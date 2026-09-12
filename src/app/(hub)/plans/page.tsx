import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList, Plus, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { BillingCycle } from '@/types/domain'

export const metadata: Metadata = { title: 'Planos' }

const CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  CUSTOM: 'Personalizado',
}

const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  CUSTOM: 1,
}

export default async function PlansPage() {
  const session = await requireHubSession('plans:read')
  const dataSource = await getDataSource()

  const [plans, counts] = await Promise.all([
    dataSource.listPlans(session.organizationId),
    dataSource.countStudentsByPlan(session.organizationId),
  ])

  const canWrite = can(session.role, 'plans:write')
  const activePlans = plans.filter((plan) => plan.status === 'ACTIVE')

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Planos"
        description="Os planos definem o valor da mensalidade, a periodicidade e o que está incluído."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/plans/new">
                <Plus className="size-4" />
                Novo plano
              </Link>
            </Button>
          )
        }
      />

      {activePlans.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum plano cadastrado."
          description="Crie o primeiro plano para poder matricular alunos e gerar mensalidades."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/plans/new">
                  <Plus className="size-4" />
                  Criar o primeiro plano
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activePlans.map((plan) => {
            const students = counts[plan.id] ?? 0
            const monthlyEquivalent = plan.price
            const total = plan.price * CYCLE_MONTHS[plan.billingCycle]

            return (
              <Card key={plan.id} className="flex flex-col transition-shadow hover:shadow-synse">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle>{plan.name}</CardTitle>
                    <Badge variant="outline">{CYCLE_LABELS[plan.billingCycle]}</Badge>
                  </div>
                  {plan.description && (
                    <p className="text-sm text-synse-muted">{plan.description}</p>
                  )}
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-4">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-synse-text">
                      {formatCurrency(monthlyEquivalent)}
                      <span className="ml-1 text-sm font-normal text-synse-muted">/mês</span>
                    </p>
                    {CYCLE_MONTHS[plan.billingCycle] > 1 && (
                      <p className="text-xs text-synse-muted">
                        {formatCurrency(total)} no ciclo de {CYCLE_MONTHS[plan.billingCycle]} meses
                      </p>
                    )}
                    {plan.enrollmentFee > 0 && (
                      <p className="text-xs text-synse-muted">
                        Matrícula {formatCurrency(plan.enrollmentFee)}
                      </p>
                    )}
                  </div>

                  {plan.benefits.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-synse-muted">
                      {plan.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-2">
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-synse-primary"
                            aria-hidden
                          />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-synse-border pt-3.5 text-sm">
                    <span className="flex items-center gap-1.5 text-synse-muted">
                      <Users className="size-4" aria-hidden />
                      {formatNumber(students)} alunos
                    </span>
                    {plan.autoCharge && <Badge variant="success">Cobrança automática</Badge>}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
