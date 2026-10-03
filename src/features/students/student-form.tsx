'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { createStudentAction, updateStudentAction } from '@/features/students/actions'
import { initialActionState } from '@/features/students/state'
import { formatCurrency } from '@/lib/utils'
import type { MembershipPlan } from '@/types/domain'

type Option = { id: string; name: string }

/** Os valores que a edição precisa reapresentar. */
export type StudentFormValues = {
  id: string
  name: string
  email: string
  phone: string
  taxId: string
  goal: string
  planId: string
  trainerId: string
  billingDay: number
}

/**
 * O mesmo formulário matricula e corrige.
 *
 * Dois formulários separados divergiriam no primeiro campo novo — e o campo
 * que faltasse num deles só apareceria como "não consigo mudar isso aqui".
 * A diferença real entre os dois modos cabe em três pontos: o e-mail é somente
 * leitura na edição, o CPF já gravado não é reescrito, e o botão muda de nome.
 */
export function StudentForm({
  plans,
  trainers,
  student,
}: {
  plans: MembershipPlan[]
  trainers: Option[]
  student?: StudentFormValues
}) {
  const editando = Boolean(student)
  const [state, formAction] = useActionState(
    editando ? updateStudentAction : createStudentAction,
    initialActionState,
  )

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {student && <input type="hidden" name="studentId" value={student.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          {state.createdId && !editando && (
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <Link href={`/students/${state.createdId}`}>Abrir perfil</Link>
            </Button>
          )}
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-synse-text">Dados pessoais</legend>

        <Field
          id="name"
          label="Nome completo"
          errors={state.fieldErrors?.name}
          input={
            <Input
              id="name"
              name="name"
              required
              autoComplete="name"
              defaultValue={student?.name}
              placeholder="Ana Ribeiro"
            />
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="email"
            label="E-mail"
            hint={
              editando
                ? 'O e-mail é a identidade da conta do aluno e vale em qualquer academia — só ele pode trocar.'
                : 'Usado para o acesso do aluno ao Synse App.'
            }
            errors={state.fieldErrors?.email}
            input={
              <Input
                id="email"
                name={editando ? undefined : 'email'}
                type="email"
                required={!editando}
                readOnly={editando}
                autoComplete="email"
                defaultValue={student?.email}
                placeholder="ana@exemplo.com.br"
                className={editando ? 'cursor-not-allowed opacity-70' : undefined}
              />
            }
          />
          <Field
            id="phone"
            label="Telefone"
            errors={state.fieldErrors?.phone}
            input={
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={student?.phone}
                placeholder="(11) 98888-7777"
              />
            }
          />
        </div>

        <Field
          id="taxId"
          label="CPF"
          hint={
            student?.taxId
              ? 'Já registrado. Corrigir documento de alguém é operação de cadastro, não de edição de aluno.'
              : 'Opcional agora, obrigatório para emitir cobrança pelo Synse Pay.'
          }
          errors={state.fieldErrors?.taxId}
          input={
            <Input
              id="taxId"
              name="taxId"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={student?.taxId}
              readOnly={Boolean(student?.taxId)}
              className={student?.taxId ? 'cursor-not-allowed opacity-70' : undefined}
              placeholder="000.000.000-00"
            />
          }
        />

        <Field
          id="goal"
          label="Objetivo"
          errors={state.fieldErrors?.goal}
          input={
            <Input
              id="goal"
              name="goal"
              defaultValue={student?.goal}
              placeholder="Emagrecimento, hipertrofia…"
            />
          }
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-3 text-sm font-semibold text-synse-text">Plano e cobrança</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="planId"
            label="Plano"
            errors={state.fieldErrors?.planId}
            input={
              <select
                id="planId"
                name="planId"
                defaultValue={student?.planId ?? ''}
                className={SELECT_CLASS}
              >
                <option value="">Sem plano por enquanto</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {formatCurrency(plan.price)}
                  </option>
                ))}
              </select>
            }
          />

          <Field
            id="billingDay"
            label="Dia de vencimento"
            hint="Entre 1 e 28."
            errors={state.fieldErrors?.billingDay}
            input={
              <Input
                id="billingDay"
                name="billingDay"
                type="number"
                min={1}
                max={28}
                defaultValue={student?.billingDay ?? 5}
              />
            }
          />
        </div>

        <Field
          id="trainerId"
          label="Professor responsável"
          errors={state.fieldErrors?.trainerId}
          input={
            <select
              id="trainerId"
              name="trainerId"
              defaultValue={student?.trainerId ?? ''}
              className={SELECT_CLASS}
            >
              <option value="">Definir depois</option>
              {trainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.name}
                </option>
              ))}
            </select>
          }
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton editando={editando} />
        <Button variant="ghost" asChild>
          <Link href={student ? `/students/${student.id}` : '/students'}>Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  const rotulo = editando
    ? pending
      ? 'Salvando…'
      : 'Salvar alterações'
    : pending
      ? 'Matriculando…'
      : 'Matricular aluno'

  return (
    <Button type="submit" disabled={pending}>
      {rotulo}
    </Button>
  )
}
