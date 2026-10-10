/**
 * Tipos da busca de aluno. Fora do arquivo `'use server'`, que só exporta
 * função assíncrona — guardado por `tests/unit/use-server-exports.test.ts`.
 */
export type AlunoEncontrado = {
  id: string
  name: string
  synseId: string
  planName: string | null
}

export type BuscaDeAlunoResultado =
  { ok: true; alunos: AlunoEncontrado[]; total: number } | { ok: false; erro: string }
