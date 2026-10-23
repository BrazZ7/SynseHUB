import { registerPlugin } from '@capacitor/core'

import type { SynsePlusBillingPlugin } from './definitions'

/**
 * O plugin, registrado pelo nome que o Swift e o Kotlin anunciam.
 *
 * `registerPlugin` devolve um proxy mesmo sem implementação nativa, para a
 * aplicação web importar sem quebrar no navegador. Quem confere a presença
 * antes de chamar é `src/features/plus/loja/ponte.ts` — no navegador a loja
 * nunca está disponível, e é isso que a tela espera.
 */
export const SynsePlusBilling = registerPlugin<SynsePlusBillingPlugin>('SynsePlusBilling')

export * from './definitions'
