'use client'

import { BleClient, type BleService, type ScanResult } from '@capacitor-community/bluetooth-le'

import {
  BODY_COMPOSITION_FEATURE_CHAR,
  BODY_COMPOSITION_MEASUREMENT_CHAR,
  BODY_COMPOSITION_SERVICE,
  WEIGHT_MEASUREMENT_CHAR,
  WEIGHT_SCALE_FEATURE_CHAR,
  WEIGHT_SCALE_SERVICE,
  mergeCapabilities,
  mergeReadings,
  parseBodyCompositionFeature,
  parseBodyCompositionMeasurement,
  parseWeightMeasurement,
  parseWeightScaleFeature,
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
import { NENHUMA_CAPACIDADE } from '@/features/synse-body/engine/types'

/**
 * A balança que fala o padrão Bluetooth SIG.
 *
 * O transporte é o plugin nativo do Capacitor, e não Web Bluetooth. Não é
 * preferência: Web Bluetooth não existe no Safari nem no iOS, que é metade do
 * público, e no Chrome só funciona em contexto seguro com um gesto do usuário
 * por conexão. Um produto que dependesse dele não teria balança em iPhone.
 *
 * O mesmo plugin roda no navegador quando ele suporta — ali o provider
 * continua valendo, com as limitações que o navegador impõe.
 */

const SERVICOS_DE_BALANCA = [WEIGHT_SCALE_SERVICE, BODY_COMPOSITION_SERVICE]

let inicializado = false

async function inicializar(): Promise<void> {
  if (inicializado) return
  /*
   * `androidNeverForLocation` é o que permite declarar no manifesto que a
   * varredura não serve para descobrir onde a pessoa está. Sem isso, o Android
   * 12+ exige permissão de localização para ligar o rádio — pedir localização
   * para ler uma balança é desproporcional, e a Play Console pergunta por quê.
   */
  await BleClient.initialize({ androidNeverForLocation: true })
  inicializado = true
}

function comoErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message
  return typeof erro === 'string' ? erro : 'Falha na comunicação com o aparelho.'
}

export const standardBleScaleProvider: ScaleDeviceProvider = {
  id: 'standard_ble',
  label: 'Balança Bluetooth (padrão SIG)',

  async isAvailable() {
    try {
      await inicializar()
      return true
    } catch {
      return false
    }
  },

  async requestPermissions(): Promise<PermissionOutcome> {
    try {
      await inicializar()
    } catch (erro) {
      return {
        granted: false,
        reason: 'UNAVAILABLE',
        message: `Este aparelho não disponibilizou o Bluetooth ao app: ${comoErro(erro)}`,
      }
    }

    try {
      const ligado = await BleClient.isEnabled()
      if (!ligado) {
        return {
          granted: false,
          reason: 'BLUETOOTH_OFF',
          message: 'O Bluetooth está desligado.',
        }
      }
    } catch {
      /*
       * `isEnabled` não existe no navegador. Não saber se está ligado não é o
       * mesmo que estar desligado — segue, e a falha aparece na varredura.
       */
    }

    return { granted: true }
  },

  /**
   * Varredura com hora para acabar.
   *
   * Rádio ligado indefinidamente derruba a bateria e, a partir do Android 7, o
   * sistema passa a ignorar quem inicia varredura demais — o app simplesmente
   * para de encontrar aparelhos, sem erro nenhum.
   */
  async scan(options: ScanOptions): Promise<DiscoveredScale[]> {
    await inicializar()
    const encontrados = new Map<string, DiscoveredScale>()

    options.onDiagnostic?.({ at: Date.now(), kind: 'SCAN', message: 'Varredura iniciada' })

    const aoEncontrar = (resultado: ScanResult) => {
      const aparelho: DiscoveredScale = {
        platformDeviceId: resultado.device.deviceId,
        name: resultado.device.name ?? resultado.localName ?? null,
        rssi: resultado.rssi ?? null,
      }
      encontrados.set(aparelho.platformDeviceId, aparelho)
      options.onDiscover?.(aparelho)
      options.onDiagnostic?.({
        at: Date.now(),
        kind: 'SCAN',
        message: `Encontrado ${aparelho.name ?? 'sem nome'}`,
        detail: { id: aparelho.platformDeviceId, rssi: aparelho.rssi },
      })
    }

    try {
      await BleClient.requestLEScan(
        options.onlyScales === false ? {} : { services: SERVICOS_DE_BALANCA },
        aoEncontrar,
      )
    } catch (erro) {
      options.onDiagnostic?.({ at: Date.now(), kind: 'ERROR', message: comoErro(erro) })
      throw erro
    }

    await new Promise((resolve) => setTimeout(resolve, options.timeoutMs))
    await this.stopScan()

    return [...encontrados.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999))
  },

  async stopScan() {
    try {
      await BleClient.stopLEScan()
    } catch {
      // Parar uma varredura que já parou não é problema.
    }
  },

  async connect(platformDeviceId: string) {
    await inicializar()
    await BleClient.connect(platformDeviceId)
  },

  async disconnect(platformDeviceId: string) {
    try {
      await BleClient.disconnect(platformDeviceId)
    } catch {
      // Já desconectado, ou fora de alcance. Nos dois casos, o fim é o mesmo.
    }
  },

  /**
   * "É esta mesmo?"
   *
   * O padrão de balança não tem comando de bipar. O que dá para fazer sem
   * inventar protocolo é ler a característica de fabricante: a balança
   * responde, e a tela confirma que está falando com aquele aparelho — sem
   * prometer uma luz que não vai acender.
   */
  async identify(platformDeviceId: string) {
    await BleClient.readRssi(platformDeviceId)
  },

  async discoverServices(platformDeviceId: string): Promise<DiscoveredService[]> {
    await BleClient.discoverServices(platformDeviceId)
    const servicos: BleService[] = await BleClient.getServices(platformDeviceId)

    return servicos.map((servico) => ({
      uuid: servico.uuid,
      characteristics: servico.characteristics.map((caracteristica) => ({
        uuid: caracteristica.uuid,
        properties: Object.entries(caracteristica.properties)
          .filter(([, ligado]) => ligado === true)
          .map(([nome]) => nome),
      })),
    }))
  },

  /**
   * O que este aparelho entrega — lido dele, não prometido pelo fabricante.
   *
   * Duas fontes, e as duas importam: os serviços que ele realmente expõe, e as
   * características de "feature", em que ele declara campo a campo o que sabe
   * medir.
   */
  async getCapabilities(platformDeviceId: string): Promise<ScaleCapabilities> {
    const servicos = await this.discoverServices(platformDeviceId)
    const temServico = (uuid: string) =>
      servicos.some((s) => s.uuid.toLowerCase() === uuid.toLowerCase())

    const partes: Partial<ScaleCapabilities>[] = [
      { weight: temServico(WEIGHT_SCALE_SERVICE), bodyComposition: temServico(BODY_COMPOSITION_SERVICE) },
    ]

    if (temServico(WEIGHT_SCALE_SERVICE)) {
      try {
        const dados = await BleClient.read(
          platformDeviceId,
          WEIGHT_SCALE_SERVICE,
          WEIGHT_SCALE_FEATURE_CHAR,
        )
        partes.push(parseWeightScaleFeature(dados))
      } catch {
        // A característica de feature é opcional. Sem ela, vale o que o serviço diz.
      }
    }

    if (temServico(BODY_COMPOSITION_SERVICE)) {
      try {
        const dados = await BleClient.read(
          platformDeviceId,
          BODY_COMPOSITION_SERVICE,
          BODY_COMPOSITION_FEATURE_CHAR,
        )
        partes.push(parseBodyCompositionFeature(dados))
      } catch {
        /* idem */
      }
    }

    return partes.length ? mergeCapabilities(...partes) : { ...NENHUMA_CAPACIDADE }
  },

  /**
   * Assina as notificações das duas características.
   *
   * As duas, e não uma: há balança que só tem peso, balança que só tem
   * composição, e balança que manda as duas coisas em características
   * separadas para a mesma subida. Escolher uma deixaria metade do mercado de
   * fora.
   */
  async subscribeToMeasurements(
    platformDeviceId: string,
    onReading: (leitura: ParsedScaleReading) => void,
  ): Promise<() => void> {
    const servicos = await this.discoverServices(platformDeviceId)
    const temServico = (uuid: string) =>
      servicos.some((s) => s.uuid.toLowerCase() === uuid.toLowerCase())

    /*
     * O pacote que se anuncia como parcial fica guardado até o próximo chegar.
     * Entregar cada metade como se fosse uma pesagem gravaria duas linhas pela
     * metade — ver `mergeReadings`.
     */
    let pendente: ParsedScaleReading | null = null

    const entregar = (leitura: ParsedScaleReading) => {
      const completa = pendente ? mergeReadings(pendente, leitura) : leitura
      pendente = completa.continues ? completa : null
      onReading(completa)
    }

    const assinaturas: { servico: string; caracteristica: string }[] = []

    if (temServico(WEIGHT_SCALE_SERVICE)) {
      await BleClient.startNotifications(
        platformDeviceId,
        WEIGHT_SCALE_SERVICE,
        WEIGHT_MEASUREMENT_CHAR,
        (valor) => entregar(parseWeightMeasurement(valor)),
      )
      assinaturas.push({ servico: WEIGHT_SCALE_SERVICE, caracteristica: WEIGHT_MEASUREMENT_CHAR })
    }

    if (temServico(BODY_COMPOSITION_SERVICE)) {
      await BleClient.startNotifications(
        platformDeviceId,
        BODY_COMPOSITION_SERVICE,
        BODY_COMPOSITION_MEASUREMENT_CHAR,
        (valor) => entregar(parseBodyCompositionMeasurement(valor)),
      )
      assinaturas.push({
        servico: BODY_COMPOSITION_SERVICE,
        caracteristica: BODY_COMPOSITION_MEASUREMENT_CHAR,
      })
    }

    if (!assinaturas.length) {
      throw new Error('Este aparelho não expõe nenhum serviço de balança conhecido.')
    }

    return () => {
      for (const { servico, caracteristica } of assinaturas) {
        void BleClient.stopNotifications(platformDeviceId, servico, caracteristica).catch(() => {})
      }
    }
  },

  /**
   * Leitura avulsa.
   *
   * Vale para a balança que guarda a última pesagem numa característica
   * legível. A maioria só notifica, e aí isto devolve nulo — que é diferente
   * de erro: significa "este aparelho não guarda, espere ele avisar".
   */
  async readMeasurement(platformDeviceId: string): Promise<ParsedScaleReading | null> {
    try {
      const dados = await BleClient.read(
        platformDeviceId,
        BODY_COMPOSITION_SERVICE,
        BODY_COMPOSITION_MEASUREMENT_CHAR,
      )
      return parseBodyCompositionMeasurement(dados)
    } catch {
      /* segue para o peso */
    }

    try {
      const dados = await BleClient.read(
        platformDeviceId,
        WEIGHT_SCALE_SERVICE,
        WEIGHT_MEASUREMENT_CHAR,
      )
      return parseWeightMeasurement(dados)
    } catch {
      return null
    }
  },

  normalizeMeasurement(leitura: ParsedScaleReading, contexto: NormalizationContext): NormalizedResult {
    return normalizeScaleReading(leitura, contexto)
  },
}
