import 'server-only'

import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { isDemoMode } from '@/lib/database/env'
import { logger } from '@/lib/logger'
import type { EstadoDaLoja } from '@/lib/plans/lojas/estado'
import type { Loja } from '@/lib/plans/lojas/tipos'

/**
 * ── O que se faz com a notificação de uma loja ───────────────────────────────
 *
 * Três garantias, e são as mesmas do webhook do Mercado Pago — de propósito,
 * porque os problemas são os mesmos:
 *
 * 1. **Idempotência.** `webhook_events` tem UNIQUE (provider, event_id). As
 *    duas lojas reenviam até receber 2xx; o conflito no insert é o que impede
 *    processar duas vezes.
 *
 * 2. **O corpo não decide.** Da Apple, o estado vem da JWS verificada; do
 *    Google, de uma consulta nossa à API. Quem chama já fez isso — aqui chega
 *    o estado, não o corpo.
 *
 * 3. **A escrita é do banco.** `set_plus_subscription` valida, exige prazo e
 *    aplica as três regras da 0061.
 *
 * ── E uma diferença que custa dinheiro se for esquecida ──────────────────────
 *
 * **`p_takeover: false`.** Notificação não é compra.
 *
 * A regra 3 da 0061 — compra nova é dona e ganha — existe para o caminho em
 * que a pessoa acabou de ser cobrada. Uma renovação mensal não é isso. Se
 * notificação tomasse posse, a renovação de uma assinatura antiga do Mercado
 * Pago roubaria a assinatura de quem comprou pela App Store, e a próxima
 * notificação da Apple tomaria de volta: o estado ficaria piscando entre as
 * duas a cada ciclo, e a cobrança da pessoa também.
 *
 * ── Achar de quem é a assinatura ─────────────────────────────────────────────
 *
 * A notificação chega sem sessão, horas ou meses depois da compra. A amarra é
 * a `referencia` que a loja devolve — e quando ela não vem, sobra procurar
 * pelo `plus_provider_ref`, que é o id da assinatura na loja e foi gravado na
 * compra. Sem nenhum dos dois, a notificação não tem dono e é registrada como
 * ignorada: ela existe no histórico, e ninguém é afetado por engano.
 */

export type DesfechoDaNotificacao =
  | 'PROCESSED'
  | 'DUPLICATE'
  | 'IGNORED'
  | 'FAILED'
  | 'STALE'
  | 'CONFLICT'

export async function processarNotificacaoDaLoja(entrada: {
  loja: Loja
  /** Identificador único do evento, para a idempotência. */
  eventId: string
  tipo: string
  estado: EstadoDaLoja
  rawPayload: unknown
}): Promise<DesfechoDaNotificacao> {
  const { loja, eventId, tipo, estado } = entrada
  const admin = createSupabaseAdminClient()

  if (!admin || isDemoMode()) {
    logger.info('loja:notificacao_demo', { loja, eventId, tipo })
    return 'IGNORED'
  }

  const { error: erroDeRegistro } = await admin.from('webhook_events').insert({
    provider: loja,
    event_id: eventId,
    event_type: tipo,
    payload: entrada.rawPayload,
    status: 'RECEIVED',
  })

  if (erroDeRegistro) {
    if ((erroDeRegistro as { code?: string }).code === '23505') {
      logger.info('loja:notificacao_duplicada', { loja, eventId })
      return 'DUPLICATE'
    }
    logger.error('loja:notificacao_registro_falhou', { erro: erroDeRegistro.message })
    return 'FAILED'
  }

  try {
    const perfil = await acharPerfil(admin, loja, estado)
    if (!perfil) {
      await marcar(admin, loja, eventId, 'IGNORED', 'sem perfil para a assinatura')
      logger.error('loja:notificacao_sem_dono', { loja, tipo, ref: estado.refDaLoja.slice(0, 12) })
      return 'IGNORED'
    }

    const { data: desfecho, error } = await admin.rpc('set_plus_subscription', {
      p_profile_id: perfil,
      p_status: estado.status,
      p_until: estado.until,
      p_provider: loja,
      p_provider_ref: estado.refDaLoja,
      p_event_at: estado.eventoEm,
      // Ver a nota do cabeçalho. Notificação não toma posse.
      p_takeover: false,
    })
    if (error) throw new Error(error.message)

    if (desfecho === 'STALE') {
      await marcar(admin, loja, eventId, 'IGNORED', 'fora de ordem (0061)')
      return 'STALE'
    }
    if (desfecho === 'CONFLICT') {
      await marcar(admin, loja, eventId, 'IGNORED', 'assinatura viva em outra origem (0061)')
      logger.error('loja:notificacao_conflito', { loja, perfil, tipo })
      return 'CONFLICT'
    }

    await marcar(admin, loja, eventId, 'PROCESSED')
    /*
     * O log guarda perfil, loja e estado — nunca o comprovante nem o token: o
     * token da compra é o que concede acesso no Google, e um log com ele
     * dentro é uma cópia da chave em texto puro.
     */
    logger.info('loja:notificacao_processada', { loja, perfil, tipo, estado: estado.status })
    return 'PROCESSED'
  } catch (erro) {
    logger.error('loja:notificacao_falhou', { loja, eventId, erro: String(erro) })
    await marcar(admin, loja, eventId, 'FAILED', String(erro).slice(0, 500))
    return 'FAILED'
  }
}

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>

/**
 * De quem é esta assinatura?
 *
 * A referência da loja primeiro, porque é a amarra que a compra estabeleceu.
 * O `plus_provider_ref` é o plano B — e ele existe porque a Apple **não** manda
 * `appAccountToken` em toda notificação: ela o manda quando a compra o
 * incluiu, e uma assinatura migrada de outra conta de loja pode chegar sem.
 */
async function acharPerfil(
  admin: Admin,
  loja: Loja,
  estado: EstadoDaLoja,
): Promise<string | null> {
  if (estado.referencia) {
    /*
     * Confere que o perfil existe antes de escrever. `set_plus_subscription`
     * levanta exceção para perfil inexistente, e uma referência inventada
     * viraria `FAILED` com cara de problema nosso.
     */
    const { data } = await admin
      .from('user_profiles')
      .select('id')
      .eq('id', estado.referencia)
      .maybeSingle()
    if (data?.id) return data.id
  }

  const { data } = await admin
    .from('user_profiles')
    .select('id')
    .eq('plus_provider', loja)
    .eq('plus_provider_ref', estado.refDaLoja)
    .maybeSingle()

  return data?.id ?? null
}

async function marcar(
  admin: Admin,
  loja: string,
  eventId: string,
  status: 'PROCESSED' | 'IGNORED' | 'FAILED',
  detalhe?: string,
) {
  await admin
    .from('webhook_events')
    .update({ status, processed_at: new Date().toISOString(), error_detail: detalhe ?? null })
    .eq('provider', loja)
    .eq('event_id', eventId)
}
