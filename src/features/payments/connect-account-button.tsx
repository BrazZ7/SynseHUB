'use client'

import { CircleCheck, Link2, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import {
  connectPaymentAccountAction,
  type AccountActionState,
} from '@/features/payments/account-actions'

const inicial: AccountActionState = { status: 'idle' }

/**
 * Abre a subconta da academia no provedor.
 *
 * Fica desabilitado em modo simulado: ali não existe subconta a criar, e um
 * botão que responde "não dá" é pior que um botão que explica por quê.
 */
export function ConnectAccountButton({
  connected,
  simulated,
}: {
  connected: boolean
  simulated: boolean
}) {
  const [state, formAction] = useActionState(connectPaymentAccountAction, inicial)

  if (connected) {
    return (
      <p className="flex items-center gap-2 text-xs text-synse-success">
        <CircleCheck className="size-3.5 shrink-0" aria-hidden />
        Cobranças saindo pela conta da academia.
      </p>
    )
  }

  if (simulated) {
    return (
      <p className="text-xs text-synse-muted">
        Disponível quando o provedor real estiver configurado.
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-2">
      <SubmitButton />

      {state.status !== 'idle' && state.message && (
        <p
          role="status"
          className={
            state.status === 'success'
              ? 'flex items-start gap-2 text-xs text-synse-success'
              : 'flex items-start gap-2 text-xs text-synse-danger'
          }
        >
          {state.status === 'success' ? (
            <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          {state.message}
        </p>
      )}
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Link2 className="size-4" />
      {pending ? 'Conectando…' : 'Conectar Synse Pay'}
    </Button>
  )
}
