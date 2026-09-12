import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { cn, formatPercent } from '@/lib/utils'

type MetricCardProps = {
  label: string
  value: string
  /** Variação percentual em relação ao período anterior. */
  delta?: number
  deltaLabel?: string
  /** `true` quando cair é bom (ex.: inadimplência). */
  invertDelta?: boolean
  icon?: LucideIcon
  hint?: string
  accent?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}

const ACCENTS = {
  default: 'bg-synse-surface-2 text-synse-muted',
  primary: 'bg-synse-mint/50 text-synse-primary',
  success: 'bg-synse-success/12 text-synse-success',
  warning: 'bg-synse-warning/14 text-synse-warning',
  danger: 'bg-synse-danger/12 text-synse-danger',
} as const

export function MetricCard({
  label,
  value,
  delta,
  deltaLabel,
  invertDelta = false,
  icon: Icon,
  hint,
  accent = 'default',
  className,
}: MetricCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta)
  const positive = hasDelta && delta > 0
  const negative = hasDelta && delta < 0
  const good = invertDelta ? negative : positive
  const bad = invertDelta ? positive : negative

  const DeltaIcon = positive ? ArrowUpRight : negative ? ArrowDownRight : Minus

  return (
    <div
      className={cn(
        'group rounded-xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm transition-all duration-200 hover:shadow-synse',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-synse-muted">{label}</p>
        {Icon && (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105',
              ACCENTS[accent],
            )}
            aria-hidden
          >
            <Icon className="size-4.5" />
          </span>
        )}
      </div>

      <p className="mt-3 text-2xl font-semibold tracking-tight text-synse-text">{value}</p>

      {(hasDelta || hint) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                good && 'text-synse-success',
                bad && 'text-synse-danger',
                !good && !bad && 'text-synse-muted',
              )}
            >
              <DeltaIcon className="size-3.5" aria-hidden />
              {formatPercent(Math.abs(delta))}
            </span>
          )}
          <span className="text-synse-muted">{deltaLabel ?? hint}</span>
        </div>
      )}
    </div>
  )
}
