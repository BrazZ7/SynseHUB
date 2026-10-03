'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, FilePlus } from 'lucide-react'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import {
  newNutritionVersionAction,
  publishNutritionPlanAction,
} from '@/features/nutrition/actions'
import { initialNutritionState } from '@/features/nutrition/state'
import type { NutritionPlanStatus } from '@/types/domain'

/** Publicar e abrir versão nova. Duas ações, cada uma com o próprio estado. */
export function PlanActions({ planId, status }: { planId: string; status: NutritionPlanStatus }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {status === 'DRAFT' && <Publicar planId={planId} />}
      {status === 'PUBLISHED' && <NovaVersao planId={planId} />}
    </div>
  )
}

function Publicar({ planId }: { planId: string }) {
  const [state, formAction] = useActionState(publishNutritionPlanAction, initialNutritionState)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="planId" value={planId} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}
      <Botao rotulo="Publicar para o aluno" pendente="Publicando…" icone={<CheckCircle2 className="size-4" aria-hidden />} />
      <p className="text-xs text-synse-muted">
        Arquiva o plano anterior deste aluno e envia o aviso no app.
      </p>
    </form>
  )
}

function NovaVersao({ planId }: { planId: string }) {
  const [state, formAction] = useActionState(newNutritionVersionAction, initialNutritionState)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="planId" value={planId} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}
      <Botao
        rotulo="Abrir nova versão"
        pendente="Abrindo…"
        variante="outline"
        icone={<FilePlus className="size-4" aria-hidden />}
      />
      {/*
        Editar o publicado mudaria por baixo o que o aluno está seguindo hoje —
        e apagaria o que foi prescrito antes.
      */}
      <p className="text-xs text-synse-muted">
        Copia as refeições para um rascunho. O plano atual continua valendo até você publicar o novo.
      </p>
    </form>
  )
}

function Botao({
  rotulo,
  pendente,
  variante,
  icone,
}: {
  rotulo: string
  pendente: string
  variante?: 'outline'
  icone: React.ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant={variante} className="w-full">
      {pending ? pendente : (<>{icone}{rotulo}</>)}
    </Button>
  )
}
