import { cn } from '@/lib/utils'

export type LegendItem = {
  label: string
  color: string
  /** Marcadores diferentes reforçam a identidade sem depender da cor. */
  shape?: 'area' | 'bar' | 'line'
}

/**
 * Legenda sempre presente quando há duas ou mais séries.
 * A identidade nunca depende só da cor: forma do marcador + rótulo.
 */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-synse-muted">
          <span
            aria-hidden
            className={cn(
              'shrink-0',
              item.shape === 'line' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-[3px]',
            )}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
