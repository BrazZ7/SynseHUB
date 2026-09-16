'use client'

import { ChevronRight, Info } from 'lucide-react'
import { useTransition } from 'react'

import { signInWithDemoPersona } from '@/lib/auth/actions'
import { ROLE_LABELS } from '@/lib/permissions/permissions'
import { cn, initials } from '@/lib/utils'
import type { DemoPersona } from '@/lib/auth/session'

/**
 * Entrada em modo de demonstração.
 *
 * Só aparece quando não há Supabase configurado. Não existe senha nem conta
 * real: a persona escolhida vira uma sessão em cookie, e cada perfil enxerga
 * exatamente o que o seu papel permite — inclusive as restrições.
 */
export function DemoPersonaPicker({ personas }: { personas: DemoPersona[] }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-4">
      <div className="bg-synse-mint/40 flex items-start gap-2.5 rounded-lg p-3 text-sm text-synse-dark">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Nenhum banco de dados conectado. Escolha um perfil para explorar o produto com dados de
          demonstração — as permissões de cada função valem normalmente.
        </p>
      </div>

      <ul className="space-y-2">
        {personas.map((persona) => (
          <li key={persona.key}>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => void signInWithDemoPersona(persona.key))}
              className={cn(
                'group flex w-full items-center gap-3 rounded-xl border border-synse-border bg-synse-surface p-3 text-left transition-all duration-200',
                'hover:border-synse-primary/40 hover:shadow-synse disabled:opacity-60',
              )}
            >
              <span
                className="bg-synse-mint/60 flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-synse-dark"
                aria-hidden
              >
                {initials(persona.label)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-synse-text">
                  {persona.label}
                </span>
                <span className="block truncate text-xs text-synse-muted">
                  {persona.description}
                </span>
              </span>
              <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wide text-synse-muted sm:block">
                {ROLE_LABELS[persona.role]}
              </span>
              <ChevronRight className="size-4 shrink-0 text-synse-muted transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
