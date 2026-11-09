import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { accessTokenDosCookies, middlewareDeveRenovar } from '@/lib/auth/token-vence-em'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/database/env'

/**
 * Renova a sessão do Supabase — mas só quando ela está perto de vencer.
 *
 * Sem renovação o token expira silenciosamente e a pessoa é derrubada no meio
 * do trabalho. Em DEMO MODE não há nada a renovar.
 *
 * ── Por que a condição, e por que ela é segura ─────────────────────────────
 *
 * `auth.getUser()` **vai à rede**: é uma chamada ao servidor de autenticação
 * do Supabase. Como este middleware roda em toda requisição — página, rota de
 * API, server action, cada navegação —, era uma viagem de ida e volta
 * pendurada em tudo, inclusive nas requisições que nem tocam no banco.
 *
 * Medido: o token do Supabase dura uma hora. Renová-lo a cada clique é
 * perguntar quarenta vezes por minuto uma coisa que muda uma vez por hora.
 *
 * E não afrouxa nada. Este middleware nunca autorizou ninguém: quem decide se
 * a sessão vale é `resolveSession`, a cada tela, com `getUser()` de verdade
 * contra o servidor, e a RLS por cima disso. O que acontece aqui é só
 * manutenção do cookie. Pular a manutenção enquanto o token tem cinquenta
 * minutos pela frente não torna nada legível para quem não devia ler.
 *
 * A margem é de dez minutos, e larga de propósito: renovar cedo demais custa
 * uma viagem; renovar tarde demais custa a sessão de alguém.
 */
export async function middleware(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next()

  /*
   * A saída rápida, por dois motivos: não há sessão para renovar (visitante
   * anônimo, robô, rota pública), ou há e ela ainda tem bastante validade.
   * Nos dois casos montar o cliente do Supabase e chamar a rede não produz
   * nada.
   */
  const token = accessTokenDosCookies(request.cookies.getAll())
  if (!middlewareDeveRenovar(token)) return NextResponse.next({ request })

  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  /*
   * É esta chamada que dispara o refresh. Ela continua existindo — só deixou
   * de acontecer em toda requisição.
   */
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Todas as rotas exceto assets estáticos e o webhook de pagamento —
     * o webhook autentica por token próprio e não deve tocar em cookie.
     */
    '/((?!_next/static|_next/image|favicon.ico|brand|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
