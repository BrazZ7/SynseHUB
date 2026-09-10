import { NextResponse } from 'next/server'

import { processPaymentWebhook } from '@/features/payments/webhook-service'
import { logger } from '@/lib/logger'
import { AsaasPaymentProvider } from '@/lib/payments/providers/asaas'
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook do Asaas.
 *
 * Regras que este handler nunca quebra:
 *
 * - O corpo é lido cru e o token do cabeçalho é comparado em tempo constante.
 *   Sem token configurado, tudo é rejeitado — nunca aceito por omissão.
 * - A resposta é sempre 200 depois da validação, inclusive em falha interna.
 *   Isso evita que o provedor entre em loop de reenvio enquanto investigamos;
 *   o evento fica marcado como FAILED em `webhook_events` para reprocessamento.
 * - Nenhum detalhe interno vaza na resposta.
 */
export async function POST(request: Request) {
  pruneRateLimits()

  const forwardedFor = request.headers.get('x-forwarded-for') ?? 'unknown'
  const limit = rateLimit(`webhook:asaas:${forwardedFor}`, 300, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ received: false }, { status: 429 })
  }

  const rawBody = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })

  const provider = new AsaasPaymentProvider()

  let verification
  try {
    verification = await provider.verifyWebhook({ headers, rawBody })
  } catch (error) {
    logger.warn('webhook:asaas_malformed', { error: String(error) })
    return NextResponse.json({ received: false }, { status: 400 })
  }

  if (!verification.valid) {
    logger.warn('webhook:asaas_unauthorized', { ip: forwardedFor })
    return NextResponse.json({ received: false }, { status: 401 })
  }

  const outcome = await processPaymentWebhook(provider.id, verification, safeParse(rawBody))

  return NextResponse.json({ received: true, outcome }, { status: 200 })
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return { raw }
  }
}
