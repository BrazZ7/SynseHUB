'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { cn } from '@/lib/utils'

export type FilterOption = {
  value: string
  label: string
  count?: number
}

type FilterBarProps = {
  paramName: string
  options: FilterOption[]
  defaultValue?: string
  className?: string
  'aria-label': string
}

/** Chips de filtro ligados à URL — sem estado duplicado no cliente. */
export function FilterBar({
  paramName,
  options,
  defaultValue = 'ALL',
  className,
  'aria-label': ariaLabel,
}: FilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const active = searchParams.get(paramName) ?? defaultValue

  function apply(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === defaultValue) params.delete(paramName)
    else params.set(paramName, value)
    params.delete('page')
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'synse-scroll flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5',
        isPending && 'opacity-70',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === active
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => apply(option.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
              selected
                ? 'bg-synse-dark text-white shadow-synse-sm dark:bg-synse-primary'
                : 'bg-synse-surface-2 text-synse-muted hover:bg-synse-mint/40 hover:text-synse-dark',
            )}
          >
            {option.label}
            {typeof option.count === 'number' && (
              <span className={cn('tabular-nums', selected ? 'text-white/70' : 'text-synse-muted/70')}>
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
