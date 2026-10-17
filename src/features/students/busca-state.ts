/**
 * Tipos da busca de aluno. Fora do arquivo `'use server'`, que só exporta
 * função assíncrona — guardado por `tests/unit/use-server-exports.test.ts`.
 */
export type AlunoEncontrado = {
  id: string
  name: string
  synseId: string
  planName: string | null
  /**
   * Se este aluno já tem a ficha que a tela está atribuindo.
   *
   * Só vem preenchido quando a busca recebe um `workoutPlanId`. A anotação
   * nasce aqui, no servidor, recortada pelos alunos que a página mostra —
   * antes a tela recebia a lista inteira de quem tem a ficha, que numa
   * academia com treino atribuído a todos era a academia inteira no HTML,
   * para anotar doze nomes.
   */
  jaTemOTreino?: boolean
}

export type BuscaDeAlunoResultado =
  { ok: true; alunos: AlunoEncontrado[]; total: number } | { ok: false; erro: string }
