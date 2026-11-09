/** Estado das ações de programa. Fora do arquivo `'use server'`, por regra. */
export type ProgramaState = {
  status: 'idle' | 'error'
  message?: string
}

export const programaInicial: ProgramaState = { status: 'idle' }
