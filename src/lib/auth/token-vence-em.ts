/**
 * ── Quando este token vence? ────────────────────────────────────────────────
 *
 * Lê o `exp` do access token do Supabase **sem ir à rede e sem verificar
 * assinatura**, e é importante entender por que isso não é um furo.
 *
 * Isto não decide quem a pessoa é, nem se ela pode alguma coisa. Decide uma
 * pergunta só: "vale a pena gastar uma ida à rede para renovar agora?". Um
 * token forjado com `exp` no ano 3000 consegue, no máximo, **não ser
 * renovado** — e aí a validação de verdade, que acontece no servidor a cada
 * tela (`resolveSession` → `auth.getUser()`), recusa a sessão do mesmo jeito.
 *
 * Quem autoriza continua sendo o Supabase, e a RLS por cima. Esta função só
 * evita perguntar a ele a mesma coisa quarenta vezes por minuto.
 */

/** O que o cookie do Supabase guarda, da parte que interessa. */
type Carga = { exp?: unknown }

/**
 * Decodifica o payload de um JWT. Devolve nulo para qualquer coisa estranha.
 *
 * `atob` e não `Buffer`: isto roda no middleware, que é ambiente de borda —
 * `Buffer` não existe lá, e o erro só apareceria em produção.
 */
function cargaDoToken(token: string): Carga | null {
  const partes = token.split('.')
  if (partes.length !== 3) return null

  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = JSON.parse(atob(preenchido)) as unknown
    return json && typeof json === 'object' ? (json as Carga) : null
  } catch {
    return null
  }
}

/**
 * Faltam menos de `margemSegundos` para este token vencer?
 *
 * **Nulo, token ilegível ou sem `exp` devolvem `true`** — na dúvida, renova.
 * Errar para o lado de uma ida à rede a mais custa latência; errar para o
 * outro derruba a pessoa no meio do trabalho, que é exatamente o que o
 * middleware existe para impedir.
 */
export function precisaRenovar(token: string | null | undefined, margemSegundos = 600): boolean {
  if (!token) return true

  const carga = cargaDoToken(token)
  if (!carga || typeof carga.exp !== 'number' || !Number.isFinite(carga.exp)) return true

  const agora = Math.floor(Date.now() / 1000)
  return carga.exp - agora <= margemSegundos
}

/**
 * O access token guardado no cookie do Supabase.
 *
 * O `@supabase/ssr` grava a sessão inteira em JSON, às vezes com o prefixo
 * `base64-`, e às vezes **partida em vários cookies** (`...0`, `...1`) quando
 * passa do limite de tamanho do navegador. Juntar os pedaços na ordem é o que
 * impede esta leitura de falhar justamente nas sessões maiores — que são as
 * de quem tem mais dado, isto é, as que mais importam.
 */
export function accessTokenDosCookies(cookies: { name: string; value: string }[]): string | null {
  const pedacos = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))

  if (pedacos.length === 0) return null

  let bruto = pedacos.map((c) => c.value).join('')
  if (bruto.startsWith('base64-')) {
    try {
      bruto = atob(bruto.slice('base64-'.length))
    } catch {
      return null
    }
  }

  try {
    const sessao = JSON.parse(bruto) as { access_token?: unknown }
    return typeof sessao.access_token === 'string' ? sessao.access_token : null
  } catch {
    return null
  }
}

/**
 * O middleware precisa gastar uma ida à rede nesta requisição?
 *
 * Duas perguntas diferentes, e misturá-las foi um engano meu: `precisaRenovar`
 * responde "este token está perto de vencer?", e **sem token ela diz que sim**
 * — porque, isolada, errar para o lado de renovar é o lado certo.
 *
 * Aqui a pergunta é outra: "há sessão para renovar?". Sem cookie nenhum não
 * há: é visitante anônimo, robô, rota pública. Renovar o nada custa a mesma
 * viagem e não produz nada.
 *
 * O primeiro comentário que escrevi no middleware prometia esta saída rápida
 * e o código fazia o contrário — anônimo caía no caminho completo. Separar as
 * duas perguntas em duas funções é o que impede isso de voltar.
 */
export function middlewareDeveRenovar(token: string | null | undefined): boolean {
  if (!token) return false
  return precisaRenovar(token)
}
