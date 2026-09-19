/** Estado das server actions de nutrição. Fora do arquivo `'use server'`. */
export type NutritionActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  planId?: string
}

export const initialNutritionState: NutritionActionState = { status: 'idle' }
