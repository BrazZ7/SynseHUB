import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParsedScaleReading } from '@/features/synse-body/engine/types'
import { weighingReducer } from '@/features/synse-body/engine/weighing-machine'
import { ESTADO_INICIAL } from '@/features/synse-body/engine/weighing-machine'
import { APARELHO_DEMO, createMockScaleProvider } from '@/features/synse-body/providers/mock'

/**
 * A balança simulada movendo a pesagem de ponta a ponta.
 *
 * Fecha o ciclo que os outros testes cobrem por partes: bytes no layout do
 * padrão → parser de verdade → máquina de estados → medição normalizada. Sem
 * hardware, e sem nenhum atalho: o mock emite bytes, não objetos prontos.
 */

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function pesar(provider: ReturnType<typeof createMockScaleProvider>) {
  const leituras: ParsedScaleReading[] = []
  const cancelar = await provider.subscribeToMeasurements(APARELHO_DEMO.platformDeviceId, (l) =>
    leituras.push(l),
  )
  await vi.advanceTimersByTimeAsync(5_000)
  cancelar()
  return leituras
}

describe('a balança simulada', () => {
  it('a varredura encontra o aparelho de demonstração', async () => {
    const provider = createMockScaleProvider()
    const encontrados = await provider.scan({ timeoutMs: 100 })
    expect(encontrados).toHaveLength(1)
    expect(encontrados[0].platformDeviceId).toBe(APARELHO_DEMO.platformDeviceId)
  })

  it('permissão negada é um resultado, não uma exceção', async () => {
    const provider = createMockScaleProvider({ pesosKg: [70], permissaoNegada: true })
    const resultado = await provider.requestPermissions()
    expect(resultado).toMatchObject({ granted: false, reason: 'DENIED' })
  })

  it('balança incompatível: nenhum aparelho encontrado, e a varredura termina', async () => {
    const provider = createMockScaleProvider({ pesosKg: [], semAparelhos: true })
    const promessa = provider.scan({ timeoutMs: 8_000 })
    await vi.advanceTimersByTimeAsync(8_000)
    expect(await promessa).toEqual([])
  })

  it('a pessoa se equilibrando vira uma medição estável', async () => {
    const provider = createMockScaleProvider()
    const leituras = await pesar(provider)

    let estado = weighingReducer(ESTADO_INICIAL, { tipo: 'INICIAR', em: 0 })
    leituras.forEach((leitura, i) => {
      estado = weighingReducer(estado, { tipo: 'LEITURA', leitura, em: (i + 1) * 350 })
    })

    expect(estado.estado).toBe('ESTAVEL')
    expect(estado.pesoAtualKg).toBeCloseTo(70.4, 1)

    const normalizada = provider.normalizeMeasurement(estado.leituraFinal!, {
      clientId: 'c-1',
      heightM: 1.78,
      deviceId: 'd-1',
    })
    expect(normalizada.ok).toBe(true)
    if (!normalizada.ok) return

    expect(normalizada.measurement.weightKg).toBeCloseTo(70.4, 1)
    // O último pacote é de composição: gordura estimada, peso medido.
    expect(normalizada.measurement.fieldOrigin.bodyFatPercent).toBe('ESTIMATED')
    expect(normalizada.measurement.fieldOrigin.weightKg).toBe('MEASURED')
    // E o metabolismo já convertido de quilojoule.
    expect(normalizada.measurement.bmrKcal).toBeCloseTo(1600, -1)
  })

  it('a balança em libras chega em quilo do outro lado', async () => {
    const provider = createMockScaleProvider({ pesosKg: [70.4], imperial: true, comComposicao: false })
    const [leitura] = await pesar(provider)

    expect(leitura.reportedImperial).toBe(true)
    expect(leitura.weightKg).toBeCloseTo(70.4, 1)
  })

  it('medição malsucedida guarda o peso e recusa a composição', async () => {
    const provider = createMockScaleProvider({ pesosKg: [70.4], malsucedida: true })
    const [leitura] = await pesar(provider)

    expect(leitura.unsuccessful).toBe(true)
    const normalizada = provider.normalizeMeasurement(leitura, { clientId: 'c-1' })
    expect(normalizada.ok).toBe(true)
    if (!normalizada.ok) return
    expect(normalizada.measurement.bodyFatPercent).toBeUndefined()
    expect(normalizada.measurement.weightKg).toBeCloseTo(70.4, 1)
  })

  it('aparelho que some no meio deixa a pesagem sem estabilizar', async () => {
    const provider = createMockScaleProvider({ pesosKg: [68.2, 71.9, 70.4], desconectaApos: 2 })
    const leituras = await pesar(provider)
    expect(leituras).toHaveLength(2)

    let estado = weighingReducer(ESTADO_INICIAL, { tipo: 'INICIAR', em: 0 })
    leituras.forEach((leitura, i) => {
      estado = weighingReducer(estado, { tipo: 'LEITURA', leitura, em: (i + 1) * 350 })
    })
    estado = weighingReducer(estado, { tipo: 'TEMPO', em: 60_000 })

    expect(estado.estado).toBe('ERRO')
  })

  it('cancelar a assinatura cala o aparelho', async () => {
    const provider = createMockScaleProvider()
    const leituras: ParsedScaleReading[] = []
    const cancelar = await provider.subscribeToMeasurements('x', (l) => leituras.push(l))
    cancelar()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(leituras).toHaveLength(0)
  })

  it('as capacidades declaradas são as que o mock entrega', async () => {
    const provider = createMockScaleProvider()
    const capacidades = await provider.getCapabilities('x')
    expect(capacidades.impedance).toBe(true)
    expect(capacidades.bodyWaterMass).toBe(true)
    // Ele não faz altura, e não promete que faz.
    expect(capacidades.height).toBe(false)
  })
})
