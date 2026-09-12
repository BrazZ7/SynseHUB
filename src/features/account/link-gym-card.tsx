'use client'

import { Building2 } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initialAccountState, linkGymAction } from '@/features/account/actions'

/**
 * Onde o código da academia mora depois da entrada.
 *
 * Tornar o código opcional no cadastro só funciona se houver este lugar: a
 * academia da pessoa pode entrar no Synse meses depois, ou ela pode trocar de
 * academia. Sem isto, a única saída seria criar outra conta.
 */
export function LinkGymCard() {
  const [state, formAction] = useActionState(linkGymAction, initialAccountState)

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
        <Building2 className="size-4 text-synse-muted" aria-hidden />
        Vincular a uma academia
      </h2>
      <p className="mt-1 text-sm text-synse-muted">
        Se a sua academia usa o Synse, informe o código que ela te passou. Seu histórico continua o
        mesmo — o Synse ID é vitalício.
      </p>

      <form action={formAction} className="mt-3 space-y-2">
        <Label htmlFor="inviteCode" className="sr-only">
          Código da academia
        </Label>
        <div className="flex items-end gap-2">
          <Input
            id="inviteCode"
            name="inviteCode"
            required
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABC123"
            maxLength={6}
            className="text-center text-base font-semibold uppercase tracking-[0.25em]"
          />
          <SubmitButton />
        </div>

        {state.error && (
          <p role="alert" className="text-xs text-synse-danger">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-xs text-synse-success">{state.message}</p>}
      </form>
    </section>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Vinculando…' : 'Vincular'}
    </Button>
  )
}
