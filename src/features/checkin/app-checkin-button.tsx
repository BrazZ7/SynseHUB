'use client'

import { CircleCheck, QrCode } from 'lucide-react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { studentCheckInAction } from '@/features/checkin/student-actions'
import { initialCheckInState } from '@/features/checkin/state'

/** Botão de check-in do Synse App. Confirmação visível, sem alarde. */
export function AppCheckInButton({ alreadyCheckedIn }: { alreadyCheckedIn: boolean }) {
  const [state, formAction, pending] = useActionState(studentCheckInAction, initialCheckInState)
  const done = alreadyCheckedIn || state.status === 'success'

  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl bg-synse-success/12 py-3.5 text-sm font-medium text-synse-success animate-fade-in">
        <CircleCheck className="size-4" aria-hidden />
        Presença registrada hoje
      </div>
    )
  }

  return (
    <form action={formAction}>
      <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
        <QrCode className="size-4" />
        {pending ? 'Registrando…' : 'FAZER CHECK-IN'}
      </Button>
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-center text-xs text-synse-danger">
          {state.message}
        </p>
      )}
    </form>
  )
}
