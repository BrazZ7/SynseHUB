import type { TrackPoint } from '@/features/synse-run/engine/types'

/**
 * Pace e velocidade instantâneos calculados sobre uma janela de tempo.
 *
 * Entre dois pontos consecutivos, o pace pula de 4:10 para 7:30 e volta, sem
 * que a pessoa tenha mudado nada — é ruído dividido por um intervalo curto. Um
 * número que oscila assim é pior que número nenhum: quem corre olhando para
 * ele acelera e desacelera atrás de uma miragem.
 *
 * A janela move junto com a corrida: soma a distância e o tempo dos últimos N
 * segundos e divide. Quanto maior a janela, mais estável e mais atrasado o
 * número; 20 segundos é o meio-termo que os relógios de corrida usam.
 */
export function windowedSpeed(
  pontos: TrackPoint[],
  janelaSegundos: number,
  agora?: number,
): number {
  if (pontos.length < 2) return 0

  const fim = pontos[pontos.length - 1]

  /*
   * A janela termina *agora*, não no último ponto recebido. Sem isso, quando
   * os pontos param de chegar — pessoa parada, sinal perdido — a velocidade
   * congela no último valor, e a tela segue anunciando 11 km/h para quem está
   * em pé no semáforo.
   */
  const referencia = agora ?? fim.timestamp
  const limite = referencia - janelaSegundos * 1000

  if (fim.timestamp < limite) return 0

  let distancia = 0
  let inicio = fim

  for (let i = pontos.length - 1; i > 0; i -= 1) {
    if (pontos[i - 1].timestamp < limite) break
    distancia += pontos[i].distanceFromPrevious
    inicio = pontos[i - 1]
  }

  const segundos = (referencia - inicio.timestamp) / 1000
  if (segundos <= 0) return 0

  return distancia / segundos
}

/** m/s → segundos por quilômetro. Zero não vira pace: viraria infinito. */
export function speedToPace(metrosPorSegundo: number): number | null {
  if (metrosPorSegundo <= 0.1) return null
  return 1000 / metrosPorSegundo
}

/**
 * Ganho e perda de elevação, com limiar.
 *
 * O GPS erra bem mais na vertical que na horizontal: parado, a altitude
 * oscila metros. Somar toda variação positiva transforma uma corrida plana em
 * trezentos metros de subida.
 *
 * Por isso a altitude só é atualizada quando se afasta o suficiente da última
 * referência aceita. Abaixo do limiar, a oscilação é descartada inteira, e não
 * acumulada aos poucos.
 */
export function accumulateElevation(
  altitudes: Array<number | null>,
  limiar: number,
): { gain: number; loss: number; min: number | null; max: number | null } {
  const validas = altitudes.filter((valor): valor is number => valor !== null)
  if (validas.length === 0) return { gain: 0, loss: 0, min: null, max: null }

  let gain = 0
  let loss = 0
  let referencia = validas[0]

  for (const altitude of validas) {
    const variacao = altitude - referencia
    if (Math.abs(variacao) < limiar) continue

    if (variacao > 0) gain += variacao
    else loss += -variacao

    referencia = altitude
  }

  return {
    gain,
    loss,
    min: Math.min(...validas),
    max: Math.max(...validas),
  }
}

/**
 * Posição média dos últimos pontos — um filtro passa-baixa sobre a rota.
 *
 * É o que derruba o ruído de quem está parado, e nenhuma regra por ponto
 * consegue derrubar. Parado, o GPS oscila em torno da posição real: os pontos
 * se cancelam na média, e a posição suavizada não sai do lugar. Correndo, a
 * média avança na mesma velocidade que a pessoa, com meia janela de atraso.
 *
 * Foi medido: sem isto, uma oscilação de 4 metros a cada segundo virava 8
 * metros de "corrida" a cada dois segundos, com a pessoa parada no semáforo.
 */
export function smoothedPosition(janela: Array<{ latitude: number; longitude: number }>): {
  latitude: number
  longitude: number
} {
  const total = janela.length
  return {
    latitude: janela.reduce((soma, p) => soma + p.latitude, 0) / total,
    longitude: janela.reduce((soma, p) => soma + p.longitude, 0) / total,
  }
}
