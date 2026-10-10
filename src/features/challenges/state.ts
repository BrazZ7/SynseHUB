/**
 * Estado das ações de desafio.
 *
 * Fica fora de `actions.ts` porque um arquivo `'use server'` só pode exportar
 * funções async: exportar uma constante de lá derruba a ação em produção com
 * "A 'use server' file can only export async functions, found object" — e o
 * build passa, porque a falha só aparece quando alguém invoca a ação.
 *
 * O projeto já resolvia isso assim em `onboarding/state.ts` e
 * `students/state.ts`. Esta convenção existe por um motivo; eu a ignorei.
 */
export type ChallengeActionState = { error?: string; message?: string }

export const initialChallengeState: ChallengeActionState = {}
