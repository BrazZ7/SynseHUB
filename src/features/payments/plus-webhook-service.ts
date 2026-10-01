import 'server-only'

import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { isDemoMode } from '@/lib/database/env'
import { logger } from '@/lib/logger'
import { estadoDoPlus } from '@/lib/payments/providers/mercadopago/assinatura'
import type { MercadoPagoProvider } from '@/lib/payments/providers/mercadopago'

/**
 * ── A confirmação da assinatura do Synse+ ────────────────────────────────────
 *
 * Separado de `webhook-service.ts` porque é outro produto, com outra tabela e
 * outro dono do dinheiro. Aquele liquida `charges` de academia e grava
 * `payment_splits`; aqui não há academia, não há cobrança no banco e não há
 * divisão — há uma conta que passa a ser Synse+.
 *
 * Misturar os dois faria o caminho da mensalidade carregar `if` de assinatura
 * e vice-versa, nas duas rotinas que mexem em dinheiro.
 *
 * ── Três garantias ──────────────────────────────────────────────────────────
 *
 * 1. **Idempotência.** `webhook_events` tem UNIQUE (provider, event_id). O
 *    Mercado Pago reenvia; o conflito é o que impede processar duas vezes.
 *
 * 2. **O corpo do webhook não decide nada.** Ele entrega um id; o estado vem
 *    de uma consulta nossa à API do Mercado Pago. Quem forja um corpo com
 *    assinatura válida — se algum dia o esquema de assinatura falhar — ainda
 *    assim não consegue inventar um estado.
 *
 * 3. **A escrita é do banco.** `set_plus_subscription` é a única porta da
 *    assinatura desde a 0036, concedida só ao `service_role`, e é ela que
 *    valida o estado e exige prazo. Esta função não escreve em
 *    `user_profiles`.
 */

export type ResultadoDoAviso = 'PROCESSED' | 'DUPLICATE' | 'IGNORED' | 'FAILED'

/** Os tipos de evento que dizem respeito a uma assinatura. */
const DE_ASSINATURA = ['subscription_preapproval', 'preapproval']

export async function processarAvisoDePlus(input: {
  provider: MercadoPagoProvider
  eventId: string
  eventType: string
  preapprovalId: string
  rawPayload: unknown
}): Promise<ResultadoDoAviso> {
  const { provider, eventId, eventType, preapprovalId } = input
  const admin = createSupabaseAdminClient()

  if (!admin || isDemoMode()) {
    logger.info('plus:webhook_demo', { eventId, eventType })
    return 'IGNORED'
  }

  /*
   * Evento que não é de assinatura passa batido. O Mercado Pago manda também
   * `payment` de cada cobrança do ciclo; quem manda no acesso é o estado da
   * assinatura, e consultá-lo a cada pagamento seria trabalho repetido.
   */
  if (!DE_ASSINATURA.some((tipo) => eventType.includes(tipo))) {
    logger.info('plus:webhook_outro_tipo', { eventId, eventType })
    return 'IGNORED'
  }

  const { error: erroDeRegistro } = await admin.from('webhook_events').insert({
    provider: provider.id,
    event_id: eventId,
    event_type: eventType,
    payload: input.rawPayload,
    status: 'RECEIVED',
  })

  if (erroDeRegistro) {
    if ((erroDeRegistro as { code?: string }).code === '23505') {
      logger.info('plus:webhook_duplicado', { eventId })
      return 'DUPLICATE'
    }
    logger.error('plus:webhook_registro_falhou', { erro: erroDeRegistro.message })
    return 'FAILED'
  }

  try {
    // A fonte da verdade: o estado que o Mercado Pago informa agora.
    const assinatura = await provider.buscarAssinatura(preapprovalId)
    const perfil = assinatura.external_reference ?? ''

    if (!perfil) {
      await marcar(admin, provider.id, eventId, 'IGNORED', 'sem external_reference')
      return 'IGNORED'
    }

    const estado = estadoDoPlus(assinatura)

    const { error: erroDaEscrita } = await admin.rpc('set_plus_subscription', {
      p_profile_id: perfil,
      p_status: estado.status,
      p_until: estado.until,
      p_provider: provider.id,
      p_provider_ref: preapprovalId,
    })
    if (erroDaEscrita) throw new Error(erroDaEscrita.message)

    await marcar(admin, provider.id, eventId, 'PROCESSED')
    /*
     * O log guarda o perfil e o estado, nunca e-mail, nome ou valor: é
     * registro de operação, não de pessoa.
     */
    logger.info('plus:webhook_processado', {
      perfil,
      estado: estado.status,
      mpStatus: assinatura.status,
    })
    return 'PROCESSED'
  } catch (erro) {
    logger.error('plus:webhook_falhou', { eventId, erro: String(erro) })
    await marcar(admin, provider.id, eventId, 'FAILED', String(erro).slice(0, 500))
    return 'FAILED'
  }
}

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>

async function marcar(
  admin: Admin,
  provider: string,
  eventId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  detalhe?: string,
) {
  await admin
    .from('webhook_events')
    .update({ status, processed_at: new Date().toISOString(), error_detail: detalhe ?? null })
    .eq('provider', provider)
    .eq('event_id', eventId)
}
