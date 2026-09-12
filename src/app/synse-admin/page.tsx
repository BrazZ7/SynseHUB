import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Building2,
  ChevronLeft,
  CircleDollarSign,
  Percent,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  Users,
  Webhook,
} from 'lucide-react'

import { DataTable, type Column } from '@/components/synse/data-table'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { SynseLogo } from '@/components/synse/synse-logo'
import { ThemeToggle } from '@/components/synse/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HUB_PLAN_CATALOG, getPlatformMetrics } from '@/features/organizations/platform-service'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getPaymentProvider, isSimulatedProvider } from '@/lib/payments'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Synse Admin' }

type OrganizationRow = Awaited<ReturnType<typeof getPlatformMetrics>>['organizations'][number]

export default async function SynseAdminPage() {
  await requirePlatformSession()
  const { organizations, totals } = await getPlatformMetrics()
  const provider = getPaymentProvider()

  const columns: Column<OrganizationRow>[] = [
    {
      key: 'name',
      header: 'Organização',
      render: (organization) => (
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-synse-text">
            {organization.name}
          </span>
          <span className="block truncate text-xs text-synse-muted">
            {organization.city ?? '—'} · desde {formatDate(organization.createdAt)}
          </span>
        </span>
      ),
    },
    {
      key: 'plan',
      header: 'Plano',
      render: (organization) => <Badge variant="primary">{organization.hubPlan}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (organization) => (
        <Badge variant={organization.status === 'ACTIVE' ? 'success' : 'warning'}>
          {organization.status}
        </Badge>
      ),
    },
    {
      key: 'students',
      header: 'Alunos',
      hideBelow: 'sm',
      align: 'right',
      render: (organization) => (
        <span className="text-sm tabular-nums text-synse-text">
          {formatNumber(organization.students)}
        </span>
      ),
    },
    {
      key: 'gmv',
      header: 'GMV',
      hideBelow: 'md',
      align: 'right',
      render: (organization) => (
        <span className="text-sm tabular-nums text-synse-text">
          {formatCurrency(organization.gmv)}
        </span>
      ),
    },
    {
      key: 'commission',
      header: 'Comissão Synse',
      hideBelow: 'lg',
      align: 'right',
      render: (organization) => (
        <span className="text-sm font-semibold tabular-nums text-synse-success">
          {formatCurrency(organization.platformRevenue)}
        </span>
      ),
    },
    {
      key: 'overdue',
      header: 'Inadimplentes',
      hideBelow: 'xl',
      align: 'right',
      render: (organization) => (
        <span className="text-sm tabular-nums text-synse-muted">
          {formatNumber(organization.overdueCount)}
        </span>
      ),
    },
  ]

  return (
    <div className="min-h-svh bg-synse-bg">
      <header className="border-b border-synse-border bg-synse-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <SynseLogo size="sm" />
            <Badge variant="primary" className="gap-1.5">
              <ShieldCheck className="size-3" aria-hidden />
              Plataforma
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ChevronLeft className="size-4" />
                Voltar ao painel
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-5 py-8 sm:px-8">
        <PageHeader
          eyebrow="Synse Admin"
          title="Visão da plataforma"
          description="Organizações, volume processado e receita da Synse. GMV e faturamento são grandezas distintas — nunca somadas."
        />

        <section aria-label="Indicadores da plataforma" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Academias cadastradas"
            value={formatNumber(totals.organizations)}
            icon={Building2}
            accent="primary"
            hint={`${formatNumber(totals.activeOrganizations)} ativas`}
          />
          <MetricCard
            label="Usuários na base"
            value={formatNumber(totals.students)}
            icon={Users}
            accent="default"
            hint="Alunos ativos em todas as organizações"
          />
          <MetricCard
            label="MRR SynseHub"
            value={formatCurrency(totals.mrr)}
            icon={CircleDollarSign}
            accent="success"
            hint="Assinaturas das academias"
          />
          <MetricCard
            label="Cobranças em atraso"
            value={formatNumber(totals.overdueCount)}
            icon={TriangleAlert}
            accent="danger"
            hint="Somadas em toda a base"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Volume financeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Figure
                label="GMV processado"
                value={formatCurrency(totals.gmv)}
                caption="Tudo que passou pelo Synse Pay"
              />
              <Figure
                label="Receita Synse"
                value={formatCurrency(totals.platformRevenue)}
                caption="Somente a comissão da plataforma"
                emphasis
              />
              <Figure
                label="Tarifas do provedor"
                value={formatCurrency(totals.providerFees)}
                caption="Retidas pelo gateway"
              />
              <Figure
                label="Receita das academias"
                value={formatCurrency(totals.organizationRevenue)}
                caption="Repassado às organizações"
              />
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-subtitle font-semibold text-synse-text">Organizações</h2>
          <DataTable
            caption="Organizações cadastradas na plataforma"
            columns={columns}
            rows={organizations}
            rowKey={(organization) => organization.id}
            empty={<EmptyState icon={Building2} title="Nenhuma organização cadastrada." />}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="size-4 text-synse-muted" aria-hidden />
                Saúde dos webhooks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Provedor ativo" value={provider.id} />
              <Row
                label="Modo"
                value={
                  isSimulatedProvider() ? (
                    <Badge variant="warning">Simulado</Badge>
                  ) : (
                    <Badge variant="success">Produção</Badge>
                  )
                }
              />
              <Row label="Endpoint" value={<code className="text-xs">/api/webhooks/payments/asaas</code>} />
              <p className="text-xs text-synse-muted">
                Todo evento é gravado em <code>webhook_events</code> com chave de idempotência
                (provider + event_id). Um evento repetido é reconhecido e ignorado, nunca
                reprocessado.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="size-4 text-synse-muted" aria-hidden />
                Planos SynseHub
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {HUB_PLAN_CATALOG.map((plan) => (
                  <li
                    key={plan.tier}
                    className="flex items-center justify-between gap-3 rounded-lg bg-synse-surface-2/60 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-synse-text">{plan.name}</p>
                      <p className="truncate text-xs text-synse-muted">{plan.features[0]}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-synse-text">
                      {plan.price > 0 ? `${formatCurrency(plan.price)}/mês` : 'Sob consulta'}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-synse-muted">
                <Percent className="mt-0.5 size-3 shrink-0" aria-hidden />
                Preços e comissões vivem em configuração, não no código.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

function Figure({
  label,
  value,
  caption,
  emphasis = false,
}: {
  label: string
  value: string
  caption: string
  emphasis?: boolean
}) {
  return (
    <div className="rounded-xl bg-synse-surface-2/60 p-4">
      <dt className="text-xs text-synse-muted">{label}</dt>
      <dd
        className={
          emphasis
            ? 'mt-1 text-xl font-semibold tabular-nums text-synse-success'
            : 'mt-1 text-xl font-semibold tabular-nums text-synse-text'
        }
      >
        {value}
      </dd>
      <p className="mt-0.5 text-[11px] text-synse-muted">{caption}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-synse-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-synse-muted">{label}</span>
      <span className="font-medium text-synse-text">{value}</span>
    </div>
  )
}
