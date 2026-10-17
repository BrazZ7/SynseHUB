'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CalendarClock, ExternalLink } from 'lucide-react'

import { StudentAvatar } from '@/components/synse/student-avatar'
import { AvancarEtapa, Converter, Perder, Registrar } from '@/features/crm/lead-actions'
import { PROXIMA } from '@/features/crm/state'
import { SOURCE_LABELS, STAGE_LABELS } from '@/lib/validations/lead'
import { cn, formatDate, formatPhone } from '@/lib/utils'
import type { Lead, LeadStage, MembershipPlan } from '@/types/domain'

/**
 * O funil, em colunas.
 *
 * Sem arrastar-e-soltar de propósito. Arrastar num celular na recepção é
 * impreciso e não tem como registrar o motivo da perda — e é o motivo que
 * explica a taxa de conversão depois. Cada cartão traz o próximo passo como
 * botão, que funciona no toque e no teclado.
 */

/** As colunas do quadro. Matriculado e Perdido ficam fora: são destinos. */
const COLUNAS: LeadStage[] = ['NEW', 'CONTACTED', 'TRIAL_CLASS', 'PROPOSAL']

export function LeadBoard({ leads, plans }: { leads: Lead[]; plans: MembershipPlan[] }) {
  const [aberto, setAberto] = useState<string | null>(null)

  return (
    <div className="synse-scroll overflow-x-auto pb-2">
      <div className="grid min-w-[900px] grid-cols-4 gap-3">
        {COLUNAS.map((etapa) => {
          const daEtapa = leads.filter((lead) => lead.stage === etapa)

          return (
            <section key={etapa} className="space-y-2">
              <header className="flex items-center justify-between rounded-lg bg-synse-surface-2 px-2.5 py-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-synse-text">
                  {STAGE_LABELS[etapa]}
                </h2>
                <span className="text-xs tabular-nums text-synse-muted">{daEtapa.length}</span>
              </header>

              {daEtapa.length === 0 ? (
                <p className="rounded-lg border border-dashed border-synse-border px-2 py-6 text-center text-xs text-synse-muted">
                  Vazio
                </p>
              ) : (
                daEtapa.map((lead) => (
                  <CartaoLead
                    key={lead.id}
                    lead={lead}
                    plans={plans}
                    aberto={aberto === lead.id}
                    onAlternar={() => setAberto(aberto === lead.id ? null : lead.id)}
                  />
                ))
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CartaoLead({
  lead,
  plans,
  aberto,
  onAlternar,
}: {
  lead: Lead
  plans: MembershipPlan[]
  aberto: boolean
  onAlternar: () => void
}) {
  const proxima = PROXIMA[lead.stage]
  const vencido = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()

  return (
    <article
      className={cn(
        'rounded-xl border bg-synse-surface p-3 transition-shadow hover:shadow-synse',
        vencido ? 'border-synse-warning/50' : 'border-synse-border',
      )}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2.5 text-left"
      >
        <StudentAvatar name={lead.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-synse-text">{lead.name}</span>
          <span className="block truncate text-xs text-synse-muted">
            {SOURCE_LABELS[lead.source]}
            {lead.phone && ` · ${formatPhone(lead.phone)}`}
          </span>
        </span>
      </button>

      {lead.nextFollowUpAt && (
        <p
          className={cn(
            'mt-2 flex items-center gap-1 text-xs',
            vencido ? 'font-medium text-synse-warning' : 'text-synse-muted',
          )}
        >
          <CalendarClock className="size-3.5" aria-hidden />
          {vencido ? 'Atrasado desde ' : 'Retornar em '}
          {formatDate(lead.nextFollowUpAt)}
        </p>
      )}

      {aberto && (
        <div className="mt-3 space-y-3 border-t border-synse-border pt-3">
          {lead.notes && <p className="text-xs text-synse-muted">{lead.notes}</p>}

          {/*
            A porta da ficha. O cartão resolve o passo seguinte sem sair do
            quadro — é o que a recepção faz o dia inteiro —, e quem precisa do
            histórico de contatos abre aqui.
          */}
          <Link
            href={`/crm/${lead.id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-synse-primary hover:underline"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Abrir ficha e histórico
          </Link>

          {proxima && <AvancarEtapa leadId={lead.id} proxima={proxima} />}
          <Registrar leadId={lead.id} />
          <Converter lead={lead} plans={plans} />
          <Perder leadId={lead.id} />
        </div>
      )}
    </article>
  )
}
