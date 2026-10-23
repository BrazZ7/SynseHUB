'use client'

import type { TooltipContentProps } from 'recharts'

import { cn } from '@/lib/utils'

/**
 * `Partial` de propósito: quem monta o elemento é o JSX do gráfico, e o
 * Recharts injeta `active`, `payload` e `label` só na hora de renderizar.
 */
type SynseTooltipProps = Partial<TooltipContentProps<number, string>> & {
  formatValue?: (value: number) => string
  className?: string
}

/**
 * Tooltip padrão dos gráficos.
 * O valor usa tokens de texto; a cor da série aparece apenas no marcador —
 * nunca no número, para não competir com a leitura.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue = (value) => String(value),
  className,
}: SynseTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        'rounded-lg border border-synse-border bg-synse-surface px-3 py-2 shadow-synse-lg',
        className,
      )}
      role="tooltip"
    >
      <p className="mb-1.5 text-xs font-semibold capitalize text-synse-text">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-synse-muted">{entry.name}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums text-synse-text">
              {formatValue(Number(entry.value ?? 0))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
