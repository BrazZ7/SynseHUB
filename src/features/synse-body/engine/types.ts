import type {
  BodyMeasurement,
  BodyMeasurementSource,
  FieldOrigin,
  FieldOriginMap,
  UserDevice,
} from '@/types/domain'

/**
 * Synse Body — o vocabulário do aparelho.
 *
 * Uma pesagem no Synse tem duas naturezas misturadas, e separá-las é o que
 * permite a tela ser honesta:
 *
 * - o que a balança **mediu** (peso, impedância);
 * - o que ela **estimou** por bioimpedância (gordura, água, massa muscular);
 * - o que o **Synse calculou** (IMC, a partir do peso e da altura do perfil).
 *
 * Apresentar estimativa de bioimpedância como medição direta é o tipo de
 * imprecisão que vira decisão de alguém sobre o próprio corpo. Por isso todo
 * campo carrega de onde veio, em `fieldOrigin`.
 */

export type { BodyMeasurement, BodyMeasurementSource, FieldOrigin, FieldOriginMap, UserDevice }


/**
 * O que saiu do parser, antes de virar medição.
 *
 * Separado de `BodyMeasurement` de propósito: o pacote BLE pode chegar sem
 * peso (medição malsucedida, pacote parcial de um envio em várias partes), e
 * aí não é uma pesagem — é um fragmento. Só a normalização decide se virou.
 */
export type ParsedScaleReading = {
  weightKg?: number
  heightM?: number
  bmi?: number
  bodyFatPercent?: number
  musclePercent?: number
  muscleMassKg?: number
  fatFreeMassKg?: number
  softLeanMassKg?: number
  bodyWaterMassKg?: number
  basalMetabolismKcal?: number
  impedanceOhm?: number
  /** O relógio da balança, quando ele é plausível. Ver `parseDateTime`. */
  measuredAt?: Date
  /** Qual usuário da balança, quando ela tem vários cadastrados. */
  scaleUserId?: number
  /** A balança reportou libra/polegada e o parser converteu. */
  reportedImperial: boolean
  /**
   * O envio continua noutro pacote (bit "Multiple Packet Measurement").
   * Enquanto for verdade, isto não é uma leitura completa.
   */
  continues: boolean
  /** A balança disse que a medição não deu certo (0xFFFF onde não podia). */
  unsuccessful: boolean
  /** Bytes originais em hexadecimal, para o painel de desenvolvimento. */
  rawHex: string
}

/** O que o aparelho comprovadamente entrega — descoberto, não prometido. */
export type ScaleCapabilities = {
  weight: boolean
  bodyComposition: boolean
  timestamp: boolean
  multipleUsers: boolean
  bmi: boolean
  basalMetabolism: boolean
  musclePercentage: boolean
  muscleMass: boolean
  fatFreeMass: boolean
  softLeanMass: boolean
  bodyWaterMass: boolean
  impedance: boolean
  height: boolean
}

export const NENHUMA_CAPACIDADE: ScaleCapabilities = {
  weight: false,
  bodyComposition: false,
  timestamp: false,
  multipleUsers: false,
  bmi: false,
  basalMetabolism: false,
  musclePercentage: false,
  muscleMass: false,
  fatFreeMass: false,
  softLeanMass: false,
  bodyWaterMass: false,
  impedance: false,
  height: false,
}

/** Um aparelho visto no ar, ainda não pareado. */
export type DiscoveredScale = {
  /**
   * O identificador que a plataforma dá — e não o MAC.
   *
   * Android e iOS aleatorizam o endereço por privacidade, e o CoreBluetooth
   * nem expõe MAC: devolve um UUID próprio, estável para aquele aparelho
   * naquele iPhone. Guardar MAC significaria perder o vínculo na próxima
   * rotação do endereço.
   */
  platformDeviceId: string
  name: string | null
  /** Potência do sinal em dBm. Serve para "aproxime o celular da balança". */
  rssi: number | null
}

/** O que o painel de desenvolvimento mostra: a comunicação como ela é. */
export type ScaleDiagnostic = {
  at: number
  kind: 'SCAN' | 'CONNECT' | 'SERVICE' | 'CHARACTERISTIC' | 'NOTIFY' | 'ERROR' | 'INFO'
  message: string
  detail?: Record<string, unknown>
}

/**
 * O contrato com o aparelho.
 *
 * Existe para que a balança que a gente tem hoje e a que o fabricante lançar
 * amanhã entrem pelo mesmo buraco. O `standardBleScaleProvider` implementa o
 * padrão Bluetooth SIG; o `mockScaleProvider` permite construir e testar a
 * tela sem hardware na mesa.
 */
export interface ScaleDeviceProvider {
  readonly id: string
  readonly label: string

  /** O ambiente atual consegue falar BLE? (navegador sem suporte, etc.) */
  isAvailable(): Promise<boolean>
  /** Pede a permissão e liga o rádio, se preciso. */
  requestPermissions(): Promise<PermissionOutcome>

  /**
   * Procura balanças. Nunca indefinidamente: varredura BLE contínua drena a
   * bateria e, no Android, o sistema começa a ignorar quem abusa.
   */
  scan(options: ScanOptions): Promise<DiscoveredScale[]>
  stopScan(): Promise<void>

  connect(platformDeviceId: string): Promise<void>
  disconnect(platformDeviceId: string): Promise<void>
  /** Faz o aparelho se anunciar (bipe/luz), para confirmar que é aquele. */
  identify(platformDeviceId: string): Promise<void>

  /** Lê serviços e características de verdade — é isto que vira `capabilities`. */
  discoverServices(platformDeviceId: string): Promise<DiscoveredService[]>
  getCapabilities(platformDeviceId: string): Promise<ScaleCapabilities>

  /** Assina as notificações. Devolve a função que cancela a assinatura. */
  subscribeToMeasurements(
    platformDeviceId: string,
    onReading: (leitura: ParsedScaleReading) => void,
  ): Promise<() => void>
  /** Leitura avulsa, para balanças que guardam a última pesagem. */
  readMeasurement(platformDeviceId: string): Promise<ParsedScaleReading | null>

  normalizeMeasurement(leitura: ParsedScaleReading, contexto: NormalizationContext): NormalizedResult
}

export type ScanOptions = {
  /** Teto da varredura. Sem teto o rádio fica ligado até a bateria acabar. */
  timeoutMs: number
  /** Só aparelhos que anunciam serviço de balança. */
  onlyScales?: boolean
  onDiscover?: (aparelho: DiscoveredScale) => void
  onDiagnostic?: (evento: ScaleDiagnostic) => void
}

export type DiscoveredService = {
  uuid: string
  characteristics: { uuid: string; properties: string[] }[]
}

export type PermissionOutcome =
  | { granted: true }
  | { granted: false; reason: 'DENIED' | 'UNAVAILABLE' | 'BLUETOOTH_OFF' | 'LOCATION_OFF'; message: string }

/** O que a normalização precisa saber e o pacote BLE não traz. */
export type NormalizationContext = {
  clientId: string
  /** Altura em metros, do perfil. Sem ela não há IMC calculado. */
  heightM?: number | null
  deviceId?: string | null
  source?: BodyMeasurementSource
  /** Relógio do celular, usado quando o da balança não é confiável. */
  now?: Date
}

export type NormalizedResult =
  | { ok: true; measurement: BodyMeasurement; warnings: string[] }
  | { ok: false; reason: NormalizationFailure; message: string }

export type NormalizationFailure =
  | 'SEM_PESO'
  | 'PESO_IMPLAUSIVEL'
  | 'MEDICAO_MALSUCEDIDA'
  | 'PACOTE_INCOMPLETO'

/** Os estados da experiência de pesagem. */
export type WeighingState =
  | 'AGUARDANDO'
  | 'MEDINDO'
  | 'INSTAVEL'
  | 'ESTAVEL'
  | 'SINCRONIZANDO'
  | 'CONCLUIDO'
  | 'ERRO'
