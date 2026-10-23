import { NextResponse } from 'next/server'

import { processarNotificacaoDaLoja } from '@/features/plus/loja/notificacao-service'
import { logger } from '@/lib/logger'
import {
  estadoDaNotificacaoDaApple,
  lerNotificacaoDaApple,
} from '@/lib/plans/lojas/apple-notificacao'
import { ambientesDaApple, raizDaApple } from '@/lib/plans/lojas/apple-config'
import { APP_ID } from '@/lib/plans/lojas/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * App Store Server Notifications V2.
 *
 * ── A assinatura é a autenticação ───────────────────────────────────────────
 *
 * Não há segredo compartilhado nem token na URL, e não falta nada: só a Apple
 * produz uma JWS que termina na raiz fixada dela. Quem postar outra coisa aqui
 * é recusado pela criptografia — não por uma senha que poderia vazar num log
 * de proxy.
 *
 * ── 200 depois de validar, 401 antes ────────────────────────────────────────
 *
 * Mesma regra do webhook do Mercado Pago. Assinatura inválida é 401 e nada é
 * gravado. Depois de validada, falha nossa devolve 200 e fica `FAILED` em
 * `webhook_events`: erro põe a Apple em laço de reenvio por 72 horas enquanto
 * a gente investiga, e o reenvio não conserta um defeito nosso.
 */
export async function POST(request: Request) {
  const corpo = (await request.json().catch(() => null)) as { signedPayload?: unknown } | null
  const assinado = corpo?.signedPayload

  if (typeof assinado !== 'string' || !assinado) {
    return NextResponse.json({ received: false }, { status: 400 })
  }

  let notificacao
  try {
    notificacao = lerNotificacaoDaApple(assinado, {
      raizPem: raizDaApple(),
      bundleId: APP_ID,
      ambientes: ambientesDaApple(),
    })
  } catch (erro) {
    /*
     * Inclui o `TEST` que a App Store Connect manda do botão de teste: ele
     * chega sem `signedTransactionInfo` e é recusado aqui. É aceitável —
     * responder 400 ao teste diz à Apple que o endereço existe e responde, que
     * é o que o botão quer saber — mas vale registrar para não parecer defeito.
     */
    logger.error('loja:apple_notificacao_recusada', { erro: String(erro).slice(0, 200) })
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const desfecho = await processarNotificacaoDaLoja({
    loja: 'apple',
    eventId: notificacao.uuid,
    tipo: notificacao.subtipo ? `${notificacao.tipo}.${notificacao.subtipo}` : notificacao.tipo,
    estado: estadoDaNotificacaoDaApple(notificacao),
    /*
     * O payload guardado é o envelope **já verificado e sem as JWS internas**:
     * elas são documentos que concedem acesso, e `webhook_events` é lido por
     * quem investiga. Guardar o que identifica o evento basta para reprocessar.
     */
    rawPayload: {
      notificationType: notificacao.tipo,
      subtype: notificacao.subtipo,
      notificationUUID: notificacao.uuid,
      environment: notificacao.ambiente,
      originalTransactionId: notificacao.transacao.originalTransactionId,
      productId: notificacao.transacao.productId,
      signedDate: notificacao.assinadaEm,
    },
  })

  return NextResponse.json({ received: true, outcome: desfecho }, { status: 200 })
}
