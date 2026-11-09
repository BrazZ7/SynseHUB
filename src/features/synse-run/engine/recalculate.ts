import { estimateCalories } from '@/features/synse-run/engine/calories'
import { haversineDistance } from '@/features/synse-run/engine/geo'
import { computeSplits } from '@/features/synse-run/engine/splits'
import { accumulateElevation, speedToPace } from '@/features/synse-run/engine/smoothing'
import { DEFAULT_CONFIG, type SportType, type TrackPoint } from '@/features/synse-run/engine/types'

export type RoutePointInput = {
  latitude: number
  longitude: number
  altitude: number | null
  speed: number | null
  accuracy: number | null
  heading: number | null
  recordedAt: string
}

/**
 * Recalcula a atividade a partir da rota, no servidor.
 *
 * O aparelho manda os números já prontos, e eles servem para desenhar a tela
 * na hora. Para gravar, não servem: um payload é editável, e ranking com
 * número que a pessoa digita não é ranking — basta um `fetch` para "correr"
 * uma maratona sentado.
 *
 * Recalcular também resolve um caso honesto: uma versão antiga do app, com
 * filtro pior, mandaria números diferentes dos de hoje para a mesma rota. Como
 * a fonte é sempre a rota, o histórico inteiro fala a mesma língua.
 *
 * O que não dá para recalcular é o tempo em movimento: pausa é decisão de
 * quem correu, e não está nos pontos. Esse vem do aparelho, limitado pelo
 * tempo total, que os próprios carimbos da rota comprovam.
 */
export function recalculateFromRoute(input: {
  route: RoutePointInput[]
  sport: SportType
  weightKg?: number
  /** Tempo em movimento informado pelo aparelho, em segundos. */
  reportedMovingSeconds: number
}) {
  const config = DEFAULT_CONFIG[input.sport]
  const pontos: TrackPoint[] = []
  let total = 0

  for (const cru of input.route) {
    const ponto = {
      latitude: cru.latitude,
      longitude: cru.longitude,
      altitude: cru.altitude,
      accuracy: cru.accuracy ?? 0,
      speed: cru.speed,
      heading: cru.heading,
      timestamp: new Date(cru.recordedAt).getTime(),
    }

    const anterior = pontos[pontos.length - 1]
    const trecho = anterior ? haversineDistance(anterior, ponto) : 0

    /*
     * O mesmo teste de salto impossível do aparelho, refeito aqui.
     *
     * Sem ele, recalcular protegeria contra um número forjado e aceitaria uma
     * *rota* forjada — bastaria intercalar pontos distantes para "correr" o que
     * não se correu. E protege também o caso honesto: um pico de GPS de sessenta
     * metros num segundo entrava inteiro na distância e ficava gravado para
     * sempre como velocidade máxima.
     */
    if (anterior) {
      const segundos = (ponto.timestamp - anterior.timestamp) / 1000
      if (segundos <= 0 || trecho / segundos > config.maxSpeed) continue
    }

    total += trecho
    pontos.push({ ...ponto, distanceFromPrevious: trecho, totalDistance: total })
  }

  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]

  const elapsedSeconds =
    primeiro && ultimo ? Math.max(0, (ultimo.timestamp - primeiro.timestamp) / 1000) : 0

  // Movimento nunca passa do total: é o limite que os carimbos comprovam.
  const movingSeconds = Math.min(Math.max(0, input.reportedMovingSeconds), elapsedSeconds)

  const elevacao = accumulateElevation(
    pontos.map((ponto) => ponto.altitude),
    config.elevationThreshold,
  )

  const averageSpeed = movingSeconds > 0 ? total / movingSeconds : 0
  const splits = computeSplits(pontos)

  const bestPace = splits.reduce<number | null>(
    (melhor, parcial) =>
      melhor === null || parcial.paceSecondsPerKm < melhor ? parcial.paceSecondsPerKm : melhor,
    null,
  )

  return {
    points: pontos,
    distanceMeters: Math.round(total * 100) / 100,
    elapsedSeconds: Math.round(elapsedSeconds),
    movingSeconds: Math.round(movingSeconds),
    averageSpeed: Math.round(averageSpeed * 1000) / 1000,
    maxSpeed: Math.round(maxSpeedOf(pontos) * 1000) / 1000,
    averagePace: speedToPace(averageSpeed),
    bestPace,
    elevationGain: Math.round(elevacao.gain),
    elevationLoss: Math.round(elevacao.loss),
    minAltitude: elevacao.min,
    maxAltitude: elevacao.max,
    calories: estimateCalories({
      sport: input.sport,
      weightKg: input.weightKg ?? config.weightKg,
      movingSeconds,
      distanceMeters: total,
    }),
    splits: splits.map((parcial) => ({
      kilometer: parcial.kilometer,
      splitSeconds: Math.round(parcial.seconds * 100) / 100,
      paceSeconds: Math.round(parcial.paceSecondsPerKm * 100) / 100,
      elevationGain: parcial.elevationGain,
    })),
  }
}

/**
 * Velocidade máxima sobre janelas de dez segundos.
 *
 * Entre dois pontos, um erro de GPS de poucos metros vira um pico de 30 km/h
 * que fica gravado para sempre como "velocidade máxima". A janela dilui o
 * pico sem esconder uma arrancada de verdade, que dura mais que um segundo.
 */
function maxSpeedOf(pontos: TrackPoint[]): number {
  let maxima = 0

  for (let fim = 1; fim < pontos.length; fim += 1) {
    let distancia = 0
    let inicio = fim

    while (inicio > 0 && (pontos[fim].timestamp - pontos[inicio - 1].timestamp) / 1000 <= 10) {
      distancia += pontos[inicio].distanceFromPrevious
      inicio -= 1
    }

    const segundos = (pontos[fim].timestamp - pontos[inicio].timestamp) / 1000
    if (segundos >= 3) maxima = Math.max(maxima, distancia / segundos)
  }

  return maxima
}
