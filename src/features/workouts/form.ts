/**
 * Tradução do formulário de treino para o que o schema espera.
 *
 * O formulário tem uma lista de linhas, e o navegador manda lista como campos
 * repetidos: cinco `exerciseId`, cinco `sets`, cinco `reps`. Recompor as linhas
 * é juntar os vetores pelo índice — e é aqui que mora o erro clássico, quando
 * um dos vetores vem mais curto que o outro e as colunas se desalinham em
 * silêncio, atribuindo as séries de um exercício a outro.
 */
export type WorkoutFormEntries = {
  name?: string
  goal?: string
  splitLabel?: string
  exerciseId?: string[]
  sets?: string[]
  reps?: string[]
  restSeconds?: string[]
  suggestedLoad?: string[]
  notes?: string[]
}

export function parseWorkoutForm(entries: WorkoutFormEntries) {
  const ids = entries.exerciseId ?? []

  const exercises = ids
    .map((exerciseId, i) => ({
      exerciseId: exerciseId.trim(),
      sets: entries.sets?.[i] ?? '3',
      reps: (entries.reps?.[i] ?? '').trim(),
      restSeconds: entries.restSeconds?.[i] || '60',
      suggestedLoad: entries.suggestedLoad?.[i] || undefined,
      notes: (entries.notes?.[i] ?? '').trim(),
    }))
    /*
     * Linha em branco é a que a pessoa abriu e não usou — some sem reclamar.
     * Recusar o formulário inteiro por causa dela obrigaria a caçar qual das
     * oito linhas está vazia, quando a intenção era óbvia.
     */
    .filter((linha) => linha.exerciseId.length > 0)

  return {
    name: entries.name,
    goal: entries.goal ?? '',
    splitLabel: entries.splitLabel || 'A',
    exercises,
  }
}
