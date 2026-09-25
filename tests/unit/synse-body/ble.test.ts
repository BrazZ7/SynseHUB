import { describe, expect, it } from 'vitest'

import {
  KJ_POR_KCAL,
  libraParaQuilo,
  mergeCapabilities,
  mergeReadings,
  parseBodyCompositionFeature,
  parseBodyCompositionMeasurement,
  parseDateTimeBytes,
  parseWeightMeasurement,
  parseWeightScaleFeature,
  quilojouleParaCaloria,
} from '@/features/synse-body/engine/ble'

/**
 * Os parsers do padrão Bluetooth SIG.
 *
 * Os bytes destes testes são montados à mão a partir da especificação — não
 * capturados de uma balança e colados. É o que garante que um erro aqui é erro
 * de código e não de transcrição de um aparelho específico.
 */

const bytes = (...valores: number[]) => new Uint8Array(valores)
const u16 = (valor: number) => [valor & 0xff, (valor >> 8) & 0xff]

describe('Weight Measurement (0x2A9D)', () => {
  it('peso em SI usa resolução de 0,005 kg', () => {
    // 70,4 kg / 0,005 = 14080
    const leitura = parseWeightMeasurement(bytes(0x00, ...u16(14080)))
    expect(leitura.weightKg).toBeCloseTo(70.4, 3)
    expect(leitura.reportedImperial).toBe(false)
    expect(leitura.unsuccessful).toBe(false)
  })

  it('peso em libra vira quilo', () => {
    /*
     * A balança vendida nos EUA reporta libra, e a mesma balança vendida aqui
     * reporta quilo. Guardar a unidade junto do número faria toda leitura do
     * histórico ter de converter, e um dia alguém esqueceria.
     */
    // 155,2 lb / 0,01 = 15520
    const leitura = parseWeightMeasurement(bytes(0x01, ...u16(15520)))
    expect(leitura.reportedImperial).toBe(true)
    expect(leitura.weightKg).toBeCloseTo(libraParaQuilo(155.2), 4)
    expect(leitura.weightKg).toBeCloseTo(70.398, 2)
  })

  it('0xFFFF no peso é medição malsucedida, não peso zero', () => {
    const leitura = parseWeightMeasurement(bytes(0x00, 0xff, 0xff))
    expect(leitura.weightKg).toBeUndefined()
    expect(leitura.unsuccessful).toBe(true)
  })

  it('carimbo de tempo, usuário, IMC e altura saem na ordem certa', () => {
    const leitura = parseWeightMeasurement(
      bytes(
        0x0e, // bits 1, 2 e 3: tempo, usuário e IMC+altura. Unidade SI.
        ...u16(14080), // 70,4 kg
        ...u16(2026),
        9,
        16,
        7,
        30,
        0,
        3, // usuário 3 da balança
        ...u16(224), // IMC 22,4
        ...u16(1780), // 1,780 m
      ),
    )
    expect(leitura.weightKg).toBeCloseTo(70.4, 3)
    expect(leitura.reportedImperial).toBe(false)
    expect(leitura.scaleUserId).toBe(3)
    expect(leitura.bmi).toBeCloseTo(22.4, 2)
    expect(leitura.heightM).toBeCloseTo(1.78, 3)
    expect(leitura.measuredAt?.toISOString()).toBe('2026-09-16T07:30:00.000Z')
  })

  it('pacote truncado não vira pesagem', () => {
    const leitura = parseWeightMeasurement(bytes(0x00, 0x10))
    expect(leitura.unsuccessful).toBe(true)
    expect(leitura.weightKg).toBeUndefined()
  })

  it('o hexadecimal do pacote fica guardado para o painel de desenvolvimento', () => {
    const leitura = parseWeightMeasurement(bytes(0x00, 0x00, 0x37))
    expect(leitura.rawHex).toBe('00 00 37')
  })
})

describe('Body Composition Measurement (0x2A9C)', () => {
  const flags = {
    tempo: 0x0002,
    usuario: 0x0004,
    metabolismo: 0x0008,
    percentualMusculo: 0x0010,
    massaMuscular: 0x0020,
    massaLivreGordura: 0x0040,
    massaMagraMole: 0x0080,
    agua: 0x0100,
    impedancia: 0x0200,
    peso: 0x0400,
    altura: 0x0800,
    continua: 0x1000,
  }

  it('gordura corporal vem sempre, com resolução de 0,1%', () => {
    const leitura = parseBodyCompositionMeasurement(bytes(...u16(0x0000), ...u16(224)))
    expect(leitura.bodyFatPercent).toBeCloseTo(22.4, 2)
  })

  it('metabolismo basal chega em quilojoule e sai em caloria', () => {
    /*
     * A armadilha mais cara deste parser. A característica transmite kJ — está
     * na especificação, não é escolha do fabricante. Mostrar o número cru
     * multiplicaria o metabolismo de alguém por 4,184: 1.600 kcal virariam
     * 6.694, e a meta alimentar inteira sairia errada.
     */
    const kj = Math.round(1600 * KJ_POR_KCAL)
    const leitura = parseBodyCompositionMeasurement(
      bytes(...u16(flags.metabolismo), ...u16(224), ...u16(kj)),
    )
    expect(leitura.basalMetabolismKcal).toBeCloseTo(1600, 0)
    expect(quilojouleParaCaloria(kj)).toBeCloseTo(1600, 0)
  })

  it('impedância usa 0,1 ohm e não a resolução de massa', () => {
    const leitura = parseBodyCompositionMeasurement(
      bytes(...u16(flags.impedancia), ...u16(224), ...u16(5123)),
    )
    expect(leitura.impedanceOhm).toBeCloseTo(512.3, 2)
  })

  it('os campos saem na ordem dos bits, não na ordem que der', () => {
    const leitura = parseBodyCompositionMeasurement(
      bytes(
        ...u16(flags.massaMuscular | flags.agua | flags.impedancia | flags.peso),
        ...u16(224), // gordura 22,4%
        ...u16(5360), // massa muscular 26,8 kg
        ...u16(7740), // água 38,7 kg
        ...u16(5123), // impedância 512,3 Ω
        ...u16(14080), // peso 70,4 kg
      ),
    )
    expect(leitura.muscleMassKg).toBeCloseTo(26.8, 3)
    expect(leitura.bodyWaterMassKg).toBeCloseTo(38.7, 3)
    expect(leitura.impedanceOhm).toBeCloseTo(512.3, 2)
    expect(leitura.weightKg).toBeCloseTo(70.4, 3)
  })

  it('em imperial, massa é libra e altura é polegada', () => {
    const leitura = parseBodyCompositionMeasurement(
      bytes(
        ...u16(0x0001 | flags.peso | flags.altura),
        ...u16(224),
        ...u16(15520), // 155,2 lb
        ...u16(700), // 70,0 in
      ),
    )
    expect(leitura.weightKg).toBeCloseTo(70.398, 2)
    expect(leitura.heightM).toBeCloseTo(1.778, 3)
  })

  it('0xFFFF na gordura é "não consegui", e não 0% de gordura', () => {
    const leitura = parseBodyCompositionMeasurement(
      bytes(...u16(flags.peso), 0xff, 0xff, ...u16(14080)),
    )
    expect(leitura.unsuccessful).toBe(true)
    expect(leitura.bodyFatPercent).toBeUndefined()
    // O peso continua bom: a célula de carga funcionou, a corrente é que não passou.
    expect(leitura.weightKg).toBeCloseTo(70.4, 3)
  })

  it('o bit de continuação marca a leitura como incompleta', () => {
    const leitura = parseBodyCompositionMeasurement(
      bytes(...u16(flags.continua | flags.impedancia), ...u16(224), ...u16(5123)),
    )
    expect(leitura.continues).toBe(true)
  })

  it('pacotes de uma medição partida se juntam num só', () => {
    const primeiro = parseBodyCompositionMeasurement(
      bytes(...u16(flags.continua | flags.impedancia), ...u16(224), ...u16(5123)),
    )
    const segundo = parseBodyCompositionMeasurement(
      bytes(...u16(flags.peso), ...u16(224), ...u16(14080)),
    )

    const junta = mergeReadings(primeiro, segundo)
    expect(junta.continues).toBe(false)
    expect(junta.impedanceOhm).toBeCloseTo(512.3, 2)
    expect(junta.weightKg).toBeCloseTo(70.4, 3)
  })
})

describe('o relógio da balança', () => {
  it('ano zero é "desconhecido" na especificação, e é descartado', () => {
    expect(parseDateTimeBytes(bytes(0, 0, 1, 1, 0, 0, 0))).toBeUndefined()
  })

  it('data impossível é descartada em vez de virar 1970 no gráfico', () => {
    expect(parseDateTimeBytes(bytes(...u16(2026), 13, 40, 99, 99, 99))).toBeUndefined()
  })

  it('data plausível é aceita', () => {
    const data = parseDateTimeBytes(bytes(...u16(2026), 9, 16, 7, 30, 0))
    expect(data?.toISOString()).toBe('2026-09-16T07:30:00.000Z')
  })
})

describe('as capacidades declaradas', () => {
  it('Weight Scale Feature diz o que a balança de peso suporta', () => {
    // bits 0 (tempo), 1 (vários usuários) e 2 (IMC)
    const cap = parseWeightScaleFeature(bytes(0x07, 0x00, 0x00, 0x00))
    expect(cap).toMatchObject({ weight: true, timestamp: true, multipleUsers: true, bmi: true })
  })

  it('Body Composition Feature diz campo a campo', () => {
    // bits 2 (metabolismo), 8 (impedância), 9 (peso)
    const cap = parseBodyCompositionFeature(bytes(0x04, 0x03, 0x00, 0x00))
    expect(cap.basalMetabolism).toBe(true)
    expect(cap.impedance).toBe(true)
    expect(cap.weight).toBe(true)
    expect(cap.muscleMass).toBe(false)
  })

  it('juntar capacidades nunca desliga o que já estava ligado', () => {
    const cap = mergeCapabilities({ weight: true }, { bodyComposition: true }, { weight: false })
    expect(cap.weight).toBe(true)
    expect(cap.bodyComposition).toBe(true)
    expect(cap.height).toBe(false)
  })
})
