/** Estado das ações de conta. Fora de `actions.ts`, ver challenges/state.ts. */
export type AccountActionState = { error?: string; message?: string }

export const initialAccountState: AccountActionState = {}

/** Estado da tela de encerrar conta. */
export type CloseAccountState = { error?: string }

export const CLOSE_ACCOUNT_INITIAL: CloseAccountState = {}

/** Resultado de trocar ou remover a foto de perfil. */
export type AvatarResult = { status: 'success' } | { status: 'error'; message: string }

/**
 * O que a foto pode pesar depois do processamento no aparelho.
 *
 * O cliente reduz para 512px e converte em WebP antes de enviar, o que põe uma
 * foto de celular em dezenas de KB. Meio megabyte é folga generosa para isso —
 * e o balde recusa acima de 2 MB de qualquer jeito, porque o cliente pode
 * mentir sobre o que mandou.
 */
export const AVATAR_MAX_BYTES = 512 * 1024

export const AVATAR_TIPOS_ACEITOS = ['image/webp', 'image/jpeg', 'image/png'] as const

/** O lado do quadrado para onde a foto é reduzida antes de subir. */
export const AVATAR_LADO_PX = 512
