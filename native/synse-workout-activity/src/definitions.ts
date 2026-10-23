/**
 * O contrato do plugin, em TypeScript.
 *
 * Duplica de propósito o tipo de `src/features/active-workout/platform/types.ts`
 * — este pacote é publicável sozinho e não pode importar da aplicação. O teste
 * `tests/unit/active-workout/plugin-contract.test.ts` compara os dois, então
 * eles não divergem em silêncio.
 */
export type LiveWorkoutState = {
  exerciseName: string
  setNumber: number
  totalSets: number
  reps: number
  weight: number | null
  phase: 'SET' | 'REST' | 'REST_FINISHED'
  /** Epoch em milissegundos. Instante, nunca contagem. */
  restEndsAt: number | null
  progress: number
  planName?: string
}

export type RemoteAction = 'COMPLETE_SET' | 'SKIP_REST' | 'ADD_REST' | 'NEXT_SET'

export interface SynseWorkoutActivityPlugin {
  isSupported(): Promise<{ supported: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  start(options: LiveWorkoutState): Promise<void>
  update(options: LiveWorkoutState): Promise<void>
  restFinished(options: LiveWorkoutState): Promise<void>
  stop(): Promise<void>
  addListener(
    eventName: 'remoteAction',
    listenerFunc: (data: { action: RemoteAction }) => void,
  ): Promise<{ remove: () => void }>
}
