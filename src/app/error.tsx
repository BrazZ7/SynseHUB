'use client'

import { RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Erro de aplicação. O usuário lê uma frase humana; o detalhe técnico fica no
 * console do servidor e no serviço de observabilidade.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[synse] unhandled error', { digest: error.digest, message: error.message })
  }, [error])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-synse-bg px-6 text-center">
      <span
        className="flex size-14 items-center justify-center rounded-2xl bg-synse-warning/14 text-synse-warning"
        aria-hidden
      >
        <TriangleAlert className="size-6" />
      </span>
      <div className="space-y-2">
        <h1 className="text-subtitle font-semibold text-synse-text">
          Não foi possível concluir esta operação
        </h1>
        <p className="max-w-md text-sm text-synse-muted">
          Algo saiu do esperado ao carregar esta página. Tente novamente — se continuar, nossa
          equipe já recebeu o registro do problema.
        </p>
        {error.digest && (
          <p className="text-xs text-synse-muted/70">Referência do erro: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset}>
        <RotateCcw className="size-4" />
        Tentar novamente
      </Button>
    </div>
  )
}
