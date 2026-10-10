import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { AmostraDeSaude } from '../../../src/features/synse-body/health/amostra'
import {
  JANELA_DO_GRUPO_MS,
  PESO_MAXIMO_KG,
  PESO_MINIMO_KG,
  agruparEmPesagens,
  normalizarGrupo,
  pesagemJaExiste,
} from '../../../src/features/synse-body/health/normalizar'

let n = 0
const amostra = (parcial: Partial<AmostraDeSaude> = {}): AmostraDeSaude => ({
  idNaPlataforma: `id-${(n += 1)}`,
  tipo: 'PESO',
  valor: 80,
  medidaEm: '2026-10-01T07:00:00.000Z',
  appDeOrigem: 'Mi Fit',
  aparelhoDeOrigem: 'Mi Body Composition Scale 2',
  ...parcial,
})

const emT = (segundos: number) =>
  new Date(Date.parse('2026-10-01T07:00:00.000Z') + segundos * 1000).toISOString()

describe('remontar a pesagem a partir das amostras soltas', () => {
  it('junta peso, gordura e massa magra do mesmo instante numa pesagem só', () => {
    const grupos = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22 }),
      amostra({ tipo: 'MASSA_MAGRA', valor: 62 }),
    ])

    expect(grupos).toHaveLength(1)
    expect(grupos[0].acompanhantes).toHaveLength(2)
  })

  it('separa duas subidas na balança em dois grupos', () => {
    const grupos = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80, medidaEm: emT(0) }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22, medidaEm: emT(1) }),
      amostra({ tipo: 'PESO', valor: 80.4, medidaEm: emT(600) }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 23, medidaEm: emT(601) }),
    ])

    expect(grupos).toHaveLength(2)
    expect(grupos[0].acompanhantes[0].valor).toBe(22)
    expect(grupos[1].acompanhantes[0].valor).toBe(23)
  })

  it('aceita a composição que chega alguns segundos depois do peso', () => {
    // Há balança que grava o peso ao estabilizar e a bioimpedância em seguida.
    const dentro = JANELA_DO_GRUPO_MS / 1000 - 1
    const grupos = agruparEmPesagens([
      amostra({ tipo: 'PESO', medidaEm: emT(0) }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22, medidaEm: emT(dentro) }),
    ])

    expect(grupos[0].acompanhantes).toHaveLength(1)
  })

  it('descarta a amostra avulsa que não tem peso por perto', () => {
    /*
     * Alguém que anota só o percentual de gordura num app de dieta não fez uma
     * pesagem; inventar um peso para acomodar o número seria pior que ignorar.
     */
    const grupos = agruparEmPesagens([amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22 })])
    expect(grupos).toEqual([])
  })

  it('manda a acompanhante para o peso mais próximo, não para o primeiro que couber', () => {
    const grupos = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80, medidaEm: emT(0) }),
      amostra({ tipo: 'PESO', valor: 81, medidaEm: emT(8) }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22, medidaEm: emT(7) }),
    ])

    expect(grupos[0].acompanhantes).toHaveLength(0)
    expect(grupos[1].acompanhantes).toHaveLength(1)
  })
})

describe('o grupo vira medição', () => {
  const comAltura = { fonte: 'apple_health' as const, alturaM: 1.75 }

  it('o peso é medido; gordura e massa magra são estimativa', () => {
    const [grupo] = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22 }),
      amostra({ tipo: 'MASSA_MAGRA', valor: 62 }),
    ])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.fieldOrigin.weightKg).toBe('MEASURED')
    expect(r.measurement.fieldOrigin.bodyFatPercent).toBe('ESTIMATED')
    expect(r.measurement.fieldOrigin.leanMassKg).toBe('ESTIMATED')
  })

  it('água corporal chega em quilo e é gravada em percentual, como calculada', () => {
    // A mesma armadilha do padrão Bluetooth: 48 kg de água em 80 kg são 60%.
    const [grupo] = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'AGUA_CORPORAL', valor: 48 }),
    ])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.bodyWaterPercent).toBe(60)
    expect(r.measurement.fieldOrigin.bodyWaterPercent).toBe('CALCULATED')
  })

  it('recalcula o IMC com a altura do perfil e avisa quando o da plataforma diverge', () => {
    const [grupo] = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'IMC', valor: 30 }),
    ])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.bmi).toBe(26.12)
    expect(r.measurement.fieldOrigin.bmi).toBe('CALCULATED')
    expect(r.avisos.join(' ')).toMatch(/difere do calculado/)
  })

  it('sem altura no perfil, o IMC fica ausente em vez de vir da plataforma', () => {
    const [grupo] = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'IMC', valor: 26.1 }),
    ])
    const r = normalizarGrupo(grupo, { fonte: 'apple_health', alturaM: null })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.bmi).toBeUndefined()
    expect(r.measurement.fieldOrigin.bmi).toBe('ABSENT')
  })

  it('descarta massa magra maior que o peso, que é erro de unidade de quem escreveu', () => {
    const [grupo] = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'MASSA_MAGRA', valor: 620 }),
    ])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.leanMassKg).toBeUndefined()
    expect(r.avisos.join(' ')).toMatch(/incompatível com o peso/)
  })

  it('recusa o que o próprio Synse escreveu na plataforma', () => {
    // Sem isto o histórico dobraria sozinho a cada sincronização.
    const [grupo] = agruparEmPesagens([amostra({ appDeOrigem: 'Synse' })])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('ECO_DO_SYNSE')
  })

  it('recusa peso impossível', () => {
    for (const valor of [PESO_MINIMO_KG - 1, PESO_MAXIMO_KG + 1, Number.NaN]) {
      const [grupo] = agruparEmPesagens([amostra({ valor })])
      expect(normalizarGrupo(grupo, comAltura).ok).toBe(false)
    }
  })

  it('guarda as amostras originais para auditoria', () => {
    const [grupo] = agruparEmPesagens([
      amostra({ tipo: 'PESO', valor: 80 }),
      amostra({ tipo: 'GORDURA_PERCENTUAL', valor: 22 }),
    ])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.rawPayload?.appDeOrigem).toBe('Mi Fit')
    expect((r.measurement.rawPayload?.amostras as unknown[]).length).toBe(2)
  })

  it('não vincula aparelho: a balança da plataforma não é uma balança pareada aqui', () => {
    const [grupo] = agruparEmPesagens([amostra()])
    const r = normalizarGrupo(grupo, comAltura)

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.measurement.deviceId).toBeNull()
  })
})

describe('a mesma pesagem chegando por dois caminhos', () => {
  const jaNoHistorico = [
    { clientId: 'ble-1', measuredAt: '2026-10-01T07:00:00.000Z', weightKg: 80 },
  ]

  it('pula o que já entrou pelo Bluetooth segundos antes', () => {
    expect(
      pesagemJaExiste(
        { clientId: 'ah-x', measuredAt: '2026-10-01T07:00:20.000Z', weightKg: 80.05 },
        jaNoHistorico,
      ),
    ).toBe(true)
  })

  it('importa a segunda subida de verdade, mais tarde no dia', () => {
    expect(
      pesagemJaExiste(
        { clientId: 'ah-y', measuredAt: '2026-10-01T19:00:00.000Z', weightKg: 80 },
        jaNoHistorico,
      ),
    ).toBe(false)
  })

  it('importa peso diferente no mesmo minuto — são duas pessoas na balança de casa', () => {
    expect(
      pesagemJaExiste(
        { clientId: 'ah-z', measuredAt: '2026-10-01T07:00:30.000Z', weightKg: 62 },
        jaNoHistorico,
      ),
    ).toBe(false)
  })
})

describe('os limites de peso não divergem do caminho Bluetooth', () => {
  it('são os mesmos números nos dois arquivos', () => {
    /*
     * Em `engine/normalize.ts` eles são privados do módulo, então não dá para
     * importar. Divergir em silêncio significaria a mesma balança sendo aceita
     * por um caminho e recusada pelo outro.
     */
    const fonte = readFileSync('src/features/synse-body/engine/normalize.ts', 'utf8')
    const ler = (nome: string) => Number(new RegExp(`const ${nome} = (\\d+)`).exec(fonte)![1])

    expect(PESO_MINIMO_KG).toBe(ler('PESO_MINIMO_KG'))
    expect(PESO_MAXIMO_KG).toBe(ler('PESO_MAXIMO_KG'))
  })
})
