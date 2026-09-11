'use client'

import { CircleCheck, TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  updateFiscalDataAction,
  type FiscalActionState,
} from '@/features/organizations/fiscal-actions'
import { formatTaxId } from '@/lib/validations/tax-id'

const inicial: FiscalActionState = { status: 'idle' }

/**
 * Dados fiscais da academia.
 *
 * O campo do documento aceita CNPJ ou CPF: o provedor aceita os dois na
 * abertura de subconta, e exigir CNPJ deixaria de fora o personal e o estúdio
 * que ainda não abriu empresa.
 */
export function FiscalDataForm({
  legalName,
  taxId,
}: {
  legalName: string | null
  taxId: string | null
}) {
  const [state, formAction] = useActionState(updateFiscalDataAction, inicial)

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="legalName">Razão social</Label>
        <Input
          id="legalName"
          name="legalName"
          defaultValue={legalName ?? ''}
          placeholder="Academia Alpha LTDA"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="taxId">CNPJ ou CPF</Label>
        <Input
          id="taxId"
          name="taxId"
          inputMode="numeric"
          defaultValue={formatTaxId(taxId)}
          placeholder="00.000.000/0000-00"
          aria-describedby={state.fieldErrors?.taxId ? 'taxId-error' : 'taxId-hint'}
        />
        {state.fieldErrors?.taxId ? (
          <p id="taxId-error" role="alert" className="text-xs text-synse-danger">
            {state.fieldErrors.taxId[0]}
          </p>
        ) : (
          <p id="taxId-hint" className="text-xs text-synse-muted">
            Necessário para conectar o Synse Pay. Aceita CPF de quem atua como autônomo.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />

        {state.status !== 'idle' && state.message && (
          <p
            role="status"
            className={
              state.status === 'success'
                ? 'flex items-center gap-1.5 text-xs text-synse-success'
                : 'flex items-center gap-1.5 text-xs text-synse-danger'
            }
          >
            {state.status === 'success' ? (
              <CircleCheck className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            )}
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar dados fiscais'}
    </Button>
  )
}
