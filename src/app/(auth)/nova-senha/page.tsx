import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { NovaSenhaForm } from '@/features/auth/nova-senha-form'
import { RECUPERACAO_COOKIE, getSession } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Nova senha' }

/**
 * A tela de senha nova, que serve os dois caminhos.
 *
 * Quem chegou pelo link do e-mail tem a marca posta pelo callback e não
 * informa a senha atual — ela é o que esqueceu. Quem já estava logado informa,
 * e é isso que impede que um navegador deixado aberto vire uma conta perdida.
 *
 * Sem sessão não há o que trocar: o link expirou, ou alguém abriu o endereço
 * na mão.
 */
export default async function NovaSenhaPage() {
  const session = await getSession()
  if (!session) redirect('/recuperar-senha?erro=link-expirado')

  const cookieStore = await cookies()
  const veioDoLink = cookieStore.get(RECUPERACAO_COOKIE)?.value === '1'

  return (
    <div className="animate-fade-in-up space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">
          {veioDoLink ? 'Escolha uma senha nova' : 'Trocar a senha'}
        </h1>
        <p className="text-sm text-synse-muted">
          {veioDoLink
            ? 'Pronto — o link funcionou. Agora é só definir a senha que você vai usar.'
            : 'Informe a senha atual e a nova. Pedimos a atual para que ninguém troque a sua senha num computador que você deixou aberto.'}
        </p>
      </header>

      <NovaSenhaForm exigeSenhaAtual={!veioDoLink} />

      <p className="text-center text-sm text-synse-muted">
        <Link
          href={session.role === 'STUDENT' ? '/app' : '/dashboard'}
          className="text-synse-primary underline-offset-2 hover:underline"
        >
          Voltar sem trocar
        </Link>
      </p>
    </div>
  )
}
