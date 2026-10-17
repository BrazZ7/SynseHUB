/**
 * Estado das server actions de alunos.
 * Vive fora do arquivo `'use server'`: um módulo de action só pode exportar
 * funções assíncronas.
 */
export type ActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  createdId?: string
}

export const initialActionState: ActionState = { status: 'idle' }
