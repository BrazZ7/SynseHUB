'use client'

import { TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startSoloAction } from '@/features/onboarding/actions'
import { initialOnboardingState } from '@/features/onboarding/state'

/**
 * Entrada de quem não tem academia vinculada.
 *
 * Um campo só. Pedir mais aqui seria cobrar antes de entregar: a pessoa ainda
 * não viu nada do produto.
 */
export function SoloStartForm({ defaultName }: { defaultName: string }) {
  const [state, formAction] = useActionState(startSoloAction, initialOnboardingState)

  return (
    <form action={formAction} className="space-y-5" noValidate>
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
        <Label htmlFor="studentName">Seu nome</Label>
        <Input id="studentName" name="studentName" required defaultValue={defaultName} />
      </div>

      <ul className="space-y-1.5 rounded-lg bg-synse-surface-2 p-4 text-sm text-synse-muted">
        <li>· Treino base de corpo inteiro, pronto para hoje</li>
        <li>· Plano alimentar base, sem prescrição individual</li>
        <li>· Um desafio por mês, com medalha no fim</li>
      </ul>

      <SubmitButton />

      <p className="text-center text-xs text-synse-muted">
        Recebeu o código de uma academia depois? Dá para entrar nela sem perder nada disto.
      </p>
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Preparando…' : 'Começar'}
    </Button>
  )
}
