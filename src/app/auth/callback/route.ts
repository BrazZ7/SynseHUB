import { NextResponse, type NextRequest } from 'next/server'

import { CAMINHO_NOVA_SENHA, RECUPERACAO_COOKIE, RECUPERACAO_MAX_AGE } from '@/lib/auth/session'
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
  const resposta = NextResponse.redirect(`${origin}${destinoPedido ?? '/onboarding'}`)

  /*
   * A marca de recuperação.
   *
   * O destino é nosso: quem monta o link é `requestPasswordReset`, e só ele
   * pede `next=/nova-senha`. Chegar aqui com esse destino exige um código de
   * uso único válido, que só sai na caixa de e-mail da própria conta — então a
   * marca prova o que precisa provar: a pessoa tem o e-mail, mesmo sem ter a
   * senha.
   *
   * Sem isto a tela de senha nova teria de aceitar qualquer sessão, e a
   * exigência de senha atual na troca comum viraria enfeite — bastaria abrir a
   * outra tela.
   */
  if (destinoPedido === CAMINHO_NOVA_SENHA) {
    resposta.cookies.set(RECUPERACAO_COOKIE, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: RECUPERACAO_MAX_AGE,
    })
  }

  return resposta
}
