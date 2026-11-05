import {
  corpoAssinadoPelaApple,
  JwsInvalida,
  verificarJwsDaApple,
  type Ambiente,
  type TransacaoDaApple,
} from '@/lib/plans/lojas/apple-jws'
import { estadoDaApple, type EstadoDaLoja } from '@/lib/plans/lojas/estado'

/**
 * ── A notificação do servidor da App Store (V2) ──────────────────────────────
 *
 * Sem isto, a assinatura fica certa até o fim do primeiro ciclo e errada
 * depois. É aqui que chegam: renovação, cancelamento, falha de cobrança,
 * estorno, mudança de plano e expiração.
 *
 * O formato é uma JWS **envelopando outras duas**: a transação e a informação
 * de renovação, cada uma assinada separadamente. As três passam pela mesma
 * cadeia e pela mesma raiz fixada, o que permite reaproveitar
 * `corpoAssinadoPelaApple` — e é por isso que ela existe separada.
 *
 * ── A assinatura é a autenticação ───────────────────────────────────────────
 *
 * Não há segredo compartilhado nem token na URL, e não precisa: só a Apple
 * consegue produzir uma JWS que termina na raiz dela. Quem postar qualquer
 * outra coisa no nosso endereço é recusado pela criptografia, não por uma
 * senha que poderia vazar.
 *
 * ── O que só a informação de renovação sabe ─────────────────────────────────
 *
 * `autoRenewStatus`. A transação diz "vale até tal dia" e nada sobre o futuro;
 * quem cancelou aparece como ACTIVE até a data — correto, porque o período
 * pago vale até o fim, mas insuficiente: a tela precisa dizer "encerrando em"
 * em vez de "renova em", e a cobrança precisa saber que não vem mais.
 *
 * Esta é a única fonte dessa informação em todo o fluxo da Apple.
 */

/** Os tipos que mudam o estado da assinatura. Os outros são informativos. */
export type TipoDeNotificacao =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'DID_FAIL_TO_RENEW'
  | 'EXPIRED'
  | 'REFUND'
  | 'REVOKE'
  | 'GRACE_PERIOD_EXPIRED'
  | 'DID_CHANGE_RENEWAL_PREF'
  | 'PRICE_INCREASE'
  | 'RENEWAL_EXTENDED'
  | 'CONSUMPTION_REQUEST'
  | 'OFFER_REDEEMED'
  | 'TEST'

export type NotificacaoDaApple = {
  tipo: string
  subtipo?: string
  /** Idempotência: a Apple reenvia a mesma notificação até receber 200. */
  uuid: string
  ambiente: string
  bundleId: string
  transacao: TransacaoDaApple
  /** `false` quando a pessoa desligou a renovação. */
  renovaAutomaticamente: boolean | null
  /** Quando a Apple assinou o envelope. */
  assinadaEm: number | null
}

type Opcoes = {
  raizPem: string
  bundleId: string
  ambientes: readonly Ambiente[]
  agora?: Date
}

export function lerNotificacaoDaApple(signedPayload: string, opcoes: Opcoes): NotificacaoDaApple {
  const envelope = corpoAssinadoPelaApple(signedPayload, {
    raizPem: opcoes.raizPem,
    agora: opcoes.agora,
  })

  const dados = envelope.data
  if (!dados || typeof dados !== 'object') throw new JwsInvalida('notificação sem `data`')
  const bloco = dados as Record<string, unknown>

  const uuid = envelope.notificationUUID
  if (typeof uuid !== 'string' || !uuid) throw new JwsInvalida('notificação sem notificationUUID')

  const tipo = envelope.notificationType
  if (typeof tipo !== 'string' || !tipo) throw new JwsInvalida('notificação sem notificationType')

  /*
   * O bundle id e o ambiente moram em `data`, não no topo — e é por isso que
   * `verificarJwsDaApple` não serve para o envelope: ela os procura na raiz do
   * corpo e recusaria toda notificação legítima.
   */
  const bundleId = bloco.bundleId
  if (bundleId !== opcoes.bundleId) {
    throw new JwsInvalida(`notificação de outro app: "${String(bundleId)}"`)
  }

  const ambiente = bloco.environment
  if (typeof ambiente !== 'string' || !opcoes.ambientes.includes(ambiente as Ambiente)) {
    throw new JwsInvalida(`notificação em ambiente "${String(ambiente)}" não aceito`)
  }

  const transacaoAssinada = bloco.signedTransactionInfo
  if (typeof transacaoAssinada !== 'string') {
    /*
     * `TEST` e alguns tipos informativos chegam sem transação. Quem chama
     * precisa distinguir "não mudou nada" de "não entendi" — então isto é
     * recusa, e o chamador trata o `TEST` antes.
     */
    throw new JwsInvalida(`notificação ${tipo} sem signedTransactionInfo`)
  }

  /*
   * A transação interna passa pela verificação **completa**, incluindo bundle
   * id, ambiente e presença de `productId`. Ela é o documento que concede
   * acesso; o envelope só a transporta.
   */
  const transacao = verificarJwsDaApple(transacaoAssinada, opcoes)

  let renovaAutomaticamente: boolean | null = null
  const renovacaoAssinada = bloco.signedRenewalInfo
  if (typeof renovacaoAssinada === 'string') {
    const renovacao = corpoAssinadoPelaApple(renovacaoAssinada, {
      raizPem: opcoes.raizPem,
      agora: opcoes.agora,
    })
    /*
     * `0` é desligada, `1` é ligada. Ausente fica nulo em vez de virar `true`:
     * assumir que renova é assumir receita que pode não vir, e a diferença
     * aparece na tela como "renova em" para quem já cancelou.
     */
    const status = renovacao.autoRenewStatus
    if (status === 0 || status === 1) renovaAutomaticamente = status === 1
  }

  return {
    tipo,
    subtipo: typeof envelope.subtype === 'string' ? envelope.subtype : undefined,
    uuid,
    ambiente,
    bundleId,
    transacao,
    renovaAutomaticamente,
    assinadaEm: typeof envelope.signedDate === 'number' ? envelope.signedDate : null,
  }
}

/**
 * O estado da conta depois desta notificação.
 *
 * Parte de `estadoDaApple` — que já trata estorno e data — e acrescenta a
 * única coisa que a transação não sabe: se a renovação foi desligada.
 */
export function estadoDaNotificacaoDaApple(
  notificacao: NotificacaoDaApple,
  agora: Date = new Date(),
): EstadoDaLoja {
  const base = estadoDaApple(notificacao.transacao, agora)

  /*
   * Horário do envelope, não da transação: numa renovação, a Apple reassina a
   * transação original com data nova, mas é o envelope que marca **quando este
   * fato aconteceu**. É o que a regra 1 da 0061 compara.
   */
  const estado = {
    ...base,
    eventoEm: notificacao.assinadaEm ? new Date(notificacao.assinadaEm).toISOString() : base.eventoEm,
  }

  /*
   * Renovação desligada e acesso ainda válido é CANCELED: o período pago vale
   * até o fim, e só o rótulo muda. Sem isto, quem cancela na App Store
   * continua lendo "renova em tal dia" até a data passar.
   */
  if (notificacao.renovaAutomaticamente === false && estado.status === 'ACTIVE') {
    return { ...estado, status: 'CANCELED' }
  }

  /*
   * REVOKE é o compartilhamento familiar sendo retirado; REFUND é estorno —
   * este último já cai em EXPIRED por `revocationDate`, mas não dá para contar
   * com isso: a Apple documenta o campo e não há por que depender de um só
   * sinal quando o tipo da notificação diz a mesma coisa.
   */
  if (notificacao.tipo === 'REFUND' || notificacao.tipo === 'REVOKE') {
    return { ...estado, status: 'EXPIRED', until: null }
  }

  return estado
}
