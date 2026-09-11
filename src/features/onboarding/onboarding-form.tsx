'use client'

import { TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createOrganizationAction } from '@/features/onboarding/actions'
import type { OnboardingState } from '@/features/onboarding/state'

const initialState: OnboardingState = {}

/**
 * Academia e profissional preenchem os mesmos campos — o que muda é o nome das
 * coisas. Um estúdio de personal não se reconhece em "nome da academia", e essa
 * estranheza no primeiro minuto de uso custa mais do que parece.
 */
const ROTULOS = {
  academia: { nome: 'Nome da academia', exemplo: 'Academia Alpha', botao: 'Abrir minha academia' },
  profissional: {
    nome: 'Nome do seu espaço',
    exemplo: 'Studio Ana Ribeiro',
    botao: 'Abrir meu espaço',
  },
} as const

export function OnboardingForm({
  defaultOwnerName,
  accountType,
}: {
  defaultOwnerName: string
  accountType: 'academia' | 'profissional'
}) {
  const rotulos = ROTULOS[accountType]
  const [state, formAction] = useActionState(createOrganizationAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="accountType" value={accountType} />
      {state.error && (
        <p
          role="alert"
          className="bg-synse-danger/10 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="org-name">{rotulos.nome}</Label>
        <Input id="org-name" name="name" required placeholder={rotulos.exemplo} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="owner-name">Seu nome</Label>
        <Input
          id="owner-name"
          name="ownerName"
          required
          defaultValue={defaultOwnerName}
          autoComplete="name"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="org-city">Cidade</Label>
          <Input id="org-city" name="city" placeholder="São Paulo" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-state">Estado</Label>
          <Input id="org-state" name="state" maxLength={2} placeholder="SP" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-legal">
          Razão social <span className="font-normal text-synse-muted">(opcional)</span>
        </Label>
        <Input id="org-legal" name="legalName" placeholder="Alpha Saúde e Performance LTDA" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-tax">
          CNPJ <span className="font-normal text-synse-muted">(opcional)</span>
        </Label>
        <Input id="org-tax" name="taxId" inputMode="numeric" placeholder="00.000.000/0000-00" />
        <p className="text-xs text-synse-muted">
          Pode deixar em branco agora. Será exigido para receber pagamentos pelo Synse Pay.
        </p>
      </div>

      <SubmitButton rotulo={rotulos.botao} />
    </form>
  )
}

function SubmitButton({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="gradient" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Criando…' : rotulo}
    </Button>
  )
}
