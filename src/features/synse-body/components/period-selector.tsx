'use client'

import Link from 'next/link'

import { PERIODOS } from '@/features/synse-body/state'
import { cn } from '@/lib/utils'
import type { BodyPeriod } from '@/types/domain'

/**
 * As janelas do histórico.
 *
 * Links e não botões: o período vive na URL, então voltar no navegador
 * funciona, o link é compartilhável, e a página continua sendo renderizada no
 * servidor — sem nenhum estado de cliente para sincronizar.
 */
export function PeriodSelector({ atual, base = '/app/corpo' }: { atual: BodyPeriod; base?: string }) {
  return (
    <nav
      aria-label="Período do histórico"
      className="flex gap-1 overflow-x-auto rounded-lg border border-synse-border bg-synse-surface p-1"
    >
      {PERIODOS.map((periodo) => (
        <Link
          key={periodo.valor}
          href={`${base}?periodo=${periodo.valor}`}
          aria-current={periodo.valor === atual ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            periodo.valor === atual
              ? 'bg-synse-primary text-white'
              : 'text-synse-muted hover:bg-synse-bg hover:text-synse-text',
          )}
        >
          {periodo.rotulo}
        </Link>
      ))}
    </nav>
  )
}
