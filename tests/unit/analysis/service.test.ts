import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ExercisePersonalRecord,
  ExerciseProgressPoint,
  WorkoutAdherenceRow,
  WorkoutSessionSummary,
  WorkoutTotals,
} from '@/types/domain'

const ATE = new Date('2026-09-30T00:00:00Z')

function totais(parcial: Partial<WorkoutTotals>): WorkoutTotals {
  return {
    workouts: 0,
    sets: 0,
    reps: 0,
    volumeKg: 0,
    averageDurationSeconds: null,
    averageRestSeconds: null,
    distinctExercises: 0,
    ...parcial,
  }
}

/**
 * Um data source de mentira, com o mínimo que a análise pede. As chamadas
 * ficam registradas porque metade do que este teste confere é *com que
 * argumentos* o serviço consultou — as duas janelas, e quais exercícios.
 */
const chamadas: { totais: Array<[string, string]>; progresso: string[] } = {
  totais: [],
  progresso: [],
}

let porJanela: (de: string) => WorkoutTotals
let recordes: ExercisePersonalRecord[]
let sessoes: WorkoutSessionSummary[]
let progresso: Record<string, ExerciseProgressPoint[]>
let linhasDeAderencia: WorkoutAdherenceRow[]
let erro: unknown = null

const dataSource = {
  async getWorkoutTotals(_studentId: string, from: string, to: string) {
    if (erro) throw erro
    chamadas.totais.push([from, to])
    return porJanela(from)
  },
  async getPersonalRecords() {
    if (erro) throw erro
    return recordes
  },
  async listWorkoutSessions() {
    if (erro) throw erro
    return sessoes
  },
  async getWorkoutAdherence() {
    if (erro) throw erro
    return linhasDeAderencia
  },
  async getExerciseProgress(_studentId: string, exerciseId: string) {
    if (erro) throw erro
    chamadas.progresso.push(exerciseId)
    return progresso[exerciseId] ?? []
  },
}

vi.mock('@/lib/database', () => ({ getDataSource: async () => dataSource }))
vi.mock('@/lib/logger', () => ({
  logger: { warn: () => {}, error: () => {}, info: () => {} },
}))

const { getAnaliseMensal, DIAS_DA_JANELA, EXERCICIOS_NA_ANALISE } = await import(
  '@/features/analysis/service'
)

function recorde(
  exerciseId: string,
  achievedAt: string,
  maxWeight = 80,
): ExercisePersonalRecord {
  return { exerciseId, exerciseName: exerciseId, maxWeight, reps: 5, achievedAt }
}

function sessao(startedAt: string): WorkoutSessionSummary {
  return {
    id: startedAt,
    organizationId: 'org',
    studentId: 'aluno',
    workoutPlanId: null,
    planName: null,
    clientId: startedAt,
    status: 'COMPLETED',
    startedAt,
    completedAt: startedAt,
    durationSeconds: 3_600,
    totalSets: 12,
    totalReps: 120,
    volumeKg: 4_000,
  }
}

beforeEach(() => {
  chamadas.totais = []
  chamadas.progresso = []
  erro = null
  recordes = []
  sessoes = []
  progresso = {}
  linhasDeAderencia = []
  porJanela = () => totais({})
})

describe('getAnaliseMensal', () => {
  it('consulta duas janelas do mesmo tamanho, coladas uma na outra', async () => {
    await getAnaliseMensal('aluno', { ate: ATE })

    expect(chamadas.totais).toHaveLength(2)
    const [atual, anterior] = chamadas.totais
    // O fim da janela anterior é o começo da atual: sem buraco, sem sobreposição.
    expect(anterior[1]).toBe(atual[0])

    const tamanho = (par: [string, string]) =>
      Math.round((Date.parse(par[1]) - Date.parse(par[0])) / 86_400_000)
    expect(tamanho(atual)).toBe(DIAS_DA_JANELA)
    expect(tamanho(anterior)).toBe(DIAS_DA_JANELA)
  })

  it('compara quando houve treino no período anterior', async () => {
    const inicioDaAtual = new Date(ATE.getTime() - DIAS_DA_JANELA * 86_400_000).toISOString()
    porJanela = (de) =>
      de === inicioDaAtual
        ? totais({ workouts: 13, volumeKg: 61_000 })
        : totais({ workouts: 10, volumeKg: 48_000 })

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.available).toBe(true)
    expect(analise.comparacao?.treinos).toMatchObject({ antes: 10, depois: 13, percentual: 30 })
  })

  it('não compara com um período anterior vazio', async () => {
    // Quem começou agora não teve "crescimento de 100%": não havia base.
    const inicioDaAtual = new Date(ATE.getTime() - DIAS_DA_JANELA * 86_400_000).toISOString()
    porJanela = (de) => (de === inicioDaAtual ? totais({ workouts: 9 }) : totais({ workouts: 0 }))

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.totais.workouts).toBe(9)
    expect(analise.comparacao).toBeNull()
  })

  it('escolhe os exercícios pelo recorde mais recente, não pelo mais pesado', async () => {
    recordes = [
      recorde('leg-press', '2024-01-10T10:00:00Z', 300),
      recorde('supino', '2026-09-20T10:00:00Z', 90),
      recorde('remada', '2026-09-18T10:00:00Z', 70),
      recorde('rosca', '2026-09-15T10:00:00Z', 30),
    ]

    await getAnaliseMensal('aluno', { ate: ATE })

    expect(chamadas.progresso).toHaveLength(EXERCICIOS_NA_ANALISE)
    // O leg press de 300 kg é o número grande de qualquer ficha, e é de 2024.
    expect(chamadas.progresso).not.toContain('leg-press')
    expect(chamadas.progresso).toEqual(['supino', 'remada', 'rosca'])
  })

  it('descarta da curva o exercício sem duas semanas de carga', async () => {
    recordes = [recorde('supino', '2026-09-20T10:00:00Z'), recorde('remada', '2026-09-18T10:00:00Z')]
    progresso = {
      supino: [
        { week: '2026-07-06', maxWeight: 72, volumeKg: 0, sets: 0, reps: 0 },
        { week: '2026-09-21', maxWeight: 81, volumeKg: 0, sets: 0, reps: 0 },
      ],
      remada: [{ week: '2026-09-21', maxWeight: 60, volumeKg: 0, sets: 0, reps: 0 }],
    }

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.forca.map((linha) => linha.exerciseId)).toEqual(['supino'])
    expect(analise.forca[0].evolucao).toMatchObject({ de: 72, para: 81, percentual: 12.5 })
  })

  it('mede constância sobre as sessões concluídas da janela', async () => {
    sessoes = [
      sessao('2026-09-28T10:00:00Z'),
      sessao('2026-09-26T10:00:00Z'),
      sessao('2026-09-24T10:00:00Z'),
      // Fora da janela de 30 dias: não conta.
      sessao('2026-07-01T10:00:00Z'),
    ]

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.constancia?.treinos).toBe(3)
    // Nada entre 31/08 e 24/09 — é o maior silêncio da janela.
    expect(analise.constancia?.maiorIntervaloDias).toBe(24)
  })

  it('só traz recorde que caiu dentro da janela', async () => {
    recordes = [recorde('supino', '2026-09-20T10:00:00Z'), recorde('agachamento', '2024-02-01T10:00:00Z')]

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.recordes.map((linha) => linha.exerciseId)).toEqual(['supino'])
    expect(analise.recordes[0].cargaMaximaEstimada).toBe(93.5)
  })

  it('mede aderência sobre as linhas do período', async () => {
    linhasDeAderencia = [
      {
        sessionId: 's1',
        startedAt: '2026-09-10T10:00:00Z',
        plannedSets: 3,
        plannedReps: 30,
        completedReps: 30,
        setsBelowPlan: 0,
      },
      {
        sessionId: 's2',
        startedAt: '2026-09-20T10:00:00Z',
        plannedSets: 3,
        plannedReps: 30,
        completedReps: 21,
        setsBelowPlan: 2,
      },
    ]

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.aderencia).toMatchObject({ sessoes: 2, planejadas: 60, feitas: 51 })
    expect(analise.aderencia?.fracao).toBeCloseTo(0.85, 3)
    // Duas sessões não dão tendência: sem base, não compara.
    expect(analise.aderencia?.recente).toBeNull()
  })

  it('não mede aderência de quem só treinou livre', async () => {
    linhasDeAderencia = []
    const analise = await getAnaliseMensal('aluno', { ate: ATE })
    expect(analise.aderencia).toBeNull()
  })

  it('devolve vazio, e não erro, quando a migration ainda não subiu', async () => {
    // Publicar não é migrar: entre o deploy e o SQL colado à mão, a tela
    // precisa continuar de pé.
    erro = Object.assign(new Error('relation does not exist'), { code: '42P01' })

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.available).toBe(false)
    expect(analise.totais.workouts).toBe(0)
    expect(analise.janela.dias).toBe(DIAS_DA_JANELA)
  })

  it('devolve vazio numa falha qualquer da consulta', async () => {
    erro = new Error('timeout')

    const analise = await getAnaliseMensal('aluno', { ate: ATE })

    expect(analise.available).toBe(false)
    expect(analise.comparacao).toBeNull()
  })
})
