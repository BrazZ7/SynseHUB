/** Estado das ações de autoria de programa. Fora do arquivo `'use server'`. */
export type ProgramAdminState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  programId?: string
  fieldErrors?: Record<string, string[]>
}

export const programAdminInicial: ProgramAdminState = { status: 'idle' }
