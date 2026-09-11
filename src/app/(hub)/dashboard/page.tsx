import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowUpRight,
  BadgeDollarSign,
  CalendarClock,
  CircleAlert,
  Info,
  QrCode,
  Repeat,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { AttendanceChart } from '@/components/synse/charts/attendance-chart'
import { RevenueChart } from '@/components/synse/charts/revenue-chart'
import { StudentFlowChart } from '@/components/synse/charts/student-flow-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { getDataSource } from '@/lib/database'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { PaymentStatus } from '@/components/synse/status-badge'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { can } from '@/lib/permissions/permissions'
import { getDashboardData } from '@/features/dashboard/service'
import {
  cn,
  daysOverdue,
  firstName,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatTime,
  greeting,
} from '@/lib/utils'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await requireHubSession('dashboard:view')
  const data = await getDashboardData(session.organizationId)
  const { kpis } = data

  // Professor e nutricionista não enxergam receita nem inadimplência — a
  // mesma regra que esconde o menu vale para cada bloco desta página.
  const showFinance = can(session.role, 'finance:read')
  const canEnroll = can(session.role, 'students:write')

  // Só consulta quem pode agir: para o professor o aviso não teria botão.
  const dataSource = await getDataSource()
  const pendentes = canEnroll
    ? (await dataSource.listStudents(session.organizationId, { status: 'PENDING', pageSize: 1 }))
        .total
    : 0

  // Alertas financeiros seguem a mesma regra dos blocos de receita.
  const alerts = showFinance
    ? data.alerts
    : data.alerts.filter((alert) => alert.id !== 'overdue' && alert.id !== 'upcoming')

  return (
    <div className="animate-fade-in-up space-y-6">
      <PageHeader
        eyebrow={data.competenceLabel}
        title={`${greeting()}, ${firstName(session.name)}`}
        description={`Panorama da ${session.organizationName} — alunos, receita e frequência em tempo real.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/checkin">
                <QrCode className="size-4" />
                Check-in
              </Link>
            </Button>
            {canEnroll && (
              <Button asChild>
                <Link href="/students/new">
                  <UserPlus className="size-4" />
                  Novo aluno
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/*
        Matrículas aguardando confirmação.
        Quem entra pelo código de convite fica invisível até alguém da academia
        confirmar — e uma pessoa esperando aprovação sem ninguém saber que ela
        existe é a pior forma de estrear no produto. O aviso só aparece quando
        há alguém esperando.
      */}
      {canEnroll && pendentes > 0 && (
        <Link
          href="/students?status=PENDING"
          className="focus-visible:ring-synse-primary/25 border-synse-primary/30 bg-synse-primary/8 flex items-center gap-3 rounded-xl border p-4 transition hover:border-synse-primary focus-visible:outline-none focus-visible:ring-2"
        >
          <UserPlus className="size-4 shrink-0 text-synse-primary" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-synse-text">
            <strong className="font-medium">
              {pendentes === 1
                ? '1 pessoa entrou com o código e aguarda confirmação'
                : `${pendentes} pessoas entraram com o código e aguardam confirmação`}
            </strong>
          </span>
          <span className="shrink-0 text-sm text-synse-primary">Ver</span>
        </Link>
      )}

      {/* Resumo financeiro do mês */}
      {showFinance && (
        <section
          className="overflow-hidden rounded-2xl bg-synse-gradient-deep p-6 text-white shadow-synse-lg sm:p-7"
          aria-labelledby="finance-summary"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                Financeiro
              </p>
              <h2 id="finance-summary" className="mt-1 text-lg font-medium capitalize text-white">
                {data.competenceLabel}
              </h2>
            </div>
            <Button
              variant="ghost"
              asChild
              className="text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Link href="/finance">
                Ver financeiro
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryFigure
              label="Recebido"
              value={formatCurrency(kpis.monthlyRevenue)}
              detail={`${formatNumber(kpis.receivedCount)} pagamentos`}
              emphasis
            />
            <SummaryFigure
              label="Em aberto"
              value={formatCurrency(kpis.monthlyPending)}
              detail={`${formatNumber(kpis.overdueCount)} inadimplentes`}
            />
            <SummaryFigure
              label="Adimplência"
              value={formatPercent(kpis.paymentComplianceRate)}
              detail={`${formatNumber(kpis.activeStudents)} alunos pagos`}
            />
            <SummaryFigure
              label="Comissão Synse"
              value={formatCurrency(kpis.platformFee)}
              detail="Sobre o valor recebido"
            />
          </dl>
        </section>
      )}

      {/* KPIs */}
      <section
        aria-label="Indicadores"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Alunos ativos"
          value={formatNumber(kpis.activeStudents)}
          icon={Users}
          accent="primary"
          hint="Matrículas em dia"
        />
        {showFinance && (
          <>
            <MetricCard
              label="Receita do mês"
              value={formatCurrency(kpis.monthlyRevenue)}
              delta={kpis.revenueDelta}
              deltaLabel="vs. mês anterior"
              icon={BadgeDollarSign}
              accent="success"
            />
            <MetricCard
              label="Inadimplentes"
              value={formatNumber(kpis.overdueCount)}
              icon={TriangleAlert}
              accent="danger"
              hint={`${formatCurrency(kpis.overdueAmount)} em atraso no total`}
              invertDelta
            />
          </>
        )}
        <MetricCard
          label="Check-ins hoje"
          value={formatNumber(kpis.checkInsToday)}
          icon={QrCode}
          accent="default"
          hint="Presenças registradas"
        />
        <MetricCard
          label="Novos alunos"
          value={formatNumber(kpis.newStudents)}
          icon={UserPlus}
          accent="primary"
          hint="Últimos 30 dias"
        />
        <MetricCard
          label="Taxa de retenção"
          value={formatPercent(kpis.retentionRate)}
          icon={TrendingUp}
          accent="success"
          hint="Base ativa sobre o total"
        />
        {showFinance && (
          <>
            <MetricCard
              label="Receita recorrente"
              value={formatCurrency(kpis.mrr)}
              icon={Repeat}
              accent="primary"
              hint="Mensalidades do ciclo"
            />
            <MetricCard
              label="Pagamentos recebidos"
              value={formatNumber(kpis.receivedCount)}
              icon={Wallet}
              accent="success"
              hint="No mês corrente"
            />
          </>
        )}
      </section>

      {/* Gráficos */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {showFinance && (
          <ChartCard
            title="Receita nos últimos 12 meses"
            description="Valores recebidos e o que segue em aberto por competência."
            className="xl:col-span-2"
          >
            <RevenueChart data={data.revenueSeries} />
          </ChartCard>
        )}

        <ChartCard
          title="Novos alunos × cancelamentos"
          description="Entradas e saídas da base."
          className={showFinance ? undefined : 'xl:col-span-2'}
        >
          <StudentFlowChart data={data.studentFlow} />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Frequência da academia"
          description="Check-ins registrados nos últimos 14 dias."
          className="xl:col-span-2"
        >
          <AttendanceChart data={data.attendance} />
        </ChartCard>

        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {alerts.length === 0 ? (
              <EmptyState
                tone="positive"
                title="Nenhum alerta agora"
                description="Operação em dia. Bom trabalho."
                className="py-8"
              />
            ) : (
              alerts.map((alert) => <AlertRow key={alert.id} {...alert} />)
            )}
          </CardContent>
        </Card>
      </section>

      {/* Listas operacionais */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {showFinance && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Últimos pagamentos</CardTitle>
              <Button variant="link" size="sm" asChild className="h-auto p-0">
                <Link href="/finance">Ver tudo</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.latestPayments.length === 0 ? (
                <EmptyState title="Nenhum pagamento registrado" className="py-8" />
              ) : (
                data.latestPayments.map((charge) => (
                  <Link
                    key={charge.id}
                    href={`/students/${charge.studentId}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-synse-surface-2"
                  >
                    <StudentAvatar name={charge.studentName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-synse-text">
                        {charge.studentName}
                      </p>
                      <p className="text-xs text-synse-muted">{formatDate(charge.paidAt)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-synse-success">
                      {formatCurrency(charge.amount)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {showFinance && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Inadimplentes</CardTitle>
              <Button variant="link" size="sm" asChild className="h-auto p-0">
                <Link href="/finance/overdue">Ver tudo</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.overdueCharges.length === 0 ? (
                <EmptyState
                  tone="positive"
                  title="Nenhuma cobrança em atraso. Excelente!"
                  className="py-8"
                />
              ) : (
                data.overdueCharges.map((charge) => (
                  <Link
                    key={charge.id}
                    href={`/students/${charge.studentId}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-synse-surface-2"
                  >
                    <StudentAvatar name={charge.studentName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-synse-text">
                        {charge.studentName}
                      </p>
                      <p className="text-xs text-synse-danger">
                        {daysOverdue(charge.dueDate)} dias em atraso
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-synse-text">
                      {formatCurrency(charge.amount)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}

        <Card className={showFinance ? undefined : 'xl:col-span-3'}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Atividade recente</CardTitle>
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <Link href="/checkin">Check-in</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.recentCheckIns.length === 0 ? (
              <EmptyState title="Nenhum check-in hoje" className="py-8" />
            ) : (
              data.recentCheckIns.map((checkIn) => (
                <div key={checkIn.id} className="flex items-center gap-3 px-0 py-2">
                  <span
                    className="bg-synse-mint/50 flex size-8 shrink-0 items-center justify-center rounded-full text-synse-primary"
                    aria-hidden
                  >
                    <QrCode className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-synse-text">{checkIn.studentName}</p>
                    <p className="text-xs text-synse-muted">
                      {checkIn.method === 'MANUAL'
                        ? 'Registrado na recepção'
                        : 'Check-in por QR Code'}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-synse-muted">
                    {formatTime(checkIn.checkedInAt)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Próximos vencimentos */}
      {showFinance && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Próximos vencimentos</CardTitle>
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <Link href="/finance">Ver cobranças</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.upcomingCharges.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nenhum vencimento nos próximos dias"
                description="As próximas mensalidades aparecerão aqui conforme a régua de cobrança."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-synse-border">
                {data.upcomingCharges.map((charge) => (
                  <li key={charge.id} className="flex flex-wrap items-center gap-3 py-3">
                    <StudentAvatar name={charge.studentName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-synse-text">
                        {charge.studentName}
                      </p>
                      <p className="text-xs text-synse-muted">{charge.planName ?? 'Sem plano'}</p>
                    </div>
                    <span className="text-xs text-synse-muted">
                      vence {formatDate(charge.dueDate)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-synse-text">
                      {formatCurrency(charge.amount)}
                    </span>
                    <PaymentStatus status={charge.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryFigure({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string
  value: string
  detail: string
  emphasis?: boolean
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</dt>
      <dd
        className={cn(
          'mt-1.5 font-semibold tabular-nums text-white',
          emphasis ? 'text-2xl' : 'text-xl',
        )}
      >
        {value}
      </dd>
      <p className="mt-0.5 text-xs text-white/60">{detail}</p>
    </div>
  )
}

const ALERT_TONES = {
  danger: { icon: CircleAlert, className: 'bg-synse-danger/12 text-synse-danger' },
  warning: { icon: TriangleAlert, className: 'bg-synse-warning/14 text-synse-warning' },
  info: { icon: Info, className: 'bg-synse-mint/50 text-synse-primary' },
} as const

function AlertRow({
  tone,
  title,
  description,
}: {
  tone: 'warning' | 'danger' | 'info'
  title: string
  description: string
}) {
  const config = ALERT_TONES[tone]
  const Icon = config.icon

  return (
    <div className="bg-synse-surface-2/60 flex gap-3 rounded-lg p-3">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          config.className,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-synse-text">{title}</p>
        <p className="text-xs text-synse-muted">{description}</p>
      </div>
    </div>
  )
}
