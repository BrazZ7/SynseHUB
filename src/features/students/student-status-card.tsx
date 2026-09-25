'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { changeStudentStatusAction } from '@/features/students/actions'
import { initialActionState } from '@/features/students/state'
import type { StudentStatus } from '@/types/domain'

/**
 * Suspender, encerrar e reativar.
 *
 * Encerrar não apaga ninguém: presenças, treinos e cobranças são registro da
 * academia e continuam valendo depois da saída — inclusive para o que a lei
 * manda guardar. O texto diz isso na tela, porque a dúvida "vou perder o
 * histórico?" é o que faz a recepção evitar o botão e deixar aluno antigo
 * marcado como ativo por anos.
 */
export function StudentStatusCard({
  studentId,
  studentName,
  status,
}: {
  studentId: string
  studentName: string
  status: StudentStatus
}) {
  const [state, formAction] = useActionState(changeStudentStatusAction, initialActionState)

  const encerrado = status === 'CANCELLED'
  const suspenso = status === 'INACTIVE'

  return (
    <div className="space-y-3">
      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <p className="text-xs text-synse-muted">
        {encerrado
          ? `A matrícula de ${studentName} está encerrada. O histórico continua aqui, e a conta pessoal dele segue existindo no Synse.`
          : 'Suspender pausa o vínculo sem encerrá-lo. Encerrar fecha a matrícula — o histórico permanece, e a conta pessoal do aluno continua existindo fora da academia.'}
      </p>

      <div className="flex flex-wrap gap-2">
        {(encerrado || suspenso) && (
          <Acao studentId={studentId} status="ACTIVE" variant="default" label="Reativar" />
        )}
        {!encerrado && !suspenso && (
          <Acao studentId={studentId} status="INACTIVE" variant="outline" label="Suspender" />
        )}
        {!encerrado && (
          <Acao
            studentId={studentId}
            status="CANCELLED"
            variant="outline"
            label="Encerrar matrícula"
            confirmacao={`Encerrar a matrícula de ${studentName}? O histórico continua guardado.`}
          />
        )}
      </div>
    </div>
  )

  function Acao({
    studentId,
    status,
    label,
    variant,
    confirmacao,
  }: {
    studentId: string
    status: StudentStatus
    label: string
    variant: 'default' | 'outline'
    confirmacao?: string
  }) {
    return (
      <form
        action={formAction}
        onSubmit={(evento) => {
          // Encerrar é a única das três que a pessoa não desfaz sozinha sem
          // saber onde procurar — e é a que mais se clica por engano.
          if (confirmacao && !window.confirm(confirmacao)) evento.preventDefault()
        }}
      >
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="status" value={status} />
        <Botao label={label} variant={variant} />
      </form>
    )
  }
}

function Botao({ label, variant }: { label: string; variant: 'default' | 'outline' }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? '…' : label}
    </Button>
  )
}
