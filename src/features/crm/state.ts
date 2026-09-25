/** Estado das server actions do CRM. Fora do arquivo `'use server'`. */
export type CrmActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  studentId?: string
}

export const initialCrmState: CrmActionState = { status: 'idle' }
