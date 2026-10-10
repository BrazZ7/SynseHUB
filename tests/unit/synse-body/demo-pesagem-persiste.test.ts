import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A pesagem gravada na demonstração precisa voltar na leitura.
 *
 * ── O defeito que este arquivo existe para impedir ──────────────────────────
 *
 * As pesagens moravam num `Map` estático do `DemoDataSource`, e o comentário
 * no código dizia que elas sobreviviam "dentro do processo, sumindo ao
 * recarregar". Medido com uma sonda, não sobreviviam nada: a escrita caía numa
 * cópia do módulo (`vcfg8c`) e a leitura em outra (`5saahq`), cada uma com o
 * próprio mapa — o Next carrega o mesmo módulo na camada da server action e na
 * do componente de servidor.
 *
 * O efeito na tela: "Medição salva." e o número nunca aparecia no histórico. É
 * o quarto caso do mesmo defeito no diário (`share`, `actpriv`, `wpref`).
 *
 * Por isso o teste **nunca** reutiliza a mesma instância para gravar e ler o
 * caso principal: ele monta uma segunda, como faria a requisição seguinte.
 */

const mutacoes: unknown[] = []
vi.mock('@/lib/database/demo-journal', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  appendDemoMutation: async (m: unknown) => {
    mutacoes.push(m)
  },
  readDemoJournal: async () => [],
}))

const { DemoDataSource } = await import('@/lib/database/demo-data-source')
type Mutacao = Parameters<typeof DemoDataSource.prototype.recordBodyMeasurement>[0]

const pesagem = (parcial: Partial<Mutacao> = {}): Mutacao => ({
  clientId: 'hc-uuid-de-teste-0001',
  measuredAt: '2026-10-10T07:00:00.000Z',
  source: 'HEALTH_CONNECT',
  deviceId: null,
  weightKg: 80.4,
  fieldOrigin: { weightKg: 'MEASURED' },
  ...parcial,
})

/** O que o diário emitiu, como ele chegaria na requisição seguinte. */
const doDiario = () => mutacoes as ConstructorParameters<typeof DemoDataSource>[0]

beforeEach(() => {
  mutacoes.length = 0
})

describe('gravar e ler', () => {
  it('a pesagem aparece na leitura da MESMA requisição', async () => {
    const fonte = new DemoDataSource([])
    await fonte.recordBodyMeasurement(pesagem())

    const { rows } = await fonte.listBodyMeasurements('30d')
    expect(rows.some((m) => m.clientId === 'hc-uuid-de-teste-0001')).toBe(true)
  })

  it('e continua lá na requisição SEGUINTE, por outra instância', async () => {
    // O coração da regressão: sem o diário, esta era a leitura que voltava vazia.
    await new DemoDataSource([]).recordBodyMeasurement(pesagem({ weightKg: 83.7 }))

    const seguinte = new DemoDataSource(doDiario())
    const { rows } = await seguinte.listBodyMeasurements('30d')
    const achada = rows.find((m) => m.clientId === 'hc-uuid-de-teste-0001')

    expect(achada).toBeDefined()
    expect(achada?.weightKg).toBe(83.7)
  })

  it('o diário leva a origem e a composição, não só o peso', async () => {
    await new DemoDataSource([]).recordBodyMeasurement(
      pesagem({ bodyFatPercent: 22.5, bodyWaterPercent: 60, bmi: 26.2 }),
    )

    const achada = (await new DemoDataSource(doDiario()).listBodyMeasurements('30d')).rows.find(
      (m) => m.clientId === 'hc-uuid-de-teste-0001',
    )

    expect(achada?.source).toBe('HEALTH_CONNECT')
    expect(achada?.bodyFatPercent).toBe(22.5)
    expect(achada?.bodyWaterPercent).toBe(60)
  })

  it('o fieldOrigin é derivado na leitura, e diz o que é estimativa', async () => {
    /*
     * Ele não viaja no cookie — seriam dez chaves para recalcular o que já se
     * sabe. Mas precisa chegar à tela, porque é ele que separa o que a balança
     * mediu do que a bioimpedância estimou.
     */
    await new DemoDataSource([]).recordBodyMeasurement(
      pesagem({ bodyFatPercent: 22.5, bodyWaterPercent: 60 }),
    )

    const achada = (await new DemoDataSource(doDiario()).listBodyMeasurements('30d')).rows.find(
      (m) => m.clientId === 'hc-uuid-de-teste-0001',
    )

    expect(achada?.fieldOrigin.weightKg).toBe('MEASURED')
    expect(achada?.fieldOrigin.bodyFatPercent).toBe('ESTIMATED')
    expect(achada?.fieldOrigin.bodyWaterPercent).toBe('CALCULATED')
  })

  it("a marca d'água da importação enxerga o que foi gravado", async () => {
    // Sem isto, toda sincronização varreria um ano de novo.
    await new DemoDataSource([]).recordBodyMeasurement(pesagem())

    const seguinte = new DemoDataSource(doDiario())
    expect(await seguinte.getLastHealthMeasurementAt('HEALTH_CONNECT')).toBe(
      '2026-10-10T07:00:00.000Z',
    )
    expect(await seguinte.getLastHealthMeasurementAt('APPLE_HEALTH')).toBeNull()
  })
})

describe('apagar', () => {
  it('alcança a pesagem semeada, que não tem entrada de criação para desfazer', async () => {
    const fonte = new DemoDataSource([])
    const antes = await fonte.listBodyMeasurements('tudo')
    const alvo = antes.rows[0]

    await fonte.deleteBodyMeasurement(alvo.id!)

    const seguinte = new DemoDataSource(doDiario())
    const depois = await seguinte.listBodyMeasurements('tudo')
    expect(depois.rows.some((m) => m.id === alvo.id)).toBe(false)
    expect(depois.total).toBe(antes.total - 1)
  })

  it('apagar e gravar de novo o mesmo clientId traz a pesagem de volta', async () => {
    const fonte = new DemoDataSource([])
    await fonte.recordBodyMeasurement(pesagem())
    await fonte.deleteBodyMeasurement('bm_hc-uuid-de-teste-0001')
    await fonte.recordBodyMeasurement(pesagem())

    const seguinte = new DemoDataSource(doDiario())
    const { rows } = await seguinte.listBodyMeasurements('30d')
    expect(rows.some((m) => m.clientId === 'hc-uuid-de-teste-0001')).toBe(true)
  })
})

describe('a regra da 0053 vale igual na demonstração', () => {
  it('a reimportação de saúde atualiza o peso', async () => {
    const fonte = new DemoDataSource([])
    await fonte.recordBodyMeasurement(pesagem({ weightKg: 80 }))
    await fonte.recordBodyMeasurement(pesagem({ weightKg: 78.5 }))

    const achada = (await new DemoDataSource(doDiario()).listBodyMeasurements('30d')).rows.find(
      (m) => m.clientId === 'hc-uuid-de-teste-0001',
    )
    expect(achada?.weightKg).toBe(78.5)
  })

  it('o reenvio do Bluetooth não reescreve nada', async () => {
    /*
     * A balança notifica a mesma leitura várias vezes ao confirmar a
     * estabilização. Se a demonstração fosse mais permissiva que o banco, um
     * defeito de reenvio passaria aqui e apareceria no cliente.
     */
    const fonte = new DemoDataSource([])
    await fonte.recordBodyMeasurement(
      pesagem({ clientId: 'ble-1', source: 'BLUETOOTH_SCALE', weightKg: 71.4 }),
    )
    await fonte.recordBodyMeasurement(
      pesagem({ clientId: 'ble-1', source: 'BLUETOOTH_SCALE', weightKg: 99 }),
    )

    const achada = (await new DemoDataSource(doDiario()).listBodyMeasurements('30d')).rows.find(
      (m) => m.clientId === 'ble-1',
    )
    expect(achada?.weightKg).toBe(71.4)
  })
})
