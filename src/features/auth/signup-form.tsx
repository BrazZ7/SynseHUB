'use client'

import { MailCheck, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUpWithPassword, type AuthActionState } from '@/lib/auth/actions'

const initialState: AuthActionState = {}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpWithPassword, initialState)

  if (state.sent) {
    return (
      <p
        role="status"
        className="flex items-start gap-2.5 rounded-lg bg-synse-primary/10 p-3 text-sm text-synse-text"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
        <span>
          Enviamos um link de confirmação para o seu e-mail. Abra o link para continuar o cadastro
          da sua academia.
        </span>
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-lg bg-synse-danger/10 p-3 text-sm text-synse-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="signup-name">Seu nome</Label>
        <Input id="signup-name" name="name" required autoComplete="name" placeholder="Como você se chama" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@academia.com.br"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-password">Senha</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Ao menos 8 caracteres"
        />
      </div>

      <SubmitButton />

      <p className="text-center text-xs text-synse-muted">
        Ao criar a conta você concorda com os Termos de Uso e a Política de Privacidade do Synse.
      </p>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Criando conta…' : 'Criar conta'}
    </Button>
  )
}
