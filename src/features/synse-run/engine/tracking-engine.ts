import { estimateCalories } from '@/features/synse-run/engine/calories'
import { haversineDistance } from '@/features/synse-run/engine/geo'
import { decideAutoPause } from '@/features/synse-run/engine/auto-pause'
import { gpsQualityFor, isNoise, validatePoint } from '@/features/synse-run/engine/filter'
import { computeSplits } from '@/features/synse-run/engine/splits'
import {
  accumulateElevation,
  smoothedPosition,
  speedToPace,
  windowedSpeed,
} from '@/features/synse-run/engine/smoothing'
import {
  DEFAULT_CONFIG,
  type ActivitySnapshot,
  type ActivityState,
  type PointOutcome,
  type RawPoint,
  type SportType,
  type TrackPoint,
  type TrackingConfig,
} from '@/features/synse-run/engine/types'

/**
 * O motor da atividade.
 *
 * TypeScript puro, sem React, sem navegador, sem banco: recebe ponto de GPS e
 * relógio, devolve o retrato da corrida. É o que torna possível testar corrida
 * com GPS ruim, pessoa parada no semáforo e sinal perdido no túnel sem sair do
 * terminal — nenhum desses casos apareceria numa tela sendo clicada à mão.
 *
 * Quem fala com o navegador é a camada de cima. Quem decide o que é distância
 * é aqui.
 */

type Transicao = { de: ActivityState[]; para: ActivityState }

/**
 * A máquina de estados, declarada (item 41).
 *
 * Com quatro booleanos — `iniciado`, `pausado`, `autoPausado`, `finalizado` —
 * existem dezesseis combinações, e a maioria não faz sentido: finalizado e
 * pausado ao mesmo tempo, autoPausado sem ter iniciado. A tela acaba cheia de
 * `if (iniciado && !pausado && !finalizado)`, e o bug mora na combinação que
 * ninguém escreveu.
 */
const TRANSICOES: Record<string, Transicao> = {
  procurarGps: { de: ['IDLE', 'ERROR'], para: 'GPS_SEARCHING' },
  sinalPronto: { de: ['GPS_SEARCHING'], para: 'READY' },
  contagem: { de: ['READY'], para: 'COUNTDOWN' },
  iniciar: { de: ['COUNTDOWN'], para: 'RUNNING' },
  pausar: { de: ['RUNNING', 'AUTO_PAUSED'], para: 'PAUSED' },
  pausarSozinho: { de: ['RUNNING'], para: 'AUTO_PAUSED' },
  retomar: { de: ['PAUSED', 'AUTO_PAUSED'], para: 'RUNNING' },
  finalizar: { de: ['RUNNING', 'PAUSED', 'AUTO_PAUSED'], para: 'FINISHING' },
  concluir: { de: ['FINISHING'], para: 'FINISHED' },
  falhar: { de: ['GPS_SEARCHING', 'READY', 'COUNTDOWN', 'RUNNING'], para: 'ERROR' },
}

export type EngineEvent =
  | { type: 'MARCO_KM'; kilometer: number; seconds: number }
  | { type: 'AUTO_PAUSADO' }
  | { type: 'AUTO_RETOMADO' }
  | { type: 'PONTO_RECUSADO'; reason: string }

export class ActivityTrackingEngine {
  private estado: ActivityState = 'IDLE'
  private readonly pontos: TrackPoint[] = []
  private readonly config: TrackingConfig

  private inicioMs: number | null = null
  private fimMs: number | null = null
  /** Soma dos intervalos em que a atividade esteve pausada. */
  private pausadoMs = 0
  private pausaComecouEm: number | null = null
  /** Instante em que a velocidade caiu abaixo do limiar de parada. */
  private paradoDesde: number | null = null
  /** Onde a pessoa estava quando a pausa automática entrou. */
  private ancoraDaPausa: TrackPoint | null = null

  private maxSpeed = 0
  private bestPace: number | null = null
  private ultimoKmAvisado = 0
  private eventos: EngineEvent[] = []

  constructor(sport: SportType = 'RUN', overrides: Partial<TrackingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG[sport], ...overrides }
  }

  // ── Estado ────────────────────────────────────────────────────────────────
  get state(): ActivityState {
    return this.estado
  }

  /** Tenta uma transição nomeada. Devolve false quando ela não é permitida. */
  transition(nome: keyof typeof TRANSICOES, agora = Date.now()): boolean {
    const transicao = TRANSICOES[nome]
    if (!transicao || !transicao.de.includes(this.estado)) return false

    const anterior = this.estado
    this.estado = transicao.para

    if (transicao.para === 'RUNNING') {
      this.ancoraDaPausa = null
      if (this.inicioMs === null) this.inicioMs = agora
      if (this.pausaComecouEm !== null) {
        this.pausadoMs += agora - this.pausaComecouEm
        this.pausaComecouEm = null
      }
      this.paradoDesde = null
    }

    if (
      (transicao.para === 'PAUSED' || transicao.para === 'AUTO_PAUSED') &&
      anterior === 'RUNNING'
    ) {
      this.pausaComecouEm = agora
    }

    if (transicao.para === 'FINISHING') {
      if (this.pausaComecouEm !== null) {
        this.pausadoMs += agora - this.pausaComecouEm
        this.pausaComecouEm = null
      }
      this.fimMs = agora
    }

    return true
  }

  // ── Entrada de dados ──────────────────────────────────────────────────────
  /**
   * Recebe um ponto do GPS.
   *
   * Pontos que chegam fora do estado RUNNING são descartados de propósito: a
   * pessoa pausou, e a distância andada até o banheiro não é da corrida dela.
   */
  addPoint(ponto: RawPoint): PointOutcome {
    /*
     * AUTO_PAUSED também processa ponto, e isso não é detalhe: enquanto o
     * motor ignorava tudo fora de RUNNING, a pausa automática era uma armadilha
     * sem saída — parava sozinha e nunca mais voltava, porque a única coisa
     * capaz de detectar movimento era justamente o ponto que ele descartava.
     *
     * Pausa manual continua descartando: ali quem decide voltar é a pessoa, e
     * a distância até o banheiro não é da corrida dela.
     */
    const rastreando = this.estado === 'RUNNING' || this.estado === 'AUTO_PAUSED'

    if (!rastreando) {
      // Enquanto procura sinal, o ponto ainda serve para medir a qualidade.
      if (this.estado === 'GPS_SEARCHING' || this.estado === 'READY') {
        this.ultimaPrecisao = ponto.accuracy
      }
      return { accepted: false, reason: 'TEMPO_NAO_AVANCOU' }
    }

    this.ultimaPrecisao = ponto.accuracy

    const ultimoCru = this.ultimoCru
    const sanidade = validatePoint(ponto, ultimoCru, this.config)

    if (!sanidade.ok) {
      this.eventos.push({ type: 'PONTO_RECUSADO', reason: sanidade.reason })
      this.avaliarAutoPause(0, ponto.timestamp)
      return { accepted: false, reason: sanidade.reason }
    }

    /*
     * Buraco no tempo reinicia a média.
     *
     * Sinal perdido num túnel, tela desligada, aba em segundo plano: quando os
     * pontos voltam, a janela ainda guarda posições de um minuto atrás. Misturar
     * as duas pontas produz um lugar onde a pessoa nunca esteve, e o
     * deslocamento real chega picado, um quinto por ponto.
     *
     * Reiniciando, o primeiro ponto depois do buraco vale por si — e a distância
     * em linha reta até ele é contabilizada inteira, já que a checagem de salto
     * impossível garantiu que ela é plausível para o tempo que passou.
     */
    const buraco =
      ultimoCru !== null &&
      (ponto.timestamp - ultimoCru.timestamp) / 1000 > this.config.gapResetSeconds

    this.ultimoCru = ponto

    if (buraco) {
      this.janela.length = 0
      for (let i = 0; i < this.config.positionWindow; i += 1) this.janela.push(ponto)
    } else {
      this.janela.push(ponto)
      if (this.janela.length > this.config.positionWindow) this.janela.shift()
    }

    /*
     * Só mede depois que a janela enche. Com um ou dois pontos, a média ainda
     * é o próprio ruído, e o começo da corrida ganharia metros que não
     * existiram.
     */
    if (this.janela.length < this.config.positionWindow) {
      return { accepted: false, reason: 'RUIDO_PARADO' }
    }

    const media = smoothedPosition(this.janela)
    const suavizado = { ...ponto, ...media }
    const anterior = this.pontos[this.pontos.length - 1] ?? null

    if (!anterior) {
      const primeiro = { ...suavizado, distanceFromPrevious: 0, totalDistance: 0 }
      this.pontos.push(primeiro)
      return { accepted: true, point: primeiro }
    }

    const distancia = haversineDistance(anterior, suavizado)

    if (isNoise(distancia, ponto.accuracy, this.config)) {
      this.eventos.push({ type: 'PONTO_RECUSADO', reason: 'RUIDO_PARADO' })
      this.avaliarAutoPause(0, ponto.timestamp)
      return { accepted: false, reason: 'RUIDO_PARADO' }
    }

    /*
     * Retomar da pausa automática exige afastamento, não um ponto aceito.
     *
     * Antes bastava um ponto passar o filtro para a corrida voltar e somar.
     * Parado em casa com sinal ruim, o app alternava pausa e retomada a cada
     * salto do GPS, acumulando metros que ninguém andou — foi o que apareceu
     * no primeiro uso real.
     *
     * Ruído vai e volta: medido sempre contra a mesma âncora, nunca se afasta.
     * Movimento de verdade se afasta e fica — e aí a distância desde a âncora
     * entra inteira, sem perder o trecho da retomada.
     */
    if (this.estado === 'AUTO_PAUSED') {
      const ancora = this.ancoraDaPausa ?? anterior
      const afastamento = haversineDistance(ancora, suavizado)

      if (afastamento < Math.max(15, ponto.accuracy * 1.5)) {
        this.eventos.push({ type: 'PONTO_RECUSADO', reason: 'RUIDO_PARADO' })
        return { accepted: false, reason: 'RUIDO_PARADO' }
      }

      this.transition('retomar', ponto.timestamp)
      this.eventos.push({ type: 'AUTO_RETOMADO' })
    }

    const resultado = {
      accepted: true as const,
      point: {
        ...suavizado,
        distanceFromPrevious: distancia,
        totalDistance: anterior.totalDistance + distancia,
      },
    }

    this.pontos.push(resultado.point)

    const velocidade = windowedSpeed(
      this.pontos,
      this.config.smoothingWindowSeconds,
      ponto.timestamp,
    )
    if (velocidade > this.maxSpeed) this.maxSpeed = velocidade

    const pace = speedToPace(velocidade)
    if (pace !== null && (this.bestPace === null || pace < this.bestPace)) {
      this.bestPace = pace
    }

    this.detectarMarcoDeKm()
    this.avaliarAutoPause(velocidade, ponto.timestamp)

    return resultado
  }

  private ultimaPrecisao: number | null = null
  /** Último ponto cru aprovado na sanidade — âncora do teste de salto. */
  private ultimoCru: RawPoint | null = null
  /** Janela da média que suaviza a posição. */
  private readonly janela: RawPoint[] = []

  private avaliarAutoPause(velocidade: number, agora: number): void {
    if (velocidade < this.config.autoPauseSpeed) {
      this.paradoDesde ??= agora
    } else {
      this.paradoDesde = null
    }

    const segundosParado = this.paradoDesde === null ? 0 : (agora - this.paradoDesde) / 1000

    const decisao = decideAutoPause({
      pausadoAutomaticamente: this.estado === 'AUTO_PAUSED',
      velocidade,
      segundosParado,
      config: this.config,
    })

    if (decisao === 'PAUSAR' && this.transition('pausarSozinho', agora)) {
      this.ancoraDaPausa = this.pontos[this.pontos.length - 1] ?? null
      this.eventos.push({ type: 'AUTO_PAUSADO' })
    }

    /*
     * A retomada por velocidade sai daqui de propósito. Ela olhava a janela de
     * velocidade, que fica velha justamente quando os pontos são recusados —
     * quem decide retomar é o afastamento da âncora, em `addPoint`.
     */
  }

  private detectarMarcoDeKm(): void {
    const parciais = computeSplits(this.pontos)
    for (const parcial of parciais) {
      if (parcial.kilometer <= this.ultimoKmAvisado) continue
      this.ultimoKmAvisado = parcial.kilometer
      this.eventos.push({
        type: 'MARCO_KM',
        kilometer: parcial.kilometer,
        seconds: parcial.seconds,
      })
    }
  }

  /** Eventos desde a última leitura. Quem consome decide o que vira aviso. */
  drainEvents(): EngineEvent[] {
    const pendentes = this.eventos
    this.eventos = []
    return pendentes
  }

  // ── Saída ─────────────────────────────────────────────────────────────────
  snapshot(agora = Date.now()): ActivitySnapshot {
    const distancia = this.pontos[this.pontos.length - 1]?.totalDistance ?? 0

    const decorridoMs = this.inicioMs === null ? 0 : (this.fimMs ?? agora) - this.inicioMs
    const pausaEmCurso =
      this.pausaComecouEm === null ? 0 : (this.fimMs ?? agora) - this.pausaComecouEm
    const movimentoMs = Math.max(0, decorridoMs - this.pausadoMs - pausaEmCurso)

    const velocidadeAtual =
      this.estado === 'RUNNING' ? windowedSpeed(this.pontos, this.config.smoothingWindowSeconds) : 0

    const segundosEmMovimento = movimentoMs / 1000
    const velocidadeMedia = segundosEmMovimento > 0 ? distancia / segundosEmMovimento : 0

    const elevacao = accumulateElevation(
      this.pontos.map((ponto) => ponto.altitude),
      this.config.elevationThreshold,
    )

    return {
      state: this.estado,
      distance: distancia,
      elapsedSeconds: decorridoMs / 1000,
      movingSeconds: segundosEmMovimento,
      currentSpeed: velocidadeAtual,
      averageSpeed: velocidadeMedia,
      maxSpeed: this.maxSpeed,
      currentPace: speedToPace(velocidadeAtual),
      averagePace: speedToPace(velocidadeMedia),
      bestPace: this.bestPace,
      altitude: this.pontos[this.pontos.length - 1]?.altitude ?? null,
      elevationGain: Math.round(elevacao.gain),
      elevationLoss: Math.round(elevacao.loss),
      minAltitude: elevacao.min,
      maxAltitude: elevacao.max,
      calories: estimateCalories({
        sport: this.config.sport,
        weightKg: this.config.weightKg,
        movingSeconds: segundosEmMovimento,
        distanceMeters: distancia,
      }),
      splits: computeSplits(this.pontos),
      gpsQuality: gpsQualityFor(this.ultimaPrecisao),
      pointCount: this.pontos.length,
    }
  }

  /** Pontos aceitos, para desenhar o mapa e para gravar. */
  get trackPoints(): readonly TrackPoint[] {
    return this.pontos
  }

  get startedAt(): number | null {
    return this.inicioMs
  }

  /**
   * Retoma uma atividade que já existia — o app fechou no meio, e os pontos
   * estavam guardados no aparelho (item 45).
   */
  static restore(input: {
    sport: SportType
    points: TrackPoint[]
    startedAt: number
    pausedMs: number
    state?: ActivityState
    overrides?: Partial<TrackingConfig>
  }): ActivityTrackingEngine {
    const engine = new ActivityTrackingEngine(input.sport, input.overrides)
    engine.pontos.push(...input.points)
    engine.inicioMs = input.startedAt
    engine.pausadoMs = input.pausedMs
    engine.estado = input.state ?? 'PAUSED'
    engine.ultimoKmAvisado = computeSplits(input.points).length
    engine.ultimaPrecisao = input.points[input.points.length - 1]?.accuracy ?? null
    return engine
  }
}
