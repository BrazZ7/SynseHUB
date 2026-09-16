import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type ChartCardProps = {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ title, description, action, children, className }: ChartCardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm',
        className,
      )}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-synse-text">{title}</h2>
          {description && <p className="text-xs text-synse-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
