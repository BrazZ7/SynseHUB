'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClassScheduleAction } from '@/features/schedule/actions'
import { initialScheduleState } from '@/features/schedule/state'

export type StaffOption = {
  id: string
  name: string
  role: string
}

const DIAS_DA_SEMANA = [
  { value: '1', label: 'Segunda-feira' },
  { value: '2', label: 'Terça-feira' },
  { value: '3', label: 'Quarta-feira' },
  { value: '4', label: 'Quinta-feira' },
  { value: '5', label: 'Sexta-feira' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
]

export function NewClassScheduleForm({
  staff,
  defaultStartsOn,
}: {
  staff: StaffOption[]
  defaultStartsOn: string
}) {
  const [state, formAction] = useActionState(createClassScheduleAction, initialScheduleState)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <p className="text-xs text-synse-success/85">
            {state.generatedSessions ?? 0} aulas materializadas nesta rodada.
          </p>
          <Button variant="link" size="sm" asChild className="h-auto p-0 text-synse-success">
            <Link href="/schedule">Ver agenda</Link>
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
          input={<Input id="name" name="name" required placeholder="Spinning" />}
        />

        <Field
          id="description"
          label="Descrição"
          hint="Opcional. Use para observações da recepção e do professor."
          errors={state.fieldErrors?.description}
          input={
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Aula de bike indoor para todos os níveis."
            />
          }
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-3 text-sm font-semibold text-synse-text">Quando acontece</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="weekday"
            label="Dia da semana"
            errors={state.fieldErrors?.weekday}
            input={
              <select id="weekday" name="weekday" defaultValue="1" className={SELECT_CLASS}>
                {DIAS_DA_SEMANA.map((dia) => (
                  <option key={dia.value} value={dia.value}>
                    {dia.label}
                  </option>
                ))}
              </select>
            }
          />

          <Field
            id="startTime"
            label="Horário"
            errors={state.fieldErrors?.startTime}
            input={<Input id="startTime" name="startTime" type="time" defaultValue="19:00" required />}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="durationMinutes"
            label="Duração"
            hint="Em minutos."
            errors={state.fieldErrors?.durationMinutes}
            input={
              <Input
                id="durationMinutes"
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                min="5"
                max="480"
                step="5"
                defaultValue="50"
                required
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
                inputMode="numeric"
                min="1"
                max="500"
                defaultValue="20"
                required
              />
            }
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-3 text-sm font-semibold text-synse-text">Responsável e sala</legend>

        <Field
          id="staffId"
          label="Profissional"
          hint="Opcional. A aula continua existindo mesmo se ficar sem responsável."
          errors={state.fieldErrors?.staffId}
          input={
            <select id="staffId" name="staffId" defaultValue="" className={SELECT_CLASS}>
              <option value="">Sem responsável definido</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
          }
        />

        <Field
          id="room"
          label="Sala"
          errors={state.fieldErrors?.room}
          input={<Input id="room" name="room" placeholder="Sala 1" />}
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-3 text-sm font-semibold text-synse-text">Período</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="startsOn"
            label="Começa em"
            errors={state.fieldErrors?.startsOn}
            input={<Input id="startsOn" name="startsOn" type="date" defaultValue={defaultStartsOn} required />}
          />

          <Field
            id="endsOn"
            label="Termina em"
            hint="Deixe em branco para manter ativa."
            errors={state.fieldErrors?.endsOn}
            input={<Input id="endsOn" name="endsOn" type="date" />}
          />
        </div>

        <Field
          id="daysAhead"
          label="Gerar aulas por"
          hint="Quantos dias à frente devem aparecer agora na agenda."
          errors={state.fieldErrors?.daysAhead}
          input={
            <Input
              id="daysAhead"
              name="daysAhead"
              type="number"
              inputMode="numeric"
              min="0"
              max="120"
              defaultValue="21"
            />
          }
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/schedule">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Criando...' : 'Criar aula'}
    </Button>
  )
}
