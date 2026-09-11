import { NextResponse, type NextRequest } from 'next/server'

import { parseAccountType } from '@/features/auth/account-type'
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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    logger.warn('auth:callback_failed', { reason: error.message })
    return NextResponse.redirect(`${origin}/login?erro=link-expirado`)
  }

  /*
   * O perfil escolhido no cadastro vem nos metadados da conta, não na URL.
   *
   * Antes ele viajava como `?next=/onboarding?tipo=aluno`, e o Supabase compara
   * o endereço de retorno inteiro contra a lista de permitidos: com a query
   * string, o endereço deixava de bater, o retorno era recusado e o token nem
   * chegava a ser consumido. O clique no link de confirmação não fazia nada, e
   * a conta seguia sem confirmar — sem nenhum erro visível.
   *
   * Guardar no metadado tira a configuração do caminho crítico: o endereço de
   * retorno passa a ser sempre o mesmo, exato, e o destino se resolve aqui.
   */
  const tipo = parseAccountType(data.user?.user_metadata?.accountType as string | undefined)
  const destinoPadrao = tipo ? `/onboarding?tipo=${tipo}` : '/dashboard'

  return NextResponse.redirect(`${origin}${destinoPedido ?? destinoPadrao}`)
}
