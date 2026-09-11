import 'server-only'

import { currentCycle } from '@/lib/baseline/challenges'
import { getDataSource } from '@/lib/database'
import { logger } from '@/lib/logger'
import { CHALLENGES_PER_CYCLE } from '@/lib/plans/tiers'
import type { SessionContext } from '@/lib/auth/session'
import type { BaselineChallenge, ChallengeEntry, ChallengeMedal } from '@/types/domain'

export type ActiveChallenge = ChallengeEntry & {
  challenge: BaselineChallenge
  percentage: number
}

export type CycleReport = {
  cycle: string
  medal: ChallengeMedal
  challenge: BaselineChallenge | null
  percentage: number
}

export type ChallengeBoard = {
  catalog: BaselineChallenge[]
  active: ActiveChallenge[]
  medals: ChallengeMedal[]
  /** Fechamento mais recente: é a análise que a pessoa recebe no fim do mês. */
  lastReport: CycleReport | null
  slotsLeft: number
  slotsTotal: number
}

function percent(progress: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.round((progress / target) * 100))
}

/**
 * Tudo que a tela de desafios precisa, numa consulta só.
 *
 * O fechamento do mês passado acontece aqui, na leitura, e não num agendador.
 * A função no banco é idempotente e só mexe nos ciclos de quem chamou, então
 * abrir o app dez vezes no dia 1º entrega uma medalha só. Um cron mensal daria
 * o mesmo resultado com uma peça de infraestrutura a mais para quebrar em
 * silêncio — e sem ninguém abrir o app não há medalha para entregar mesmo.
 */
export async function getChallengeBoard(session: SessionContext): Promise<ChallengeBoard> {
  const dataSource = await getDataSource()

  try {
    const fechados = await dataSource.closeOwnChallengeCycles()
    if (fechados > 0) logger.info('challenges:cycles_closed', { fechados })
  } catch (error) {
    // Fechar é importante, mas não a ponto de derrubar a tela de quem só quer
    // ver o desafio do mês.
    logger.warn('challenges:close_failed', { error: String(error).slice(0, 200) })
  }

  const [catalog, entries, medals] = await Promise.all([
    dataSource.listBaselineChallenges(),
    dataSource.listChallengeEntries(session.userProfileId),
    dataSource.listChallengeMedals(session.userProfileId),
  ])

  const byCode = new Map(catalog.map((item) => [item.code, item]))
  const cycle = currentCycle()

  const active = entries
    .filter((entry) => entry.cycle.slice(0, 10) === cycle && entry.closedAt === null)
    .map((entry) => ({
      ...entry,
      challenge: byCode.get(entry.challengeCode) as BaselineChallenge,
      percentage: percent(entry.progressValue, entry.targetValue),
    }))
    .filter((entry) => Boolean(entry.challenge))

  const slotsTotal = CHALLENGES_PER_CYCLE[session.tier]
  const [ultima] = medals

  return {
    catalog,
    active,
    medals,
    lastReport: ultima
      ? {
          cycle: ultima.cycle,
          medal: ultima,
          challenge: byCode.get(ultima.challengeCode) ?? null,
          percentage: percent(ultima.progressValue, ultima.targetValue),
        }
      : null,
    slotsLeft: Math.max(0, slotsTotal - active.length),
    slotsTotal,
  }
}

/** Nome do mês de um ciclo (2026-03-01 → "março de 2026"). */
export function cycleLabel(cycle: string): string {
  const [ano, mes] = cycle.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(ano, (mes ?? 1) - 1, 1),
  )
}
