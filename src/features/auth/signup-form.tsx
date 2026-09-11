'use client'

import Link from 'next/link'
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
    /*
     * A mensagem é a mesma para e-mail novo e para e-mail que já tem conta.
     *
     * Dizer "esse endereço já está cadastrado" permitiria descobrir quem é
     * cliente testando endereços, um por um. O preço é que quem esqueceu que já
     * tinha conta fica esperando um e-mail que nunca vem — por isso a saída para
     * o login aparece aqui, para todo mundo, sem revelar de quem é o caso.
     */
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="bg-synse-primary/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-text"
        >
          <MailCheck className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            Se este e-mail ainda não tiver conta, o link de confirmação está a caminho. Abra o link
            para continuar.
          </span>
        </p>

        <div className="space-y-2 rounded-lg border border-synse-border p-3.5 text-sm text-synse-muted">
          <p className="font-medium text-synse-text">Não chegou?</p>
          <ul className="list-inside list-disc space-y-1">
            <li>Confira a caixa de spam e a aba de promoções.</li>
            <li>
              Se você já tinha conta com este endereço, não enviamos outro link —{' '}
              <Link href="/login" className="text-synse-primary underline-offset-2 hover:underline">
                entre por aqui
              </Link>
              .
            </li>
            <li>
              Esqueceu a senha?{' '}
              <Link href="/login" className="text-synse-primary underline-offset-2 hover:underline">
                Entre com link por e-mail
              </Link>
              .
            </li>
          </ul>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p
          role="alert"
          className="bg-synse-danger/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="signup-name">Seu nome</Label>
        <Input
          id="signup-name"
          name="name"
          required
          autoComplete="name"
          placeholder="Como você se chama"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-email">E-mail</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="voce@exemplo.com.br"
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
