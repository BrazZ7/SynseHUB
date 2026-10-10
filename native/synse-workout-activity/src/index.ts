import { registerPlugin } from '@capacitor/core'

import type { SynseWorkoutActivityPlugin } from './definitions'

/**
 * O plugin, registrado pelo nome que o Swift e o Kotlin anunciam.
 *
 * `registerPlugin` devolve um proxy mesmo quando não há implementação nativa —
 * é o que permite a aplicação web importar sem quebrar no navegador. Quem
 * decide usar ou cair no adaptador web é
 * `src/features/active-workout/platform/native-bridge.ts`, que confere a
 * presença antes de chamar.
 */
export const SynseWorkoutActivity = registerPlugin<SynseWorkoutActivityPlugin>(
  'SynseWorkoutActivity',
)

export * from './definitions'
