import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/features/auth/login-form'
import { DemoPersonaPicker } from '@/features/auth/demo-persona-picker'
import { getDemoPersonas, getSession } from '@/lib/auth/session'
import { isDemoMode } from '@/lib/database/env'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect(session.role === 'STUDENT' ? '/app' : '/dashboard')

  const demo = isDemoMode()

  return (
    <div className="space-y-8 animate-fade-in-up">
      <header className="space-y-1.5">
        <h1 className="text-page-title font-semibold text-synse-text">Entrar no SynseHub</h1>
        <p className="text-sm text-synse-muted">
          Acesse o painel da sua academia para acompanhar alunos, pagamentos e treinos.
        </p>
      </header>

      {demo ? (
        <DemoPersonaPicker personas={getDemoPersonas()} />
      ) : (
        <LoginForm />
      )}
    </div>
  )
}
