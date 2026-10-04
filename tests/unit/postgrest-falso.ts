import { SupabaseDataSource } from '@/lib/database/supabase-data-source'

/**
 * ── Um PostgREST de mentira, para testar a ligação ─────────────────────────
 *
 * O que se testa com ele é **qual consulta saiu**, com quais argumentos, e o
 * que a aplicação fez com a resposta. A semântica do SQL — `distinct on`, a
 * ordem de uma fila, o isolamento entre academias — fica com os testes de
 * `tests/db`, que rodam contra Postgres de verdade.
 *
 * Separar os dois evita o pior dos mundos: um dublê caprichado o bastante
 * para o teste passar provando as regras do dublê.
 *
 * O que ele **não** imita, de propósito: o teto de linhas do servidor. Quem
 * quiser exercitar resposta cortada entrega a página curta na fila de
 * `tabelas` e vê o que o código faz com ela — que é mais honesto que embutir
 * aqui um número que ninguém confirmou.
 */

type Resposta = { data: unknown; error: unknown; count?: number | null }
type Passo = { metodo: string; args: unknown[] }
type Chamada = { nome: string; passos: Passo[] }

/**
 * Um cliente que anota o que foi pedido e devolve o que o teste combinou.
 *
 * Cada método de construção devolve o próprio objeto, como no PostgREST, e o
 * `then` é o que resolve: é ele que registra a chamada, no momento em que ela
 * de fato acontece. `tabelas` aceita uma fila por tabela: a mesma
 * tabela pode ser lida mais de uma vez na mesma operação — página após página
 * de uma rota, ou `students` depois da função dos sumidos —, e cada leitura
 * tira a próxima resposta da fila. Fila esgotada responde vazio, que é como
 * uma paginação chega ao fim.
 */
export function clienteFalso(combinado: {
  tabelas?: Record<string, Resposta[]>
  rpcs?: Record<string, Resposta>
}) {
  const chamadas: Chamada[] = []
  const rpcs: Chamada[] = []
  const filas = Object.fromEntries(
    Object.entries(combinado.tabelas ?? {}).map(([tabela, fila]) => [tabela, [...fila]]),
  )

  const construtor = (tabela: string) => {
    const passos: Passo[] = []
    const alvo: Record<string, unknown> = {
      then(resolve: (r: Resposta) => unknown, reject?: (e: unknown) => unknown) {
        chamadas.push({ nome: tabela, passos })
        const resposta = filas[tabela]?.shift() ?? { data: [], error: null, count: 0 }
        return Promise.resolve(resposta).then(resolve, reject)
      },
    }
    for (const metodo of [
      'select',
      'eq',
      'in',
      'gte',
      'or',
      'order',
      'range',
      'limit',
      'maybeSingle',
      'single',
    ]) {
      alvo[metodo] = (...args: unknown[]) => {
        passos.push({ metodo, args })
        return alvo
      }
    }
    return alvo
  }

  const cliente = {
    from: (tabela: string) => construtor(tabela),
    rpc: (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, passos: [{ metodo: 'rpc', args: [args] }] })
      return Promise.resolve(combinado.rpcs?.[nome] ?? { data: [], error: null })
    },
  }

  return {
    // O data source só usa `from` e `rpc`; o resto do SupabaseClient não entra.
    dataSource: new SupabaseDataSource(cliente as never),
    chamadas,
    rpcs,
    paraTabela: (tabela: string) => chamadas.find((c) => c.nome === tabela),
    todasParaTabela: (tabela: string) => chamadas.filter((c) => c.nome === tabela),
    argsDaRpc: (nome: string) =>
      rpcs.find((c) => c.nome === nome)?.passos[0].args[0] as Record<string, unknown> | undefined,
  }
}
