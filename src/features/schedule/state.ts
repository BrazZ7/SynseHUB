/**
 * Estado das server actions da agenda.
 * Fora do arquivo `'use server'`: módulo de action só exporta função assíncrona.
 */
export type ScheduleActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  savedId?: string
}

export const initialScheduleState: ScheduleActionState = { status: 'idle' }
