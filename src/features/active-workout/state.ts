/** Estado das server actions do Treino Ativo. Fora do arquivo `'use server'`. */
export type ActiveWorkoutActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  sessionId?: string
}

export const initialActiveWorkoutState: ActiveWorkoutActionState = { status: 'idle' }
