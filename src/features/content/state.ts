/** Estado das server actions de conteúdo. Fora do arquivo `'use server'`. */
export type ContentActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
  contentId?: string
}

export const initialContentState: ContentActionState = { status: 'idle' }
