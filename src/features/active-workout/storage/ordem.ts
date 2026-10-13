/**
 * A ordem em que a fila sobe.
 *
 * O IndexedDB devolve as operações na ordem da chave, que é o `clientId` —
 * isto é, em ordem nenhuma. Antes do desfazer existir, bastava um peso por
 * tipo: abrir o treino antes de registrar série, registrar série antes de
 * encerrar. Série que chega a uma sessão que o servidor ainda não conhece é
 * série perdida.
 *
 * O desfazer quebrou essa conta, e o motivo é uma restrição do banco:
 * `unique (session_id, exercise_id, set_number)` (0026) — "duas série 2 no
 * mesmo exercício não é reenvio, é dado errado". Quem conclui a série 3, desfaz
 * e conclui de novo, tudo sem rede, tem três operações na fila para o mesmo
 * número de série. Na ordem errada, a correção chega antes do desfazer, o banco
 * recusa pela unicidade, a fila insiste oito vezes e desiste — e a tela diz
 * "uma série não entrou no seu histórico" por causa de uma série que a pessoa
 * fez e corrigiu.
 *
 * Então a ordem é esta:
 *
 *   1. a abertura do treino, sempre primeiro;
 *   2. as séries, na ordem em que foram concluídas;
 *   3. cada desfazer logo atrás da série que ele desfaz;
 *   4. o desfazer cuja série já subiu, depois de todas as séries;
 *   5. o encerramento, por último.
 *
 * O desfazer viaja atrás da própria série, e não por carimbo de tempo, porque
 * o relógio do aparelho não é monotônico: ele volta atrás com fuso, com NTP e
 * com a mão de quem ajusta a hora. A relação "este desfazer é daquela série" é
 * do dado, não do relógio.
 */

/** O mínimo que uma operação precisa ter para entrar na ordem. */
export type OperacaoOrdenavel = {
  kind: 'START' | 'SET' | 'UNDO' | 'FINISH'
  clientId: string
  /** Só em `SET`: o instante em que a série foi concluída. */
  completedAt?: number
  /** Só em `UNDO`: o `clientId` da série desfeita. */
  serieClientId?: string
}

export function ordenarFila<T extends OperacaoOrdenavel>(fila: T[]): T[] {
  const inicios = fila.filter((operacao) => operacao.kind === 'START')
  const fins = fila.filter((operacao) => operacao.kind === 'FINISH')
  const desfazeres = fila.filter((operacao) => operacao.kind === 'UNDO')
  const series = fila
    .filter((operacao) => operacao.kind === 'SET')
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))

  const meio: T[] = []
  for (const serie of series) {
    meio.push(serie)
    for (const desfazer of desfazeres) {
      if (desfazer.serieClientId === serie.clientId) meio.push(desfazer)
    }
  }

  /*
   * O desfazer sem série na fila é o caso comum, não a exceção: a série sobe
   * em segundos, e o desfazer acontece durante o descanso. Ele vai depois das
   * séries e antes do encerramento — e se a série nunca chegou ao servidor,
   * `desfazer_serie` devolve `false` sem fazer nada, que é inofensivo.
   */
  const orfaos = desfazeres.filter(
    (desfazer) => !series.some((serie) => serie.clientId === desfazer.serieClientId),
  )

  return [...inicios, ...meio, ...orfaos, ...fins]
}
