import type { RawPoint } from '@/features/synse-run/engine/types'

/** Raio médio da Terra em metros, o valor usado pela fórmula de Haversine. */
const RAIO_TERRA = 6_371_000

const rad = (graus: number) => (graus * Math.PI) / 180

/**
 * Distância entre dois pontos sobre a superfície da Terra, em metros.
 *
 * Haversine trata a Terra como esfera. O erro contra o elipsoide real é de
 * cerca de 0,3% no pior caso — três metros a cada quilômetro, menos do que a
 * incerteza do próprio GPS de celular. Vincenty seria mais exato e bem mais
 * caro para rodar a cada ponto, com ganho que some dentro do ruído.
 */
export function haversineDistance(a: RawPoint, b: RawPoint): number {
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const lat1 = rad(a.latitude)
  const lat2 = rad(b.latitude)

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * RAIO_TERRA * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Retângulo que contém todos os pontos. Serve para enquadrar o mapa. */
export function boundsOf(pontos: Array<{ latitude: number; longitude: number }>) {
  if (pontos.length === 0) return null

  return pontos.reduce(
    (caixa, ponto) => ({
      north: Math.max(caixa.north, ponto.latitude),
      south: Math.min(caixa.south, ponto.latitude),
      east: Math.max(caixa.east, ponto.longitude),
      west: Math.min(caixa.west, ponto.longitude),
    }),
    {
      north: pontos[0].latitude,
      south: pontos[0].latitude,
      east: pontos[0].longitude,
      west: pontos[0].longitude,
    },
  )
}
