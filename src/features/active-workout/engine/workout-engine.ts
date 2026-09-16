import {
  DEFAULT_SETTINGS,
  type CompletedSet,
  type PlannedExercise,
  type WorkoutEvent,
  type WorkoutSession,
  type WorkoutSettings,
} from '@/features/active-workout/engine/types'

/**
 * A máquina de estados do treino.
 *
 * `reduzir(sessao, evento)` devolve uma sessão nova; nunca muda a que recebeu.
 * Imutável porque é o que permite testar cada transição isolada e porque o
 * React confia em identidade para saber o que redesenhar.
 *
 * Duas decisões merecem explicação:
 *
 * **O tempo entra como argumento.** Nenhuma função aqui chama `Date.now()`.
 * Quem chama passa `agora`, e o teste passa o instante que quiser. Sem isso,
 * testar "o descanso acabou enquanto o app estava em segundo plano" exigiria
 * esperar noventa segundos de verdade.
 *
 * **Descanso é um par de instantes, não uma contagem.** `restEndsAt` é gravado
 * uma vez, e a tela calcula `restEndsAt - agora` quando desenha. Um contador
 * que decrementa a cada segundo erra sempre que o celular bloqueia, porque o
 * navegador estrangula o `setInterval` em segundo plano — e o erro se acumula.
 */

/** Reps prescritas viram número para os botões +/−. "8-12" começa em 8. */
export function repsIniciais(reps: string): number {
  const primeiro = /\d+/.exec(reps ?? '')
  return primeiro ? Number(primeiro[0]) : 10
}

export function criarSessao(input: {
  clientId: string
  workoutPlanId: string | null
  planName: string
  exercises: PlannedExercise[]
  agora: number
  settings?: Partial<WorkoutSettings>
}): WorkoutSession {
  const primeiro = input.exercises[0]
  return {
    clientId: input.clientId,
    serverId: null,
    workoutPlanId: input.workoutPlanId,
    planName: input.planName,
    state: 'NOT_STARTED',
    exercises: input.exercises,
    exerciseIndex: 0,
    setNumber: 1,
    currentReps: primeiro ? repsIniciais(primeiro.reps) : 10,
    currentWeight: primeiro?.suggestedLoad ?? null,
    completedSets: [],
    startedAt: input.agora,
    setStartedAt: input.agora,
    restStartedAt: null,
    restEndsAt: null,
    pausedMs: 0,
    pausedAt: null,
    finishedAt: null,
    settings: { ...DEFAULT_SETTINGS, ...input.settings },
  }
}

export const exercicioAtual = (s: WorkoutSession): PlannedExercise | undefined =>
  s.exercises[s.exerciseIndex]

/** O descanso deste exercício, com a preferência do aluno como piso. */
export function descansoDoExercicio(s: WorkoutSession): number {
  return exercicioAtual(s)?.restSeconds ?? s.settings.defaultRestSeconds
}

/** Quantas séries deste exercício já entraram. */
export function seriesFeitas(s: WorkoutSession, exerciseId: string): number {
  return s.completedSets.filter((serie) => serie.exerciseId === exerciseId).length
}

export function ehUltimaSerie(s: WorkoutSession): boolean {
  const exercicio = exercicioAtual(s)
  return exercicio ? s.setNumber >= exercicio.sets : true
}

export function ehUltimoExercicio(s: WorkoutSession): boolean {
  return s.exerciseIndex >= s.exercises.length - 1
}

/** Segundos que faltam de descanso. Nunca negativo. */
export function restanteDoDescanso(s: WorkoutSession, agora: number): number {
  if (!s.restEndsAt) return 0
  return Math.max(Math.ceil((s.restEndsAt - agora) / 1000), 0)
}

/**
 * Progresso do treino, de 0 a 1, por séries.
 *
 * Por séries e não por exercícios porque é o que a pessoa sente: parar no meio
 * do terceiro de quatro exercícios não é 50%, é o que as séries disserem.
 */
export function progresso(s: WorkoutSession): number {
  const previstas = s.exercises.reduce((soma, e) => soma + e.sets, 0)
  if (previstas === 0) return 0
  return Math.min(s.completedSets.length / previstas, 1)
}

/** Duração efetiva em segundos, já sem as pausas. */
export function duracaoEfetiva(s: WorkoutSession, agora: number): number {
  const fim = s.finishedAt ?? agora
  const pausadoAgora = s.pausedAt ? agora - s.pausedAt : 0
  return Math.max(Math.round((fim - s.startedAt - s.pausedMs - pausadoAgora) / 1000), 0)
}

/** O resumo do fim do treino. */
export function resumo(s: WorkoutSession, agora: number) {
  const volume = s.completedSets.reduce(
    (soma, serie) => soma + (serie.weight ?? 0) * serie.repsCompleted,
    0,
  )
  const descansos = s.completedSets
    .map((serie) => serie.restSeconds)
    .filter((v): v is number => typeof v === 'number')

  return {
    duracaoSegundos: duracaoEfetiva(s, agora),
    volumeKg: Math.round(volume),
    exercicios: new Set(s.completedSets.map((serie) => serie.exerciseId)).size,
    series: s.completedSets.length,
    repeticoes: s.completedSets.reduce((soma, serie) => soma + serie.repsCompleted, 0),
    descansoMedioSegundos: descansos.length
      ? Math.round(descansos.reduce((a, b) => a + b, 0) / descansos.length)
      : null,
  }
}

/** Posiciona a sessão no começo de um exercício. */
function entrarNoExercicio(s: WorkoutSession, indice: number, agora: number): WorkoutSession {
  const exercicio = s.exercises[indice]
  return {
    ...s,
    state: 'ACTIVE_SET',
    exerciseIndex: indice,
    setNumber: 1,
    currentReps: exercicio ? repsIniciais(exercicio.reps) : s.currentReps,
    /*
     * A carga sugerida do próximo exercício, e não a do anterior: herdar 70 kg
     * do supino para a rosca direta é o tipo de valor que a pessoa aceita sem
     * olhar e só percebe depois.
     */
    currentWeight: exercicio?.suggestedLoad ?? null,
    setStartedAt: agora,
    restStartedAt: null,
    restEndsAt: null,
  }
}

export function reduzir(s: WorkoutSession, evento: WorkoutEvent): WorkoutSession {
  switch (evento.type) {
    case 'START':
      if (s.state !== 'NOT_STARTED') return s
      return { ...s, state: 'ACTIVE_SET', startedAt: evento.agora, setStartedAt: evento.agora }

    case 'ADJUST_REPS':
      // Zero repetição é uma série que não aconteceu; o piso é 1.
      return { ...s, currentReps: Math.max(s.currentReps + evento.delta, 1) }

    case 'ADJUST_WEIGHT': {
      const base = s.currentWeight ?? 0
      // Peso corporal existe: o piso é zero, não 1.
      return { ...s, currentWeight: Math.max(Number((base + evento.delta).toFixed(2)), 0) }
    }

    case 'COMPLETE_SET': {
      if (s.state !== 'ACTIVE_SET') return s
      const exercicio = exercicioAtual(s)
      if (!exercicio) return s

      /*
       * Idempotência também aqui, e não só no banco. O toque duplo chega com o
       * mesmo `clientId` porque quem chama o gera uma vez por série; a segunda
       * passagem encontra a série já na lista e devolve a sessão intacta. Sem
       * isto, o estado local mostraria "série 3/4" com duas séries 2 dentro,
       * mesmo com o banco recusando a segunda.
       */
      if (s.completedSets.some((serie) => serie.clientId === evento.clientId)) return s

      const serie: CompletedSet = {
        clientId: evento.clientId,
        exerciseId: exercicio.exerciseId,
        setNumber: s.setNumber,
        repsPlanned: repsIniciais(exercicio.reps),
        repsCompleted: s.currentReps,
        weight: s.currentWeight,
        restSeconds: exercicio.restSeconds,
        startedAt: s.setStartedAt,
        completedAt: evento.agora,
      }
      const completedSets = [...s.completedSets, serie]
      const ultimaSerie = s.setNumber >= exercicio.sets

      if (ultimaSerie) {
        const ultimo = ehUltimoExercicio(s)
        return {
          ...s,
          completedSets,
          state: ultimo ? 'WORKOUT_COMPLETED' : 'EXERCISE_COMPLETED',
          finishedAt: ultimo ? evento.agora : null,
          restStartedAt: null,
          restEndsAt: null,
        }
      }

      if (!s.settings.autoRest) {
        // Sem descanso automático a próxima série começa na hora.
        return {
          ...s,
          completedSets,
          state: 'ACTIVE_SET',
          setNumber: s.setNumber + 1,
          setStartedAt: evento.agora,
        }
      }

      return {
        ...s,
        completedSets,
        state: 'RESTING',
        restStartedAt: evento.agora,
        restEndsAt: evento.agora + exercicio.restSeconds * 1000,
      }
    }

    case 'ADD_REST': {
      if (s.state !== 'RESTING' || !s.restEndsAt) return s
      /*
       * O piso é o instante em que o descanso começou: tirar 30 s de um
       * descanso de 20 s não pode produzir um fim no passado, que a tela leria
       * como descanso concluído antes de existir.
       */
      const novo = Math.max(s.restEndsAt + evento.segundos * 1000, s.restStartedAt ?? 0)
      return { ...s, restEndsAt: novo }
    }

    case 'SKIP_REST':
    case 'REST_ELAPSED': {
      if (s.state !== 'RESTING') return s
      if (evento.type === 'REST_ELAPSED' && s.restEndsAt && evento.agora < s.restEndsAt) return s

      const proxima = { ...s, state: 'REST_FINISHED' as const, restEndsAt: evento.agora }
      // Avanço automático pula a confirmação: a próxima série já começa.
      return s.settings.autoAdvance ? reduzir(proxima, { type: 'NEXT_SET', agora: evento.agora }) : proxima
    }

    case 'NEXT_SET': {
      if (s.state !== 'REST_FINISHED' && s.state !== 'RESTING') return s
      return {
        ...s,
        state: 'ACTIVE_SET',
        setNumber: s.setNumber + 1,
        setStartedAt: evento.agora,
        restStartedAt: null,
        restEndsAt: null,
      }
    }

    case 'NEXT_EXERCISE': {
      if (s.state !== 'EXERCISE_COMPLETED') return s
      if (ehUltimoExercicio(s)) {
        return { ...s, state: 'WORKOUT_COMPLETED', finishedAt: evento.agora }
      }
      return entrarNoExercicio(s, s.exerciseIndex + 1, evento.agora)
    }

    case 'PAUSE': {
      if (s.state === 'WORKOUT_COMPLETED' || s.state === 'PAUSED') return s
      return { ...s, state: 'PAUSED', pausedAt: evento.agora }
    }

    case 'RESUME': {
      if (s.state !== 'PAUSED' || !s.pausedAt) return s
      const parado = evento.agora - s.pausedAt
      return {
        ...s,
        state: 'ACTIVE_SET',
        pausedMs: s.pausedMs + parado,
        pausedAt: null,
        /*
         * O descanso também esperou. Empurrar o fim pelo tempo parado evita que
         * quem pausou dois minutos volte para um descanso já vencido.
         */
        restEndsAt: s.restEndsAt ? s.restEndsAt + parado : null,
        setStartedAt: s.setStartedAt + parado,
      }
    }

    case 'FINISH':
      if (s.state === 'WORKOUT_COMPLETED') return s
      return { ...s, state: 'WORKOUT_COMPLETED', finishedAt: evento.agora }

    case 'SETTINGS':
      return { ...s, settings: { ...s.settings, ...evento.settings } }

    default:
      return s
  }
}

/**
 * Recoloca a sessão no estado certo depois de um tempo sem ninguém olhando.
 *
 * O app fechou durante o descanso e voltou dez minutos depois: reiniciar o
 * cronômetro seria mentir, e deixá-lo em RESTING mostraria um contador zerado
 * sem avisar que a série está pronta. Como o estado veio de um instante
 * gravado, a conta é a mesma de sempre — só que feita uma vez, na volta.
 */
export function reidratar(s: WorkoutSession, agora: number): WorkoutSession {
  if (s.state === 'RESTING' && s.restEndsAt && agora >= s.restEndsAt) {
    return reduzir(s, { type: 'REST_ELAPSED', agora })
  }
  return s
}
