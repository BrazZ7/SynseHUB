'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * O código que o aluno digita para entrar.
 *
 * Fica visível e copiável porque o uso real é compartilhar: colar no grupo do
 * WhatsApp, imprimir num cartaz, ditar na recepção. Um código escondido em
 * submenu não é compartilhado, e a porta de entrada do aluno não existe.
 */
export function InviteCodeCard({ code }: { code: string | null }) {
  const [copiado, setCopiado] = useState(false)

  if (!code) {
    return (
      <p className="text-sm text-synse-muted">
        O código será gerado na próxima atualização desta academia.
      </p>
    )
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(code!)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Área de transferência bloqueada pelo navegador: o código está à vista
      // de qualquer forma, e selecionar à mão continua funcionando.
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-lg border border-synse-border bg-synse-bg px-4 py-2.5 text-xl font-semibold tracking-[0.3em] text-synse-text">
          {code}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copiar}>
          {copiado ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p className="text-xs text-synse-muted">
        Quem entrar com este código aparece como matrícula pendente, para você confirmar.
        Compartilhe só com quem já é aluno.
      </p>
    </div>
  )
}
