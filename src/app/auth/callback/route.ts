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
  const destinoPedido = next?.startsWith('/') && !next.startsWith('//') ? next : null

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

  /*
   * Sem sessão anterior a pessoa vai para o onboarding, que pergunta o perfil.
   *
   * A escolha não viaja mais por aqui: ela é feita depois deste ponto, com a
   * pessoa já autenticada. Antes ela ia na query string do endereço de retorno,
   * e o Supabase — que compara o endereço inteiro contra a lista de permitidos
   * — recusava o retorno sem consumir o token. O clique no link de confirmação
   * não fazia nada, sem erro nenhum à vista.
   */
  return NextResponse.redirect(`${origin}${destinoPedido ?? '/onboarding'}`)
}
