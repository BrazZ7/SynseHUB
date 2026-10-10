import { describe, expect, it } from 'vitest'

import type { AmostraDeSaude } from '../../../src/features/synse-body/health/amostra'
import { TETO_DE_AMOSTRAS } from '../../../src/features/synse-body/health/amostra'
import { janelaParaLer, planejarImportacao } from '../../../src/features/synse-body/health/importar'

let n = 0
const amostra = (parcial: Partial<AmostraDeSaude> = {}): AmostraDeSaude => ({
  idNaPlataforma: `id-${(n += 1)}`,
  tipo: 'PESO',
  valor: 80,
  medidaEm: '2026-10-01T07:00:00.000Z',
  appDeOrigem: 'Mi Fit',
  aparelhoDeOrigem: null,
  ...parcial,
})

const base = { fonte: 'health_connect' as const, alturaM: 1.75, jaNoHistorico: [] }

describe('planejar a importação', () => {
  it('devolve as pesagens em ordem de medição', () => {
    const plano = planejarImportacao({
      ...base,
      amostras: [
        amostra({ medidaEm: '2026-10-03T07:00:00.000Z', valor: 81 }),
        amostra({ medidaEm: '2026-10-01T07:00:00.000Z', valor: 80 }),
        amostra({ medidaEm: '2026-10-02T07:00:00.000Z', valor: 80.5 }),
      ],
    })

    expect(plano.aEnviar.map((m) => m.weightKg)).toEqual([80, 80.5, 81])
  })

  it('não reimporta o que já está no histórico', () => {
    const plano = planejarImportacao({
      ...base,
      amostras: [amostra({ medidaEm: '2026-10-01T07:00:00.000Z', valor: 80 })],
      jaNoHistorico: [{ clientId: 'ble-1', measuredAt: '2026-10-01T07:00:10.000Z', weightKg: 80 }],
    })

    expect(plano.aEnviar).toHaveLength(0)
    expect(plano.jaExistiam).toBe(1)
  })

  it('não cria duas linhas quando dois apps escreveram a mesma pesagem', () => {
    /*
     * O caso que a comparação só contra o banco não pega: nenhuma das duas
     * está gravada ainda, então é preciso comparar também contra o que já
     * entrou nesta mesma rodada.
     */
    const plano = planejarImportacao({
      ...base,
      amostras: [
        amostra({ idNaPlataforma: 'a', medidaEm: '2026-10-01T07:00:00.000Z', valor: 80 }),
        amostra({ idNaPlataforma: 'b', medidaEm: '2026-10-01T07:00:05.000Z', valor: 80.02 }),
      ],
    })

    expect(plano.aEnviar).toHaveLength(1)
    expect(plano.jaExistiam).toBe(1)
  })

  it('conta as recusas por motivo, em vez de só somar', () => {
    const plano = planejarImportacao({
      ...base,
      amostras: [
        amostra({ appDeOrigem: 'Synse' }),
        amostra({ valor: 900, medidaEm: '2026-10-02T07:00:00.000Z' }),
        amostra({ valor: 80, medidaEm: '2026-10-03T07:00:00.000Z' }),
      ],
    })

    expect(plano.recusadas.ECO_DO_SYNSE).toBe(1)
    expect(plano.recusadas.PESO_IMPLAUSIVEL).toBe(1)
    expect(plano.aEnviar).toHaveLength(1)
  })

  it('não repete o mesmo aviso uma vez por pesagem', () => {
    // Trinta pesagens sem altura dariam trinta vezes o mesmo texto na tela.
    const plano = planejarImportacao({
      ...base,
      alturaM: null,
      amostras: [
        amostra({ medidaEm: '2026-10-01T07:00:00.000Z' }),
        amostra({ tipo: 'IMC', valor: 26, medidaEm: '2026-10-01T07:00:00.000Z' }),
        amostra({ medidaEm: '2026-10-02T07:00:00.000Z' }),
        amostra({ tipo: 'IMC', valor: 26, medidaEm: '2026-10-02T07:00:00.000Z' }),
      ],
    })

    expect(plano.avisos.filter((a) => /altura/.test(a))).toHaveLength(1)
  })

  it('avisa quando bateu no teto, porque sobrou coisa para a próxima', () => {
    const muitas = Array.from({ length: TETO_DE_AMOSTRAS }, (_, i) =>
      amostra({ medidaEm: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString() }),
    )

    expect(planejarImportacao({ ...base, amostras: muitas }).atingiuOTeto).toBe(true)
    expect(planejarImportacao({ ...base, amostras: [amostra()] }).atingiuOTeto).toBe(false)
  })
})

describe('a janela pedida ao nativo', () => {
  it('sai em ISO, com teto, e diz se é a primeira vez', () => {
    const janela = janelaParaLer({
      ultimaImportadaEm: null,
      agora: new Date('2026-10-10T12:00:00Z'),
    })

    expect(janela.from).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(janela.to).toBe('2026-10-10T12:00:00.000Z')
    expect(janela.limit).toBe(TETO_DE_AMOSTRAS)
    expect(janela.primeiraVez).toBe(true)
  })
})
