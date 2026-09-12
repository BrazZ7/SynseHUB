/** Estado das ações de conta. Fora de `actions.ts`, ver challenges/state.ts. */
export type AccountActionState = { error?: string; message?: string }

export const initialAccountState: AccountActionState = {}
