/** Resultado de salvar uma corrida. Fora de `actions.ts`: 'use server' só exporta função async. */
export type SaveActivityResult =
  { status: 'success'; activityId: string } | { status: 'error'; message: string }
