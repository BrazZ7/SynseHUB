/**
 * O veredito de uma sonda de schema.
 *
 * Só a decisão mora aqui — a chamada de rede fica na rota. É esta parte que
 * tem lógica, e era a única do endereço sem teste nenhum: uma sonda que erra o
 * veredito é pior do que não existir, porque `/api/health?deep=1` passa a
 * afirmar com confiança que está tudo no lugar.
 */

export type SchemaProbe = {
  /** `true` existe, `false` não existe, `null` não deu para saber. */
  present: boolean | null
  status: number | null
}

/**
 * Sonda de tabela ou coluna, via `GET` no PostgREST.
 *
 * 200 com lista vazia é a RLS negando linha, o que só acontece se o schema
 * aceitou a pergunta. 400 com 42703 (coluna) e 404 com PGRST205 (tabela) são
 * "ainda não existe". O resto — 401, 403, 5xx — fala de credencial ou de
 * indisponibilidade, e vira `null` para não virar adivinhação.
 */
export function vereditoDeRecurso(status: number): SchemaProbe {
  if (status >= 200 && status < 300) return { present: true, status }
  if (status === 400 || status === 404) return { present: false, status }
  return { present: null, status }
}

/**
 * Sonda de função, via `POST` no PostgREST.
 *
 * A função revogada ao anônimo responde 401 ou 403 quando existe, e 404
 * (PGRST202) quando não existe — é a diferença entre "sem permissão" e "não
 * encontrada" que responde, e o POST não chega a executar nada.
 *
 * ── `executa`, para a função que o anônimo pode chamar ──────────────────────
 *
 * Nem toda função é revogada. As de leitura da 0027 e da 0035 são
 * `security invoker` sem `revoke`: o anônimo executa, a RLS nega cada linha e
 * a resposta é 200 com lista vazia. Para elas 200 **é** o sinal de que existe,
 * e sem a opção a sonda devolveria `null` — o mesmo que não ter sonda.
 *
 * A opção é explícita e não é o padrão de propósito. Ligá-la numa função de
 * escrita não revogada faria a sonda **executar** a escrita a cada visita ao
 * endereço. Só vale para função `stable`, que lê e não grava.
 */
export function vereditoDeFuncao(status: number, opcoes: { executa?: boolean } = {}): SchemaProbe {
  if (status === 404) return { present: false, status: 404 }
  if (status === 401 || status === 403) return { present: true, status }
  // Para uma função revogada, 200 seria notícia ruim — e não confirmação.
  if (opcoes.executa && status >= 200 && status < 300) return { present: true, status }
  return { present: null, status }
}
