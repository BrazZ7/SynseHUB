'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { assignWorkoutAction } from '@/features/workouts/actions'
import { initialWorkoutState } from '@/features/workouts/state'

type Aluno = { id: string; name: string; assigned: boolean }

/**
 * Atribuir o treino a um aluno.
 *
 * Esta é a escrita que faz o sino do aluno tocar — o gatilho da 0012 cria o
 * aviso "novo treino disponível" quando a linha entra em
 * `workout_assignments`, e até agora nada no produto era capaz de acioná-lo.
 */
export function AssignWorkoutCard({
  workoutPlanId,
  students,
}: {
  workoutPlanId: string
  students: Aluno[]
}) {
  const [state, formAction] = useActionState(assignWorkoutAction, initialWorkoutState)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="workoutPlanId" value={workoutPlanId} />

      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
        <Field
          id="studentId"
          label="Aluno"
          errors={state.fieldErrors?.studentId}
          input={
            <select id="studentId" name="studentId" defaultValue="" className={SELECT_CLASS}>
              <option value="">Escolher aluno…</option>
              {students.map((aluno) => (
                <option key={aluno.id} value={aluno.id}>
                  {aluno.name}
                  {/* Reatribuir renova a validade em vez de duplicar; dizer isso
                      antes evita a dúvida de "será que vou criar dois?". */}
                  {aluno.assigned ? ' — já tem este treino' : ''}
                </option>
              ))}
            </select>
          }
        />

        <Field
          id="validUntil"
          label="Válido até"
          hint="Opcional."
          errors={state.fieldErrors?.validUntil}
          input={<Input id="validUntil" name="validUntil" type="date" />}
        />
      </div>

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Atribuindo…' : 'Atribuir treino'}
    </Button>
  )
}
