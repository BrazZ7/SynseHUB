import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PendingOperation } from '@/features/active-workout/storage/local-workout'

/**
 * O que a fila do treino joga fora.
 *
 * A regra central é a dependência: série e encerramento precisam do id que o
 * servidor daria ao **abrir** a sessão. Quando a abertura se esgota, esse id
 * nunca vai existir — e manter as séries enfileiradas seria guardar um
 * pendente que não tem como ser resolvido, para sempre.
 */

const removidas: string[] = []
vi.mock('@/features/active-workout/actions', () => ({
  startWorkoutSessionAction: vi.fn(),
  logWorkoutSetAction: vi.fn(),
  finishWorkoutSessionAction: vi.fn(),
}))
vi.mock('@/features/active-workout/storage/local-workout', () => ({
  lerFila: vi.fn(),
  removerDaFila: vi.fn(async (clientId: string) => {
    removidas.push(clientId)
  }),
  registrarTentativa: vi.fn(),
  enfileirar: vi.fn(),
}))

const { expurgar } = await import('@/features/active-workout/sync')

const ESGOTADA = 8

const inicio = (clientId: string, tentativas = 0): PendingOperation => ({
  kind: 'START',
  clientId,
  workoutPlanId: null,
  tentativas,
})

const serie = (clientId: string, sessionClientId: string, tentativas = 0): PendingOperation => ({
  kind: 'SET',
  clientId,
  sessionClientId,
  exerciseId: 'ex-1',
  setNumber: 1,
  repsPlanned: 10,
  repsCompleted: 10,
  weight: 70,
  restSeconds: 60,
  startedAt: 0,
  completedAt: 1,
  tentativas,
})

const fim = (clientId: string, sessionClientId: string, tentativas = 0): PendingOperation => ({
  kind: 'FINISH',
  clientId,
  sessionClientId,
  durationSeconds: 3600,
  status: 'COMPLETED',
  tentativas,
})

beforeEach(() => {
  removidas.length = 0
})

describe('o expurgo da fila', () => {
  it('fila sadia não perde nada', async () => {
    const fila = [inicio('s1'), serie('a', 's1'), fim('f', 's1')]
    const resultado = await expurgar(fila)

    expect(resultado.restante).toHaveLength(3)
    expect(resultado.treinosPerdidos).toBe(0)
    expect(resultado.seriesPerdidas).toBe(0)
    expect(removidas).toEqual([])
  })

  it('abertura esgotada leva junto as séries que dependiam dela', async () => {
    /*
     * Sem esta regra, as séries ficavam para sempre: o laço de sincronização
     * as pula por falta de id de sessão, então elas nunca somam tentativa,
     * então nunca se esgotam. Pendente eterno, e a tela dizendo isso.
     */
    const fila = [inicio('s1', ESGOTADA), serie('a', 's1'), serie('b', 's1'), fim('f', 's1')]
    const resultado = await expurgar(fila)

    expect(resultado.restante).toHaveLength(0)
    expect(resultado.treinosPerdidos).toBe(1)
    expect(resultado.seriesPerdidas).toBe(3)
    expect(removidas.sort()).toEqual(['a', 'b', 'f', 's1'])
  })

  it('a série esgotada cai sozinha, e o treino continua', async () => {
    const fila = [inicio('s1'), serie('a', 's1', ESGOTADA), serie('b', 's1'), fim('f', 's1')]
    const resultado = await expurgar(fila)

    expect(resultado.treinosPerdidos).toBe(0)
    expect(resultado.seriesPerdidas).toBe(1)
    expect(resultado.restante.map((o) => o.clientId)).toEqual(['s1', 'b', 'f'])
  })

  it('a queda de um treino não derruba o outro', async () => {
    // Duas sessões na fila: a pessoa treinou ontem sem rede e de novo hoje.
    const fila = [inicio('s1', ESGOTADA), serie('a', 's1'), inicio('s2'), serie('b', 's2')]
    const resultado = await expurgar(fila)

    expect(resultado.treinosPerdidos).toBe(1)
    expect(resultado.restante.map((o) => o.clientId)).toEqual(['s2', 'b'])
  })

  it('remove de verdade, e não só do resultado devolvido', async () => {
    // Se só filtrasse em memória, a próxima abertura do app traria tudo de volta.
    await expurgar([inicio('s1', ESGOTADA)])
    expect(removidas).toEqual(['s1'])
  })
})
