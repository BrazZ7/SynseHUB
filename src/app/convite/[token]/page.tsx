import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SynseLogo } from '@/components/synse/synse-logo'
import { Button } from '@/components/ui/button'
import { AcceptInvite } from '@/features/staff/accept-invite'
import { getAuthenticatedUserId } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Convite para equipe' }

type Params = Promise<{ token: string }>

/**
 * A porta de entrada de quem foi convidado.
 *
 * Quem não estiver autenticado é mandado para o login com o destino guardado:
 * o convite exige que a sessão seja do e-mail convidado, e sem sessão não há o
 * que comparar. Depois de entrar, a pessoa volta para cá e o botão aparece.
 */
export default async function ConvitePage({ params }: { params: Params }) {
  const { token } = await params
  const authUserId = await getAuthenticatedUserId()

  if (!authUserId) {
    redirect(`/login?proximo=${encodeURIComponent(`/convite/${token}`)}`)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-synse-bg px-5 py-10">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-synse-border bg-synse-surface p-6 shadow-synse-sm">
        <Link href="/" aria-label="Início">
          <SynseLogo />
        </Link>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-synse-text">Convite para a equipe</h1>
          <p className="text-sm text-synse-muted">
            Ao aceitar, você passa a ter acesso ao painel desta academia com as permissões da função
            que ela escolheu. O convite só vale para o e-mail que recebeu — se você entrou com
            outro, saia e entre com o endereço convidado.
          </p>
        </div>

        <AcceptInvite token={token} />

        <Button variant="ghost" size="sm" asChild className="w-full">
          <Link href="/app">Agora não</Link>
        </Button>
      </div>
    </div>
  )
}
