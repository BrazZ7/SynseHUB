/**
 * Estado devolvido pela ação de consentimento.
 *
 * Fica fora do arquivo com `'use server'` porque lá só podem morar funções
 * assíncronas exportadas — um objeto exportado ao lado delas derruba a ação em
 * tempo de execução, com build e lint passando. Já aconteceu neste projeto.
 */
export type ConsentActionState = { error?: string; message?: string }

export const CONSENT_INITIAL_STATE: ConsentActionState = {}
