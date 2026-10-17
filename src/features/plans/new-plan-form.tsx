'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createPlanAction } from '@/features/plans/actions'
import { initialPlanState } from '@/features/plans/state'

const CICLOS = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
  { value: 'CUSTOM', label: 'Personalizado' },
]

export function NewPlanForm() {
  const [state, formAction] = useActionState(createPlanAction, initialPlanState)

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href="/plans">Ver todos os planos</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-synse-text">O plano</legend>

        <Field
          id="name"
          label="Nome"
          errors={state.fieldErrors?.name}
          input={<Input id="name" name="name" required placeholder="Mensal livre" />}
        />

        <Field
          id="description"
          label="Descrição"
          hint="Uma linha para a recepção lembrar a quem este plano serve."
          errors={state.fieldErrors?.description}
          input={
            <Input
              id="description"
              name="description"
              placeholder="Acesso à musculação e às aulas coletivas"
            />
          }
        />
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-3 text-sm font-semibold text-synse-text">Valor e cobrança</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="price"
            label="Valor"
            hint="Em reais, por período."
            errors={state.fieldErrors?.price}
            input={
              <Input
                id="price"
                name="price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="109,90"
              />
            }
          />

          <Field
            id="billingCycle"
            label="Periodicidade"
            errors={state.fieldErrors?.billingCycle}
            input={
              <select
                id="billingCycle"
                name="billingCycle"
                defaultValue="MONTHLY"
                className={SELECT_CLASS}
              >
                {CICLOS.map((ciclo) => (
                  <option key={ciclo.value} value={ciclo.value}>
                    {ciclo.label}
                  </option>
                ))}
              </select>
            }
          />
        </div>

        <Field
          id="enrollmentFee"
          label="Taxa de matrícula"
          hint="Cobrada uma vez, na entrada. Deixe zero se não houver."
          errors={state.fieldErrors?.enrollmentFee}
          input={
            <Input
              id="enrollmentFee"
              name="enrollmentFee"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              defaultValue="0"
            />
          }
        />

        <label className="flex items-start gap-2.5 text-sm text-synse-text">
          <input
            type="checkbox"
            name="autoCharge"
            defaultChecked
            className="mt-0.5 size-4 accent-[var(--synse-primary)]"
          />
          <span>
            Gerar a cobrança automaticamente a cada período
            <span className="block text-xs text-synse-muted">
              Desmarque para planos que a academia cobra por fora.
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-synse-border pt-6">
        <legend className="mb-3 text-sm font-semibold text-synse-text">O que está incluído</legend>

        <label className="flex items-start gap-2.5 text-sm text-synse-text">
          <input
            type="checkbox"
            name="unlimitedAccess"
            defaultChecked
            className="mt-0.5 size-4 accent-[var(--synse-primary)]"
          />
          <span>
            Acesso livre, sem limite de dias na semana
            <span className="block text-xs text-synse-muted">
              Desmarque para planos de 2, 3 ou 5 vezes por semana.
            </span>
          </span>
        </label>

        <Field
          id="weeklyAccessDays"
          label="Dias por semana"
          hint="Só vale se o acesso livre estiver desmarcado."
          errors={state.fieldErrors?.weeklyAccessDays}
          input={
            <Input
              id="weeklyAccessDays"
              name="weeklyAccessDays"
              type="number"
              inputMode="numeric"
              min="1"
              max="7"
              placeholder="3"
            />
          }
        />

        <Field
          id="benefits"
          label="Benefícios"
          hint="Um por linha. Aparecem no cartão do plano, para o aluno e para a recepção."
          errors={state.fieldErrors?.benefits}
          input={
            <Textarea
              id="benefits"
              name="benefits"
              rows={4}
              placeholder={'Musculação\nAulas coletivas\nAvaliação física trimestral'}
            />
          }
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-6">
        <SubmitButton />
        <Button variant="ghost" asChild>
          <Link href="/plans">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Criando…' : 'Criar plano'}
    </Button>
  )
}
