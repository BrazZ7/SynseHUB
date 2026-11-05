'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'

import { alternarFavoritoAction } from '@/features/content/favoritos-actions'
import { cn } from '@/lib/utils'

/**
 * O coração.
 *
 * ── Por que ele não é um elo dentro de um elo ───────────────────────────────
 *
 * O cartão inteiro já é um `<Link>`, e botão dentro de elo é HTML inválido —
 * o mesmo problema que tirou o "Abrir" do cartão de conteúdo. A solução aqui é
 * o botão ficar **fora** do elo, no canto do cartão, com o elo ocupando o
 * resto. `stopPropagation` e `preventDefault` não bastariam: um leitor de tela
 * continuaria anunciando um alvo dentro do outro.
 *
 * ── Otimista, e volta atrás quando o servidor recusa ────────────────────────
 *
 * O coração acende no toque. Se a gravação falhar — sessão caída, item que
 * deixou de ser visível —, ele volta ao estado anterior. Mostrar "guardado" e
 * não ter guardado é a pior das três opções.
 */
export function BotaoFavorito({
  contentId,
  recipeId,
  inicial,
  titulo,
  className,
}: {
  contentId?: string
  recipeId?: string
  inicial: boolean
  /** Para o rótulo acessível dizer **o quê** está sendo guardado. */
  titulo: string
  className?: string
}) {
  const [guardado, setGuardado] = useState(inicial)
  const [gravando, iniciar] = useTransition()

  const alternar = () => {
    const anterior = guardado
    setGuardado(!anterior)

    iniciar(async () => {
      const resposta = await alternarFavoritoAction(
        contentId ? { contentId } : { recipeId },
      )
      // A verdade do servidor manda: `guardado` quando ele respondeu, e o
      // estado anterior quando ele recusou.
      if (!resposta.ok) setGuardado(anterior)
      else if (typeof resposta.guardado === 'boolean') setGuardado(resposta.guardado)
    })
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={gravando}
      aria-pressed={guardado}
      aria-label={guardado ? `Esquecer ${titulo}` : `Guardar ${titulo}`}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
        'hover:bg-synse-surface-2 disabled:opacity-60',
        guardado ? 'text-synse-primary' : 'text-synse-muted',
        className,
      )}
    >
      <Heart className={cn('size-5', guardado && 'fill-current')} aria-hidden />
    </button>
  )
}
