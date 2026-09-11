'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { initialChallengeState, recordProgressAction } from '@/features/challenges/actions'

/**
 * Lançamento manual de progresso.
 *
 * Constância é a exceção: conta pelos check-ins, sem ninguém digitar nada. Nos
 * outros o número vem da pessoa — e é por isso que o desafio vale medalha, não
 * ranking público.
 */
export function ProgressForm({ code, unit }: { code: string; unit: string }) {
  const [state, formAction] = useActionState(recordProgressAction, initialChallengeState)

  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="code" value={code} />
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={`delta-${code}`} className="text-xs text-synse-muted">
            Somar {unit}
          </label>
          <Input
            id={`delta-${code}`}
            name="delta"
            inputMode="decimal"
            placeholder="0"
            required
            className="mt-1"
          />
        </div>
        <SubmitButton />
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-synse-danger">
          {state.error}
        </p>
      )}
      {state.message && <p className="text-xs text-synse-success">{state.message}</p>}
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Somando…' : 'Registrar'}
    </Button>
  )
}
