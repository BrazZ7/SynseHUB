import type { ReactNode } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Colunas secundárias somem em telas estreitas. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  align?: 'left' | 'right'
  className?: string
}

type DataTableProps<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty: ReactNode
  caption?: string
  className?: string
}

const HIDE_CLASSES = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const

/** Tabela do SynseHub: responsiva por colunas, nunca por scroll horizontal cego. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-synse-border bg-synse-surface">{empty}</div>
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-synse-border bg-synse-surface shadow-synse-sm',
        className,
      )}
    >
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow className="bg-synse-surface-2/60 hover:bg-synse-surface-2/60">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  column.hideBelow && HIDE_CLASSES[column.hideBelow],
                  column.align === 'right' && 'text-right',
                  column.className,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    column.hideBelow && HIDE_CLASSES[column.hideBelow],
                    column.align === 'right' && 'text-right',
                    column.className,
                  )}
                >
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
