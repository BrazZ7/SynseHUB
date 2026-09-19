import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowUpRight,
  BadgeDollarSign,
  Clock,
  Percent,
  Receipt,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react'

import { RevenueChart } from '@/components/synse/charts/revenue-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { DataTable, type Column } from '@/components/synse/data-table'
import { EmptyState } from '@/components/synse/empty-state'
import { FilterBar } from '@/components/synse/filter-bar'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { PaymentStatus } from '@/components/synse/status-badge'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Button } from '@/components/ui/button'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import type { ChargeWithStudent } from '@/lib/database/data-source'
import { getDashboardData } from '@/features/dashboard/service'
import { getPaySummary } from '@/features/payments/service'
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/utils'
import type { ChargeStatus } from '@/types/domain'

export const metadata: Metadata = { title: 'Financeiro' }

const STATUS_FILTERS = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PAID', label: 'Pagas' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'OVERDUE', label: 'Atrasadas' },
]

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function FinancePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireHubSession('finance:read')
  const params = await searchParams
  const statusParam = (Array.isArray(params.status) ? params.status[0] : params.status) ?? 'ALL'

  const dataSource = await getDataSource()
  const [summary, dashboard, charges] = await Promise.all([
    getPaySummary(session.organizationId),
    getDashboardData(session.organizationId),
    dataSource.listCharges(session.organizationId, {
      status: statusParam as ChargeStatus | 'ALL',
      limit: 40,
    }),
  ])

  const columns: Column<ChargeWithStudent>[] = [
    {
      key: 'student',
      header: 'Aluno',
      render: (charge) => (
        <Link
          href={`/students/${charge.studentId}`}
          className="flex items-center gap-3 hover:opacity-80"
        >
          <StudentAvatar name={charge.studentName} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-synse-text">
              {charge.studentName}
            </span>
            <span className="block truncate text-xs text-synse-muted">
              {charge.planName ?? 'Sem plano'}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: 'description',
      header: 'Referência',
      hideBelow: 'lg',
      render: (charge) => (
        <span className="text-sm capitalize text-synse-muted">{charge.description}</span>
      ),
    },
    {
      key: 'due',
      header: 'Vencimento',
      hideBelow: 'sm',
      render: (charge) => (
        <span className="text-sm tabular-nums text-synse-text">{formatDate(charge.dueDate)}</span>
      ),
    },
    {
      key: 'method',
      header: 'Forma',
      hideBelow: 'xl',
      render: (charge) => (
        <span className="text-sm text-synse-muted">{METHOD_LABELS[charge.paymentMethod ?? ''] ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (charge) => <PaymentStatus status={charge.status} />,
    },
    {
      key: 'amount',
      header: 'Valor',
      align: 'right',
      render: (charge) => (
        <span className="text-sm font-semibold tabular-nums text-synse-text">
          {formatCurrency(charge.amount)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        eyebrow="Synse Pay"
        title="Financeiro"
        description="Você cuida da academia. O Synse cuida das cobranças."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/finance/overdue">
                <TriangleAlert className="size-4" />
                Inadimplentes
              </Link>
            </Button>
            <Button asChild>
              <Link href="/synse-pay">
                Synse Pay
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Resumo financeiro" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total recebido"
          value={formatCurrency(summary.totalReceived)}
          icon={BadgeDollarSign}
          accent="success"
          hint="Histórico completo"
        />
        <MetricCard
          label="A receber"
          value={formatCurrency(summary.totalPending)}
          icon={Clock}
          accent="warning"
          hint={`${formatCurrency(summary.forecast)} previstos`}
        />
        <MetricCard
          label="Inadimplência"
          value={formatCurrency(summary.overdueAmount)}
          icon={TriangleAlert}
          accent="danger"
          hint={`${formatNumber(summary.overdueCount)} cobranças em atraso`}
        />
        <MetricCard
          label="Taxa de pagamento"
          value={formatPercent(summary.paymentRate)}
          icon={TrendingUp}
          accent="primary"
          hint="Recebido sobre o faturado"
        />
        <MetricCard
          label="Comissão Synse"
          value={formatCurrency(summary.platformFee)}
          icon={Percent}
          accent="default"
          hint="Configurável por organização"
        />
        <MetricCard
          label="Tarifas do provedor"
          value={formatCurrency(summary.providerFees)}
          icon={Receipt}
          accent="default"
          hint="Estimativa sobre o recebido"
        />
        <MetricCard
          label="Receita recorrente"
          value={formatCurrency(dashboard.kpis.mrr)}
          icon={Wallet}
          accent="primary"
          hint="Mensalidades do ciclo"
        />
        <MetricCard
          label="Previsão de recebimento"
          value={formatCurrency(summary.forecast)}
          icon={Clock}
          accent="success"
          hint="Cobranças em aberto no prazo"
        />
      </section>

      <ChartCard
        title="Receita nos últimos 12 meses"
        description="Comparativo entre o que foi recebido e o que segue em aberto."
      >
        <RevenueChart data={dashboard.revenueSeries} />
      </ChartCard>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-subtitle font-semibold text-synse-text">Cobranças</h2>
          <FilterBar aria-label="Filtrar cobranças" paramName="status" options={STATUS_FILTERS} />
        </div>

        <DataTable
          caption="Cobranças da academia"
          columns={columns}
          rows={charges}
          rowKey={(charge) => charge.id}
          empty={
            <EmptyState
              tone={statusParam === 'OVERDUE' ? 'positive' : 'neutral'}
              title={
                statusParam === 'OVERDUE'
                  ? 'Nenhuma cobrança em atraso. Excelente!'
                  : 'Nenhuma cobrança encontrada.'
              }
              description="As mensalidades geradas para os alunos aparecem aqui."
            />
          }
        />
      </div>
    </div>
  )
}

const METHOD_LABELS: Record<string, string> = {
  PIX: 'PIX',
  PIX_AUTOMATIC: 'PIX automático',
  CREDIT_CARD: 'Cartão',
  CREDIT_CARD_RECURRING: 'Cartão recorrente',
  BOLETO: 'Boleto',
  CASH: 'Dinheiro',
}
