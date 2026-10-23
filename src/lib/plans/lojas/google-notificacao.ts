/**
 * ── A notificação em tempo real do Google Play (RTDN) ────────────────────────
 *
 * O Google publica num tópico do Pub/Sub, e o Pub/Sub entrega aqui por POST.
 * Sem isto, renovação e cancelamento no Android nunca chegam.
 *
 * ── Ela não tem assinatura, e isso muda a estratégia ────────────────────────
 *
 * A notificação da Apple é uma JWS: a assinatura **é** a autenticação. Aqui
 * não existe nada equivalente — o corpo é JSON em base64, e qualquer pessoa
 * que descubra o endereço consegue postar o que quiser.
 *
 * Então a proteção não está em acreditar no corpo. Está em **nunca** acreditar
 * nele: o que a notificação traz é um `purchaseToken`, e o estado vem de uma
 * consulta nossa à Play Developer API. Uma notificação forjada, no máximo, nos
 * faz perguntar ao Google sobre um token — e a resposta do Google é que decide.
 *
 * É a mesma regra do webhook do Mercado Pago, escrita lá como "o corpo do
 * webhook não decide nada".
 *
 * O token no cabeçalho, que a rota confere, é camada a mais: ele evita que
 * alguém nos faça gastar cota da API do Google à vontade. Não é o que mantém a
 * assinatura correta.
 */

export type NotificacaoDoGoogle = {
  pacote: string
  /** O token da compra. É o que se pergunta ao Google. */
  purchaseToken: string
  /** O produto, como o Google o chama nesta mensagem. */
  produto: string
  /** O código do tipo. Ver `TIPOS_DO_GOOGLE`. */
  tipo: number
  /** Quando o Google diz que o evento aconteceu. */
  eventoEm: string | null
  /** Idempotência: o Pub/Sub reentrega até receber 2xx. */
  messageId: string
}

/**
 * Os tipos que o Google manda, pelos números que ele usa.
 *
 * Mapeados para leitura de log, não para decisão: **o estado vem da consulta à
 * API**, não daqui. Decidir pelo número seria confiar no corpo que qualquer
 * pessoa pode postar — e seria também apostar que a lista não cresce, o que
 * ela já fez duas vezes.
 */
export const TIPOS_DO_GOOGLE: Record<number, string> = {
  1: 'RECOVERED',
  2: 'RENEWED',
  3: 'CANCELED',
  4: 'PURCHASED',
  5: 'ON_HOLD',
  6: 'IN_GRACE_PERIOD',
  7: 'RESTARTED',
  8: 'PRICE_CHANGE_CONFIRMED',
  9: 'DEFERRED',
  10: 'PAUSED',
  11: 'PAUSE_SCHEDULE_CHANGED',
  12: 'REVOKED',
  13: 'EXPIRED',
  20: 'PENDING_PURCHASE_CANCELED',
}

export class NotificacaoInvalida extends Error {
  constructor(motivo: string) {
    super(`RTDN do Google: ${motivo}`)
    this.name = 'NotificacaoInvalida'
  }
}

type EnvelopeDoPubSub = {
  message?: { data?: unknown; messageId?: unknown; publishTime?: unknown }
  subscription?: unknown
}

/**
 * Lê o envelope do Pub/Sub e a mensagem dentro dele.
 *
 * Função pura: nada de rede, e nada de decisão sobre acesso.
 */
export function lerNotificacaoDoGoogle(corpo: unknown): NotificacaoDoGoogle {
  const envelope = corpo as EnvelopeDoPubSub | null
  const mensagem = envelope?.message
  if (!mensagem || typeof mensagem !== 'object') {
    throw new NotificacaoInvalida('envelope sem `message`')
  }

  if (typeof mensagem.data !== 'string' || !mensagem.data) {
    throw new NotificacaoInvalida('`message.data` ausente')
  }

  let lido: Record<string, unknown>
  try {
    lido = JSON.parse(Buffer.from(mensagem.data, 'base64').toString('utf8'))
  } catch {
    throw new NotificacaoInvalida('`message.data` não é JSON em base64')
  }

  const pacote = lido.packageName
  if (typeof pacote !== 'string' || !pacote) {
    throw new NotificacaoInvalida('mensagem sem packageName')
  }

  /*
   * Só assinatura interessa aqui. O Google manda no mesmo tópico
   * `oneTimeProductNotification`, `voidedPurchaseNotification` e
   * `testNotification` — e tratar qualquer um deles como assinatura produziria
   * uma consulta a um token que não é de assinatura.
   */
  const daAssinatura = lido.subscriptionNotification
  if (!daAssinatura || typeof daAssinatura !== 'object') {
    throw new NotificacaoInvalida('mensagem sem subscriptionNotification')
  }
  const bloco = daAssinatura as Record<string, unknown>

  const purchaseToken = bloco.purchaseToken
  if (typeof purchaseToken !== 'string' || !purchaseToken) {
    throw new NotificacaoInvalida('subscriptionNotification sem purchaseToken')
  }

  const emMilissegundos = Number(lido.eventTimeMillis)

  return {
    pacote,
    purchaseToken,
    produto: typeof bloco.subscriptionId === 'string' ? bloco.subscriptionId : '',
    tipo: Number(bloco.notificationType) || 0,
    /*
     * `eventTimeMillis` vem como texto no JSON do Google — é um int64, e JSON
     * não tem int64. `Number()` direto num campo ausente dá `NaN`, que viraria
     * uma data inválida se fosse passado adiante.
     */
    eventoEm: Number.isFinite(emMilissegundos) ? new Date(emMilissegundos).toISOString() : null,
    messageId: typeof mensagem.messageId === 'string' ? mensagem.messageId : '',
  }
}

/** É uma notificação de teste do painel? Não mexe em assinatura nenhuma. */
export function ehTesteDoGoogle(corpo: unknown): boolean {
  const envelope = corpo as EnvelopeDoPubSub | null
  if (typeof envelope?.message?.data !== 'string') return false
  try {
    const lido = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'))
    return Boolean(lido.testNotification)
  } catch {
    return false
  }
}
