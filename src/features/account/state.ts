/** Estado das ações de conta. Fora de `actions.ts`, ver challenges/state.ts. */
export type AccountActionState = { error?: string; message?: string }

export const initialAccountState: AccountActionState = {}

/** Estado da tela de encerrar conta. */
export type CloseAccountState = { error?: string }

export const CLOSE_ACCOUNT_INITIAL: CloseAccountState = {}
