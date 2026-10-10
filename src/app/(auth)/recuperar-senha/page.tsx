import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { RecuperarSenhaForm } from '@/features/auth/recuperar-senha-form'
import { getSession } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'

export const metadata: Metadata = { title: 'Recuperar senha' }

export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  /*
   * Quem já está logado não veio esquecer a senha — veio trocá-la. A tela de
   * senha nova faz as duas coisas, e lá a senha atual é exigida de quem tem
   * sessão. Mandar para o começo do fluxo de recuperação seria dar a volta
   * inteira pelo e-mail para chegar no mesmo lugar.
   */
  const session = await getSession()
  if (session) redirect('/nova-senha')

  /*
   * Quem cai aqui vindo de `/nova-senha` chegou sem sessão: o link venceu, já
   * foi usado, ou alguém abriu o endereço na mão. Redirecionar com um código
   * que nenhuma tela mostra é pior do que não redirecionar — a pessoa reaparece
   * no começo sem entender o que aconteceu e tenta o mesmo link de novo.
   */
  const { erro } = await searchParams
  const linkExpirado = erro === 'link-expirado'

  return (
    <div className="animate-fade-in-up space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">Esqueceu a senha?</h1>
        <p className="text-sm text-synse-muted">
          Informe o e-mail da sua conta. Enviamos um link para você escolher uma senha nova.
        </p>
      </header>

      {linkExpirado && (
        <p role="alert" className="bg-synse-warning/10 rounded-lg p-3 text-sm text-synse-text">
          Esse link não vale mais — ele expira em uma hora e só funciona uma vez. Peça outro abaixo.
        </p>
      )}

      {isDemoMode() ? (
        <p role="status" className="bg-synse-warning/10 rounded-lg p-3 text-sm text-synse-text">
          No modo de demonstração não há e-mail nem senha: escolha um perfil na tela de entrada.
        </p>
      ) : (
        <RecuperarSenhaForm />
      )}

      <p className="text-center text-sm text-synse-muted">
        Lembrou?{' '}
        <Link href="/login" className="text-synse-primary underline-offset-2 hover:underline">
          Voltar para a entrada
        </Link>
      </p>
    </div>
  )
}
