import 'server-only'

/**
 * De quem é esta requisição, para fins de marcação.
 *
 * Lê o `sub` do token do Supabase que vem no cookie, **sem verificar
 * assinatura** — e isso é aceitável exatamente porque o valor não autoriza
 * nada: ele só etiqueta um registro de erro. Quem lê os erros passa pela
 * autenticação de verdade, e só recebe os que casam com o próprio `sub`.
 *
 * Forjar um cookie aqui não dá acesso a nada: daria apenas a etiqueta errada
 * ao próprio erro de quem forjou.
 */
export function subjectFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null

  for (const parte of cookieHeader.split(';')) {
    const [nome, ...resto] = parte.trim().split('=')
    if (!nome?.startsWith('sb-') || !nome.includes('auth-token')) continue

    const bruto = decodeURIComponent(resto.join('='))
    const sub = subjectFromToken(bruto)
    if (sub) return sub
  }

  return null
}

function subjectFromToken(bruto: string): string | null {
  try {
    // O cookie pode vir como JSON (array de tokens), como objeto, ou com
    // prefixo `base64-` — o formato mudou entre versões do cliente Supabase.
    const texto = bruto.startsWith('base64-')
      ? Buffer.from(bruto.slice(7), 'base64').toString('utf8')
      : bruto

    const inicio = texto.trim()
    const jwt = inicio.startsWith('[')
      ? (JSON.parse(inicio)[0] as string)
      : inicio.startsWith('{')
        ? ((JSON.parse(inicio) as { access_token?: string }).access_token ?? '')
        : inicio

    const payload = jwt.split('.')[1]
    if (!payload) return null

    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown
    }
    return typeof dados.sub === 'string' ? dados.sub : null
  } catch {
    return null
  }
}
