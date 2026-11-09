import Capacitor
import Foundation
import StoreKit

/*
 A cobrança do Synse+ pela App Store.

 Escrito contra StoreKit 2, que é iOS 15+ — o mesmo piso do app. O StoreKit 1
 não aparece aqui de propósito: ele devolve um recibo do aparelho inteiro, e
 verificar aquilo no servidor exige o endpoint `verifyReceipt`, que a Apple
 deu por obsoleto. O StoreKit 2 devolve uma JWS por transação, assinada pela
 Apple e verificável sem chamar ninguém.

 ── O que este arquivo deliberadamente não faz ──────────────────────────────

 Não decide se a pessoa tem Synse+. Devolve a JWS e para. Quem verifica é o
 servidor; quem grava é `set_plus_subscription`. O WebView carrega um site
 remoto, então acesso concedido a partir do retorno de um método daqui seria
 Synse+ de graça para quem abrir o app com um proxy.

 ── Nunca compilado ────────────────────────────────────────────────────────

 Não há Mac no projeto. O primeiro build na CI do Codemagic é que vai dizer se
 este arquivo compila — e, mesmo compilando, nenhuma compra foi executada: não
 há conta de desenvolvedor, não há produto cadastrado e não há iPhone.
*/
@objc(SynsePlusBillingPlugin)
public class SynsePlusBillingPlugin: CAPPlugin {

    /// Tem de ser igual a `PRODUTO_MENSAL` em `src/definitions.ts`.
    private static let produtoMensal = "synse_plus_mensal"

    /**
     Escuta as transações que chegam fora de uma compra.

     Renovação, estorno, compra feita em outro aparelho e "Pedir para comprar"
     aprovado depois chegam por aqui, sem ninguém esperando resposta. Sem este
     laço, uma renovação não finalizada volta para sempre e a Apple entende que
     o app não entregou.

     O que ele **não** faz é liberar acesso: a JWS vai para o servidor pelo
     mesmo caminho da compra, e quem decide é ele.
    */
    private var escuta: Task<Void, Never>?

    override public func load() {
        escuta = Task.detached { [weak self] in
            for await resultado in Transaction.updates {
                guard let self else { return }
                if case .verified(let transacao) = resultado {
                    /*
                     Avisa a web, que repassa ao servidor. O `notifyListeners`
                     não garante entrega — o WebView pode estar descarregado —,
                     e é por isso que `restaurar` existe e é chamado na abertura:
                     ele é o caminho que não depende de ninguém estar ouvindo.
                    */
                    self.notifyListeners(
                        "transacaoAtualizada",
                        data: [
                            "loja": "apple",
                            "comprovante": resultado.jwsRepresentation,
                            "produto": transacao.productID,
                            "referencia": transacao.appAccountToken?.uuidString ?? "",
                        ]
                    )
                }
            }
        }
    }

    deinit {
        escuta?.cancel()
    }

    // ── Os métodos do contrato ───────────────────────────────────────────────

    @objc func disponivel(_ call: CAPPluginCall) {
        /*
         `AppStore.canMakePayments` é falso com compra bloqueada por Tempo de
         Uso ou controle parental. Não é erro, e a tela precisa saber para não
         mostrar um botão que não abre nada.
        */
        call.resolve(["disponivel": AppStore.canMakePayments])
    }

    @objc func precos(_ call: CAPPluginCall) {
        Task {
            do {
                let produtos = try await Product.products(for: [Self.produtoMensal])
                let lista: [[String: Any]] = produtos.map { produto in
                    [
                        "produto": produto.id,
                        // `displayPrice` já vem na moeda e no idioma da conta da
                        // loja. Formatar aqui divergiria do que a pessoa é
                        // cobrada, e as duas lojas recusam por isso.
                        "preco": produto.displayPrice,
                        "precoEmMicros": NSDecimalNumber(decimal: produto.price * 1_000_000).int64Value,
                        "moeda": produto.priceFormatStyle.currencyCode,
                    ]
                }
                call.resolve(["produtos": lista])
            } catch {
                call.reject("Não foi possível ler os preços na App Store.", "PRECOS", error)
            }
        }
    }

    @objc func comprar(_ call: CAPPluginCall) {
        guard let idDoProduto = call.getString("produto"),
              let referencia = call.getString("referencia"),
              let token = UUID(uuidString: referencia)
        else {
            /*
             `appAccountToken` da Apple é tipado como UUID, e o id do perfil é
             um uuid do Postgres — então isto nunca falha em produção. Recusar
             em vez de descartar o token é deliberado: sem ele a notificação da
             loja chega sem dono, e a assinatura fica sem conta.
            */
            call.reject("`produto` e `referencia` (uuid) são obrigatórios.", "ARGUMENTOS")
            return
        }

        Task {
            do {
                guard let produto = try await Product.products(for: [idDoProduto]).first else {
                    call.reject("Produto \(idDoProduto) não encontrado na App Store Connect.", "PRODUTO_AUSENTE")
                    return
                }

                let resultado = try await produto.purchase(options: [.appAccountToken(token)])

                switch resultado {
                case .success(let verificacao):
                    switch verificacao {
                    case .verified(let transacao):
                        /*
                         Sem `finish()` aqui: finalizar é dizer à Apple "já
                         entreguei". Quem entrega é o servidor, e o `confirmar`
                         vem depois dele. Finalizar antes tiraria da pessoa o
                         estorno automático se a verificação falhasse.
                        */
                        call.resolve([
                            "loja": "apple",
                            "comprovante": verificacao.jwsRepresentation,
                            "produto": transacao.productID,
                            "referencia": transacao.appAccountToken?.uuidString ?? referencia,
                        ])
                    case .unverified(_, let erro):
                        /*
                         Assinatura da Apple não confere. Pode ser aparelho
                         comprometido ou JWS alterada: não é compra, e tratar
                         como compra aqui seria o próprio furo que a verificação
                         existe para fechar.
                        */
                        call.reject("A App Store devolveu uma transação não verificada.", "NAO_VERIFICADA", erro)
                    }

                case .userCancelled:
                    // Desistir não é erro, e precisa ser distinguível: a tela
                    // mostra mensagem de falha para erro e silêncio para isto.
                    call.reject("Compra cancelada.", "CANCELADA")

                case .pending:
                    /*
                     "Pedir para comprar": a compra espera aprovação de um
                     responsável, e pode ser aprovada horas depois. Quem a traz
                     é `Transaction.updates`, no laço de `load()`.
                    */
                    call.reject("A compra está aguardando aprovação.", "PENDENTE")

                @unknown default:
                    call.reject("Resultado de compra desconhecido.", "DESCONHECIDO")
                }
            } catch {
                call.reject("Falha ao abrir a compra na App Store.", "COMPRA", error)
            }
        }
    }

    @objc func restaurar(_ call: CAPPluginCall) {
        Task {
            var compras: [[String: Any]] = []
            /*
             `currentEntitlements` e não `Transaction.all`: o primeiro devolve o
             que está **valendo agora** — ignora o que expirou e o que foi
             estornado. `all` traria o histórico inteiro, e restaurar a partir
             dele devolveria acesso a quem cancelou há um ano.
            */
            for await resultado in Transaction.currentEntitlements {
                if case .verified(let transacao) = resultado {
                    compras.append([
                        "loja": "apple",
                        "comprovante": resultado.jwsRepresentation,
                        "produto": transacao.productID,
                        "referencia": transacao.appAccountToken?.uuidString ?? "",
                    ])
                }
            }
            call.resolve(["compras": compras])
        }
    }

    @objc func confirmar(_ call: CAPPluginCall) {
        guard let comprovante = call.getString("comprovante") else {
            call.reject("`comprovante` é obrigatório.", "ARGUMENTOS")
            return
        }

        Task {
            /*
             A JWS não é "finalizável" direto: é preciso achar a transação viva
             que corresponde a ela. Comparar a JWS inteira é o que garante que
             se finaliza a transação que o servidor verificou, e não outra
             qualquer do mesmo produto.
            */
            for await resultado in Transaction.unfinished {
                if resultado.jwsRepresentation == comprovante,
                   case .verified(let transacao) = resultado {
                    await transacao.finish()
                    call.resolve()
                    return
                }
            }
            /*
             Não achou: já estava finalizada. É sucesso para quem chamou — o
             estado desejado é esse —, e acontece quando a tela tenta de novo
             depois de uma falha de rede.
            */
            call.resolve()
        }
    }
}
