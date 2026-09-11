'use client'

import { MailCheck, TriangleAlert } from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signInWithEmailLink, signInWithPassword, type AuthActionState } from '@/lib/auth/actions'

const initialState: AuthActionState = {}

type Mode = 'password' | 'link'

export function LoginForm() {
  const [mode, setMode] = useState<Mode>('password')

  return mode === 'link' ? (
    <EmailLinkForm onBack={() => setMode('password')} />
  ) : (
    <PasswordForm onUseLink={() => setMode('link')} />
  )
}

function PasswordForm({ onUseLink }: { onUseLink: () => void }) {
  const [state, formAction] = useActionState(signInWithPassword, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <ErrorMessage error={state.error} />

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@academia.com.br"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      <SubmitButton label="Entrar" pendingLabel="Entrando…" />

      <button
        type="button"
        onClick={onUseLink}
        className="w-full rounded text-center text-sm text-synse-primary underline-offset-2 hover:underline"
      >
        Entrar com link por e-mail
      </button>

      <Terms />
    </form>
  )
}

/**
 * Entrada sem senha. É o caminho das contas criadas pelo seed, que nascem sem
 * credencial — e de quem simplesmente esqueceu a senha.
 */
function EmailLinkForm({ onBack }: { onBack: () => void }) {
  const [state, formAction] = useActionState(signInWithEmailLink, initialState)

  if (state.sent) {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="bg-synse-primary/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-text"
        >
          <MailCheck className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            Se esse e-mail estiver cadastrado, o link de acesso chega em instantes. Ele vale por uma
            hora e só pode ser usado uma vez.
          </span>
        </p>
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onBack}>
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <ErrorMessage error={state.error} />

      <div className="space-y-1.5">
        <Label htmlFor="email-link">E-mail</Label>
        <Input
          id="email-link"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@academia.com.br"
        />
        <p className="text-xs text-synse-muted">
          Enviamos um link de acesso. Você não precisa de senha.
        </p>
      </div>

      <SubmitButton label="Enviar link" pendingLabel="Enviando…" />

      <button
        type="button"
        onClick={onBack}
        className="w-full rounded text-center text-sm text-synse-primary underline-offset-2 hover:underline"
      >
        Entrar com senha
      </button>

      <Terms />
    </form>
  )
}

function ErrorMessage({ error }: { error?: string }) {
  if (!error) return null
  return (
    <p
      role="alert"
      className="bg-synse-danger/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-danger"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {error}
    </p>
  )
}

function Terms() {
  return (
    <p className="text-center text-xs text-synse-muted">
      Ao entrar você concorda com os Termos de Uso e a Política de Privacidade do Synse.
    </p>
  )
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}
