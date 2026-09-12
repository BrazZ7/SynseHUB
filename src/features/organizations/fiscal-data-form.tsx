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
type Dados = {
  legalName: string | null
  taxId: string | null
  companyType: string | null
  postalCode: string | null
  address: string | null
  addressNumber: string | null
  district: string | null
  city: string | null
  state: string | null
  phone: string | null
  monthlyRevenue: number | null
}

export function FiscalDataForm({ dados }: { dados: Dados }) {
  const { legalName, taxId } = dados
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
            Aceita CPF de quem atua como autônomo. Este bloco inteiro é o que o provedor exige para
            abrir a conta de recebimento.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyType">Tipo de empresa</Label>
        <select
          id="companyType"
          name="companyType"
          defaultValue={dados.companyType ?? ''}
          className="focus-visible:ring-synse-primary/25 h-10 w-full rounded-lg border border-synse-border bg-synse-surface px-3 text-sm text-synse-text focus-visible:border-synse-primary focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">Selecione</option>
          <option value="MEI">MEI</option>
          <option value="LIMITED">Sociedade limitada (LTDA)</option>
          <option value="INDIVIDUAL">Empresário individual</option>
          <option value="ASSOCIATION">Associação</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo id="postalCode" rotulo="CEP" valor={dados.postalCode} exemplo="00000-000" />
        <div className="sm:col-span-2">
          <Campo
            id="address"
            rotulo="Logradouro"
            valor={dados.address}
            exemplo="Rua das Palmeiras"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo id="addressNumber" rotulo="Número" valor={dados.addressNumber} exemplo="128" />
        <Campo id="district" rotulo="Bairro" valor={dados.district} exemplo="Centro" />
        <Campo id="city" rotulo="Cidade" valor={dados.city} exemplo="São Paulo" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo
          id="state"
          rotulo="UF"
          valor={dados.state}
          exemplo="SP"
          erros={state.fieldErrors?.state}
        />
        <Campo
          id="phone"
          rotulo="Telefone"
          valor={dados.phone}
          exemplo="(11) 98888-7777"
          erros={state.fieldErrors?.phone}
        />
        <Campo
          id="monthlyRevenue"
          rotulo="Faturamento mensal"
          valor={dados.monthlyRevenue != null ? String(dados.monthlyRevenue) : null}
          exemplo="15000"
          erros={state.fieldErrors?.monthlyRevenue}
        />
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

/** Campo de texto simples, com erro abaixo quando houver. */
function Campo({
  id,
  rotulo,
  valor,
  exemplo,
  erros,
}: {
  id: string
  rotulo: string
  valor: string | null
  exemplo: string
  erros?: string[]
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={id} defaultValue={valor ?? ''} placeholder={exemplo} />
      {erros?.length ? (
        <p role="alert" className="text-xs text-synse-danger">
          {erros[0]}
        </p>
      ) : null}
    </div>
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
