/**
 * ── A regra do ganho de carga, fora do data source ──────────────────────────
 *
 * A 0055 calcula isto no banco, que é onde ele precisa ser calculado para a
 * produção. Esta função é a **mesma regra** para a demonstração — e mora aqui,
 * pura, porque é assim que ela pode ser exercitada caso a caso sem subir
 * Postgres nem semear aluno.
 *
 * Foi o que faltou na primeira versão: a regra vivia dentro do
 * `DemoDataSource`, e os testes só alcançavam os alunos que a semente produz.
 * Todos eles têm vários dias do mesmo exercício, então a mutação que aceitava
 * **um** dia só passou sem quebrar nada — o caso do aluno novo, que é
 * justamente o que a tela precisa distinguir, não tinha como ser montado.
 *
 * As três escolhas, e o porquê de cada uma, estão na 0055. Em resumo:
 * mais treinado conta **dias**; a carga do dia é a **máxima** do dia; e menos
 * de dois dias não devolve nada, porque zero diria "você não evoluiu" para
 * quem acabou de começar.
 */

/** Um registro de carga, reduzido ao que a regra usa. */
export type RegistroDeCarga = {
  exerciseId: string
  /** ISO. Só a data conta — a hora não distingue um dia de treino. */
  performedAt: string
  load: number
}

export type GanhoDeCarga = {
  exerciseId: string
  primeira: number
  ultima: number
  dias: number
}

/**
 * O ganho no exercício mais treinado, ou `null` quando não há dois dias dele.
 *
 * Empate no número de dias é decidido pelo id, e não pela ordem de chegada:
 * sem isso a tela trocaria de exercício entre duas aberturas sem nada ter
 * mudado no treino da pessoa.
 */
export function ganhoMaisTreinado(registros: readonly RegistroDeCarga[]): GanhoDeCarga | null {
  // exercício → dia → carga máxima daquele dia
  const porExercicio = new Map<string, Map<string, number>>()

  for (const registro of registros) {
    if (!Number.isFinite(registro.load)) continue
    const dia = registro.performedAt.slice(0, 10)
    const dias = porExercicio.get(registro.exerciseId) ?? new Map<string, number>()
    const anterior = dias.get(dia)
    dias.set(dia, anterior == null ? registro.load : Math.max(anterior, registro.load))
    porExercicio.set(registro.exerciseId, dias)
  }

  const maisTreinado = [...porExercicio.entries()]
    .filter(([, dias]) => dias.size >= 2)
    .sort(([idA, a], [idB, b]) => b.size - a.size || idA.localeCompare(idB))[0]

  if (!maisTreinado) return null

  const [exerciseId, dias] = maisTreinado
  const ordenados = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b))

  return {
    exerciseId,
    primeira: ordenados[0][1],
    ultima: ordenados[ordenados.length - 1][1],
    dias: dias.size,
  }
}
