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
 * Cadastro da academia.
 *
 * Já serviu também ao profissional independente, com outro vocabulário. Agora
 * o profissional entra como pessoa física e abre o espaço pelo perfil, depois
 * de assinar — então aqui sobrou um caminho só, e o texto pode ser direto.
 */
const ROTULOS = {
  nome: 'Nome da academia',
  exemplo: 'Academia Alpha',
  botao: 'Abrir minha academia',
} as const

export function OnboardingForm({ defaultOwnerName }: { defaultOwnerName: string }) {
  const rotulos = ROTULOS
  const [state, formAction] = useActionState(createOrganizationAction, initialState)

  return (
    <form action={formAction} className="space-y-4">
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
