'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveClassScheduleAction } from '@/features/schedule/actions'
import { initialScheduleState } from '@/features/schedule/state'
import { DIAS_DA_SEMANA } from '@/lib/validations/schedule'
import type { ClassSchedule } from '@/types/domain'

/**
 * A regra semanal da aula.
 *
 * Campos não controlados: o que a recepção digitou fica no DOM, e uma conexão
 * que cai no meio do cadastro não apaga o formulário.
 */
export function ClassScheduleForm({
  professores,
  hoje,
  schedule,
}: {
  professores: Array<{ id: string; name: string }>
  hoje: string
  schedule?: ClassSchedule
}) {
  const [state, formAction] = useActionState(saveClassScheduleAction, initialScheduleState)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {schedule && <input type="hidden" name="scheduleId" value={schedule.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href="/schedule">Ver na agenda</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-synse-text">A aula</legend>

        <Field
          id="name"
          label="Nome"
          errors={state.fieldErrors?.name}
          input={
            <Input
              id="name"
              name="name"
              required
              maxLength={80}
              defaultValue={schedule?.name ?? ''}
              placeholder="Spinning"
            />
          }
        />

        <Field
          id="description"
          label="Descrição"
          hint="Aparece para o aluno na agenda do app."
          errors={state.fieldErrors?.description}
          input={
            <Textarea
              id="description"
              name="description"
              rows={2}
              maxLength={300}
              defaultValue={schedule?.description ?? ''}
              placeholder="Aula de 45 minutos, intensidade alta. Traga toalha e garrafa."
            />
          }
        />

        <Field
          id="staffId"
          label="Professor"
          errors={state.fieldErrors?.staffId}
          input={
            <select
              id="staffId"
              name="staffId"
              defaultValue={schedule?.staffId ?? ''}
              className={SELECT_CLASS}
            >
              <option value="">A definir</option>
              {professores.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.name}
                </option>
              ))}
            </select>
          }
        />
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 border-t border-synse-border pt-6 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Quando e onde</legend>

        <Field
          id="weekday"
          label="Dia"
          errors={state.fieldErrors?.weekday}
          input={
            <select
              id="weekday"
              name="weekday"
              defaultValue={String(schedule?.weekday ?? 1)}
              className={SELECT_CLASS}
            >
              {DIAS_DA_SEMANA.map((dia, indice) => (
                <option key={dia} value={indice}>
                  {dia}
                </option>
              ))}
            </select>
          }
        />
        <Field
          id="startTime"
          label="Horário"
          errors={state.fieldErrors?.startTime}
          input={
            <Input
              id="startTime"
              name="startTime"
              type="time"
              required
              defaultValue={schedule?.startTime ?? '19:00'}
            />
          }
        />
        <Field
          id="durationMinutes"
          label="Duração (min)"
          errors={state.fieldErrors?.durationMinutes}
          input={
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min="5"
              max="480"
              step="5"
              defaultValue={schedule?.durationMinutes ?? 60}
            />
          }
        />
        <Field
          id="capacity"
          label="Vagas"
          errors={state.fieldErrors?.capacity}
          input={
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min="1"
              max="500"
              required
              defaultValue={schedule?.capacity ?? 20}
            />
          }
        />

        <div className="col-span-2 sm:col-span-4">
          <Field
            id="room"
            label="Sala"
            errors={state.fieldErrors?.room}
            input={
              <Input
                id="room"
                name="room"
                maxLength={60}
                defaultValue={schedule?.room ?? ''}
                placeholder="Sala de bike"
              />
            }
          />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 border-t border-synse-border pt-6 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-semibold text-synse-text">Vigência</legend>

        <Field
          id="startsOn"
          label="A partir de"
          errors={state.fieldErrors?.startsOn}
          input={
            <Input
              id="startsOn"
              name="startsOn"
              type="date"
              required
              defaultValue={schedule?.startsOn ?? hoje}
            />
          }
        />
        <Field
          id="endsOn"
          label="Até"
          hint="Em branco, a aula segue sem data para acabar."
          errors={state.fieldErrors?.endsOn}
          input={
            <Input id="endsOn" name="endsOn" type="date" defaultValue={schedule?.endsOn ?? ''} />
          }
        />
        <Field
          id="status"
          label="Situação"
          hint="Arquivar para de gerar novas aulas."
          errors={state.fieldErrors?.status}
          input={
            <select
              id="status"
              name="status"
              defaultValue={schedule?.status ?? 'ACTIVE'}
              className={SELECT_CLASS}
            >
              <option value="ACTIVE">Ativa</option>
              <option value="ARCHIVED">Arquivada</option>
            </select>
          }
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton editando={Boolean(schedule)} />
        <Button variant="ghost" asChild>
          <Link href="/schedule">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : editando ? 'Salvar grade' : 'Criar aula'}
    </Button>
  )
}
