'use client'

import { Check } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { confirmStudentAction } from '@/features/students/actions'
import { initialActionState } from '@/features/students/state'

/**
 * Confirma quem entrou pelo código de convite.
 *
 * A academia precisa dizer "sim, é aluno meu" antes de a pessoa entrar na
 * contagem de mensalidades e nos relatórios. É a contrapartida de deixar o
 * aluno se cadastrar sozinho.
 */
export function ConfirmStudentButton({ studentId }: { studentId: string }) {
  const [state, formAction] = useActionState(confirmStudentAction, initialActionState)

  if (state.status === 'success') {
    return <span className="text-xs text-synse-success">Confirmada</span>
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="studentId" value={studentId} />
      <SubmitButton />
      {state.status === 'error' && (
        <span role="alert" className="ml-2 text-xs text-synse-danger">
          {state.message}
        </span>
      )}
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      <Check className="size-3.5" aria-hidden />
      {pending ? 'Confirmando…' : 'Confirmar'}
    </Button>
  )
}
