'use client'

import { MailCheck, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset, type AuthActionState } from '@/lib/auth/actions'

const initialState: AuthActionState = {}

export function RecuperarSenhaForm() {
  const [state, formAction] = useActionState(requestPasswordReset, initialState)

  /*
   * A confirmação não diz se o e-mail existe, e a frase é escrita para isso
   * não soar como enrolação: "se esse e-mail estiver cadastrado" explica o
   * condicional em vez de deixar a pessoa achando que o envio falhou.
   */
  if (state.sent) {
    return (
      <p
        role="status"
        className="bg-synse-primary/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-text"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0 text-synse-primary" aria-hidden />
        <span>
          Se esse e-mail estiver cadastrado, o link para criar a senha nova chega em instantes. Ele
          vale por uma hora e só pode ser usado uma vez.
        </span>
      </p>
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

      <Enviar />
    </form>
  )
}

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Enviando…' : 'Enviar link'}
    </Button>
  )
}
