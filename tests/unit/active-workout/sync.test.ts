import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PendingOperation } from '@/features/active-workout/storage/local-workout'

/**
 * A fila offline.
 *
 * Academia é subsolo com concreto. O treino precisa continuar quando a rede
 * cai, e subir inteiro quando ela volta — sem duplicar nada e sem inverter a
 * ordem, porque série de uma sessão que o servidor ainda não conhece é série
 * perdida.
 *
 * O armazenamento e as actions são substituídos aqui: o que está sob teste é a
 * orquestração, não o IndexedDB nem o Supabase.
 */

const fila: PendingOperation[] = []
const chamadas: string[] = []

vi.mock('@/features/active-workout/storage/local-workout', () => ({
  lerFila: vi.fn(async () => {
    const peso = { START: 0, SET: 1, FINISH: 2 }
    return [...fila].sort((a, b) => peso[a.kind] - peso[b.kind])
  }),
  removerDaFila: vi.fn(async (clientId: string) => {
    const i = fila.findIndex((o) => o.clientId === clientId)
    if (i >= 0) fila.splice(i, 1)
  }),
  registrarTentativa: vi.fn(async (operacao: PendingOperation) => {
    const i = fila.findIndex((o) => o.clientId === operacao.clientId)
    if (i >= 0) fila[i] = { ...operacao, tentativas: operacao.tentativas + 1 }
  }),
  enfileirar: vi.fn(),
}))

const semRede = { ok: false as const, erro: 'Falha de rede' }
let redeDisponivel = true

vi.mock('@/features/active-workout/actions', () => ({
  startWorkoutSessionAction: vi.fn(async (clientId: string) => {
    chamadas.push(`START:${clientId}`)
    return redeDisponivel ? { ok: true as const, id: 'servidor-1' } : semRede
  }),
  logWorkoutSetAction: vi.fn(async (input: { clientId: string; sessionId: string }) => {
    chamadas.push(`SET:${input.clientId}@${input.sessionId}`)
    return redeDisponivel ? { ok: true as const, id: 'set-x' } : semRede
  }),
  finishWorkoutSessionAction: vi.fn(async () => {
    chamadas.push('FINISH')
    return redeDisponivel ? { ok: true as const } : semRede
  }),
}))

const { sincronizar } = await import('@/features/active-workout/sync')

const serie = (n: number): PendingOperation => ({
  kind: 'SET',
  clientId: `s-${n}`,
  sessionClientId: 'local-1',
  exerciseId: 'ex-1',
  setNumber: n,
  repsPlanned: 10,
  repsCompleted: 10,
  weight: 70,
  restSeconds: 90,
  startedAt: 1_000,
  completedAt: 2_000,
  tentativas: 0,
})

beforeEach(() => {
  fila.length = 0
  chamadas.length = 0
  redeDisponivel = true
})

describe('ordem', () => {
  it('abre a sessão antes de mandar série, mesmo enfileirada fora de ordem', async () => {
    /*
     * A série precisa do id do servidor, que só existe depois do START. Fora de
     * ordem, ela chegaria a uma sessão inexistente.
     */
    fila.push(serie(2), serie(1), {
      kind: 'START',
      clientId: 'local-1',
      workoutPlanId: 'plano-1',
      tentativas: 0,
    })

    const resultado = await sincronizar(null)

    expect(chamadas[0]).toBe('START:local-1')
    expect(resultado.enviadas).toBe(3)
    expect(resultado.pendentes).toBe(0)
    expect(resultado.sessionId).toBe('servidor-1')
  })

  it('as séries sobem com o id que o servidor devolveu, não com o local', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 0 },
      serie(1),
    )
    await sincronizar(null)
    expect(chamadas).toContain('SET:s-1@servidor-1')
  })
})

describe('a rede cai no meio', () => {
  it('nada é perdido: a fila segura o que não subiu', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 0 },
      serie(1),
      serie(2),
    )
    redeDisponivel = false

    const resultado = await sincronizar(null)

    expect(resultado.enviadas).toBe(0)
    expect(resultado.pendentes).toBe(3)
  })

  it('e sobe tudo quando ela volta', async () => {
    fila.push(
      { kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 0 },
      serie(1),
      serie(2),
    )
    redeDisponivel = false
    await sincronizar(null)

    redeDisponivel = true
    const resultado = await sincronizar(null)

    expect(resultado.enviadas).toBe(3)
    expect(resultado.pendentes).toBe(0)
  })

  it('para na primeira falha em vez de gastar rede com o resto', async () => {
    // As seguintes dependem da sessão que acabou de falhar; insistir nelas só
    // encheria o log de erro.
    fila.push(
      { kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 0 },
      serie(1),
    )
    redeDisponivel = false
    await sincronizar(null)

    expect(chamadas).toEqual(['START:local-1'])
  })

  it('não manda série antes de a sessão existir no servidor', async () => {
    fila.push(serie(1))
    const resultado = await sincronizar(null)

    expect(chamadas).toHaveLength(0)
    expect(resultado.pendentes).toBe(1)
  })
})

describe('tentativas', () => {
  it('conta a falha, para não tentar para sempre', async () => {
    fila.push({ kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 0 })
    redeDisponivel = false
    await sincronizar(null)

    expect(fila[0].tentativas).toBe(1)
  })

  it('depois do limite a operação sai da fila, e a perda é contada', async () => {
    /*
     * Oito falhas é erro que não é de rede — payload recusado pelo banco, por
     * exemplo. Insistir para sempre gastaria bateria a cada abertura do app.
     *
     * Antes, ela era apenas pulada e **ficava na fila**: o contador de
     * pendentes nunca chegava a zero, e a tela dizia "1 a sincronizar"
     * indefinidamente, sem explicar e sem resolver. Agora sai, e sai contada —
     * porque um treino que não subiu precisa ser dito, não escondido.
     */
    fila.push({ kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 8 })
    const resultado = await sincronizar(null)

    expect(chamadas).toHaveLength(0)
    expect(resultado.pendentes).toBe(0)
    expect(resultado.treinosPerdidos).toBe(1)
  })

  it('a série órfã não fica pendente para sempre', async () => {
    /*
     * O caso mais sorrateiro: a série depende do id que o servidor daria ao
     * abrir a sessão. Com a abertura esgotada, esse id nunca existirá — e o
     * laço de sincronização pula a série por falta dele, então ela nunca soma
     * tentativa e nunca se esgota sozinha. Pendente eterno.
     */
    fila.push({ kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 8 })
    fila.push(serie(1))

    const resultado = await sincronizar(null)

    expect(resultado.pendentes).toBe(0)
    expect(resultado.treinosPerdidos).toBe(1)
    expect(resultado.seriesPerdidas).toBe(1)
    expect(fila).toHaveLength(0)
  })
})

describe('reenvio', () => {
  it('sincronizar de novo com a fila vazia não chama nada', async () => {
    const resultado = await sincronizar('servidor-1')
    expect(chamadas).toHaveLength(0)
    expect(resultado.enviadas).toBe(0)
  })

  it('o encerramento sobe depois das séries', async () => {
    fila.push(
      { kind: 'FINISH', clientId: 'f-1', sessionClientId: 'local-1', durationSeconds: 1800, status: 'COMPLETED', tentativas: 0 },
      serie(1),
      { kind: 'START', clientId: 'local-1', workoutPlanId: null, tentativas: 0 },
    )
    await sincronizar(null)

    expect(chamadas).toEqual(['START:local-1', 'SET:s-1@servidor-1', 'FINISH'])
  })
})
