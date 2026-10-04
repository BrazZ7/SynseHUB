'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { estadoDaPaginacao } from '@/components/synse/pagination-state'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
}

/** Paginação server-side: listas grandes nunca são carregadas de uma vez. */
export function Pagination({ page, pageSize, total }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const estado = estadoDaPaginacao(page, pageSize, total)

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextPage <= 1) params.delete('page')
    else params.set('page', String(nextPage))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  if (estado.tipo === 'oculta') return null

  /*
   * A página pedida não existe: lista que encolheu, link velho, `?page=` na
   * mão. Antes a barra simplesmente não aparecia — e a pessoa ficava olhando
   * uma seção vazia sem botão de voltar, sem saber que estava fora da lista.
   */
  if (estado.tipo === 'fora_da_faixa') {
    return (
      <nav
        aria-label="Paginação"
        className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm"
      >
        <p className="text-synse-muted">
          Esta página não existe mais — a lista tem {formatNumber(total)}{' '}
          {total === 1 ? 'item' : 'itens'}.
        </p>
        <Button variant="outline" size="sm" onClick={() => goTo(estado.ultimaPagina)}>
          <ChevronLeft className="size-4" />
          Voltar ao início
        </Button>
      </nav>
    )
  }

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm"
    >
      <p className="text-synse-muted">
        {formatNumber(estado.de)}–{formatNumber(estado.ate)} de {formatNumber(total)}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>
        <span className="px-1 text-xs text-synse-muted" aria-current="page">
          {page} / {estado.totalPaginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= estado.totalPaginas}
          onClick={() => goTo(page + 1)}
          aria-label="Próxima página"
        >
          Próxima
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  )
}
