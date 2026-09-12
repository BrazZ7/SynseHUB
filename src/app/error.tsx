'use client'

import { RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

type Detalhe = {
  at: string
  path: string
  digest: string | null
  message: string
  frames: string[]
}

/**
 * Erro de aplicação.
 *
 * A frase de cima é para quem usa o produto. O bloco de baixo é para quem o
 * mantém, e só aparece quando o servidor tem algo a dizer sobre **este** erro,
 * para **esta** conta.
 *
 * Ele existe porque a referência sozinha não resolve nada: o outro lado dela
 * mora no log da Vercel, fora do alcance de quem opera pelo navegador. A
 * alternativa — pedir para a pessoa abrir outra URL depois — perde a corrida
 * contra o tempo, porque o registro vive na memória da instância e a navegação
 * seguinte pode cair em outra. Buscar aqui, no instante do erro, é a melhor
 * chance de pegar a mesma.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)

  useEffect(() => {
    console.error('[synse] unhandled error', { digest: error.digest, message: error.message })

    let ativo = true
    fetch('/api/health/errors', { cache: 'no-store' })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados: { erros?: Detalhe[] } | null) => {
        if (!ativo || !dados?.erros?.length) return
        // Casa pela digest quando ela existe; senão, o mais recente da conta.
        const alvo = dados.erros.find((item) => item.digest === error.digest) ?? dados.erros[0]
        setDetalhe(alvo ?? null)
      })
      .catch(() => {
        // Diagnóstico não pode atrapalhar: sem detalhe, a tela segue como era.
      })

    return () => {
      ativo = false
    }
  }, [error])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-synse-bg px-6 text-center">
      <span
        className="bg-synse-warning/14 flex size-14 items-center justify-center rounded-2xl text-synse-warning"
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
          <p className="text-synse-muted/70 text-xs">Referência do erro: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset}>
        <RotateCcw className="size-4" />
        Tentar novamente
      </Button>

      {detalhe && (
        <details className="w-full max-w-2xl rounded-xl border border-synse-border bg-synse-surface p-4 text-left">
          <summary className="cursor-pointer text-xs font-medium text-synse-muted">
            Detalhe técnico (visível só para você)
          </summary>
          <p className="mt-3 break-words font-mono text-xs text-synse-text">{detalhe.message}</p>
          <p className="mt-2 font-mono text-[11px] text-synse-muted">{detalhe.path}</p>
          {detalhe.frames.length > 0 && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-synse-muted">
              {detalhe.frames.join('\n')}
            </pre>
          )}
        </details>
      )}
    </div>
  )
}
