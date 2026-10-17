/**
 * ── O contrato da cobrança pelas lojas ───────────────────────────────────────
 *
 * O Synse+ destrava só conteúdo digital dentro do app, e isso Apple e Google
 * reservam para a cobrança **delas**. Este plugin é essa cobrança: ele abre a
 * folha nativa de compra e devolve o comprovante.
 *
 * ── A regra que molda tudo aqui ──────────────────────────────────────────────
 *
 * **O plugin não libera acesso.** Ele devolve um comprovante; quem decide é o
 * servidor, depois de verificar com a loja, e quem escreve é
 * `set_plus_subscription` no banco. É a mesma regra do PIX da mensalidade —
 * "nunca confiar no front-end para confirmar pagamento" — e aqui ela é mais
 * importante ainda, porque o WebView carrega um site remoto: qualquer pessoa
 * que abra o aplicativo com um proxy consegue responder o que quiser para a
 * tela. O comprovante não vale por existir, vale por ser verificável.
 *
 * ── Por que existe `confirmar`, e por que ela vem depois do servidor ────────
 *
 * As duas lojas exigem que a compra seja **reconhecida** depois de entregue, e
 * as duas desfazem a cobrança se o reconhecimento não vier:
 *
 *   - Google: assinatura não reconhecida em 3 dias é estornada automaticamente;
 *   - Apple: transação não finalizada volta em `Transaction.updates` para
 *     sempre, e a loja entende que o app não entregou.
 *
 * Reconhecer **antes** da verificação do servidor seria dizer à loja "entreguei"
 * sem ter entregue — e se a verificação falhasse, a pessoa teria pago sem
 * receber e sem direito a estorno automático. Então a ordem é: comprar →
 * servidor verifica e grava → `confirmar`. Nessa ordem, uma falha no meio deixa
 * a loja estornar sozinha, que é o lado seguro de errar.
 */

/** O único produto, por enquanto. Tem de ser igual ao id cadastrado nas duas lojas. */
export const PRODUTO_MENSAL = 'synse_plus_mensal'

export type Loja = 'apple' | 'google'

export type CompraDaLoja = {
  loja: Loja
  /**
   * O comprovante que o servidor verifica. **Opaco para a tela**: ela não lê,
   * não interpreta e não decide nada com ele — só repassa.
   *
   * No iOS é a JWS da transação (StoreKit 2); no Android, o `purchaseToken`.
   * São formatos diferentes de propósito: cada loja verifica o seu, e tentar
   * uniformizar aqui só esconderia de qual delas o comprovante veio.
   */
  comprovante: string
  /** O produto comprado, para o servidor conferir que é o que ele espera. */
  produto: string
  /**
   * O identificador que amarra a compra à conta, devolvido pela loja.
   *
   * É o que permite à notificação da loja — que chega muito depois, sem
   * sessão nenhuma — saber de quem é a assinatura. Sem ele, uma renovação ou
   * um cancelamento chegaria sem dono.
   */
  referencia: string | null
}

export type PrecoDaLoja = {
  produto: string
  /** Já formatado pela loja, na moeda e no idioma do aparelho. */
  preco: string
  /** Em micros da moeda, como as duas lojas devolvem. Para registro, não para exibir. */
  precoEmMicros: number
  moeda: string
}

export interface SynsePlusBillingPlugin {
  /**
   * A loja está acessível neste aparelho?
   *
   * Falso é comum e não é erro: aparelho sem Google Play (alguns da China, ou
   * com a conta desconectada), compra bloqueada por controle parental, ou
   * versão do sistema abaixo do mínimo. A tela precisa saber para não mostrar
   * um botão que não abre nada.
   */
  disponivel(): Promise<{ disponivel: boolean }>

  /**
   * O preço, **como a loja o informa**.
   *
   * Nunca escrito no código: a loja aplica moeda, imposto e a tabela regional
   * da conta de quem está olhando. Preço fixo no app diverge do que a pessoa é
   * cobrada, e as duas lojas recusam por isso.
   */
  precos(): Promise<{ produtos: PrecoDaLoja[] }>

  /**
   * Abre a folha de compra e devolve o comprovante.
   *
   * `referencia` é o id do perfil. Vai para a loja como `appAccountToken`
   * (Apple) e `obfuscatedAccountId` (Google), e volta nas notificações — é a
   * única amarra entre a assinatura e a conta.
   */
  comprar(options: { produto: string; referencia: string }): Promise<CompraDaLoja>

  /**
   * O que esta conta de loja já comprou.
   *
   * Existe para quem reinstalou o app ou trocou de aparelho: a assinatura está
   * na conta da loja, não no aparelho, e sem restaurar a pessoa veria convite
   * para comprar o que já paga. As duas lojas exigem este caminho.
   */
  restaurar(): Promise<{ compras: CompraDaLoja[] }>

  /**
   * Reconhece a compra na loja. **Só depois de o servidor ter gravado.**
   *
   * Ver a nota sobre ordem no cabeçalho: chamar antes é dizer "entreguei" sem
   * ter entregue, e tira da pessoa o estorno automático.
   */
  confirmar(options: { comprovante: string }): Promise<void>

  /**
   * Transação que chegou **sem ninguém ter pedido**.
   *
   * Renovação mensal, estorno, compra feita em outro aparelho, e "Pedir para
   * comprar" aprovado por um responsável horas depois. Nenhuma delas tem uma
   * tela esperando resposta, e todas precisam chegar ao servidor.
   *
   * Não é o caminho confiável, e não deve ser tratado como se fosse: o WebView
   * pode estar descarregado quando o evento sai. Quem garante é a notificação
   * que a loja manda ao servidor, mais `restaurar` na abertura do app. Este
   * evento é o atalho rápido quando o app está aberto.
   */
  addListener(
    eventName: 'transacaoAtualizada',
    listenerFunc: (compra: CompraDaLoja) => void,
  ): Promise<{ remove: () => void }>
}
