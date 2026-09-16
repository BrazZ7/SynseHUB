import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarClock, KanbanSquare, Plus, TrendingUp, UserCheck, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { Button } from '@/components/ui/button'
import { LeadBoard } from '@/features/crm/lead-board'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
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

      {perdidos > 0 && (
        <p className="text-xs text-synse-muted">
          {formatNumber(perdidos)} {perdidos === 1 ? 'lead perdido' : 'leads perdidos'} no
          histórico. O motivo de cada um fica registrado e alimenta a taxa de conversão.
        </p>
      )}
    </div>
  )
}
