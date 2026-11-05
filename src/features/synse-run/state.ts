/** Resultado de salvar uma corrida. Fora de `actions.ts`: 'use server' só exporta função async. */
export type SaveActivityResult =
  { status: 'success'; activityId: string } | { status: 'error'; message: string }

/**
 * Resultado das duas escritas de privacidade.
 *
 * As duas devolviam `void` e engoliam a exceção num `logger.error`. Para
 * "salvar rascunho" seria defensável; para privacidade, não: a tela dizia que
 * escondeu, e a corrida continuava visível no ranking. Falha silenciosa num
 * controle de privacidade não é degradação graciosa — é mentira.
 */
export type ActivityPrivacyResult = { status: 'success' } | { status: 'error'; message: string }
