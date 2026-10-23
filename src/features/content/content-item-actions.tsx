'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Send, Trash2 } from 'lucide-react'

import { Feedback } from '@/components/synse/form-field'
import { Button } from '@/components/ui/button'
import { deleteContentAction, publishContentAction } from '@/features/content/actions'
import { initialContentState } from '@/features/content/state'

/** Publicar agora e apagar. Estados separados: uma falha não apaga a outra. */
export function ContentItemActions({
  contentId,
  publicado,
}: {
  contentId: string
  publicado: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {!publicado && <PublicarAgora contentId={contentId} />}
      <Apagar contentId={contentId} />
    </div>
  )
}

function PublicarAgora({ contentId }: { contentId: string }) {
  const [state, formAction] = useActionState(publishContentAction, initialContentState)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="contentId" value={contentId} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}
      <Botao rotulo="Publicar agora" pendente="Publicando…" icone={<Send className="size-4" aria-hidden />} />
    </form>
  )
}

function Apagar({ contentId }: { contentId: string }) {
  const [state, formAction] = useActionState(deleteContentAction, initialContentState)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="contentId" value={contentId} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}
      <Botao
        rotulo="Apagar"
        pendente="Apagando…"
        variante="outline"
        icone={<Trash2 className="size-4" aria-hidden />}
      />
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
