import type { Metadata } from 'next'
import Link from 'next/link'
import { Bell, Building2, CreditCard, ShieldCheck, Users, Wallet } from 'lucide-react'

import { PageHeader } from '@/components/synse/page-header'
import { FiscalDataForm } from '@/features/organizations/fiscal-data-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { getPaymentProvider } from '@/lib/payments'
import { DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { ROLE_LABELS, permissionsForRole } from '@/lib/permissions/permissions'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils'
import type { UserRole } from '@/types/domain'

export const metadata: Metadata = { title: 'Configurações' }

const HUB_PLAN_LABELS: Record<string, string> = {
  START: 'SynseHub Start',
  PRO: 'SynseHub Pro',
  PREMIUM: 'SynseHub Premium',
  NETWORK: 'SynseHub Network',
}

const ROLES_TO_SHOW: UserRole[] = [
  'OWNER',
  'MANAGER',
  'RECEPTIONIST',
  'TRAINER',
  'NUTRITIONIST',
  'PROFESSIONAL',
]

export default async function SettingsPage() {
  const session = await requireHubSession('settings:read')
  const dataSource = await getDataSource()

  const [organization, billing, account, staff] = await Promise.all([
    dataSource.getOrganization(session.organizationId),
    dataSource.getBillingSettings(session.organizationId),
    dataSource.getPaymentAccount(session.organizationId),
    dataSource.listStaff(session.organizationId),
  ])

  const settings = billing ?? {
    organizationId: session.organizationId,
    ...DEFAULT_BILLING_SETTINGS,
  }
  const provider = getPaymentProvider()

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        title="Configurações"
        description="Academia, equipe, permissões, financeiro e privacidade."
      />

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization">Academia</TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
          <TabsTrigger value="permissions">Permissões</TabsTrigger>
          <TabsTrigger value="finance">Financeiro</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="privacy">Privacidade</TabsTrigger>
          <TabsTrigger value="subscription">Assinatura</TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-synse-muted" aria-hidden />
                Dados da academia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Nome" value={organization?.name ?? '—'} />
              <Row label="Tipo" value={organization?.type ?? '—'} />
              <Row
                label="Localização"
                value={
                  organization?.city ? `${organization.city} / ${organization.state ?? ''}` : '—'
                }
              />
              <Row label="Fuso horário" value={organization?.timezone ?? '—'} />
              <Row
                label="Criada em"
                value={organization ? formatDate(organization.createdAt) : '—'}
              />

              {/*
                Razão social e documento saem da lista de leitura e viram
                formulário: é o documento daqui que abre a subconta no provedor,
                e antes disto o Synse Pay recusava conectar apontando para uma
                tela onde não havia campo nenhum para preencher.
              */}
              <div className="border-t border-synse-border pt-4">
                <h3 className="mb-3 text-sm font-semibold text-synse-text">Dados fiscais</h3>
                <FiscalDataForm
                  legalName={organization?.legalName ?? null}
                  taxId={organization?.taxId ?? null}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-synse-muted" aria-hidden />
                Equipe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-synse-border">
                {staff.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-synse-text">{member.name}</p>
                      <p className="truncate text-xs text-synse-muted">{member.email}</p>
                    </div>
                    <Badge variant="primary">{ROLE_LABELS[member.role]}</Badge>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" asChild className="mt-4">
                <Link href="/staff">Gerenciar profissionais</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-synse-muted" aria-hidden />
                Matriz de permissões
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ROLES_TO_SHOW.map((role) => (
                <div key={role} className="bg-synse-surface-2/60 rounded-lg p-3.5">
                  <p className="mb-2 text-sm font-medium text-synse-text">{ROLE_LABELS[role]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {permissionsForRole(role).map((permission) => (
                      <Badge key={permission} variant="outline" className="font-mono text-[10px]">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-synse-muted">
                As permissões são conferidas no servidor a cada ação, e o Postgres aplica Row Level
                Security por cima. Esconder um botão nunca é o controle de acesso.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-4 text-synse-muted" aria-hidden />
                Synse Pay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Provedor configurado" value={provider.id} />
              <Row label="Conta financeira" value={account?.status ?? 'DISCONNECTED'} />
              <Row
                label="Comissão da plataforma"
                value={formatPercent(settings.platformFeePercentage)}
              />
              <Row label="Taxa fixa" value={formatCurrency(settings.platformFixedFee)} />
              <Button variant="outline" size="sm" asChild className="mt-2">
                <Link href="/synse-pay">Abrir Synse Pay</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4 text-synse-muted" aria-hidden />
                Canais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-synse-muted">
              <p>
                Push e e-mail estão previstos na régua de cobrança. O WhatsApp usará exclusivamente
                a API oficial — nenhuma integração não oficial será suportada.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-synse-muted" aria-hidden />
                Privacidade e LGPD
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm text-synse-muted">
              <p>
                Dados de saúde (avaliações e planos nutricionais) têm acesso restrito por função e
                policy no banco. Fotos de progresso exigem consentimento explícito e revogável.
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>Consentimento versionado por finalidade, com data de aceite e de revogação.</li>
                <li>
                  Trilha de auditoria em operações críticas: mensalidade, treino, permissão,
                  estorno.
                </li>
                <li>Minimização: nenhum dado de cartão trafega ou é armazenado pelo Synse.</li>
                <li>Exportação e exclusão de dados pessoais mediante solicitação do titular.</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4 text-synse-muted" aria-hidden />
                Assinatura SynseHub
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row
                label="Plano atual"
                value={HUB_PLAN_LABELS[organization?.hubPlan ?? 'START'] ?? 'SynseHub Start'}
              />
              <Row label="Situação" value={organization?.status ?? '—'} />
              <p className="text-xs text-synse-muted">
                Os preços dos planos SynseHub são configuráveis pela plataforma e nunca ficam fixos
                no código da aplicação.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-synse-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-synse-muted">{label}</span>
      <span className="text-right font-medium text-synse-text">{value}</span>
    </div>
  )
}
