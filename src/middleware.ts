import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/database/env'

/**
 * Renova a sessão do Supabase a cada navegação.
 *
 * Sem isso o token expira silenciosamente e o usuário é derrubado no meio do
 * trabalho. Em DEMO MODE não há nada a renovar — a requisição passa direto.
 */
export async function middleware(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Chamada obrigatória: é ela que dispara o refresh do token.
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
