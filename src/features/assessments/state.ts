/**
 * Estado das server actions de avaliação.
 * Vive fora do arquivo `'use server'`: um módulo de action só pode exportar
 * funções assíncronas.
 */
export type AssessmentActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  savedId?: string
}

export const initialAssessmentState: AssessmentActionState = { status: 'idle' }
