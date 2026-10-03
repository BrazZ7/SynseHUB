/**
 * O domínio do Treino Ativo, sem React dentro.
 *
 * A separação não é gosto por camadas: um dia a série é concluída pelo relógio
 * e o celular precisa iniciar o descanso sozinho. Se a regra morasse no
 * componente, o relógio teria de reimplementá-la — e duas implementações da
 * mesma regra divergem.
 *
 * Nada aqui lê o relógio do sistema por conta própria. Toda função recebe
 * `agora` como argumento, o que torna o tempo testável e evita o erro clássico
 * de contar segundos em JavaScript: o cronômetro é uma subtração entre
 * instantes gravados, não um número que alguém incrementa.
 */

export type WorkoutState =
  | 'NOT_STARTED'
  | 'ACTIVE_SET'
  | 'RESTING'
  | 'REST_FINISHED'
  | 'EXERCISE_COMPLETED'
  | 'WORKOUT_COMPLETED'
  | 'PAUSED'

/** O exercício como foi prescrito. Vem de `workout_exercises`. */
export type PlannedExercise = {
  exerciseId: string
  workoutExerciseId: string | null
  name: string
  sets: number
  /** Texto, como na prescrição: "10", "8-12", "até a falha". */
  reps: string
  restSeconds: number
  suggestedLoad: number | null
  notes: string | null
}

/** Uma série concluída. Espelha `workout_set_logs`. */
export type CompletedSet = {
  /** Gerado no aparelho antes de existir rede. Torna o reenvio inofensivo. */
  clientId: string
  exerciseId: string
  setNumber: number
  repsPlanned: number | null
  repsCompleted: number
  weight: number | null
  restSeconds: number | null
  startedAt: number
  completedAt: number
}

export type WorkoutSettings = {
  autoRest: boolean
  sound: boolean
  vibration: boolean
  autoAdvance: boolean
  keepScreenAwake: boolean
  defaultRestSeconds: number
}

export const DEFAULT_SETTINGS: WorkoutSettings = {
  autoRest: true,
  sound: true,
  vibration: true,
  autoAdvance: false,
  keepScreenAwake: true,
  defaultRestSeconds: 90,
}

/**
 * Tudo que o treino é, num objeto serializável.
 *
 * Serializável de propósito: é isto que vai para o IndexedDB a cada mudança, e
 * é disto que o treino volta quando o app é fechado no meio.
 */
export type WorkoutSession = {
  clientId: string
  /** Chega depois da primeira sincronização. Nulo enquanto o treino for só local. */
  serverId: string | null
  workoutPlanId: string | null
  planName: string
  state: WorkoutState
  exercises: PlannedExercise[]
  exerciseIndex: number
  /** A série em curso, a partir de 1. */
  setNumber: number
  /** Ajustados pelos botões antes de concluir a série. */
  currentReps: number
  currentWeight: number | null
  completedSets: CompletedSet[]
  startedAt: number
  /** Início da série atual. Vira `started_at` no registro. */
  setStartedAt: number
  restStartedAt: number | null
  restEndsAt: number | null
  /** Soma das pausas, em ms. Descontada da duração efetiva. */
  pausedMs: number
  pausedAt: number | null
  finishedAt: number | null
  settings: WorkoutSettings
}

export type WorkoutEvent =
  | { type: 'START'; agora: number }
  | { type: 'COMPLETE_SET'; agora: number; clientId: string }
  | { type: 'ADJUST_REPS'; delta: number }
  | { type: 'ADJUST_WEIGHT'; delta: number }
  | { type: 'SKIP_REST'; agora: number }
  | { type: 'ADD_REST'; segundos: number }
  | { type: 'REST_ELAPSED'; agora: number }
  | { type: 'NEXT_SET'; agora: number }
  | { type: 'NEXT_EXERCISE'; agora: number }
  | { type: 'PAUSE'; agora: number }
  | { type: 'RESUME'; agora: number }
  | { type: 'FINISH'; agora: number }
  | { type: 'SETTINGS'; settings: Partial<WorkoutSettings> }
