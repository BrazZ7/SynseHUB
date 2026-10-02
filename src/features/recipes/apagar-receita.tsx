'use client'

import { Loader2, Trash2 } from 'lucide-react'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { apagarReceitaAction } from '@/features/recipes/admin-actions'
import { recipeAdminInicial } from '@/features/recipes/admin-state'

/**
 * Apagar a receita.
 *
 * Existe como componente, e não só como action, porque é essa a diferença
 * entre uma porta e um corredor sem porta: `apagarProgramaAction` foi escrita
 * na 0043 e nenhuma tela a chama até hoje — uma escrita que passou nos testes
 * e nunca chegou a quem precisava dela.
 */
export function ApagarReceita({ recipeId }: { recipeId: string }) {
  const [state, formAction] = useActionState(apagarReceitaAction, recipeAdminInicial)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="recipeId" value={recipeId} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}
      <Enviar />
    </form>
  )
}

function Enviar() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-4" aria-hidden />
      )}
      {pending ? 'Apagando…' : 'Apagar receita'}
    </Button>
  )
}
