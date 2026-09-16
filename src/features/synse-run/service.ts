import 'server-only'

import { getDataSource } from '@/lib/database'
import { isPendingMigration } from '@/lib/database/pending-migration'
import { logger } from '@/lib/logger'
import type { SessionContext } from '@/lib/auth/session'
import type { Activity, ActivitySummary, PersonalRecord } from '@/types/domain'

export type RunDashboard = {
  available: boolean
  week: ActivitySummary
  byDay: Array<{ label: string; distanceMeters: number }>
  recent: Activity[]
  records: PersonalRecord[]
}

const VAZIO: RunDashboard = {
  available: false,
  week: { activities: 0, distanceMeters: 0, movingSeconds: 0, calories: 0, elevationGain: 0 },
  byDay: [],
  recent: [],
  records: [],
}

/** Segunda-feira desta semana, à meia-noite. A semana brasileira começa nela. */
function inicioDaSemana(agora = new Date()): Date {
  const dia = agora.getDay()
  const recuo = dia === 0 ? 6 : dia - 1
  const segunda = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - recuo)
  return segunda
}

export async function getRunDashboard(session: SessionContext): Promise<RunDashboard> {
  const inicio = inicioDaSemana()

  try {
    const dataSource = await getDataSource()

    const [week, recent, records, daSemana] = await Promise.all([
      dataSource.summarizeActivities(session.userProfileId, inicio.toISOString()),
      dataSource.listActivities(session.userProfileId, { limit: 5 }),
      dataSource.listPersonalRecords(session.userProfileId),
      dataSource.listActivities(session.userProfileId, {
        since: inicio.toISOString(),
        limit: 100,
      }),
    ])

    /*
     * Sete colunas sempre, inclusive as vazias: o gráfico da semana precisa
     * mostrar o descanso. Um gráfico que só desenha os dias treinados esconde
     * exatamente a informação que a pessoa procura ali.
     */
    const rotulos = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
    const byDay = rotulos.map((label, indice) => {
      const dia = new Date(inicio)
      dia.setDate(inicio.getDate() + indice)
      const proximo = new Date(dia)
      proximo.setDate(dia.getDate() + 1)

      const distanceMeters = daSemana
        .filter((atividade) => {
          const quando = new Date(atividade.startedAt)
          return quando >= dia && quando < proximo
        })
        .reduce((total, atividade) => total + atividade.distanceMeters, 0)

      return { label, distanceMeters }
    })

    return { available: true, week, byDay, recent, records }
  } catch (error) {
    if (isPendingMigration(error)) {
      logger.warn('synse-run:schema_pendente', { detalhe: 'Migration 0016 pendente.' })
      return VAZIO
    }

    logger.error('synse-run:painel_falhou', { error: String(error).slice(0, 300) })
    return VAZIO
  }
}
