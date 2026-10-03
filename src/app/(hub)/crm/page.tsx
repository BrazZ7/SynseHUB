import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, KanbanSquare, Plus, TrendingUp, UserCheck, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LeadBoard } from '@/features/crm/lead-board'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { SOURCE_LABELS, STAGE_LABELS } from '@/lib/validations/lead'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'CRM' }

export default async function CrmPage() {
  const session = await requireHubSession('crm:read')
  const dataSource = await getDataSource()

  const [leads, plans] = await Promise.all([
    dataSource.listLeads(session.organizationId),
    dataSource.listPlans(session.organizationId),
  ])

  const canWrite = can(session.role, 'crm:write')
  const agora = new Date()

  const abertos = leads.filter((lead) => lead.stage !== 'ENROLLED' && lead.stage !== 'LOST')
  const matriculados = leads.filter((lead) => lead.stage === 'ENROLLED').length
  const perdidos = leads.filter((lead) => lead.stage === 'LOST').length
  const atrasados = abertos.filter(
    (lead) => lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < agora,
  ).length

  /*
   * Conversão sobre o que já foi decidido — matriculados mais perdidos —, e não
   * sobre o total. Dividir pelo total afunda a taxa com quem ainda está em
   * negociação, e faria o número melhorar sozinho só por parar de captar.
   */
  const decididos = matriculados + perdidos
  const conversao = decididos > 0 ? Math.round((matriculados / decididos) * 100) : null

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="CRM"
        description="Do primeiro contato à matrícula. Converter é o que cria o aluno e a mensalidade."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/crm/new">
                <Plus className="size-4" />
                Novo lead
              </Link>
            </Button>
          )
        }
      />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Em negociação"
          value={formatNumber(abertos.length)}
          icon={Users}
          accent="primary"
        />
        <MetricCard
          label="Retorno atrasado"
          value={formatNumber(atrasados)}
          icon={CalendarClock}
          accent={atrasados > 0 ? 'warning' : 'success'}
          hint="Prometido e não feito"
        />
        <MetricCard
          label="Matriculados"
          value={formatNumber(matriculados)}
          icon={UserCheck}
          accent="success"
        />
        <MetricCard
          label="Conversão"
          value={conversao === null ? '—' : `${conversao}%`}
          icon={TrendingUp}
          accent="default"
          hint="Sobre o que já foi decidido"
        />
      </section>

      {leads.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="Nenhum lead ainda"
          description="Cadastre quem pediu informação na recepção, no Instagram ou no WhatsApp. O funil mostra onde cada pessoa parou."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/crm/new">
                  <Plus className="size-4" />
                  Cadastrar o primeiro
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <LeadBoard
          leads={abertos}
          plans={plans.filter((plano) => plano.status === 'ACTIVE')}
        />
      )}

      {/*
        ── Os que saíram do quadro ──────────────────────────────────────────
        O funil mostra só quem está em negociação, e estava certo: coluna de
        matriculado e de perdido viraria depósito. O que faltava era **porta**
        — a página dizia "o motivo de cada um fica registrado" e não havia
        onde ler nenhum. Agora cada um abre a própria ficha.
      */}
      {decididos > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-synse-text">Já decididos</h2>
          <p className="text-xs text-synse-muted">
            {formatNumber(matriculados)} {matriculados === 1 ? 'matriculado' : 'matriculados'} e{' '}
            {formatNumber(perdidos)} {perdidos === 1 ? 'perdido' : 'perdidos'}. O motivo de cada
            perda fica no histórico e alimenta a taxa de conversão.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {leads
              .filter((lead) => lead.stage === 'ENROLLED' || lead.stage === 'LOST')
              .map((lead) => (
                <li key={lead.id}>
                  {/*
                    `ListLink`, e não `<Link>`: numa lista o `<Link>` busca no
                    servidor toda linha que entra na tela. Guardado por
                    `tests/unit/link-de-lista.test.ts`, que pegou isto aqui.
                  */}
                  <ListLink
                    href={`/crm/${lead.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-synse-border bg-synse-surface px-3.5 py-2.5 text-sm transition-colors hover:border-synse-primary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-synse-text">
                        {lead.name}
                      </span>
                      <span className="block truncate text-xs text-synse-muted">
                        {lead.lostReason ?? SOURCE_LABELS[lead.source]}
                      </span>
                    </span>
                    <Badge variant={lead.stage === 'ENROLLED' ? 'success' : 'warning'}>
                      {STAGE_LABELS[lead.stage]}
                    </Badge>
                  </ListLink>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  )
}
