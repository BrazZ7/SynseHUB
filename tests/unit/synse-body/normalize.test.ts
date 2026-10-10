import { describe, expect, it } from 'vitest'

import { parseBodyCompositionMeasurement, parseWeightMeasurement } from '@/features/synse-body/engine/ble'
import { normalizeManualEntry, normalizeScaleReading } from '@/features/synse-body/engine/normalize'
import type { ParsedScaleReading } from '@/features/synse-body/engine/types'

/**
 * A fronteira entre o que o aparelho mediu e o que ele estimou.
 *
 * É o teste mais importante do Synse Body. Uma balança de bioimpedância mede
 * duas coisas — peso e impedância — e deduz todo o resto por uma fórmula que o
 * fabricante não publica. Apresentar a dedução como medição é imprecisão que
 * vira decisão de alguém sobre o próprio corpo.
 */

const AGORA = new Date('2026-09-16T10:00:00.000Z')
const base = (extra: Partial<ParsedScaleReading> = {}): ParsedScaleReading => ({
  reportedImperial: false,
  continues: false,
  unsuccessful: false,
  rawHex: '00',
  ...extra,
})

const contexto = (extra = {}) => ({ clientId: 'c-1', now: AGORA, ...extra })

describe('a origem de cada número', () => {
  it('peso e impedância são medidos; gordura, água e músculo não', () => {
    const resultado = normalizeScaleReading(
      base({
        weightKg: 70.4,
        impedanceOhm: 512.3,
        bodyFatPercent: 22.4,
        muscleMassKg: 26.8,
        bodyWaterMassKg: 38.7,
        basalMetabolismKcal: 1600,
      }),
      contexto({ heightM: 1.78 }),
    )

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    const { fieldOrigin } = resultado.measurement
    expect(fieldOrigin.weightKg).toBe('MEASURED')
    expect(fieldOrigin.impedanceOhm).toBe('MEASURED')
    // Bioimpedância é palpite bem-informado, não medição.
    expect(fieldOrigin.bodyFatPercent).toBe('ESTIMATED')
    expect(fieldOrigin.muscleMassKg).toBe('ESTIMATED')
    expect(fieldOrigin.bmrKcal).toBe('ESTIMATED')
    // O Synse é quem divide pelo peso e quem calcula o IMC.
    expect(fieldOrigin.bodyWaterPercent).toBe('CALCULATED')
    expect(fieldOrigin.bmi).toBe('CALCULATED')
  })

  it('campo que não veio fica ABSENT, que é diferente de zero', () => {
    const resultado = normalizeScaleReading(base({ weightKg: 70.4 }), contexto())
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    expect(resultado.measurement.fieldOrigin.bodyFatPercent).toBe('ABSENT')
    expect(resultado.measurement.bodyFatPercent).toBeUndefined()
  })

  it('gordura visceral e massa óssea não existem no padrão e ficam ausentes', () => {
    /*
     * Quando o app do fabricante mostra esses números, eles vêm por protocolo
     * proprietário. Preenchê-los a partir de uma fórmula inventada seria
     * apresentar palpite do Synse como leitura da balança.
     */
    const resultado = normalizeScaleReading(base({ weightKg: 70.4 }), contexto())
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.fieldOrigin.visceralFat).toBe('ABSENT')
    expect(resultado.measurement.fieldOrigin.boneMassKg).toBe('ABSENT')
  })
})

describe('as conversões', () => {
  it('água corporal vem em quilo e é gravada em porcentagem', () => {
    const resultado = normalizeScaleReading(
      base({ weightKg: 70, bodyWaterMassKg: 38.5 }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.bodyWaterPercent).toBeCloseTo(55, 1)
  })

  it('água que não fecha com o peso é descartada com aviso', () => {
    const resultado = normalizeScaleReading(
      base({ weightKg: 70, bodyWaterMassKg: 120 }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.bodyWaterPercent).toBeUndefined()
    expect(resultado.warnings.join(' ')).toMatch(/água/i)
  })

  it('percentual de músculo vira quilo quando a balança não manda a massa', () => {
    const resultado = normalizeScaleReading(
      base({ weightKg: 70, musclePercent: 40 }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.muscleMassKg).toBeCloseTo(28, 2)
    expect(resultado.measurement.fieldOrigin.muscleMassKg).toBe('CALCULATED')
  })

  it('a conversão de libra é registrada em aviso', () => {
    const resultado = normalizeScaleReading(
      base({ weightKg: 70.4, reportedImperial: true }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.warnings.join(' ')).toMatch(/libra/i)
  })
})

describe('o IMC', () => {
  it('é recalculado com a altura do perfil, não com a cadastrada na balança', () => {
    const resultado = normalizeScaleReading(
      base({ weightKg: 70.4, bmi: 30 }),
      contexto({ heightM: 1.78 }),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.bmi).toBeCloseTo(22.22, 1)
  })

  it('sem altura no perfil, o IMC da balança vale — com aviso do que ele é', () => {
    const resultado = normalizeScaleReading(base({ weightKg: 70.4, bmi: 22.4 }), contexto())
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.bmi).toBeCloseTo(22.4, 2)
    expect(resultado.warnings.join(' ')).toMatch(/altura cadastrada nela/i)
  })

  it('sem altura nenhuma, não há IMC inventado', () => {
    const resultado = normalizeScaleReading(base({ weightKg: 70.4 }), contexto())
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.bmi).toBeUndefined()
    expect(resultado.measurement.fieldOrigin.bmi).toBe('ABSENT')
  })
})

describe('o que não vira medição', () => {
  it('pacote que continua noutro é recusado', () => {
    const resultado = normalizeScaleReading(base({ weightKg: 70, continues: true }), contexto())
    expect(resultado).toMatchObject({ ok: false, reason: 'PACOTE_INCOMPLETO' })
  })

  it('leitura sem peso é recusada', () => {
    expect(normalizeScaleReading(base({ bodyFatPercent: 22 }), contexto())).toMatchObject({
      ok: false,
      reason: 'SEM_PESO',
    })
  })

  it('medição que a balança declarou malsucedida, sem peso, é recusada', () => {
    expect(normalizeScaleReading(base({ unsuccessful: true }), contexto())).toMatchObject({
      ok: false,
      reason: 'MEDICAO_MALSUCEDIDA',
    })
  })

  it('peso impossível é recusado em vez de poluir o histórico', () => {
    expect(normalizeScaleReading(base({ weightKg: 0.4 }), contexto())).toMatchObject({
      ok: false,
      reason: 'PESO_IMPLAUSIVEL',
    })
    expect(normalizeScaleReading(base({ weightKg: 620 }), contexto())).toMatchObject({
      ok: false,
      reason: 'PESO_IMPLAUSIVEL',
    })
  })

  it('composição malsucedida com peso bom guarda o peso e avisa', () => {
    /*
     * Pé seco ou meia: a célula de carga funciona, a corrente não passa. A
     * pesagem vale e a estimativa não — jogar as duas fora perderia o peso.
     */
    const bytes = parseBodyCompositionMeasurement(
      new Uint8Array([0x00, 0x04, 0xff, 0xff, 0x00, 0x37]),
    )
    const resultado = normalizeScaleReading(bytes, contexto())
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.weightKg).toBeCloseTo(70.4, 2)
    expect(resultado.measurement.bodyFatPercent).toBeUndefined()
    expect(resultado.warnings.join(' ')).toMatch(/não conseguiu estimar/i)
  })
})

describe('qual relógio vale', () => {
  it('o da balança, quando é plausível', () => {
    const medidoEm = new Date('2026-09-15T07:30:00.000Z')
    const resultado = normalizeScaleReading(
      base({ weightKg: 70, measuredAt: medidoEm }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.measuredAt).toBe(medidoEm.toISOString())
  })

  it('o do celular, quando o da balança ficou em 2001', () => {
    /*
     * Balança que perde energia volta com o relógio de fábrica. Sem esta
     * regra, a pesagem de hoje entraria no gráfico vinte e cinco anos atrás.
     */
    const resultado = normalizeScaleReading(
      base({ weightKg: 70, measuredAt: new Date('2001-01-01T00:00:00.000Z') }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.measuredAt).toBe(AGORA.toISOString())
  })

  it('o do celular, quando o da balança está no futuro', () => {
    const resultado = normalizeScaleReading(
      base({ weightKg: 70, measuredAt: new Date('2030-01-01T00:00:00.000Z') }),
      contexto(),
    )
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.measuredAt).toBe(AGORA.toISOString())
  })
})

describe('entrada digitada à mão', () => {
  it('grava como MANUAL, sem aparelho', () => {
    const resultado = normalizeManualEntry({ weightKg: 71.2 }, contexto({ heightM: 1.78 }))
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.source).toBe('MANUAL')
    expect(resultado.measurement.deviceId).toBeNull()
    expect(resultado.measurement.fieldOrigin.bmi).toBe('CALCULATED')
  })

  it('o dedo escorregado no teclado é recusado como qualquer outro peso impossível', () => {
    expect(normalizeManualEntry({ weightKg: 712 }, contexto())).toMatchObject({
      ok: false,
      reason: 'PESO_IMPLAUSIVEL',
    })
  })

  it('peso ausente é recusado', () => {
    expect(normalizeManualEntry({ weightKg: Number.NaN }, contexto())).toMatchObject({
      ok: false,
      reason: 'SEM_PESO',
    })
  })
})

describe('do byte à medição, sem atalho', () => {
  it('o pacote do padrão atravessa parser e normalização', () => {
    const leitura = parseWeightMeasurement(new Uint8Array([0x00, 0x00, 0x37]))
    const resultado = normalizeScaleReading(leitura, contexto({ heightM: 1.78, deviceId: 'd-1' }))

    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return
    expect(resultado.measurement.weightKg).toBeCloseTo(70.4, 2)
    expect(resultado.measurement.deviceId).toBe('d-1')
    expect(resultado.measurement.rawPayload).toMatchObject({ hex: '00 00 37' })
  })
})
