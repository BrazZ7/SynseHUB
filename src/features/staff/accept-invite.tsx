'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { acceptStaffInviteAction } from '@/features/staff/actions'
import { initialStaffState } from '@/features/staff/state'

export function AcceptInvite({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptStaffInviteAction, initialStaffState)

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}
      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Entrando na equipe…' : 'Aceitar convite'}
    </Button>
  )
}
