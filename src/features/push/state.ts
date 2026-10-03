/** Estado das server actions de push. Fora do arquivo `'use server'`. */
export type PushActionState = { ok?: string; error?: string }

export const INICIAL_PUSH: PushActionState = {}
