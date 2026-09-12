import type { TrackingConfig } from '@/features/synse-run/engine/types'

export type AutoPauseDecision = 'MANTER' | 'PAUSAR' | 'RETOMAR'

/**
 * Pausa automática, com histerese.
 *
 * Um limiar só — pausa abaixo de X, retoma acima de X — faz o app piscar entre
 * pausado e rodando a cada oscilação do GPS em torno do valor. Por isso são
 * dois limiares: pausa abaixo de um, e só retoma acima de outro, mais alto.
 *
 * A pausa também espera alguns segundos parada antes de valer. Semáforo é
 * pausa; um passo mais curto no meio da passada não é.
 */
export function decideAutoPause(input: {
  pausadoAutomaticamente: boolean
  velocidade: number
  /** Há quantos segundos a velocidade está abaixo do limiar de parada. */
  segundosParado: number
  config: TrackingConfig
}): AutoPauseDecision {
  const { pausadoAutomaticamente, velocidade, segundosParado, config } = input

  if (pausadoAutomaticamente) {
    return velocidade >= config.autoResumeSpeed ? 'RETOMAR' : 'MANTER'
  }

  const parado = velocidade < config.autoPauseSpeed
  return parado && segundosParado >= config.autoPauseAfterSeconds ? 'PAUSAR' : 'MANTER'
}
