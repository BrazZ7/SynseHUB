'use client'

import { TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { startPersonalAction } from '@/features/onboarding/actions'
import { initialOnboardingState } from '@/features/onboarding/state'

/**
 * Entrada da pessoa física.
 *
 * Um formulário no lugar de dois. Antes havia a porta "aluno", que exigia
 * código, e a porta "por conta própria", que não aceitava nenhum — e a pessoa
 * tinha de saber de antemão em qual delas cabia. Quem tinha o código na mão
 * mas escolheu errado não tinha onde digitá-lo; quem escolheu "aluno" sem
 * código ficava travado numa tela que não deixava passar.
 *
 * O código vira um campo opcional. Com ele, a matrícula nasce pendente na
 * academia; sem ele, a conta começa igual e o vínculo pode vir depois, pelo
 * perfil. É a mesma decisão adiada para quando ela é fácil de tomar.
 */
export function PersonalStartForm({ defaultName }: { defaultName: string }) {
  const [state, formAction] = useActionState(startPersonalAction, initialOnboardingState)

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

      <div className="space-y-1.5">
        <Label htmlFor="inviteCode">
          Código da academia <span className="font-normal text-synse-muted">(opcional)</span>
        </Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABC123"
          className="text-center text-lg font-semibold uppercase tracking-[0.3em]"
          maxLength={6}
        />
        <p className="text-xs text-synse-muted">
          Só se a sua academia usa o Synse e te passou um código. Sem ele você entra do mesmo jeito
          e pode vincular depois, no seu perfil.
        </p>
      </div>

      <ul className="space-y-1.5 rounded-lg bg-synse-surface-2 p-4 text-sm text-synse-muted">
        <li>· Treino base de corpo inteiro, pronto para hoje</li>
        <li>· Plano alimentar base, sem prescrição individual</li>
        <li>· Um desafio por mês, com medalha no fim</li>
      </ul>

      <SubmitButton />
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
