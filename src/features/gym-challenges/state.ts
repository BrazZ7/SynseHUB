/** Estado das server actions dos desafios. Fora do arquivo `'use server'`. */
export type GymChallengeActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

export const initialGymChallengeState: GymChallengeActionState = { status: 'idle' }
