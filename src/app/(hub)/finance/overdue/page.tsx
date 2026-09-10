import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { DataTable, type Column } from '@/components/synse/data-table'
import { EmptyState } from '@/components/synse/empty-state'
import { FilterBar } from '@/components/synse/filter-bar'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { OverdueActionsCell } from '@/features/payments/overdue-actions-cell'
import { OVERDUE_BUCKETS, bucketOf, filterByBucket } from '@/features/payments/service'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import type { ChargeWithStudent } from '@/lib/database/data-source'
import { can } from '@/lib/permissions/permissions'
import { cn, daysOverdue, formatCurrency, formatDate, formatNumber, formatPhone } from '@/lib/utils'

export const metadata: Metadata = { title: 'Inadimplentes' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function OverduePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireHubSession('finance:read')
  const params = await searchParams
  const bucket = (Array.isArray(params.faixa) ? params.faixa[0] : params.faixa) ?? 'ALL'

  const dataSource = await getDataSource()
  const allOverdue = await dataSource.listOverdueCharges(session.organizationId)
  const rows = filterByBucket(allOverdue, bucket)

  const canAct = can(session.role, 'finance:write')
  const totalAmount = allOverdue.reduce((sum, charge) => sum + charge.amount, 0)
  const averageDays =
    allOverdue.length > 0
      ? Math.round(
          allOverdue.reduce((sum, charge) => sum + daysOverdue(charge.dueDate), 0) / allOverdue.length,
        )
      : 0
  const critical = allOverdue.filter((charge) => daysOverdue(charge.dueDate) > 30).length

  const bucketCounts = OVERDUE_BUCKETS.map((option) => ({
    ...option,
    count:
      option.value === 'ALL'
        ? allOverdue.length
        : allOverdue.filter((charge) => bucketOf(charge.dueDate) === option.value).length,
  }))

  const columns: Column<ChargeWithStudent>[] = [
    {
      key: 'student',
      header: 'Aluno',
      render: (charge) => (
        <Link href={`/students/${charge.studentId}`} className="flex items-center gap-3 hover:opacity-80">
          <StudentAvatar name={charge.studentName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-synse-text">
              {charge.studentName}
            </span>
            <span className="block truncate text-xs tabular-nums text-synse-muted">
              {formatPhone(charge.studentPhone)}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Mensalidade',
      hideBelow: 'lg',
      render: (charge) => (
        <span className="text-sm text-synse-muted">{charge.planName ?? 'Sem plano'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      render: (charge) => (
        <span className="text-sm font-semibold tabular-nums text-synse-text">
          {formatCurrency(charge.amount)}
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Vencimento',
      hideBelow: 'sm',
      render: (charge) => (
        <span className="text-sm tabular-nums text-synse-muted">{formatDate(charge.dueDate)}</span>
      ),
    },
    {
      key: 'days',
      header: 'Atraso',
      render: (charge) => {
        const days = daysOverdue(charge.dueDate)
        return (
          <Badge
            variant={days > 30 ? 'danger' : days > 15 ? 'warning' : 'outline'}
            className="tabular-nums"
          >
            {days} {days === 1 ? 'dia' : 'dias'}
          </Badge>
        )
      },
    },
    {
      key: 'contact',
      header: 'Último contato',
      hideBelow: 'xl',
      render: () => <span className="text-sm text-synse-muted">Sem registro</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (charge) =>
        canAct ? (
          <OverdueActionsCell
            chargeId={charge.id}
            studentName={charge.studentName}
            amount={charge.amount}
          />
        ) : null,
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/finance">
          <ChevronLeft className="size-4" />
          Financeiro
        </Link>
      </Button>

      <PageHeader
        eyebrow="Synse Pay"
        title="Inadimplentes"
        description="Priorize por tempo de atraso e acione a régua de cobrança sem sair da tela."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Alunos em atraso" value={formatNumber(allOverdue.length)} accent="danger" />
        <MetricCard label="Valor em aberto" value={formatCurrency(totalAmount)} accent="warning" />
        <MetricCard label="Atraso médio" value={`${averageDays} dias`} accent="default" />
        <MetricCard label="Acima de 30 dias" value={formatNumber(critical)} accent="danger" />
      </section>

      <FilterBar
        aria-label="Filtrar por faixa de atraso"
        paramName="faixa"
        options={bucketCounts}
      />

      <DataTable
        caption="Cobranças em atraso"
        columns={columns}
        rows={rows}
        rowKey={(charge) => charge.id}
        empty={
          <EmptyState
            tone="positive"
            title="Nenhuma cobrança em atraso. Excelente!"
            description={
              bucket === 'ALL'
                ? 'Toda a base está em dia com as mensalidades.'
                : 'Nenhum aluno nesta faixa de atraso.'
            }
          />
        }
      />

      <p className={cn('text-xs text-synse-muted')}>
        A régua automática dispara lembretes 3 dias antes, no vencimento e nos dias 3, 7, 15 e 30 de
        atraso. Configure os canais em Synse Pay → Régua de cobrança.
      </p>
    </div>
  )
}
