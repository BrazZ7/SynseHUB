/**
 * Tipos do motor de rastreamento.
 *
 * Tudo aqui é SI: metros, metros por segundo, segundos. Conversão para
 * quilômetro, km/h e pace acontece só na borda que desenha a tela.
 *
 * A razão é chata e importante: pace é minuto por quilômetro, velocidade é
 * quilômetro por hora, distância é metro, e altitude é metro. Misturar unidade
 * dentro do cálculo é a forma mais fácil de errar por 3,6 e só descobrir
 * quando alguém correr de verdade.
 */

export type SportType = 'RUN' | 'WALK' | 'RIDE'

/** Ponto cru, como o navegador entrega. */
export type RawPoint = {
  latitude: number
  longitude: number
  /** Metros acima do nível do mar. Ausente em muitos aparelhos. */
  altitude: number | null
  /** Raio de confiança horizontal, em metros. Quanto menor, melhor. */
  accuracy: number
  /** Velocidade instantânea do GPS, em m/s. Nem sempre existe. */
  speed: number | null
  /** Direção em graus. Só para desenhar, nunca para calcular distância. */
  heading: number | null
  /** Epoch em milissegundos. */
  timestamp: number
}

/** Ponto aceito pelo filtro, já com o que foi derivado dele. */
export type TrackPoint = RawPoint & {
  /** Metros percorridos desde o ponto aceito anterior. */
  distanceFromPrevious: number
  /** Metros acumulados até aqui. */
  totalDistance: number
}

export type RejectionReason =
  'PRECISAO_RUIM' | 'SALTO_IMPOSSIVEL' | 'TEMPO_NAO_AVANCOU' | 'RUIDO_PARADO'

export type PointOutcome =
  { accepted: true; point: TrackPoint } | { accepted: false; reason: RejectionReason }

export type ActivityState =
  | 'IDLE'
  | 'GPS_SEARCHING'
  | 'READY'
  | 'COUNTDOWN'
  | 'RUNNING'
  | 'PAUSED'
  | 'AUTO_PAUSED'
  | 'FINISHING'
  | 'FINISHED'
  | 'ERROR'

export type Split = {
  /** 1 para o primeiro quilômetro completo, 2 para o segundo… */
  kilometer: number
  /** Segundos gastos neste quilômetro. */
  seconds: number
  /** Segundos por quilômetro — aqui é igual a `seconds`, mantido por clareza. */
  paceSecondsPerKm: number
  elevationGain: number
}

/** Retrato do que a tela mostra. Recalculado a cada ponto aceito. */
export type ActivitySnapshot = {
  state: ActivityState
  /** Metros. */
  distance: number
  /** Segundos desde o início, incluindo pausas. */
  elapsedSeconds: number
  /** Segundos descontando pausa manual e automática. */
  movingSeconds: number
  /** m/s suavizado. */
  currentSpeed: number
  averageSpeed: number
  maxSpeed: number
  /** Segundos por quilômetro. `null` enquanto não há distância suficiente. */
  currentPace: number | null
  averagePace: number | null
  bestPace: number | null
  altitude: number | null
  elevationGain: number
  elevationLoss: number
  minAltitude: number | null
  maxAltitude: number | null
  calories: number
  splits: Split[]
  /** Qualidade do sinal, derivada da precisão dos últimos pontos. */
  gpsQuality: GpsQuality
  pointCount: number
}

export type GpsQuality = 'AUSENTE' | 'FRACO' | 'MEDIO' | 'EXCELENTE'

/**
 * Limites do filtro e das heurísticas.
 *
 * Ficam num objeto, e não espalhados como número mágico, porque cada esporte
 * quer valores diferentes: 43 km/h é salto impossível correndo e rotina
 * pedalando.
 */
export type TrackingConfig = {
  sport: SportType
  /** Acima disto o ponto é descartado. Metros. */
  maxAccuracy: number
  /** Acima disto o deslocamento é considerado teletransporte. m/s. */
  maxSpeed: number
  /** Abaixo disto o deslocamento é ruído de GPS parado. Metros. */
  minDisplacement: number
  /** Janela do pace e da velocidade instantâneos. Segundos. */
  smoothingWindowSeconds: number
  /** Quantos pontos entram na média que suaviza a posição. */
  positionWindow: number
  /** Buraco no tempo que reinicia a média de posição. Segundos. */
  gapResetSeconds: number
  /** Variação mínima para contar como subida ou descida. Metros. */
  elevationThreshold: number
  /** Abaixo desta velocidade a pessoa é considerada parada. m/s. */
  autoPauseSpeed: number
  /** Segundos parado até pausar sozinho. */
  autoPauseAfterSeconds: number
  /** Velocidade que retoma a atividade. m/s. */
  autoResumeSpeed: number
  /** Peso da pessoa, para estimar caloria. Quilos. */
  weightKg: number
}

export const DEFAULT_CONFIG: Record<SportType, TrackingConfig> = {
  RUN: {
    sport: 'RUN',
    gapResetSeconds: 5,
    positionWindow: 5,
    maxAccuracy: 25,
    // 12 m/s são 43 km/h: acima disso ninguém está correndo, é o GPS pulando.
    maxSpeed: 12,
    minDisplacement: 3,
    smoothingWindowSeconds: 20,
    elevationThreshold: 3,
    // 0,8 km/h em m/s. Abaixo disso é oscilação de quem está parado.
    autoPauseSpeed: 0.22,
    autoPauseAfterSeconds: 8,
    autoResumeSpeed: 0.55,
    weightKg: 70,
  },
  WALK: {
    sport: 'WALK',
    gapResetSeconds: 5,
    positionWindow: 5,
    maxAccuracy: 25,
    maxSpeed: 5,
    minDisplacement: 3,
    smoothingWindowSeconds: 25,
    elevationThreshold: 3,
    autoPauseSpeed: 0.15,
    autoPauseAfterSeconds: 10,
    autoResumeSpeed: 0.4,
    weightKg: 70,
  },
  RIDE: {
    sport: 'RIDE',
    gapResetSeconds: 5,
    positionWindow: 3,
    maxAccuracy: 30,
    // 90 km/h: descida de bicicleta chega perto, GPS pulando passa longe.
    maxSpeed: 25,
    minDisplacement: 5,
    smoothingWindowSeconds: 15,
    elevationThreshold: 4,
    autoPauseSpeed: 0.5,
    autoPauseAfterSeconds: 8,
    autoResumeSpeed: 1.2,
    weightKg: 70,
  },
}
