import { describe, expect, it } from 'vitest'

import { jaRegistrada, mesmaPesagem } from '@/features/synse-body/engine/dedup'
import type { BodyMeasurement, ParsedScaleReading } from '@/features/synse-body/engine/types'
import {
  CONFIG_PADRAO,
  ESTADO_INICIAL,
  type WeighingEvent,
  type WeighingSnapshot,
  weighingReducer,
} from '@/features/synse-body/engine/weighing-machine'

/**
 * A pessoa em cima da balança.
 *
 * O aparelho não avisa quando o número virou verdade: ele manda o
 * desequilíbrio junto com a pesagem. Estes testes fixam quando o Synse decide
 * que acabou — porque gravar cedo demais grava a pessoa se apoiando na parede.
 */

const leitura = (pesoKg?: number, extra: Partial<ParsedScaleReading> = {}): ParsedScaleReading => ({
  weightKg: pesoKg,
  reportedImperial: false,
  continues: false,
  unsuccessful: false,
  rawHex: '00',
  ...extra,
})

function rodar(eventos: WeighingEvent[], inicial: WeighingSnapshot = ESTADO_INICIAL) {
  return eventos.reduce((estado, evento) => weighingReducer(estado, evento), inicial)
}

describe('a estabilização', () => {
  it('a primeira leitura põe a tela em MEDINDO', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(68.2), em: 100 },
    ])
    expect(estado.estado).toBe('MEDINDO')
    expect(estado.pesoAtualKg).toBeCloseTo(68.2, 2)
  })

  it('leituras que discordam entre si mantêm INSTÁVEL', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(68.2), em: 100 },
      { tipo: 'LEITURA', leitura: leitura(71.9), em: 200 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 300 },
    ])
    expect(estado.estado).toBe('INSTAVEL')
  })

  it('três leituras concordando dentro da tolerância dão ESTÁVEL', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(70.45), em: 100 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 200 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 300 },
    ])
    expect(estado.estado).toBe('ESTAVEL')
    expect(estado.pesoAtualKg).toBeCloseTo(70.4, 2)
  })

  it('a balança que manda uma leitura só fecha pelo silêncio', () => {
    /*
     * O padrão manda a pesagem já finalizada, numa notificação única. Uma
     * leitura só nunca "concorda com as seguintes" — sem esta regra, a tela
     * ficaria girando até o timeout numa pesagem que já terminou.
     */
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 100 },
      { tipo: 'TEMPO', em: 100 + CONFIG_PADRAO.silencioFinalMs },
    ])
    expect(estado.estado).toBe('ESTAVEL')
  })

  it('o silêncio não fecha antes da hora', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 100 },
      { tipo: 'TEMPO', em: 600 },
    ])
    expect(estado.estado).toBe('MEDINDO')
  })
})

describe('quando não dá certo', () => {
  it('a medição malsucedida sem peso manda a pessoa subir de novo', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(undefined, { unsuccessful: true }), em: 100 },
    ])
    expect(estado.estado).toBe('ERRO')
    expect(estado.erro).toMatch(/pés secos/i)
  })

  it('balança que não manda nada estoura no tempo com a mensagem certa', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'TEMPO', em: CONFIG_PADRAO.timeoutMs },
    ])
    expect(estado.estado).toBe('ERRO')
    expect(estado.erro).toMatch(/não enviou nenhuma leitura/i)
  })

  it('pessoa que não para quieta estoura no tempo com outra mensagem', () => {
    const instavel: WeighingEvent[] = [
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(68), em: 100 },
      { tipo: 'LEITURA', leitura: leitura(73), em: 200 },
      { tipo: 'LEITURA', leitura: leitura(69), em: 300 },
      { tipo: 'TEMPO', em: CONFIG_PADRAO.timeoutMs + 1 },
    ]
    const estado = rodar(instavel)
    expect(estado.estado).toBe('ERRO')
    expect(estado.erro).toMatch(/fique parado/i)
  })

  it('pacote parcial mantém MEDINDO em vez de mostrar meio número', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(70.4, { continues: true }), em: 100 },
    ])
    expect(estado.estado).toBe('MEDINDO')
  })

  it('aparelho que some no meio de uma medição partida vira erro', () => {
    const estado = rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 100 },
      { tipo: 'LEITURA', leitura: leitura(70.4, { continues: true }), em: 200 },
      { tipo: 'TEMPO', em: 200 + CONFIG_PADRAO.silencioFinalMs },
    ])
    expect(estado.estado).toBe('ERRO')
    expect(estado.erro).toMatch(/interrompeu o envio/i)
  })
})

describe('a sincronização', () => {
  const estavel = () =>
    rodar([
      { tipo: 'INICIAR', em: 0 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 100 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 200 },
      { tipo: 'LEITURA', leitura: leitura(70.4), em: 300 },
    ])

  it('só sincroniza o que estabilizou', () => {
    const cedo = weighingReducer(
      rodar([{ tipo: 'INICIAR', em: 0 }, { tipo: 'LEITURA', leitura: leitura(70.4), em: 100 }]),
      { tipo: 'SINCRONIZAR' },
    )
    expect(cedo.estado).toBe('MEDINDO')

    expect(weighingReducer(estavel(), { tipo: 'SINCRONIZAR' }).estado).toBe('SINCRONIZANDO')
  })

  it('leitura que chega durante a sincronização é ignorada', () => {
    /*
     * A pessoa desce da balança e o aparelho manda um zero. Aceitá-lo
     * substituiria a pesagem que já está subindo.
     */
    const sincronizando = weighingReducer(estavel(), { tipo: 'SINCRONIZAR' })
    const depois = weighingReducer(sincronizando, {
      tipo: 'LEITURA',
      leitura: leitura(0.2),
      em: 900,
    })
    expect(depois).toBe(sincronizando)
  })
})

describe('a mesma pesagem chegando duas vezes', () => {
  const medida = (extra: Partial<BodyMeasurement>): BodyMeasurement => ({
    clientId: 'c-1',
    measuredAt: '2026-09-16T07:30:00.000Z',
    source: 'BLUETOOTH_SCALE',
    deviceId: 'd-1',
    weightKg: 70.4,
    fieldOrigin: {},
    ...extra,
  })

  it('o mesmo clientId é sempre o mesmo envio', () => {
    expect(mesmaPesagem(medida({}), medida({ weightKg: 99, deviceId: null }))).toBe(true)
  })

  it('duas notificações da mesma pesagem são uma só', () => {
    const a = medida({ clientId: 'c-1' })
    const b = medida({ clientId: 'c-2', measuredAt: '2026-09-16T07:30:01.000Z', weightKg: 70.45 })
    expect(mesmaPesagem(a, b)).toBe(true)
  })

  it('subir de novo minutos depois é outra pesagem', () => {
    const a = medida({ clientId: 'c-1' })
    const b = medida({ clientId: 'c-2', measuredAt: '2026-09-16T07:35:00.000Z' })
    expect(mesmaPesagem(a, b)).toBe(false)
  })

  it('sem aparelho não há repetição de aparelho', () => {
    /*
     * Duas entradas manuais no mesmo minuto são duas decisões da pessoa.
     * Apagar uma seria decidir por ela.
     */
    const a = medida({ clientId: 'c-1', deviceId: null, source: 'MANUAL' })
    const b = medida({ clientId: 'c-2', deviceId: null, source: 'MANUAL' })
    expect(mesmaPesagem(a, b)).toBe(false)
  })

  it('aparelhos diferentes no mesmo instante são pesagens diferentes', () => {
    const a = medida({ clientId: 'c-1', deviceId: 'd-1' })
    const b = medida({ clientId: 'c-2', deviceId: 'd-2' })
    expect(mesmaPesagem(a, b)).toBe(false)
  })

  it('jaRegistrada devolve a linha que já estava no histórico', () => {
    const historico = [medida({ clientId: 'c-1' })]
    const nova = medida({ clientId: 'c-2', measuredAt: '2026-09-16T07:30:00.500Z' })
    expect(jaRegistrada(nova, historico)?.clientId).toBe('c-1')
  })
})
