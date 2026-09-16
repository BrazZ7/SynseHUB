import type { ParsedScaleReading, ScaleCapabilities } from './types'
import { NENHUMA_CAPACIDADE } from './types'

/**
 * Os dois perfis padronizados de balança do Bluetooth SIG.
 *
 * Nada aqui é inventado: são o Weight Scale Service (WSS) e o Body Composition
 * Service (BCS), com os números de característica que o SIG atribuiu. Uma
 * balança que os implementa fala com o Synse sem código de fabricante nenhum.
 *
 * O que muita balança de mercado faz — protocolo próprio sobre um serviço
 * genérico, payload cifrado, pareamento pelo app do fabricante — não cabe
 * aqui: cabe num provider separado, escrito com o aparelho na mesa. Ver
 * `docs/SYNSE_SCALE_COMPATIBILITY.md`.
 */

/** Weight Scale Service. */
export const WEIGHT_SCALE_SERVICE = '0000181d-0000-1000-8000-00805f9b34fb'
/** Weight Measurement (notify). */
export const WEIGHT_MEASUREMENT_CHAR = '00002a9d-0000-1000-8000-00805f9b34fb'
/** Weight Scale Feature (read). */
export const WEIGHT_SCALE_FEATURE_CHAR = '00002a9e-0000-1000-8000-00805f9b34fb'

/** Body Composition Service. */
export const BODY_COMPOSITION_SERVICE = '0000181b-0000-1000-8000-00805f9b34fb'
/** Body Composition Measurement (indicate). */
export const BODY_COMPOSITION_MEASUREMENT_CHAR = '00002a9c-0000-1000-8000-00805f9b34fb'
/** Body Composition Feature (read). */
export const BODY_COMPOSITION_FEATURE_CHAR = '00002a9b-0000-1000-8000-00805f9b34fb'

/** Device Information, de onde sai fabricante, modelo e firmware. */
export const DEVICE_INFORMATION_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb'
export const MANUFACTURER_NAME_CHAR = '00002a29-0000-1000-8000-00805f9b34fb'
export const MODEL_NUMBER_CHAR = '00002a24-0000-1000-8000-00805f9b34fb'
export const FIRMWARE_REVISION_CHAR = '00002a26-0000-1000-8000-00805f9b34fb'

export const LIBRA_EM_QUILO = 0.45359237
export const POLEGADA_EM_METRO = 0.0254
/** A caloria termoquímica, que é a definição usada em nutrição. */
export const KJ_POR_KCAL = 4.184

/** Campo ausente: o SIG usa 0xFFFF para "não medido" / "não deu certo". */
const DESCONHECIDO = 0xffff

export function libraParaQuilo(lb: number): number {
  return lb * LIBRA_EM_QUILO
}

export function polegadaParaMetro(pol: number): number {
  return pol * POLEGADA_EM_METRO
}

/**
 * Metabolismo basal: kJ no ar, kcal na tela.
 *
 * A característica do BCS transmite **quilojoule** — a unidade está fixada na
 * especificação, não é escolha do fabricante. Mostrar o número cru como se
 * fosse caloria multiplica o metabolismo de alguém por 4,184: 1.600 kcal
 * viram 6.700, e a meta alimentar inteira sai errada.
 */
export function quilojouleParaCaloria(kj: number): number {
  return kj / KJ_POR_KCAL
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}

function paraUint8Array(dados: DataView | Uint8Array | ArrayBuffer): Uint8Array {
  if (dados instanceof Uint8Array) return dados
  if (dados instanceof ArrayBuffer) return new Uint8Array(dados)
  return new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
}

/** Leitor sequencial: cada campo consumido anda o cursor. */
class Cursor {
  private posicao = 0

  constructor(private readonly view: DataView) {}

  get restantes(): number {
    return this.view.byteLength - this.posicao
  }

  uint8(): number {
    const valor = this.view.getUint8(this.posicao)
    this.posicao += 1
    return valor
  }

  /** Little-endian: é como todo campo multi-byte do GATT trafega. */
  uint16(): number {
    const valor = this.view.getUint16(this.posicao, true)
    this.posicao += 2
    return valor
  }

  precisaDe(bytes: number): boolean {
    return this.restantes >= bytes
  }
}

/**
 * O relógio da balança, quando dá para acreditar nele.
 *
 * Campo `date_time` do SIG: ano uint16, mês, dia, hora, minuto, segundo. O ano
 * 0 significa "desconhecido" na própria especificação, e balança sem conexão
 * costuma voltar de fábrica com 2000-01-01 ou com lixo. Um carimbo absurdo
 * jogaria a pesagem para 1970 no gráfico, então ele é descartado e quem manda
 * é o relógio do celular.
 */
function lerDateTime(cursor: Cursor): Date | undefined {
  if (!cursor.precisaDe(7)) return undefined
  const ano = cursor.uint16()
  const mes = cursor.uint8()
  const dia = cursor.uint8()
  const hora = cursor.uint8()
  const minuto = cursor.uint8()
  const segundo = cursor.uint8()

  if (ano < 1900 || ano > 2200) return undefined
  if (mes < 1 || mes > 12) return undefined
  if (dia < 1 || dia > 31) return undefined
  if (hora > 23 || minuto > 59 || segundo > 59) return undefined

  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, segundo))
  return Number.isNaN(data.getTime()) ? undefined : data
}

/**
 * Weight Measurement (0x2A9D).
 *
 * Flags (uint8):
 *   bit 0 — unidade: 0 = SI (kg, m), 1 = imperial (lb, in)
 *   bit 1 — carimbo de tempo presente
 *   bit 2 — identificador de usuário presente
 *   bit 3 — IMC e altura presentes
 *
 * Resolução: peso 0,005 kg em SI e 0,01 lb em imperial; IMC 0,1; altura
 * 0,001 m em SI e 0,1 in em imperial.
 */
/** Os sete bytes do `date_time` isolados — existe para o teste alcançar a regra. */
export function parseDateTimeBytes(bytes: Uint8Array): Date | undefined {
  return lerDateTime(new Cursor(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)))
}

export function parseWeightMeasurement(dados: DataView | Uint8Array | ArrayBuffer): ParsedScaleReading {
  const bytes = paraUint8Array(dados)
  const leitura: ParsedScaleReading = {
    reportedImperial: false,
    continues: false,
    unsuccessful: false,
    rawHex: hex(bytes),
  }

  if (bytes.byteLength < 3) {
    // Sem flags e peso não há o que ler. Pacote truncado não é pesagem.
    leitura.unsuccessful = true
    return leitura
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const cursor = new Cursor(view)

  const flags = cursor.uint8()
  const imperial = (flags & 0x01) !== 0
  leitura.reportedImperial = imperial

  const pesoCru = cursor.uint16()
  if (pesoCru === DESCONHECIDO) {
    leitura.unsuccessful = true
  } else {
    leitura.weightKg = imperial ? libraParaQuilo(pesoCru * 0.01) : pesoCru * 0.005
  }

  if ((flags & 0x02) !== 0) {
    leitura.measuredAt = lerDateTime(cursor)
  }

  if ((flags & 0x04) !== 0 && cursor.precisaDe(1)) {
    leitura.scaleUserId = cursor.uint8()
  }

  if ((flags & 0x08) !== 0 && cursor.precisaDe(4)) {
    const imc = cursor.uint16()
    if (imc !== DESCONHECIDO) leitura.bmi = imc * 0.1

    const altura = cursor.uint16()
    if (altura !== DESCONHECIDO) {
      leitura.heightM = imperial ? polegadaParaMetro(altura * 0.1) : altura * 0.001
    }
  }

  return leitura
}

/**
 * Body Composition Measurement (0x2A9C).
 *
 * Flags (uint16):
 *   bit 0 — unidade: 0 = SI, 1 = imperial
 *   bit 1 — carimbo de tempo        bit 2 — identificador de usuário
 *   bit 3 — metabolismo basal (kJ)  bit 4 — percentual de músculo
 *   bit 5 — massa muscular          bit 6 — massa livre de gordura
 *   bit 7 — massa magra mole        bit 8 — massa de água corporal
 *   bit 9 — impedância              bit 10 — peso
 *   bit 11 — altura                 bit 12 — medição em vários pacotes
 *
 * O percentual de gordura vem sempre, logo depois das flags, e é o único campo
 * obrigatório. Os demais aparecem nesta ordem, só se o bit correspondente
 * estiver ligado — ler fora de ordem desalinha tudo o que vem depois.
 */
export function parseBodyCompositionMeasurement(
  dados: DataView | Uint8Array | ArrayBuffer,
): ParsedScaleReading {
  const bytes = paraUint8Array(dados)
  const leitura: ParsedScaleReading = {
    reportedImperial: false,
    continues: false,
    unsuccessful: false,
    rawHex: hex(bytes),
  }

  if (bytes.byteLength < 4) {
    leitura.unsuccessful = true
    return leitura
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const cursor = new Cursor(view)

  const flags = cursor.uint16()
  const imperial = (flags & 0x0001) !== 0
  leitura.reportedImperial = imperial
  leitura.continues = (flags & 0x1000) !== 0

  /*
   * Massa: 0,005 kg em SI, 0,01 lb em imperial. Vale para massa muscular,
   * massa livre de gordura, massa magra mole, água corporal e peso.
   */
  const massa = (cru: number) => (imperial ? libraParaQuilo(cru * 0.01) : cru * 0.005)

  const gordura = cursor.uint16()
  if (gordura === DESCONHECIDO) {
    /*
     * 0xFFFF aqui é a forma de a balança dizer "não consegui". Acontece com pé
     * seco, meia, ou quando a pessoa sobe e desce rápido demais. Não é zero
     * por cento de gordura.
     */
    leitura.unsuccessful = true
  } else {
    leitura.bodyFatPercent = gordura * 0.1
  }

  if ((flags & 0x0002) !== 0) {
    leitura.measuredAt = lerDateTime(cursor)
  }
  if ((flags & 0x0004) !== 0 && cursor.precisaDe(1)) {
    leitura.scaleUserId = cursor.uint8()
  }
  if ((flags & 0x0008) !== 0 && cursor.precisaDe(2)) {
    const kj = cursor.uint16()
    // Vem em quilojoule por especificação. Ver `quilojouleParaCaloria`.
    if (kj !== DESCONHECIDO) leitura.basalMetabolismKcal = quilojouleParaCaloria(kj)
  }
  if ((flags & 0x0010) !== 0 && cursor.precisaDe(2)) {
    const pct = cursor.uint16()
    if (pct !== DESCONHECIDO) leitura.musclePercent = pct * 0.1
  }
  if ((flags & 0x0020) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) leitura.muscleMassKg = massa(cru)
  }
  if ((flags & 0x0040) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) leitura.fatFreeMassKg = massa(cru)
  }
  if ((flags & 0x0080) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) leitura.softLeanMassKg = massa(cru)
  }
  if ((flags & 0x0100) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) leitura.bodyWaterMassKg = massa(cru)
  }
  if ((flags & 0x0200) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) leitura.impedanceOhm = cru * 0.1
  }
  if ((flags & 0x0400) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) leitura.weightKg = massa(cru)
  }
  if ((flags & 0x0800) !== 0 && cursor.precisaDe(2)) {
    const cru = cursor.uint16()
    if (cru !== DESCONHECIDO) {
      leitura.heightM = imperial ? polegadaParaMetro(cru * 0.1) : cru * 0.001
    }
  }

  return leitura
}

/**
 * Junta os pacotes de uma medição partida.
 *
 * O bit 12 existe porque a MTU padrão do BLE é 23 bytes e a composição
 * corporal completa não cabe. A balança manda o que cabe, marca "continua", e
 * segue no pacote seguinte. Tratar cada pacote como uma pesagem gravaria duas
 * linhas pela metade, e a segunda sobrescreveria a primeira no gráfico.
 */
export function mergeReadings(anterior: ParsedScaleReading, proximo: ParsedScaleReading): ParsedScaleReading {
  const juntar = <K extends keyof ParsedScaleReading>(chave: K) =>
    (proximo[chave] ?? anterior[chave]) as ParsedScaleReading[K]

  return {
    weightKg: juntar('weightKg'),
    heightM: juntar('heightM'),
    bmi: juntar('bmi'),
    bodyFatPercent: juntar('bodyFatPercent'),
    musclePercent: juntar('musclePercent'),
    muscleMassKg: juntar('muscleMassKg'),
    fatFreeMassKg: juntar('fatFreeMassKg'),
    softLeanMassKg: juntar('softLeanMassKg'),
    bodyWaterMassKg: juntar('bodyWaterMassKg'),
    basalMetabolismKcal: juntar('basalMetabolismKcal'),
    impedanceOhm: juntar('impedanceOhm'),
    measuredAt: proximo.measuredAt ?? anterior.measuredAt,
    scaleUserId: proximo.scaleUserId ?? anterior.scaleUserId,
    reportedImperial: proximo.reportedImperial || anterior.reportedImperial,
    // Só o último pacote apaga o "continua".
    continues: proximo.continues,
    unsuccessful: proximo.unsuccessful || anterior.unsuccessful,
    rawHex: `${anterior.rawHex} | ${proximo.rawHex}`,
  }
}

/**
 * Weight Scale Feature (0x2A9E), uint32 — o que a balança diz suportar.
 *
 * Isto é o que o aparelho declara, e é diferente do que ele entrega numa
 * pesagem: um campo declarado pode vir 0xFFFF quando a medição falha. As
 * capacidades servem para a tela não prometer o que aquele aparelho não faz.
 */
export function parseWeightScaleFeature(dados: DataView | Uint8Array | ArrayBuffer): Partial<ScaleCapabilities> {
  const bytes = paraUint8Array(dados)
  if (bytes.byteLength < 4) return {}
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const flags = view.getUint32(0, true)

  return {
    weight: true,
    timestamp: (flags & 0x00000001) !== 0,
    multipleUsers: (flags & 0x00000002) !== 0,
    bmi: (flags & 0x00000004) !== 0,
  }
}

/** Body Composition Feature (0x2A9B), uint32. */
export function parseBodyCompositionFeature(
  dados: DataView | Uint8Array | ArrayBuffer,
): Partial<ScaleCapabilities> {
  const bytes = paraUint8Array(dados)
  if (bytes.byteLength < 4) return {}
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const flags = view.getUint32(0, true)

  return {
    bodyComposition: true,
    timestamp: (flags & 0x00000001) !== 0,
    multipleUsers: (flags & 0x00000002) !== 0,
    basalMetabolism: (flags & 0x00000004) !== 0,
    musclePercentage: (flags & 0x00000008) !== 0,
    muscleMass: (flags & 0x00000010) !== 0,
    fatFreeMass: (flags & 0x00000020) !== 0,
    softLeanMass: (flags & 0x00000040) !== 0,
    bodyWaterMass: (flags & 0x00000080) !== 0,
    impedance: (flags & 0x00000100) !== 0,
    weight: (flags & 0x00000200) !== 0,
    height: (flags & 0x00000400) !== 0,
  }
}

export function mergeCapabilities(...partes: Partial<ScaleCapabilities>[]): ScaleCapabilities {
  return partes.reduce<ScaleCapabilities>(
    (acumulado, parte) => {
      const somado = { ...acumulado }
      for (const [chave, valor] of Object.entries(parte)) {
        if (valor === true) somado[chave as keyof ScaleCapabilities] = true
      }
      return somado
    },
    { ...NENHUMA_CAPACIDADE },
  )
}
