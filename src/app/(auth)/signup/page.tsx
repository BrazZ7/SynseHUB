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

  // Sem banco não há onde a academia nascer.
  if (isDemoMode()) redirect('/login')

  return (
    <div className="space-y-8 animate-fade-in-up">
      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">Cadastre sua academia</h1>
        <p className="text-sm text-synse-muted">
          Primeiro criamos a sua conta. Em seguida você informa os dados da academia.
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
