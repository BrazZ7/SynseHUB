import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BodyMeasurement } from '@/types/domain'

/**
 * A fila offline.
 *
 * A balança é Bluetooth, não é internet: pesar no banheiro de manhã com o
 * celular sem sinal é o caso comum. O que estes testes fixam é o que acontece
 * depois — quando a rede volta, o que sobe, o que fica, e o que a fila
 * finalmente desiste de tentar.
 */

const acao = vi.hoisted(() => vi.fn())
const armazem = vi.hoisted(() => ({
  pendentes: vi.fn(),
  marcarSincronizada: vi.fn(),
  marcarFalha: vi.fn(),
  descartar: vi.fn(),
}))

vi.mock('@/features/synse-body/actions', () => ({ recordBodyMeasurementAction: acao }))
vi.mock('@/features/synse-body/storage/local-measurements', () => ({
  ...armazem,
  TENTATIVAS_ATE_DESISTIR: 5,
}))

const { enviarAgora, sincronizarPendentes } = await import('@/features/synse-body/sync')

const medida = (clientId: string): BodyMeasurement => ({
  clientId,
  measuredAt: '2026-09-16T07:30:00.000Z',
  source: 'BLUETOOTH_SCALE',
  deviceId: 'd-1',
  weightKg: 70.4,
  fieldOrigin: { weightKg: 'MEASURED' },
})

const naFila = (clientId: string, attempts = 0) => ({
  clientId,
  measurement: medida(clientId),
  syncStatus: 'pending' as const,
  attempts,
  lastError: null,
  updatedAt: 1,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a rede voltando', () => {
  it('sobe as pendentes e tira cada uma da fila', async () => {
    armazem.pendentes.mockResolvedValue([naFila('c-1'), naFila('c-2')])
    acao.mockResolvedValue({ status: 'success', measurementId: 'bm-1' })

    const resultado = await sincronizarPendentes()

    expect(resultado).toMatchObject({ enviadas: 2, falhas: 0, descartadas: 0 })
    expect(armazem.marcarSincronizada).toHaveBeenCalledWith('c-1')
    expect(armazem.marcarSincronizada).toHaveBeenCalledWith('c-2')
  })

  it('a que falha continua na fila, com a tentativa contada', async () => {
    armazem.pendentes.mockResolvedValue([naFila('c-1')])
    acao.mockResolvedValue({ status: 'error', message: 'rede indisponível' })

    const resultado = await sincronizarPendentes()

    expect(resultado).toMatchObject({ enviadas: 0, falhas: 1, descartadas: 0 })
    expect(armazem.marcarFalha).toHaveBeenCalledWith('c-1', 'rede indisponível')
    expect(armazem.descartar).not.toHaveBeenCalled()
  })

  it('depois de tentar demais, a fila desiste em vez de tentar para sempre', async () => {
    /*
     * Erro de validação não melhora com repetição. Insistir a cada abertura do
     * app gastaria bateria para receber a mesma recusa, e esconderia da pessoa
     * que aquela medição nunca entrou.
     */
    armazem.pendentes.mockResolvedValue([naFila('c-1', 4)])
    acao.mockResolvedValue({ status: 'error', message: 'peso inválido' })

    const resultado = await sincronizarPendentes()

    expect(resultado).toMatchObject({ enviadas: 0, falhas: 0, descartadas: 1 })
    expect(armazem.descartar).toHaveBeenCalledWith('c-1')
  })

  it('uma pendente que falha não impede a seguinte de subir', async () => {
    armazem.pendentes.mockResolvedValue([naFila('c-1'), naFila('c-2')])
    acao
      .mockResolvedValueOnce({ status: 'error', message: 'timeout' })
      .mockResolvedValueOnce({ status: 'success', measurementId: 'bm-2' })

    const resultado = await sincronizarPendentes()

    expect(resultado).toMatchObject({ enviadas: 1, falhas: 1 })
    expect(armazem.marcarSincronizada).toHaveBeenCalledWith('c-2')
  })

  it('fila vazia não chama o servidor', async () => {
    armazem.pendentes.mockResolvedValue([])
    await sincronizarPendentes()
    expect(acao).not.toHaveBeenCalled()
  })
})

describe('a pesagem recém-feita', () => {
  it('sobe na hora e sai da fila', async () => {
    acao.mockResolvedValue({ status: 'success', measurementId: 'bm-9' })

    await expect(enviarAgora(medida('c-9'))).resolves.toEqual({ ok: true, id: 'bm-9' })
    expect(armazem.marcarSincronizada).toHaveBeenCalledWith('c-9')
  })

  it('sem rede, fica pendente — e a medição não se perde', async () => {
    acao.mockResolvedValue({ status: 'error', message: 'sem conexão' })

    const resposta = await enviarAgora(medida('c-9'))

    expect(resposta).toEqual({ ok: false, message: 'sem conexão' })
    expect(armazem.marcarFalha).toHaveBeenCalledWith('c-9', 'sem conexão')
    expect(armazem.marcarSincronizada).not.toHaveBeenCalled()
  })

  it('o reenvio manda o mesmo clientId: é ele que impede a linha duplicada', async () => {
    acao.mockResolvedValue({ status: 'success', measurementId: 'bm-9' })

    await enviarAgora(medida('c-9'))
    await enviarAgora(medida('c-9'))

    const enviados = acao.mock.calls.map(([payload]) => (payload as BodyMeasurement).clientId)
    expect(enviados).toEqual(['c-9', 'c-9'])
  })
})
