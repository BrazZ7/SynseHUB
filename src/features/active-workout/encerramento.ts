import type { WorkoutSession } from '@/features/active-workout/engine/types'

/**
 * Se o servidor ainda não sabe que este treino terminou.
 *
 * ── O defeito que isto fecha ────────────────────────────────────────────────
 *
 * A última série do último exercício leva direto a WORKOUT_COMPLETED. O único
 * lugar da tela que chamava `encerrar('COMPLETED')` era o botão "Concluir
 * treino", dentro do painel de fim de exercício, no ramo "não há próximo" — e
 * esse ramo é inalcançável, porque EXERCISE_COMPLETED só existe quando há
 * próximo exercício (provado em `tests/unit/active-workout/engine.test.ts`).
 *
 * Resultado: `finish_workout_session` nunca era chamada no caminho normal. A
 * sessão ficava `IN_PROGRESS` no servidor até a regra das oito horas (0047) a
 * marcar como `ABANDONED`, e `listWorkoutSessions` — que filtra
 * `status = 'COMPLETED'` — não achava nada. A pessoa treinava uma hora e o
 * histórico dela ficava vazio, sem erro em lugar nenhum.
 *
 * ── Por que é uma função pura, e não um `if` no hook ────────────────────────
 *
 * Porque é a regra que não pode voltar a sumir. Testar o hook exigiria
 * renderizar React, que este projeto não faz em teste; testar isto é direto.
 *
 * Dois cuidados, e os dois têm consequência visível:
 *
 * - **Não enfileirar dois encerramentos.** `finish_workout_session` grava o
 *   status que recebe. Um segundo encerramento com `COMPLETED` em cima de um
 *   `ABANDONED` já enviado transformaria treino abandonado em concluído — e o
 *   caminho é real: "Encerrar treino" mostra o resumo, e o "Fechar" do resumo
 *   viria depois.
 * - **A fila conta.** Enquanto o encerramento está esperando rede, ele já foi
 *   decidido. Enfileirar outro só gastaria rede para dizer o mesmo.
 */
export function faltaEncerrarNoServidor(
  sessao: Pick<WorkoutSession, 'clientId'>,
  fila: { kind: string; sessionClientId?: string }[],
  jaEncerrado: boolean,
): boolean {
  if (jaEncerrado) return false
  return !fila.some(
    (operacao) =>
      operacao.kind === 'FINISH' && operacao.sessionClientId === sessao.clientId,
  )
}
