import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  tone?: 'neutral' | 'positive'
  className?: string
}

/**
 * Nenhuma tabela vazia fica sem contexto. Quando o vazio é boa notícia
 * (`tone="positive"`), a peça comemora em vez de sugerir que falta algo.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-2xl',
            tone === 'positive' ? 'bg-synse-success/12 text-synse-success' : 'bg-synse-surface-2 text-synse-muted',
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-synse-text">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-synse-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
