'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { ArrowRight, Phone, UserCheck } from 'lucide-react'

import { Feedback, SELECT_CLASS } from '@/components/synse/form-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addLeadNoteAction, convertLeadAction, moveLeadStageAction } from '@/features/crm/actions'
import { initialCrmState } from '@/features/crm/state'
import { STAGE_LABELS } from '@/lib/validations/lead'
import type { Lead, LeadStage, MembershipPlan } from '@/types/domain'

/**
 * ── O que dá para fazer com um lead ─────────────────────────────────────────
 *
 * Avançar a etapa, registrar um contato, converter em aluno e marcar como
 * perdido. Moravam dentro do `lead-board`, e saíram daqui quando a ficha
 * passou a existir: as mesmas quatro ações precisam estar nos dois lugares, e
 * duas cópias de um formulário que converte lead em aluno divergem — a
 * segunda esquece o `requirePermission` que a primeira tinha, ou para numa
 * versão antiga da mensagem.
 *
 * O `leadId` vai em campo escondido, e **o servidor não confia nele**: cada
 * action refaz `getLead(session.organizationId, leadId)` antes de escrever, e
 * a RLS (`leads_staff`, 0028) confere de novo. Trocar o valor no inspetor
 * alcança, no máximo, um lead da própria academia.
 */

export function AvancarEtapa({ leadId, proxima }: { leadId: string; proxima: LeadStage }) {
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

export function Registrar({ leadId }: { leadId: string }) {
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

export function Converter({ lead, plans }: { lead: Lead; plans: MembershipPlan[] }) {
  const [state, formAction] = useActionState(convertLeadAction, initialCrmState)

  if (lead.convertedStudentId) {
    return <Badge variant="success">Já é aluno</Badge>
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-synse-success/30 p-2.5">
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
        Cria o aluno e a mensalidade de uma vez. É esta ação que matricula — arrastar o cartão não.
      </p>
    </form>
  )
}

export function Perder({ leadId }: { leadId: string }) {
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
