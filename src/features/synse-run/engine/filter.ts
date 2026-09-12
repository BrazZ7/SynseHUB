import { haversineDistance } from '@/features/synse-run/engine/geo'
import type {
  GpsQuality,
  RawPoint,
  RejectionReason,
  TrackingConfig,
} from '@/features/synse-run/engine/types'

/**
 * O filtro é a diferença entre um app de corrida e um somador de ruído.
 *
 * GPS de celular erra, e erra de formas que somam: parado num semáforo, a
 * posição oscila alguns metros a cada segundo e, sem filtro, isso vira
 * quilômetro. Num túnel ou entre prédios, a posição salta centenas de metros
 * de uma vez — e o app anuncia um pace de campeão mundial.
 *
 * Quatro regras, nesta ordem:
 *
 *   1. precisão ruim   → o ponto não é confiável o bastante para virar distância
 *   2. tempo não andou → dois pontos no mesmo instante não têm velocidade
 *   3. salto impossível→ rápido demais para o esporte: é o GPS, não a pessoa
 *   4. ruído de parado → deslocamento menor que o próprio erro do aparelho
 *
 * A quarta é a que mais importa no dia a dia, e a mais fácil de esquecer.
 */
/**
 * Sanidade do ponto cru, antes de qualquer suavização.
 *
 * Três recusas, e cada uma protege de um defeito diferente:
 *
 *   precisão ruim    → o aparelho avisa que não sabe onde está
 *   tempo parado     → dois pontos no mesmo instante não têm velocidade
 *   salto impossível → rápido demais para o esporte: é o GPS saindo do túnel
 *
 * O ruído de quem está parado **não** é tratado aqui. Ele não se distingue
 * ponto a ponto: parado, cada passo do GPS parece deslocamento legítimo, e é a
 * soma que mente. Quem cuida disso é a suavização de posição, no motor.
 */
export function validatePoint(
  ponto: RawPoint,
  ultimoCru: RawPoint | null,
  config: TrackingConfig,
): { ok: true } | { ok: false; reason: RejectionReason } {
  if (ponto.accuracy > config.maxAccuracy) return { ok: false, reason: 'PRECISAO_RUIM' }
  if (!ultimoCru) return { ok: true }

  const segundos = (ponto.timestamp - ultimoCru.timestamp) / 1000
  if (segundos <= 0) return { ok: false, reason: 'TEMPO_NAO_AVANCOU' }

  const distancia = haversineDistance(ultimoCru, ponto)
  if (distancia / segundos > config.maxSpeed) return { ok: false, reason: 'SALTO_IMPOSSIVEL' }

  return { ok: true }
}

/**
 * Deslocamento pequeno o bastante para ser o próprio erro do aparelho.
 *
 * Aplicado sobre a posição **já suavizada**: depois da média, o que sobra de
 * ruído é a amplitude dividida pela raiz do tamanho da janela, e três metros
 * cobrem folgado o caso comum. Em sinal ruim o limiar acompanha a precisão.
 */
export function isNoise(distancia: number, accuracy: number, config: TrackingConfig): boolean {
  return distancia < Math.max(config.minDisplacement, accuracy * 0.4)
}

/**
 * Qualidade do sinal a partir da precisão informada.
 *
 * É o número que o aparelho declara, não uma medição nossa — serve para avisar
 * a pessoa, não para decidir cálculo. Quem decide cálculo é o filtro acima.
 */
export function gpsQualityFor(accuracy: number | null): GpsQuality {
  if (accuracy === null) return 'AUSENTE'
  if (accuracy <= 10) return 'EXCELENTE'
  if (accuracy <= 25) return 'MEDIO'
  return 'FRACO'
}
