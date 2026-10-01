import { NextResponse } from 'next/server'

import { processarAvisoDePlus } from '@/features/payments/plus-webhook-service'
import { logger } from '@/lib/logger'
import { MercadoPagoProvider } from '@/lib/payments/providers/mercadopago'
import { mercadoPagoConfigurado } from '@/lib/payments/providers/mercadopago/env'
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook do Mercado Pago — assinatura do Synse+.
 *
 * ── O `data.id` vem da query string ─────────────────────────────────────────
 *
 * O Mercado Pago chama `?type=...&data.id=...`, e é esse id que entra no texto
 * assinado. Conferir contra o id do corpo seria conferir a assinatura contra
 * um valor que quem forja o pedido escolheu — a verificação pareceria existir
 * e não existiria.
 *
 * ── Por que 200 depois de validar, mesmo em falha ───────────────────────────
 *
 * Mesma regra do webhook que havia antes: devolver erro põe o provedor em
 * laço de reenvio enquanto a gente investiga. O evento fica `FAILED` em
 * `webhook_events`, que é onde se reprocessa.
 *
 * Antes da validação é o contrário: 401 em assinatura inválida, e nada é
 * gravado.
 */
export async function POST(request: Request) {
  pruneRateLimits()

  const de = request.headers.get('x-forwarded-for') ?? 'desconhecido'
  if (!(await rateLimit(`webhook:mercadopago:${de}`, 300, 60_000)).allowed) {
    return NextResponse.json({ received: false }, { status: 429 })
  }

  /*
   * Sem credencial não há o que processar, e responder 200 faria o Mercado
   * Pago marcar a entrega como bem-sucedida — o aviso se perderia em silêncio
   * em vez de aparecer como falha no painel dele.
   */
  if (!mercadoPagoConfigurado()) {
    logger.warn('mercadopago:webhook_sem_credencial')
    return NextResponse.json({ received: false }, { status: 503 })
  }

  const rawBody = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((valor, chave) => {
    headers[chave.toLowerCase()] = valor
  })

  // O id que entra no texto assinado é o da URL, não o do corpo.
  const url = new URL(request.url)
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id')
  if (dataId) headers['x-data-id'] = dataId

  const provider = new MercadoPagoProvider()

  let conferido
  try {
    conferido = await provider.verifyWebhook({ headers, rawBody })
  } catch (erro) {
    logger.warn('mercadopago:webhook_malformado', { erro: String(erro) })
    return NextResponse.json({ received: false }, { status: 400 })
  }

  if (!conferido.valid) {
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const resultado = await processarAvisoDePlus({
    provider,
    eventId: conferido.eventId,
    eventType: conferido.eventType || (url.searchParams.get('type') ?? ''),
    preapprovalId: conferido.providerChargeId ?? '',
    rawPayload: interpretar(rawBody),
  })

  return NextResponse.json({ received: true, outcome: resultado }, { status: 200 })
}

function interpretar(bruto: string): unknown {
  try {
    return JSON.parse(bruto || '{}')
  } catch {
    return { raw: bruto.slice(0, 2000) }
  }
}
