import 'server-only'

import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { isDemoMode } from '@/lib/database/env'
import { logger } from '@/lib/logger'
import { calculateSplit, DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { roundMoney } from '@/lib/utils'
import type { WebhookVerification } from '@/lib/payments/provider'

/**
 * Processamento de webhook de pagamento.
 *
 * Duas garantias inegociáveis:
 *
 * 1. Idempotência — `webhook_events` tem UNIQUE (provider, event_id). Se o
 *    provedor reenviar o mesmo evento, o INSERT falha por conflito e o evento é
 *    reconhecido sem reprocessar. Nunca há liquidação em duplicidade.
 *
 * 2. Origem confiável — o status de um pagamento só muda a partir daqui (ou de
 *    uma consulta direta ao provedor). Nada vindo do navegador confirma
 *    pagamento.
 */

export type WebhookOutcome = 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'FAILED'

export async function processPaymentWebhook(
  provider: string,
  event: WebhookVerification,
  rawPayload: unknown,
): Promise<WebhookOutcome> {
  const admin = createSupabaseAdminClient()

  // Sem banco (DEMO MODE) o evento é apenas registrado no log do servidor.
  if (!admin || isDemoMode()) {
    logger.info('webhook:received_demo_mode', {
      provider,
      eventId: event.eventId,
      eventType: event.eventType,
    })
    return 'IGNORED'
  }

  // 1. Registra o evento. O conflito é o mecanismo de idempotência.
  const { error: insertError } = await admin.from('webhook_events').insert({
    provider,
    event_id: event.eventId,
    event_type: event.eventType,
    payload: rawPayload,
    status: 'RECEIVED',
  })

  if (insertError) {
    // 23505 = unique_violation → já processamos este evento.
    if ((insertError as { code?: string }).code === '23505') {
      logger.info('webhook:duplicate_ignored', { provider, eventId: event.eventId })
      return 'DUPLICATE'
    }
    logger.error('webhook:persist_failed', { provider, error: insertError.message })
    return 'FAILED'
  }

  if (event.status !== 'PAID' || !event.providerChargeId) {
    await markEvent(admin, provider, event.eventId, 'IGNORED')
    return 'IGNORED'
  }

  try {
    // 2. Localiza a cobrança pela referência do provedor.
    const { data: charge, error: chargeError } = await admin
      .from('charges')
      .select('id, organization_id, amount, status')
      .eq('provider', provider)
      .eq('provider_charge_id', event.providerChargeId)
      .maybeSingle()

    if (chargeError) throw chargeError
    if (!charge) {
      await markEvent(admin, provider, event.eventId, 'IGNORED', 'charge not found')
      return 'IGNORED'
    }

    if (charge.status === 'PAID') {
      await markEvent(admin, provider, event.eventId, 'IGNORED', 'charge already settled')
      return 'DUPLICATE'
    }

    const paidAt = event.paidAt ?? new Date().toISOString()
    const grossAmount = Number(charge.amount)
    const netAmount = event.netAmount ?? grossAmount
    const providerFee = roundMoney(Math.max(0, grossAmount - netAmount))

    // 3. Confirma a cobrança.
    const { error: updateError } = await admin
      .from('charges')
      .update({ status: 'PAID', paid_at: paidAt, payment_method: event.method ?? 'PIX' })
      .eq('id', charge.id)
    if (updateError) throw updateError

    // 4. Registra o pagamento.
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .insert({
        organization_id: charge.organization_id,
        charge_id: charge.id,
        provider,
        provider_payment_id: event.providerPaymentId ?? event.providerChargeId,
        amount: grossAmount,
        net_amount: netAmount,
        method: event.method ?? 'PIX',
        confirmed_at: paidAt,
        raw_provider_status: event.eventType,
      })
      .select('id')
      .single()
    if (paymentError) throw paymentError

    // 5. Calcula e grava o split com as taxas da organização.
    const { data: billing } = await admin
      .from('organization_billing_settings')
      .select('*')
      .eq('organization_id', charge.organization_id)
      .maybeSingle()

    const settings = billing
      ? {
          platformFeePercentage: Number(billing.platform_fee_percentage),
          platformFixedFee: Number(billing.platform_fixed_fee),
          paymentProviderFeeStrategy: billing.payment_provider_fee_strategy as
            | 'PLATFORM_ABSORBS'
            | 'ORGANIZATION_ABSORBS'
            | 'CUSTOMER_ABSORBS',
        }
      : DEFAULT_BILLING_SETTINGS

    const split = calculateSplit(grossAmount, settings, providerFee)

    const { error: splitError } = await admin.from('payment_splits').insert({
      charge_id: charge.id,
      payment_id: payment.id,
      organization_amount: split.organizationAmount,
      platform_amount: split.platformAmount,
      platform_percentage: split.platformPercentage,
      provider_fee: split.providerFee,
      status: 'SETTLED',
    })
    if (splitError) throw splitError

    // 6. Auditoria.
    await admin.from('audit_logs').insert({
      organization_id: charge.organization_id,
      action: 'payment.confirmed',
      entity: 'charges',
      entity_id: charge.id,
      metadata: { provider, eventId: event.eventId, amount: grossAmount },
    })

    await markEvent(admin, provider, event.eventId, 'PROCESSED')
    logger.info('webhook:processed', { provider, eventId: event.eventId, chargeId: charge.id })
    return 'PROCESSED'
  } catch (error) {
    logger.error('webhook:processing_failed', {
      provider,
      eventId: event.eventId,
      error: String(error),
    })
    await markEvent(admin, provider, event.eventId, 'FAILED', String(error).slice(0, 500))
    return 'FAILED'
  }
}

async function markEvent(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  provider: string,
  eventId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  errorDetail?: string,
) {
  await admin
    .from('webhook_events')
    .update({ status, processed_at: new Date().toISOString(), error_detail: errorDetail ?? null })
    .eq('provider', provider)
    .eq('event_id', eventId)
}
