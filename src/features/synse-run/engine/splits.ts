import type { Split, TrackPoint } from '@/features/synse-run/engine/types'

const UM_KM = 1000

/**
 * Parciais por quilômetro.
 *
 * O quilômetro quase nunca cai exatamente em cima de um ponto de GPS: o ponto
 * anterior marca 987 m e o seguinte marca 1.014 m. Fechar a parcial no ponto
 * seguinte empurra o erro para a frente e faz a última parcial ficar sempre
 * mais curta.
 *
 * Aqui o instante da marca é interpolado entre os dois pontos, proporcional à
 * distância que faltava. É o mesmo que o relógio de corrida faz, e é o que faz
 * a soma das parciais bater com o tempo total.
 */
export function computeSplits(pontos: TrackPoint[]): Split[] {
  if (pontos.length < 2) return []

  const parciais: Split[] = []
  let alvo = UM_KM
  let inicioDaParcial = pontos[0].timestamp
  let altitudeInicial = pontos[0].altitude
  let ganhoNaParcial = 0

  for (let i = 1; i < pontos.length; i += 1) {
    const anterior = pontos[i - 1]
    const atual = pontos[i]

    if (atual.altitude !== null && altitudeInicial !== null) {
      const variacao = atual.altitude - (anterior.altitude ?? altitudeInicial)
      if (variacao > 0) ganhoNaParcial += variacao
    }

    while (atual.totalDistance >= alvo && anterior.totalDistance < alvo) {
      const trecho = atual.totalDistance - anterior.totalDistance
      const fracao = trecho > 0 ? (alvo - anterior.totalDistance) / trecho : 0
      const instante = anterior.timestamp + (atual.timestamp - anterior.timestamp) * fracao

      const segundos = (instante - inicioDaParcial) / 1000

      parciais.push({
        kilometer: alvo / UM_KM,
        seconds: segundos,
        paceSecondsPerKm: segundos,
        elevationGain: Math.round(ganhoNaParcial),
      })

      inicioDaParcial = instante
      ganhoNaParcial = 0
      altitudeInicial = atual.altitude
      alvo += UM_KM
    }
  }

  return parciais
}
