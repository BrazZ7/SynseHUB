import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/features/auth/login-form'
import { DemoPersonaPicker } from '@/features/auth/demo-persona-picker'
import { getDemoPersonas, getSession } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; proximo?: string }>
}) {
  const session = await getSession()
  if (session) redirect(session.role === 'STUDENT' ? '/app' : '/dashboard')

  /*
   * Quem chega com `?erro=indisponivel` está autenticado: a senha passou, e o
   * que falhou foi ler a conta. Antes essa pessoa era mandada para o cadastro
   * e recebia "você é academia, profissional ou aluno?" — pergunta que ela já
   * tinha respondido, e que respondida de novo criaria uma academia vazia.
   */
  const parametros = await searchParams
  const indisponivel = parametros.erro === 'indisponivel'
  // Só caminho interno: `//host` sairia do site levando junto a confiança de
  // quem clicou num link do Synse.
  const proximo =
    parametros.proximo?.startsWith('/') && !parametros.proximo.startsWith('//')
      ? parametros.proximo
      : undefined
  const demo = isDemoMode()

  return (
    <div className="animate-fade-in-up space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">Entrar no SynseHub</h1>
        <p className="text-sm text-synse-muted">
          Acesse o painel da sua academia para acompanhar alunos, pagamentos e treinos.
        </p>
      </header>

      {indisponivel && (
        <p role="alert" className="bg-synse-warning/10 rounded-lg p-3 text-sm text-synse-text">
          Sua conta existe e a senha está certa, mas não conseguimos carregar seus dados agora.
          Tente entrar de novo em instantes. Se continuar, avise o suporte — não crie outra conta.
        </p>
      )}

      {demo ? (
        <DemoPersonaPicker personas={getDemoPersonas()} />
      ) : (
        <>
          <LoginForm proximo={proximo} />
          <p className="text-center text-sm text-synse-muted">
            Ainda não tem conta?{' '}
            <Link href="/signup" className="text-synse-primary underline-offset-2 hover:underline">
              Cadastre sua academia
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
