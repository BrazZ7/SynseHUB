import 'server-only'

import { createSupabaseAdminClient } from '@/lib/database/supabase-admin'
import { logger } from '@/lib/logger'

export type BillingRunResult = {
  ok: boolean
  /** Mensalidades criadas nesta execução. */
  created: number
  /** Cobranças que passaram para vencida. */
  overdue: number
  reason?: string
}

/**
 * O trabalho diário de cobrança.
 *
 * Duas chamadas, nesta ordem, e a ordem importa: gerar antes de vencer faz com
 * que uma cobrança criada hoje com vencimento de ontem — o que acontece quando
 * o job ficou um dia fora do ar — já saia marcada como vencida, em vez de
 * esperar mais 24 horas para aparecer na lista de inadimplentes.
 *
 * Toda a lógica está no banco, em `generate_due_charges` e
 * `mark_overdue_charges`. Aqui não há regra de negócio nenhuma de propósito: a
 * idempotência que impede cobrança dobrada é a restrição de unicidade da
 * tabela, e ela só protege quem passa por lá.
 */
export async function runBillingJob(
  options: { referenceDate?: string; daysAhead?: number } = {},
): Promise<BillingRunResult> {
  const admin = createSupabaseAdminClient()
  if (!admin) {
    // Sem chave de serviço não há como escrever cobrança de ninguém — e falhar
    // dizendo isso é melhor que devolver "0 criadas", que parece sucesso.
    return { ok: false, created: 0, overdue: 0, reason: 'service-role-ausente' }
  }

  const referencia = options.referenceDate ?? new Date().toISOString().slice(0, 10)

  const geradas = await admin.rpc('generate_due_charges', {
    p_reference: referencia,
    p_days_ahead: options.daysAhead ?? 5,
  })

  if (geradas.error) {
    logger.error('billing:generate_failed', { error: geradas.error.message })
    return { ok: false, created: 0, overdue: 0, reason: 'falha-ao-gerar' }
  }

  const vencidas = await admin.rpc('mark_overdue_charges', { p_reference: referencia })

  if (vencidas.error) {
    /*
     * Gerar deu certo e marcar não. Isso é sucesso parcial, não falha: as
     * cobranças criadas existem e ninguém deve regerá-las. O relatório diz o
     * que aconteceu de cada lado.
     */
    logger.error('billing:overdue_failed', { error: vencidas.error.message })
    return {
      ok: false,
      created: Number(geradas.data ?? 0),
      overdue: 0,
      reason: 'falha-ao-marcar-vencidas',
    }
  }

  const resultado = {
    ok: true,
    created: Number(geradas.data ?? 0),
    overdue: Number(vencidas.data ?? 0),
  }

  logger.info('billing:run', { referencia, ...resultado })
  return resultado
}
