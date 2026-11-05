import { registerPlugin } from '@capacitor/core'

import type { SynseHealthPlugin } from './definitions'

/**
 * O plugin, registrado pelo nome que o Swift e o Kotlin anunciam.
 *
 * `registerPlugin` devolve um proxy mesmo quando não há implementação nativa —
 * é o que permite a aplicação web importar sem quebrar no navegador. Quem
 * decide usar ou dizer "aqui não dá" é
 * `src/features/synse-body/health/ponte.ts`, que confere a presença antes de
 * chamar.
 */
export const SynseHealth = registerPlugin<SynseHealthPlugin>('SynseHealth')

export * from './definitions'
