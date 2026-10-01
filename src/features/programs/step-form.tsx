'use client'

import { Loader2 } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { salvarDiaAction } from '@/features/programs/admin-actions'
import { programAdminInicial } from '@/features/programs/admin-state'
import type { ProgramStep } from '@/types/domain'

/**
 * Um dia do programa.
 *
 * Tarefas como texto, uma por linha. É o jeito de digitar que sobrevive a
 * colar de qualquer lugar — campo repetível com botão de "adicionar item"
 * seria mais bonito e mais lento de preencher, e aqui a pessoa vai digitar
 * noventa desses.
 *
 * Gravar o mesmo dia de novo sobrescreve: a 0003 tem unicidade em
 * (program_id, day_number) e a 0043 usa `on conflict`, então reescrever o dia
 * 7 é a operação normal de quem está montando.
 */
export function StepForm({
  programId,
  proximoDia,
  passo,
}: {
  programId: string
  proximoDia: number
  passo?: ProgramStep
}) {
  const [state, formAction] = useActionState(salvarDiaAction, programAdminInicial)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="programId" value={programId} />

      {state.status === 'success' && <Feedback tone="success" message={state.message ?? ''} />}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <Field
          id="dayNumber"
          label="Dia"
          errors={state.fieldErrors?.dayNumber}
          input={
            <Input
              id="dayNumber"
              name="dayNumber"
              type="number"
              min={1}
              defaultValue={passo?.dayNumber ?? proximoDia}
            />
          }
        />
        <Field
          id="title"
          label="Título do dia"
          errors={state.fieldErrors?.title}
          input={
            <Input
              id="title"
              name="title"
              maxLength={140}
              defaultValue={passo?.title ?? ''}
              placeholder="Corpo inteiro"
            />
          }
        />
      </div>

      <Field
        id="tasks"
        label="Tarefas"
        hint="Uma por linha."
        errors={state.fieldErrors?.tasks}
        input={
          <Textarea
            id="tasks"
            name="tasks"
            rows={5}
            maxLength={4_000}
            defaultValue={passo?.tasks.join('\n') ?? ''}
            placeholder={'Agachamento 3x10\nRemada 3x10\nPrancha 3x30s'}
          />
        }
      />

      <Enviar />
    </form>
  )
}

function Enviar() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Salvar dia
    </Button>
  )
}
