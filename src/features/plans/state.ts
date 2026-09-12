/**
 * Estado das server actions de planos.
 * Vive fora do arquivo `'use server'`: um módulo de action só pode exportar
 * funções assíncronas.
 */
export type PlanActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  createdId?: string
}

export const initialPlanState: PlanActionState = { status: 'idle' }
