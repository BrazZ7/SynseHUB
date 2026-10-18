/**
 * As duas lojas, num tipo só.
 *
 * Duplica `Loja` de `native/synse-plus-billing/src/definitions.ts` de
 * propósito: aquele pacote é publicável sozinho e não pode importar da
 * aplicação. O teste `tests/unit/plus/loja-contrato.test.ts` compara os dois.
 *
 * Minúsculas porque é o que `plus_provider` aceita desde a 0061 — maiúsculas
 * ali levantam exceção no banco.
 */
export type Loja = 'apple' | 'google'

/** O produto. Igual nas duas lojas e no plugin. */
export const PRODUTO_MENSAL = 'synse_plus_mensal'

/** O pacote do Android e o bundle id do iOS são o mesmo texto. */
export const APP_ID = 'br.com.synse.app'
