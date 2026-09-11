import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { AccountTypePicker } from '@/features/auth/account-type-picker'
import { ACCOUNT_COPY, parseAccountType } from '@/features/auth/account-type'
import { SignUpForm } from '@/features/auth/signup-form'
import { getSession } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'

export const metadata: Metadata = { title: 'Criar conta' }

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const session = await getSession()
  if (session) redirect(session.role === 'STUDENT' ? '/app' : '/dashboard')

  // Sem banco não há onde a conta nascer.
  if (isDemoMode()) redirect('/login')

  const tipo = parseAccountType((await searchParams).tipo)

  /*
   * Sem tipo escolhido, a tela pergunta antes de pedir qualquer dado. Cada
   * perfil segue para uma segunda etapa diferente — dados do negócio ou código
   * da academia — e perguntar depois obrigaria a voltar.
   */
  if (!tipo) {
    return (
      <div className="animate-fade-in-up space-y-8">
        <header className="space-y-1.5">
          <h1 className="text-page-title font-semibold text-synse-text">Criar conta</h1>
          <p className="text-sm text-synse-muted">Para começar, diga o que você faz.</p>
        </header>

        <AccountTypePicker />

        <p className="text-center text-sm text-synse-muted">
          Já tem conta?{' '}
          <Link href="/login" className="text-synse-primary underline-offset-2 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    )
  }

  const copy = ACCOUNT_COPY[tipo]

  return (
    <div className="animate-fade-in-up space-y-8">
      <header className="space-y-1.5">
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 text-sm text-synse-muted underline-offset-2 hover:text-synse-text hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Escolher outro perfil
        </Link>
        <h1 className="text-page-title font-semibold text-synse-text">{copy.titulo}</h1>
        <p className="text-sm text-synse-muted">{copy.descricao}</p>
      </header>

      <SignUpForm accountType={tipo} emailPlaceholder={copy.emailExemplo} />

      <p className="text-center text-sm text-synse-muted">
        Já tem conta?{' '}
        <Link href="/login" className="text-synse-primary underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
