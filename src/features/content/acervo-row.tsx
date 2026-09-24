'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { deleteSynseContentAction } from '@/features/content/synse-actions'
import { initialContentState } from '@/features/content/state'

/**
 * Remover um item do acervo.
 *
 * Sem diálogo de confirmação, e de propósito: o acervo é pequeno, quem opera é
 * a própria plataforma, e o dado não some do mundo — um e-book removido volta
 * sendo publicado de novo. Confirmação aqui seria atrito sem risco atrás.
 */
export function AcervoRow({ contentId, titulo }: { contentId: string; titulo: string }) {
  const [state, formAction] = useActionState(deleteSynseContentAction, initialContentState)

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="contentId" value={contentId} />
      <Remover titulo={titulo} />
      {state.status === 'error' && (
        <p role="alert" className="mt-1 text-xs text-synse-danger">
          {state.message}
        </p>
      )}
    </form>
  )
}

function Remover({ titulo }: { titulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Remover ${titulo} do acervo`}
    >
      {pending ? 'Removendo…' : 'Remover'}
    </Button>
  )
}
