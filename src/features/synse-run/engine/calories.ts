import type { SportType } from '@/features/synse-run/engine/types'

/**
 * Estimativa de caloria por MET.
 *
 * MET é quantas vezes o gasto em repouso uma atividade custa. A conta clássica
 * é `kcal = MET × peso(kg) × horas`, e o MET da corrida cresce com a
 * velocidade — correr a 12 km/h custa mais que o dobro de caminhar a 5.
 *
 * É estimativa, e o produto precisa dizer isso onde mostra o número: sem
 * frequência cardíaca, sem composição corporal e sem calibração, o erro
 * honesto fica na casa de 15 a 20%. Aparecer como se fosse medição é o tipo de
 * mentira pequena que faz alguém montar dieta em cima.
 */
export function estimateCalories(input: {
  sport: SportType
  weightKg: number
  movingSeconds: number
  distanceMeters: number
}): number {
  const horas = input.movingSeconds / 3600
  if (horas <= 0) return 0

  const kmPorHora = input.distanceMeters / 1000 / horas
  return Math.round(metFor(input.sport, kmPorHora) * input.weightKg * horas)
}

function metFor(sport: SportType, kmPorHora: number): number {
  if (sport === 'RIDE') {
    if (kmPorHora < 16) return 4
    if (kmPorHora < 20) return 6.8
    if (kmPorHora < 25) return 8
    return 10
  }

  if (sport === 'WALK' || kmPorHora < 7) {
    if (kmPorHora < 4) return 2.8
    if (kmPorHora < 5.5) return 3.5
    return 4.3
  }

  // Corrida: a tabela do Compendium of Physical Activities cresce quase
  // linearmente com a velocidade a partir de 8 km/h.
  if (kmPorHora < 8) return 8.3
  if (kmPorHora < 9.7) return 9.8
  if (kmPorHora < 11.3) return 11
  if (kmPorHora < 12.9) return 12.8
  if (kmPorHora < 14.5) return 14.5
  return 16
}
