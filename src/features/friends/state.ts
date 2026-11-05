/**
 * Constantes e tipos dos amigos.
 *
 * Fora de `actions.ts` porque arquivo `'use server'` só exporta função
 * assíncrona — `tests/unit/use-server-exports.test.ts` guarda a regra.
 */

export type FriendActionState = { error?: string; ok?: string }

/** O formato do Synse ID, gerado na 0001: `SYN-` e oito caracteres. */
export const SYNSE_ID_RE = /^SYN-[0-9A-HJKMNP-TV-Z]{8}$/

/**
 * A janela do ranking.
 *
 * Trinta dias, e não "o mês": ranking que zera todo dia 1º pune quem entrou no
 * dia 28, e no começo do mês a lista fica com todo mundo em zero — que é
 * exatamente quando a tela precisa ter o que mostrar.
 */
export const DIAS_DO_RANKING = 30
