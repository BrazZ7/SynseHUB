'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { deleteSynseContentAction } from '@/features/content/synse-actions'
import { initialContentState } from '@/features/content/state'

/**
 * Editar e remover um item do acervo.
 *
 * Sem diálogo de confirmação no remover, e de propósito: o acervo é pequeno,
 * quem opera é a própria plataforma, e o item não some do mundo — um e-book
 * removido volta sendo publicado de novo. Confirmação aqui seria atrito sem
 * risco atrás.
 *
 * `aposRemover` existe porque a mesma peça serve duas telas. Na lista, remover
 * só apaga a linha e a pessoa continua onde está. Na tela de edição, a página
 * inteira passa a apontar para um item que não existe mais — ficar ali seria
 * um 404 esperando o próximo clique.
 */
export function AcervoRow({
  contentId,
  titulo,
  aposRemover,
}: {
  contentId: string
  titulo: string
  aposRemover?: string
}) {
  const [state, formAction] = useActionState(deleteSynseContentAction, initialContentState)
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'success' && aposRemover) router.push(aposRemover)
  }, [state.status, aposRemover, router])

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button size="sm" variant="ghost" asChild>
        <Link href={`/synse-admin/acervo/${contentId}`} aria-label={`Editar ${titulo}`}>
          Editar
        </Link>
      </Button>
      <form action={formAction}>
        <input type="hidden" name="contentId" value={contentId} />
        <Remover titulo={titulo} />
        {state.status === 'error' && (
          <p role="alert" className="mt-1 text-xs text-synse-danger">
            {state.message}
          </p>
        )}
      </form>
    </div>
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
