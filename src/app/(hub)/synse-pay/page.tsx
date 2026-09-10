import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BadgeDollarSign,
  Banknote,
  CircleCheck,
  CreditCard,
  Percent,
  QrCode,
  Receipt,
  Settings2,
  TriangleAlert,
} from 'lucide-react'

import { RevenueChart } from '@/components/synse/charts/revenue-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { PaymentStatus } from '@/components/synse/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getDashboardData } from '@/features/dashboard/service'
import { getPaySummary } from '@/features/payments/service'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { getPaymentProvider, isSimulatedProvider } from '@/lib/payments'
import { DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/utils'
import type { PaymentMethod } from '@/types/domain'

export const metadata: Metadata = { title: 'Synse Pay' }

const METHOD_META: Record<PaymentMethod, { label: string; icon: typeof QrCode }> = {
  PIX: { label: 'PIX', icon: QrCode },
  PIX_AUTOMATIC: { label: 'PIX automático', icon: QrCode },
  CREDIT_CARD: { label: 'Cartão', icon: CreditCard },
  CREDIT_CARD_RECURRING: { label: 'Cartão recorrente', icon: CreditCard },
  BOLETO: { label: 'Boleto', icon: Receipt },
  CASH: { label: 'Dinheiro', icon: Banknote },
}

const ALL_METHODS: PaymentMethod[] = [
  'PIX',
  'PIX_AUTOMATIC',
  'CREDIT_CARD',
  'CREDIT_CARD_RECURRING',
  'BOLETO',
]

export default async function SynsePayPage() {
  const session = await requireHubSession('finance:read')
  const dataSource = await getDataSource()

  const [summary, dashboard, account, billing, rules, paidCharges, openCharges] = await Promise.all([
    getPaySummary(session.organizationId),
    getDashboardData(session.organizationId),
    dataSource.getPaymentAccount(session.organizationId),
    dataSource.getBillingSettings(session.organizationId),
    dataSource.listCollectionRules(session.organizationId),
    dataSource.listCharges(session.organizationId, { status: 'PAID', limit: 12 }),
    dataSource.listCharges(session.organizationId, { status: 'PENDING', limit: 12 }),
  ])

  const provider = getPaymentProvider()
  const simulated = isSimulatedProvider()
  const settings = billing ?? { organizationId: session.organizationId, ...DEFAULT_BILLING_SETTINGS }

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        eyebrow="Synse Pay"
        title="Você cuida da academia. O Synse cuida das cobranças."
        description="Automatize mensalidades, acompanhe pagamentos e reduza inadimplência em um único lugar."
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings">
              <Settings2 className="size-4" />
              Configurações
            </Link>
          </Button>
        }
      />

      {simulated && (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-synse-warning/30 bg-synse-warning/8 p-4"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-synse-warning" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-synse-text">Provedor simulado</p>
            <p className="text-synse-muted">
              Nenhum valor real é movimentado. Configure <code className="break-all">PAYMENT_PROVIDER=asaas</code> e a
              chave de API para operar com cobranças reais.
            </p>
          </div>
        </div>
      )}

      <section aria-label="Indicadores do Synse Pay" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total recebido" value={formatCurrency(summary.totalReceived)} icon={BadgeDollarSign} accent="success" />
        <MetricCard label="A receber" value={formatCurrency(summary.totalPending)} icon={Receipt} accent="warning" />
        <MetricCard label="Inadimplência" value={formatCurrency(summary.overdueAmount)} icon={TriangleAlert} accent="danger" />
        <MetricCard label="Taxa de pagamento" value={formatPercent(summary.paymentRate)} icon={Percent} accent="primary" />
      </section>

      <ChartCard title="Movimentação financeira" description="Recebido e em aberto por competência.">
        <RevenueChart data={dashboard.revenueSeries} />
      </ChartCard>

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transações</TabsTrigger>
          <TabsTrigger value="charges">Cobranças</TabsTrigger>
          <TabsTrigger value="subscriptions">Assinaturas</TabsTrigger>
          <TabsTrigger value="overdue">Inadimplentes</TabsTrigger>
          <TabsTrigger value="reconciliation">Conciliação</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Últimas transações liquidadas</CardTitle>
            </CardHeader>
            <CardContent>
              {paidCharges.length === 0 ? (
                <EmptyState title="Nenhuma transação registrada" className="py-8" />
              ) : (
                <ul className="divide-y divide-synse-border">
                  {paidCharges.map((charge) => (
                    <li key={charge.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-synse-text">
                          {charge.studentName}
                        </p>
                        <p className="truncate text-xs capitalize text-synse-muted">
                          {charge.description}
                        </p>
                      </div>
                      <span className="text-xs text-synse-muted">{formatDate(charge.paidAt)}</span>
                      <span className="text-sm font-semibold tabular-nums text-synse-success">
                        {formatCurrency(charge.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charges">
          <Card>
            <CardHeader>
              <CardTitle>Cobranças em aberto</CardTitle>
            </CardHeader>
            <CardContent>
              {openCharges.length === 0 ? (
                <EmptyState tone="positive" title="Nenhuma cobrança em aberto" className="py-8" />
              ) : (
                <ul className="divide-y divide-synse-border">
                  {openCharges.map((charge) => (
                    <li key={charge.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-synse-text">
                          {charge.studentName}
                        </p>
                        <p className="text-xs text-synse-muted">
                          vence {formatDate(charge.dueDate)}
                        </p>
                      </div>
                      <PaymentStatus status={charge.status} />
                      <span className="text-sm font-semibold tabular-nums text-synse-text">
                        {formatCurrency(charge.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <EmptyState
            icon={CreditCard}
            title="Assinaturas recorrentes"
            description="A cobrança recorrente por cartão e PIX Automático entra na segunda etapa, junto com a integração real do provedor."
          />
        </TabsContent>

        <TabsContent value="overdue">
          <EmptyState
            icon={TriangleAlert}
            title="Gestão de inadimplência"
            description="A tela dedicada traz faixas de atraso, histórico de contato e ações de recuperação."
            action={
              <Button asChild>
                <Link href="/finance/overdue">Abrir inadimplentes</Link>
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card>
            <CardHeader>
              <CardTitle>Conciliação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-synse-muted">
              <p>
                Todo pagamento só muda de status a partir de um webhook válido ou de uma consulta
                confirmada ao provedor. Nada é confirmado pelo navegador.
              </p>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <ReconciliationFigure label="GMV processado" value={formatCurrency(summary.gmv)} />
                <ReconciliationFigure label="Comissão Synse" value={formatCurrency(summary.platformFee)} />
                <ReconciliationFigure label="Tarifas do provedor" value={formatCurrency(summary.providerFees)} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conta financeira</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SettingRow label="Provedor" value={provider.id} />
              <SettingRow
                label="Situação"
                value={
                  account ? (
                    <Badge variant={account.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {account.status === 'ACTIVE' ? 'Conectada' : 'Pendente'}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Não conectada</Badge>
                  )
                }
              />
              <SettingRow label="Onboarding" value={account?.onboardingStatus ?? 'NOT_STARTED'} />
              <p className="text-xs text-synse-muted">
                Nenhum dado bancário sensível é armazenado pelo Synse. Guardamos apenas a referência
                opaca da subconta criada no provedor.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Split e comissão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SettingRow
                label="Comissão da plataforma"
                value={formatPercent(settings.platformFeePercentage)}
              />
              <SettingRow label="Taxa fixa" value={formatCurrency(settings.platformFixedFee)} />
              <SettingRow
                label="Tarifa do provedor"
                value={FEE_STRATEGY_LABELS[settings.paymentProviderFeeStrategy]}
              />
              <p className="text-xs text-synse-muted">
                Os percentuais ficam em <code>organization_billing_settings</code> e são alteráveis
                apenas pela Synse — nunca estão fixos no código.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Métodos de pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_METHODS.map((method) => {
                  const supported = provider.supportedMethods.includes(method)
                  const meta = METHOD_META[method]
                  const Icon = meta.icon
                  return (
                    <li
                      key={method}
                      className="flex items-center gap-2.5 rounded-lg bg-synse-surface-2/60 px-3 py-2.5"
                    >
                      <Icon
                        className={supported ? 'size-4 text-synse-primary' : 'size-4 text-synse-muted/50'}
                        aria-hidden
                      />
                      <span
                        className={
                          supported ? 'text-sm text-synse-text' : 'text-sm text-synse-muted/70'
                        }
                      >
                        {meta.label}
                      </span>
                      {supported && (
                        <CircleCheck className="ml-auto size-4 text-synse-success" aria-hidden />
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-xs text-synse-muted">
                A lista reflete o que o provedor configurado suporta de fato — nenhum método
                indisponível é oferecido ao aluno.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Régua de cobrança</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-synse-border">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="min-w-32 text-sm font-medium text-synse-text">
                      {rule.offsetDays < 0
                        ? `${Math.abs(rule.offsetDays)} dias antes`
                        : rule.offsetDays === 0
                          ? 'No vencimento'
                          : `${rule.offsetDays} dias depois`}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-synse-muted">
                      {rule.template}
                    </span>
                    <span className="flex gap-1.5">
                      {rule.channels.map((channel) => (
                        <Badge key={channel} variant="outline">
                          {CHANNEL_LABELS[channel]}
                        </Badge>
                      ))}
                    </span>
                    <Badge variant={rule.enabled ? 'success' : 'default'}>
                      {rule.enabled ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-synse-muted">
                O envio por WhatsApp usará exclusivamente a API oficial. Nenhuma integração não
                oficial é suportada.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-synse-muted">
        Recebido no período: {formatNumber(summary.overdueCount)} cobranças seguem em atraso.
      </p>
    </div>
  )
}

const FEE_STRATEGY_LABELS: Record<string, string> = {
  PLATFORM_ABSORBS: 'Absorvida pela Synse',
  ORGANIZATION_ABSORBS: 'Absorvida pela academia',
  CUSTOMER_ABSORBS: 'Repassada ao aluno',
}

const CHANNEL_LABELS: Record<string, string> = {
  PUSH: 'Push',
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
}

function SettingRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-synse-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-synse-muted">{label}</span>
      <span className="font-medium text-synse-text">{value}</span>
    </div>
  )
}

function ReconciliationFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-synse-surface-2/60 px-3 py-2.5">
      <dt className="text-xs text-synse-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-synse-text">{value}</dd>
    </div>
  )
}
