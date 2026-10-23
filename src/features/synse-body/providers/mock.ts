import {
  BODY_COMPOSITION_MEASUREMENT_CHAR,
  BODY_COMPOSITION_SERVICE,
  WEIGHT_MEASUREMENT_CHAR,
  WEIGHT_SCALE_SERVICE,
  /*
   * Os parsers de verdade, e não uma reimplementação: o mock monta bytes no
   * layout do padrão e deixa o mesmo código do aparelho interpretá-los. Um
   * mock que devolvesse objetos prontos testaria a si mesmo.
   */
  parseBodyCompositionMeasurement,
  parseWeightMeasurement,
} from '@/features/synse-body/engine/ble'
import { normalizeScaleReading } from '@/features/synse-body/engine/normalize'
import type {
  DiscoveredScale,
  DiscoveredService,
  NormalizationContext,
  NormalizedResult,
  ParsedScaleReading,
  PermissionOutcome,
  ScaleCapabilities,
  ScaleDeviceProvider,
  ScanOptions,
} from '@/features/synse-body/engine/types'

/**
 * A balança que não existe.
 *
 * Serve a três coisas, e nenhuma delas é enfeite:
 *
 * - **construir a tela sem hardware na mesa.** A experiência de pesagem tem
 *   sete estados, e cinco deles só acontecem com uma balança real por perto.
 * - **o modo de demonstração**, em que ninguém tem balança e a tela precisa
 *   mostrar o que o produto faz.
 * - **o teste**, que precisa reproduzir a pessoa se equilibrando, a balança
 *   que falha, a que demora, a que some no meio.
 *
 * Os bytes que ela emite são montados com o mesmo layout do padrão SIG e
 * passam pelos parsers de verdade — um mock que devolvesse objetos prontos
 * testaria a si mesmo.
 */

export type MockScaleScript = {
  /** Os pesos que chegam, em ordem, como a pessoa se equilibrando. */
  pesosKg: number[]
  intervaloMs?: number
  /** Manda também composição corporal (serviço 0x181B). */
  comComposicao?: boolean
  /** A balança declara medição malsucedida (0xFFFF na gordura). */
  malsucedida?: boolean
  /** A balança reporta em libras, e o parser precisa converter. */
  imperial?: boolean
  /** Para de mandar no meio, como um aparelho que sai de alcance. */
  desconectaApos?: number
  /** A varredura não encontra nada. */
  semAparelhos?: boolean
  /** A permissão é negada. */
  permissaoNegada?: boolean
}

export const ROTEIRO_PADRAO: MockScaleScript = {
  pesosKg: [68.2, 71.9, 70.45, 70.4, 70.4],
  intervaloMs: 350,
  comComposicao: true,
}

export const APARELHO_DEMO: DiscoveredScale = {
  platformDeviceId: 'mock-scale-0001',
  name: 'Synse Scale (demonstração)',
  rssi: -54,
}

const u16 = (valor: number) => [valor & 0xff, (valor >> 8) & 0xff]

/** Monta um pacote 0x2A9D como a especificação manda. */
export function montarWeightMeasurement(pesoKg: number, imperial = false): Uint8Array {
  const flags = imperial ? 0x01 : 0x00
  const cru = imperial ? Math.round(pesoKg / 0.45359237 / 0.01) : Math.round(pesoKg / 0.005)
  return new Uint8Array([flags, ...u16(cru)])
}

/** Monta um pacote 0x2A9C com gordura, água, massa muscular, impedância e peso. */
export function montarBodyComposition(
  pesoKg: number,
  opcoes: { malsucedida?: boolean; imperial?: boolean } = {},
): Uint8Array {
  const imperial = opcoes.imperial === true
  // bits: 0 unidade · 3 metabolismo · 5 massa muscular · 8 água · 9 impedância · 10 peso
  const flags = (imperial ? 0x0001 : 0) | 0x0008 | 0x0020 | 0x0100 | 0x0200 | 0x0400

  const massa = (kg: number) =>
    imperial ? Math.round(kg / 0.45359237 / 0.01) : Math.round(kg / 0.005)

  const gordura = opcoes.malsucedida ? 0xffff : Math.round(22.4 / 0.1)
  // O metabolismo basal trafega em quilojoule: ~1.600 kcal = 6.694 kJ.
  const metabolismoKj = Math.round(1600 * 4.184)

  return new Uint8Array([
    ...u16(flags),
    ...u16(gordura),
    ...u16(metabolismoKj),
    ...u16(massa(pesoKg * 0.38)),
    ...u16(massa(pesoKg * 0.55)),
    ...u16(Math.round(512.3 / 0.1)),
    ...u16(massa(pesoKg)),
  ])
}

const CAPACIDADES_DEMO: ScaleCapabilities = {
  weight: true,
  bodyComposition: true,
  timestamp: false,
  multipleUsers: false,
  bmi: false,
  basalMetabolism: true,
  musclePercentage: false,
  muscleMass: true,
  fatFreeMass: false,
  softLeanMass: false,
  bodyWaterMass: true,
  impedance: true,
  height: false,
}

export function createMockScaleProvider(roteiro: MockScaleScript = ROTEIRO_PADRAO): ScaleDeviceProvider {
  const config = { ...ROTEIRO_PADRAO, ...roteiro }
  let varrendo = false

  return {
    id: 'mock',
    label: 'Balança simulada',

    async isAvailable() {
      return true
    },

    async requestPermissions(): Promise<PermissionOutcome> {
      return config.permissaoNegada
        ? {
            granted: false,
            reason: 'DENIED',
            message: 'Permissão de Bluetooth negada.',
          }
        : { granted: true }
    },

    async scan(options: ScanOptions): Promise<DiscoveredScale[]> {
      varrendo = true
      if (config.semAparelhos) {
        // Respeita o teto: o teste do "nada encontrado" precisa terminar.
        await new Promise((resolve) => setTimeout(resolve, Math.min(options.timeoutMs, 50)))
        varrendo = false
        return []
      }

      options.onDiscover?.(APARELHO_DEMO)
      options.onDiagnostic?.({
        at: Date.now(),
        kind: 'SCAN',
        message: 'Encontrado Synse Scale (demonstração)',
        detail: { rssi: APARELHO_DEMO.rssi },
      })
      varrendo = false
      return [APARELHO_DEMO]
    },

    async stopScan() {
      varrendo = false
    },

    async connect() {
      if (varrendo) await this.stopScan()
    },

    async disconnect() {},
    async identify() {},

    async discoverServices(): Promise<DiscoveredService[]> {
      return [
        {
          uuid: WEIGHT_SCALE_SERVICE,
          characteristics: [{ uuid: WEIGHT_MEASUREMENT_CHAR, properties: ['notify'] }],
        },
        {
          uuid: BODY_COMPOSITION_SERVICE,
          characteristics: [{ uuid: BODY_COMPOSITION_MEASUREMENT_CHAR, properties: ['indicate'] }],
        },
      ]
    },

    async getCapabilities() {
      return { ...CAPACIDADES_DEMO }
    },

    async subscribeToMeasurements(
      _platformDeviceId: string,
      onReading: (leitura: ParsedScaleReading) => void,
    ) {
      let cancelado = false
      const temporizadores: ReturnType<typeof setTimeout>[] = []
      const intervalo = config.intervaloMs ?? 350

      config.pesosKg.forEach((peso, indice) => {
        if (config.desconectaApos !== undefined && indice >= config.desconectaApos) return

        temporizadores.push(
          setTimeout(() => {
            if (cancelado) return
            const ultimo = indice === config.pesosKg.length - 1
            const bytes =
              config.comComposicao && ultimo
                ? montarBodyComposition(peso, {
                    malsucedida: config.malsucedida,
                    imperial: config.imperial,
                  })
                : montarWeightMeasurement(peso, config.imperial)

            onReading(
              config.comComposicao && ultimo
                ? parseBodyCompositionMeasurement(bytes)
                : parseWeightMeasurement(bytes),
            )
          }, intervalo * (indice + 1)),
        )
      })

      return () => {
        cancelado = true
        temporizadores.forEach(clearTimeout)
      }
    },

    async readMeasurement(): Promise<ParsedScaleReading | null> {
      const ultimo = config.pesosKg.at(-1)
      if (ultimo === undefined) return null
      return parseWeightMeasurement(montarWeightMeasurement(ultimo, config.imperial))
    },

    normalizeMeasurement(leitura: ParsedScaleReading, contexto: NormalizationContext): NormalizedResult {
      return normalizeScaleReading(leitura, contexto)
    },
  }
}

export const mockScaleProvider = createMockScaleProvider()
