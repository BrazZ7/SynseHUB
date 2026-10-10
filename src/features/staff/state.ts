/**
 * Estado das server actions de equipe.
 * Vive fora do arquivo `'use server'`: um módulo de action só pode exportar
 * funções assíncronas.
 */
export type StaffActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  /** O link do convite, para copiar e mandar por onde a academia já fala. */
  link?: string
  fieldErrors?: Record<string, string[]>
}

export const initialStaffState: StaffActionState = { status: 'idle' }
