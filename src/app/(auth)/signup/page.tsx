import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SignUpForm } from '@/features/auth/signup-form'
import { getSession } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'

export const metadata: Metadata = { title: 'Criar conta' }

export default async function SignUpPage() {
  const session = await getSession()
  if (session) redirect(session.role === 'STUDENT' ? '/app' : '/dashboard')

  // Sem banco não há onde a conta nascer.
  if (isDemoMode()) redirect('/login')

  return (
    <div className="animate-fade-in-up space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">Criar conta</h1>
        <p className="text-sm text-synse-muted">
          Comece pela conta. Depois de confirmar o e-mail você diz o que faz — academia,
          profissional ou aluno.
        </p>
      </header>

      <SignUpForm />

      <p className="text-center text-sm text-synse-muted">
        Já tem conta?{' '}
        <Link href="/login" className="text-synse-primary underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
