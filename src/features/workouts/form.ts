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

/**
 * ── A semana ─────────────────────────────────────────────────────────────────
 *
 * O formulário da semana tem listas dentro de listas: N dias, cada um com suas
 * linhas de exercício. O navegador não manda estrutura, manda campos repetidos
 * — e aqui o desalinhamento por índice, que na tela de um treino só desloca
 * séries entre exercícios, misturaria exercícios entre **dias**.
 *
 * Por isso cada linha carrega um campo oculto com o índice do dia a que
 * pertence. Agrupar por esse carimbo é o que garante que o que o professor
 * escreveu na terça não apareça na quinta, mesmo que uma linha venha faltando.
 */
export type WeekFormEntries = {
  goal?: string
  /** Um por dia. */
  dayLabel?: string[]
  dayName?: string[]
  /** Um por linha de exercício: a que dia ela pertence. */
  rowDay?: string[]
  exerciseId?: string[]
  sets?: string[]
  reps?: string[]
  restSeconds?: string[]
  suggestedLoad?: string[]
  notes?: string[]
}

export function parseWeekForm(entries: WeekFormEntries) {
  const rotulos = entries.dayLabel ?? []
  const nomes = entries.dayName ?? []
  const carimbos = entries.rowDay ?? []
  const ids = entries.exerciseId ?? []

  const days = rotulos.map((splitLabel, dia) => {
    const exercises = ids
      .map((exerciseId, linha) => ({
        dia: Number(carimbos[linha]),
        exerciseId: exerciseId.trim(),
        sets: entries.sets?.[linha] ?? '3',
        reps: (entries.reps?.[linha] ?? '').trim(),
        restSeconds: entries.restSeconds?.[linha] || '60',
        suggestedLoad: entries.suggestedLoad?.[linha] || undefined,
        notes: (entries.notes?.[linha] ?? '').trim(),
      }))
      .filter((linha) => linha.dia === dia && linha.exerciseId.length > 0)
      .map(({ dia: _dia, ...resto }) => resto)

    return {
      splitLabel: splitLabel.trim() || String.fromCharCode(65 + dia),
      name: (nomes[dia] ?? '').trim(),
      exercises,
    }
  })

  return {
    goal: entries.goal ?? '',
    /*
     * Dia sem exercício nenhum é o que a pessoa abriu e não usou — sai da
     * conta, como a linha em branco sai do treino avulso. Recusar a semana
     * inteira por causa de um dia vazio obrigaria a caçar qual é.
     */
    days: days.filter((dia) => dia.exercises.length > 0),
  }
}
