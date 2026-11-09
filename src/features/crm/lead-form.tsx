'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Field, Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveLeadAction } from '@/features/crm/actions'
import { initialCrmState } from '@/features/crm/state'
import { SOURCE_LABELS } from '@/lib/validations/lead'
import type { Lead } from '@/types/domain'

export function LeadForm({
  responsaveis,
  lead,
}: {
  responsaveis: Array<{ id: string; name: string }>
  lead?: Lead
}) {
  const [state, formAction] = useActionState(saveLeadAction, initialCrmState)

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {lead && <input type="hidden" name="leadId" value={lead.id} />}

      {state.status === 'success' && (
        <Feedback tone="success" message={state.message ?? ''}>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link href="/crm">Ver no funil</Link>
          </Button>
        </Feedback>
      )}
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}

      <Field
        id="name"
        label="Nome"
        errors={state.fieldErrors?.name}
        input={<Input id="name" name="name" required maxLength={120} defaultValue={lead?.name ?? ''} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="phone"
          label="Telefone"
          hint="Telefone ou e-mail — um dos dois é obrigatório."
          errors={state.fieldErrors?.phone}
          input={
            <Input
              id="phone"
              name="phone"
              type="tel"
              maxLength={20}
              defaultValue={lead?.phone ?? ''}
              placeholder="(11) 99999-0000"
            />
          }
        />
        <Field
          id="email"
          label="E-mail"
          errors={state.fieldErrors?.email}
          input={
            <Input id="email" name="email" type="email" defaultValue={lead?.email ?? ''} />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="source"
          label="Como chegou"
          errors={state.fieldErrors?.source}
          input={
            <select
              id="source"
              name="source"
              defaultValue={lead?.source ?? 'INSTAGRAM'}
              className={SELECT_CLASS}
            >
              {Object.entries(SOURCE_LABELS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          }
        />
        <Field
          id="ownerStaffId"
          label="Responsável"
          errors={state.fieldErrors?.ownerStaffId}
          input={
            <select
              id="ownerStaffId"
              name="ownerStaffId"
              defaultValue={lead?.ownerStaffId ?? ''}
              className={SELECT_CLASS}
            >
              <option value="">Sem responsável</option>
              {responsaveis.map((pessoa) => (
                <option key={pessoa.id} value={pessoa.id}>
                  {pessoa.name}
                </option>
              ))}
            </select>
          }
        />
      </div>

      <Field
        id="nextFollowUpAt"
        label="Retornar em"
        hint="O campo que faz o lead ser trabalhado. Em branco, ele some da fila do dia."
        errors={state.fieldErrors?.nextFollowUpAt}
        input={
          <Input
            id="nextFollowUpAt"
            name="nextFollowUpAt"
            type="date"
            defaultValue={lead?.nextFollowUpAt?.slice(0, 10) ?? ''}
          />
        }
      />

      <Field
        id="notes"
        label="Observações"
        errors={state.fieldErrors?.notes}
        input={
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={600}
            defaultValue={lead?.notes ?? ''}
            placeholder="O que a pessoa procura, horário preferido, objeções."
          />
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-synse-border pt-5">
        <SubmitButton editando={Boolean(lead)} />
        <Button variant="ghost" asChild>
          <Link href="/crm">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}

function SubmitButton({ editando }: { editando: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : editando ? 'Salvar lead' : 'Cadastrar lead'}
    </Button>
  )
}
