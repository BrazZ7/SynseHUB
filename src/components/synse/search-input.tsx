'use client'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type SearchInputProps = {
  placeholder?: string
  /** Nome do parâmetro na URL — a busca é server-side. */
  paramName?: string
  className?: string
}

/**
 * Busca com debounce que grava na URL.
 * Estado na URL: o filtro é compartilhável, sobrevive ao refresh e o
 * carregamento acontece no servidor.
 */
export function SearchInput({
  placeholder = 'Buscar…',
  paramName = 'q',
  className,
}: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(searchParams.get(paramName) ?? '')

  useEffect(() => {
    const current = searchParams.get(paramName) ?? ''
    if (current === value) return

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(paramName, value)
      else params.delete(paramName)
      params.delete('page')
      startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
    }, 300)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-synse-muted"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Limpar busca"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-synse-muted transition-colors hover:text-synse-text"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
