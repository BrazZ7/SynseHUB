import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { logger } from '@/lib/logger'

/**
 * Destino do link enviado por e-mail.
 *
 * O Supabase devolve a pessoa aqui com um `code` de uso único; trocá-lo por
 * uma sessão é o que efetivamente autentica. Sem esta rota o link abre uma
 * página que não loga ninguém.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // `next` permite voltar para onde a pessoa tentou ir antes de logar.
  const next = searchParams.get('next')
  // Só caminho interno: `//host` e `https://host` sairiam do site.
  const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link-invalido`)
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.redirect(`${origin}/login?erro=indisponivel`)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    logger.warn('auth:callback_failed', { reason: error.message })
    return NextResponse.redirect(`${origin}/login?erro=link-expirado`)
  }

  return NextResponse.redirect(`${origin}${destination}`)
}
