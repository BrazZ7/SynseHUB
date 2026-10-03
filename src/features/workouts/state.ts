/**
 * Estado das server actions de treino.
 * Vive fora do arquivo `'use server'`: um módulo de action só pode exportar
 * funções assíncronas.
 */
export type WorkoutActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  createdId?: string
}

export const initialWorkoutState: WorkoutActionState = { status: 'idle' }
