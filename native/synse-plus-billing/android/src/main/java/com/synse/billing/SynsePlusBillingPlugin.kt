package com.synse.billing

import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * A cobrança do Synse+ pelo Google Play.
 *
 * Escrito contra o Play Billing 7.1.1, fixado em `build.gradle` — a API muda
 * entre majors de um jeito que quebra compilação.
 *
 * ── O que este arquivo deliberadamente não faz ──────────────────────────────
 *
 * Não decide se a pessoa tem Synse+. Ele devolve o `purchaseToken` e para. Quem
 * verifica é o servidor, contra a API do Google; quem grava é
 * `set_plus_subscription`. O WebView aqui carrega um site remoto — qualquer
 * pessoa com um proxy responde o que quiser para a tela —, então acesso
 * concedido a partir do retorno de um método daqui seria Synse+ de graça.
 *
 * ── Nada é compilado em CI ainda ────────────────────────────────────────────
 *
 * O workflow `android.yml` compila este módulo junto com o app a cada push que
 * toca `native/`, então erro de compilação aparece. O que **não** aparece é
 * comportamento: não há conta de loja, não há produto cadastrado e não há
 * aparelho. Este código nunca executou uma compra.
 */
@CapacitorPlugin(name = "SynsePlusBilling")
class SynsePlusBillingPlugin : Plugin() {

    private var cliente: BillingClient? = null

    /**
     * A compra em andamento.
     *
     * O Play Billing responde a compra por listener global, não no retorno de
     * `launchBillingFlow`: a folha é outra Activity, e o processo pode até ser
     * recriado no meio. Guardar a chamada é o que permite devolver a resposta
     * para o `await` que ficou do outro lado da ponte.
     */
    private var compraEmCurso: PluginCall? = null

    private val aoAtualizar = PurchasesUpdatedListener { resultado, compras ->
        val call = compraEmCurso
        compraEmCurso = null
        if (call == null) {
            /*
             * Sem chamada esperando: ou o processo foi recriado, ou a compra
             * veio de fora do app (um "resgatar código" na Play Store). Avisa
             * por evento, que é o mesmo caminho do `Transaction.updates` do
             * iOS — e não resolve promessa nenhuma, porque ninguém pediu.
             *
             * O evento não é garantia: o WebView pode estar descarregado.
             * Quem garante é a notificação ao servidor e o `restaurar` na
             * abertura.
             */
            if (resultado.responseCode == BillingClient.BillingResponseCode.OK) {
                compras
                    ?.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                    ?.forEach { notifyListeners("transacaoAtualizada", descrever(it)) }
            }
            return@PurchasesUpdatedListener
        }

        when (resultado.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val compra = compras?.firstOrNull()
                if (compra == null) {
                    call.reject("A loja confirmou sem devolver a compra.", "SEM_COMPRA")
                } else {
                    call.resolve(descrever(compra))
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED ->
                // Desistir não é erro, e precisa ser distinguível: a tela mostra
                // mensagem de falha para erro e silêncio para desistência.
                call.reject("Compra cancelada.", "CANCELADA")
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED ->
                /*
                 * A pessoa já assina nesta conta de loja. É o caso de quem
                 * reinstalou: não é erro, é `restaurar`.
                 */
                call.reject("Esta conta do Google já tem a assinatura.", "JA_ASSINA")
            else -> call.reject(mensagem(resultado), resultado.responseCode.toString())
        }
    }

    override fun load() {
        cliente = BillingClient.newBuilder(context)
            .setListener(aoAtualizar)
            .enablePendingPurchases()
            .build()
    }

    override fun handleOnDestroy() {
        cliente?.endConnection()
        cliente = null
    }

    // ── Os métodos do contrato ───────────────────────────────────────────────

    @PluginMethod
    fun disponivel(call: PluginCall) {
        conectar(call) { pronto ->
            call.resolve(JSObject().put("disponivel", pronto))
        }
    }

    @PluginMethod
    fun precos(call: PluginCall) {
        conectar(call) { pronto ->
            if (!pronto) {
                call.resolve(JSObject().put("produtos", JSArray()))
                return@conectar
            }
            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(PRODUTO_MENSAL)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build(),
                    ),
                )
                .build()

            cliente?.queryProductDetailsAsync(params) { resultado, detalhes ->
                if (resultado.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject(mensagem(resultado), resultado.responseCode.toString())
                    return@queryProductDetailsAsync
                }
                val lista = JSArray()
                detalhes.forEach { produto ->
                    val oferta = primeiraCobranca(produto)
                    if (oferta != null) {
                        lista.put(
                            JSObject()
                                .put("produto", produto.productId)
                                .put("preco", oferta.formattedPrice)
                                .put("precoEmMicros", oferta.priceAmountMicros)
                                .put("moeda", oferta.priceCurrencyCode),
                        )
                    }
                }
                call.resolve(JSObject().put("produtos", lista))
            }
        }
    }

    @PluginMethod
    fun comprar(call: PluginCall) {
        val produto = call.getString("produto")
        val referencia = call.getString("referencia")
        if (produto.isNullOrBlank() || referencia.isNullOrBlank()) {
            call.reject("`produto` e `referencia` são obrigatórios.", "ARGUMENTOS")
            return
        }

        val atividade = activity
        if (atividade == null) {
            call.reject("Sem Activity para abrir a folha de compra.", "SEM_ACTIVITY")
            return
        }

        conectar(call) { pronto ->
            if (!pronto) {
                call.reject("A loja não está disponível neste aparelho.", "LOJA_INDISPONIVEL")
                return@conectar
            }

            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(
                    listOf(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(produto)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build(),
                    ),
                )
                .build()

            cliente?.queryProductDetailsAsync(params) { resultado, detalhes ->
                val encontrado = detalhes.firstOrNull { it.productId == produto }
                if (resultado.responseCode != BillingClient.BillingResponseCode.OK || encontrado == null) {
                    call.reject(
                        "Produto $produto não encontrado na Play Console.",
                        "PRODUTO_AUSENTE",
                    )
                    return@queryProductDetailsAsync
                }

                /*
                 * `offerToken` é obrigatório para assinatura desde a Billing 5:
                 * um produto pode ter várias ofertas (teste grátis, preço
                 * promocional), e o fluxo precisa saber qual. Sem ele a folha
                 * nem abre.
                 */
                val oferta = encontrado.subscriptionOfferDetails?.firstOrNull()
                if (oferta == null) {
                    call.reject(
                        "Produto $produto sem oferta de assinatura ativa.",
                        "SEM_OFERTA",
                    )
                    return@queryProductDetailsAsync
                }

                val fluxo = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(
                        listOf(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(encontrado)
                                .setOfferToken(oferta.offerToken)
                                .build(),
                        ),
                    )
                    /*
                     * O id do perfil, que volta nas notificações do Google.
                     * Sem ele, uma renovação chega sem dono e a assinatura não
                     * tem como ser ligada a uma conta do Synse.
                     */
                    .setObfuscatedAccountId(referencia)
                    .build()

                compraEmCurso = call
                // A chamada fica pendurada: a resposta vem pelo listener.
                call.setKeepAlive(true)
                val abertura = cliente?.launchBillingFlow(atividade, fluxo)
                if (abertura != null &&
                    abertura.responseCode != BillingClient.BillingResponseCode.OK
                ) {
                    compraEmCurso = null
                    call.reject(mensagem(abertura), abertura.responseCode.toString())
                }
            }
        }
    }

    @PluginMethod
    fun restaurar(call: PluginCall) {
        conectar(call) { pronto ->
            if (!pronto) {
                call.resolve(JSObject().put("compras", JSArray()))
                return@conectar
            }
            val params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build()

            cliente?.queryPurchasesAsync(params) { resultado, compras ->
                if (resultado.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject(mensagem(resultado), resultado.responseCode.toString())
                    return@queryPurchasesAsync
                }
                val lista = JSArray()
                compras
                    // Pendente é cobrança em análise (boleto, por exemplo): não
                    // é acesso, e devolvê-la faria a tela prometer o que a loja
                    // ainda não confirmou.
                    .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                    .forEach { lista.put(descrever(it)) }
                call.resolve(JSObject().put("compras", lista))
            }
        }
    }

    @PluginMethod
    fun confirmar(call: PluginCall) {
        val comprovante = call.getString("comprovante")
        if (comprovante.isNullOrBlank()) {
            call.reject("`comprovante` é obrigatório.", "ARGUMENTOS")
            return
        }

        conectar(call) { pronto ->
            if (!pronto) {
                call.reject("A loja não está disponível neste aparelho.", "LOJA_INDISPONIVEL")
                return@conectar
            }
            val params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(comprovante)
                .build()

            cliente?.acknowledgePurchase(params) { resultado ->
                /*
                 * `ITEM_NOT_OWNED` aqui significa reconhecimento repetido —
                 * acontece quando a tela tenta de novo depois de uma falha de
                 * rede, e é sucesso para quem chamou: o estado desejado é esse.
                 */
                val ok = resultado.responseCode == BillingClient.BillingResponseCode.OK ||
                    resultado.responseCode == BillingClient.BillingResponseCode.ITEM_NOT_OWNED
                if (ok) call.resolve() else call.reject(mensagem(resultado), resultado.responseCode.toString())
            }
        }
    }

    // ── Apoio ────────────────────────────────────────────────────────────────

    /**
     * Garante conexão com a Play antes de qualquer consulta.
     *
     * A conexão cai sozinha — atualização do app da Play Store, troca de rede —
     * e o `BillingClient` não reconecta por conta própria. Chamar uma consulta
     * desconectado devolve `SERVICE_DISCONNECTED`, que da tela parece "a loja
     * não tem o produto".
     */
    private fun conectar(call: PluginCall, aoTerminar: (Boolean) -> Unit) {
        val atual = cliente
        if (atual == null) {
            call.reject("Plugin não inicializado.", "SEM_CLIENTE")
            return
        }
        if (atual.isReady) {
            aoTerminar(true)
            return
        }
        atual.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(resultado: BillingResult) {
                aoTerminar(resultado.responseCode == BillingClient.BillingResponseCode.OK)
            }

            override fun onBillingServiceDisconnected() {
                /*
                 * Sem reconectar aqui: isto é chamado quando a conexão cai, e
                 * tentar de novo neste ponto produziria laço se o serviço
                 * estiver mesmo fora. A próxima chamada reconecta.
                 */
            }
        })
    }

    private fun descrever(compra: Purchase): JSObject =
        JSObject()
            .put("loja", "google")
            .put("comprovante", compra.purchaseToken)
            .put("produto", compra.products.firstOrNull() ?: PRODUTO_MENSAL)
            .put("referencia", compra.accountIdentifiers?.obfuscatedAccountId)

    /**
     * O preço da **primeira** fase de cobrança da oferta.
     *
     * Uma oferta de assinatura tem uma lista de fases: teste grátis primeiro,
     * valor cheio depois. Pegar a última mostraria R$ 29 para quem vai pagar
     * R$ 0 no primeiro mês; pegar a primeira mostra o que será cobrado agora,
     * que é o que a tela promete.
     */
    private fun primeiraCobranca(produto: ProductDetails): ProductDetails.PricingPhase? =
        produto.subscriptionOfferDetails
            ?.firstOrNull()
            ?.pricingPhases
            ?.pricingPhaseList
            ?.firstOrNull()

    private fun mensagem(resultado: BillingResult): String =
        resultado.debugMessage.ifBlank { "Falha na loja (${resultado.responseCode})." }

    private companion object {
        /** Tem de ser igual a `PRODUTO_MENSAL` em `src/definitions.ts`. */
        const val PRODUTO_MENSAL = "synse_plus_mensal"
    }
}
