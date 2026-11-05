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
        {/*
          A frase não afirma mais o passo de confirmação por e-mail.
          Ele é uma configuração do Supabase que liga e desliga sem deploy, e
          estava **desligada** enquanto a tela prometia "depois de confirmar o
          e-mail" — a pessoa criava a conta, caía direto no onboarding, e a
          primeira coisa que o produto disse a ela já não tinha acontecido.

          "Depois" é verdade nas duas configurações: com confirmação ligada o
          depois inclui o clique no e-mail, sem ela é a tela seguinte.
        */}
        <p className="text-sm text-synse-muted">
          Comece pela conta. Depois você diz apenas se tem uma academia ou se vai treinar.
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
