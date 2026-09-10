'use client'

import Link from 'next/link'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
          input={<Input id="name" name="name" required autoComplete="name" placeholder="Ana Ribeiro" />}
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
              <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="(11) 98888-7777" />
            }
          />
        </div>

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
                className="h-10 w-full rounded-lg border border-synse-border bg-synse-surface px-3 text-sm text-synse-text focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synse-primary/25"
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
              <Input id="billingDay" name="billingDay" type="number" min={1} max={28} defaultValue={5} />
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
              className="h-10 w-full rounded-lg border border-synse-border bg-synse-surface px-3 text-sm text-synse-text focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synse-primary/25"
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

function Field({
  id,
  label,
  hint,
  errors,
  input,
}: {
  id: string
  label: string
  hint?: string
  errors?: string[]
  input: React.ReactNode
}) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div aria-describedby={[hint && hintId, errors?.length && errorId].filter(Boolean).join(' ')}>
        {input}
      </div>
      {hint && !errors?.length && (
        <p id={hintId} className="text-xs text-synse-muted">
          {hint}
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} role="alert" className="text-xs text-synse-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  )
}

function Feedback({
  tone,
  message,
  children,
}: {
  tone: 'success' | 'error'
  message: string
  children?: React.ReactNode
}) {
  const success = tone === 'success'
  const Icon = success ? CircleCheck : TriangleAlert

  return (
    <div
      role="status"
      className={
        success
          ? 'flex items-start gap-3 rounded-lg bg-synse-success/10 p-3.5 text-sm text-synse-success'
          : 'flex items-start gap-3 rounded-lg bg-synse-danger/10 p-3.5 text-sm text-synse-danger'
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p>{message}</p>
        {children}
      </div>
    </div>
  )
}
