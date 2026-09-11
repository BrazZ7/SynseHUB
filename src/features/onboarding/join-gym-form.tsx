'use client'

import { TriangleAlert } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { joinGymAction } from '@/features/onboarding/actions'
import { initialOnboardingState } from '@/features/onboarding/state'

/**
 * Entrada do aluno pelo código da academia.
 *
 * Um campo só, de propósito: o aluno acabou de criar a conta e está a um passo
 * de ver o app. Tudo que puder ser perguntado depois, é perguntado depois.
 */
export function JoinGymForm({ defaultName }: { defaultName: string }) {
  const [state, formAction] = useActionState(joinGymAction, initialOnboardingState)

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
        <Label htmlFor="inviteCode">Código da academia</Label>
        <Input
          id="inviteCode"
          name="inviteCode"
          required
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABC123"
          className="text-center text-lg font-semibold uppercase tracking-[0.3em]"
          maxLength={6}
        />
        <p className="text-xs text-synse-muted">
          A academia te passa esse código. Se ainda não tem, peça na recepção.
        </p>
      </div>

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar na academia'}
    </Button>
  )
}
