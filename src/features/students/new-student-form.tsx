'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { createStudentAction } from '@/features/students/actions'
import { initialActionState } from '@/features/students/state'
import { formatCurrency } from '@/lib/utils'
import type { MembershipPlan } from '@/types/domain'

type Option = { id: string; name: string }

export function NewStudentForm({
  plans,
  trainers,
}: {
  plans: MembershipPlan[]
  trainers: Option[]
}) {
  const [state, formAction] = useActionState(createStudentAction, initialActionState)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          {state.createdId && (
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
            <Input id="name" name="name" required autoComplete="name" placeholder="Ana Ribeiro" />
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="email"
            label="E-mail"
            hint="Usado para o acesso do aluno ao Synse App."
            errors={state.fieldErrors?.email}
            input={
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="ana@exemplo.com.br"
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
                placeholder="(11) 98888-7777"
              />
            }
          />
        </div>

        <Field
          id="taxId"
          label="CPF"
          hint="Opcional agora, obrigatório para emitir cobrança pelo Synse Pay."
          errors={state.fieldErrors?.taxId}
          input={
            <Input
              id="taxId"
              name="taxId"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
            />
          }
        />

        <Field
          id="goal"
          label="Objetivo"
          errors={state.fieldErrors?.goal}
          input={<Input id="goal" name="goal" placeholder="Emagrecimento, hipertrofia…" />}
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
                defaultValue=""
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
                defaultValue={5}
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
              defaultValue=""
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
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/students">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Matriculando…' : 'Matricular aluno'}
    </Button>
  )
}
