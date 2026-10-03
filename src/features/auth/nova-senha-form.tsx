'use client'

import { CheckCircle2, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setNewPassword, type AuthActionState } from '@/lib/auth/actions'

const initialState: AuthActionState = {}

export function NovaSenhaForm({ exigeSenhaAtual }: { exigeSenhaAtual: boolean }) {
  const [state, formAction] = useActionState(setNewPassword, initialState)

  if (state.sent) {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="bg-synse-success/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-text"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-synse-success" aria-hidden />
          <span>Senha trocada. Use a nova da próxima vez que entrar.</span>
        </p>
        <Button variant="outline" size="lg" className="w-full" asChild>
          <Link href="/app">Ir para o app</Link>
        </Button>
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

      {exigeSenhaAtual && (
        <div className="space-y-1.5">
          <Label htmlFor="senhaAtual">Senha atual</Label>
          <Input
            id="senhaAtual"
            name="senhaAtual"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="password">Senha nova</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
        />
        <p className="text-xs text-synse-muted">Ao menos 8 caracteres.</p>
      </div>

      {/*
        A confirmação existe porque o erro de digitação aqui é o mais caro de
        todos: a pessoa sai com uma senha que não sabe qual é, e o caminho de
        volta é fazer tudo de novo. Campo atrás de asteriscos não perdoa.
      */}
      <div className="space-y-1.5">
        <Label htmlFor="confirmacao">Repita a senha nova</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </div>

      <Salvar />
    </form>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar senha'}
    </Button>
  )
}
