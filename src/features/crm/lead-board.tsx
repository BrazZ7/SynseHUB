'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, CalendarClock, Phone, UserCheck } from 'lucide-react'

import { Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addLeadNoteAction,
  convertLeadAction,
  moveLeadStageAction,
} from '@/features/crm/actions'
import { initialCrmState } from '@/features/crm/state'
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

/** O passo seguinte de cada etapa. */
const PROXIMA: Partial<Record<LeadStage, LeadStage>> = {
  NEW: 'CONTACTED',
  CONTACTED: 'TRIAL_CLASS',
  TRIAL_CLASS: 'PROPOSAL',
}

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

          {proxima && <AvancarEtapa leadId={lead.id} proxima={proxima} />}
          <Registrar leadId={lead.id} />
          <Converter lead={lead} plans={plans} />
          <Perder leadId={lead.id} />
        </div>
      )}
    </article>
  )
}

function AvancarEtapa({ leadId, proxima }: { leadId: string; proxima: LeadStage }) {
  const [state, formAction] = useActionState(moveLeadStageAction, initialCrmState)

  return (
    <form action={formAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stage" value={proxima} />
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}
      <Botao variante="default" className="w-full">
        <ArrowRight className="size-4" aria-hidden />
        Mover para {STAGE_LABELS[proxima]}
      </Botao>
    </form>
  )
}

function Registrar({ leadId }: { leadId: string }) {
  const [state, formAction] = useActionState(addLeadNoteAction, initialCrmState)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}
      <div className="flex gap-2">
        <select name="kind" defaultValue="CALL" className={SELECT_CLASS} aria-label="Tipo">
          <option value="CALL">Ligação</option>
          <option value="MESSAGE">Mensagem</option>
          <option value="VISIT">Visita</option>
          <option value="NOTE">Observação</option>
        </select>
      </div>
      <Input name="body" maxLength={600} placeholder="O que aconteceu" aria-label="Descrição" />
      <Botao variante="outline" className="w-full">
        <Phone className="size-4" aria-hidden />
        Registrar contato
      </Botao>
    </form>
  )
}

function Converter({ lead, plans }: { lead: Lead; plans: MembershipPlan[] }) {
  const [state, formAction] = useActionState(convertLeadAction, initialCrmState)

  if (lead.convertedStudentId) {
    return <Badge variant="success">Já é aluno</Badge>
  }

  return (
    <form action={formAction} className="border-synse-success/30 space-y-2 rounded-lg border p-2.5">
      <input type="hidden" name="leadId" value={lead.id} />
      {state.status !== 'idle' && (
        <Feedback
          tone={state.status === 'success' ? 'success' : 'error'}
          message={state.message ?? ''}
        />
      )}

      <select name="planId" defaultValue="" className={SELECT_CLASS} aria-label="Plano">
        <option value="">Sem plano por enquanto</option>
        {plans.map((plano) => (
          <option key={plano.id} value={plano.id}>
            {plano.name}
          </option>
        ))}
      </select>
      <Input
        name="billingDay"
        type="number"
        min="1"
        max="28"
        defaultValue="5"
        aria-label="Dia do vencimento"
        placeholder="Dia do vencimento"
      />
      <Botao variante="default" className="w-full">
        <UserCheck className="size-4" aria-hidden />
        Converter em aluno
      </Botao>
      <p className="text-[11px] text-synse-muted">
        Cria o aluno e a mensalidade de uma vez. É esta ação que matricula — arrastar o cartão
        não.
      </p>
    </form>
  )
}

function Perder({ leadId }: { leadId: string }) {
  const [state, formAction] = useActionState(moveLeadStageAction, initialCrmState)

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stage" value="LOST" />
      {state.status === 'error' && <Feedback tone="error" message={state.message ?? ''} />}
      <Input
        name="lostReason"
        maxLength={200}
        placeholder="Motivo (entra no histórico)"
        aria-label="Motivo da perda"
      />
      <Botao variante="ghost" className="w-full text-synse-muted">
        Marcar como perdido
      </Botao>
    </form>
  )
}

function Botao({
  children,
  variante,
  className,
}: {
  children: React.ReactNode
  variante: 'default' | 'outline' | 'ghost'
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variante} disabled={pending} className={className}>
      {pending ? 'Salvando…' : children}
    </Button>
  )
}

