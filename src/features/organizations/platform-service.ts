import 'server-only'

import { getDataSource } from '@/lib/database'
import { getPaySummary } from '@/features/payments/service'
import { roundMoney } from '@/lib/utils'
import type { Organization } from '@/types/domain'

/**
 * Métricas da plataforma Synse (visão SUPER_ADMIN).
 *
 * GMV ≠ faturamento da Synse. O GMV é tudo que passou pelo Synse Pay; a
 * receita da Synse é apenas a comissão. Os dois nunca aparecem somados.
 */
export type PlatformMetrics = {
  organizations: Array<
    Organization & {
      students: number
      gmv: number
      platformRevenue: number
      overdueCount: number
    }
  >
  totals: {
    organizations: number
    activeOrganizations: number
    students: number
    gmv: number
    platformRevenue: number
    providerFees: number
    organizationRevenue: number
    mrr: number
    overdueCount: number
  }
}

/** Preços dos planos SynseHub — configuráveis, nunca fixos na aplicação. */
export const HUB_PLAN_CATALOG = [
  {
    tier: 'START' as const,
    name: 'SynseHub Start',
    price: 149,
    highlight: false,
    features: [
      'Até 150 alunos',
      'Gestão de alunos e planos',
      'Check-in por QR Code',
      'Synse App para alunos',
    ],
  },
  {
    tier: 'PRO' as const,
    name: 'SynseHub Pro',
    price: 299,
    highlight: false,
    features: ['Alunos ilimitados', 'Treinos e avaliações', 'CRM e relatórios', 'Synse Pay'],
  },
  {
    tier: 'PREMIUM' as const,
    name: 'SynseHub Premium',
    price: 499,
    highlight: true,
    features: [
      'Synse Pay com split automático',
      'Automação financeira e régua de cobrança',
      'Gestão avançada de inadimplência',
      'Relatórios avançados e previsões',
    ],
  },
  {
    tier: 'NETWORK' as const,
    name: 'SynseHub Network',
    price: 0,
    highlight: false,
    features: [
      'Redes e filiais',
      'Consolidação multi-unidade',
      'Permissões por unidade',
      'Suporte dedicado',
    ],
  },
]

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const dataSource = await getDataSource()
  const organizations = await dataSource.listOrganizations()

  const enriched = await Promise.all(
    organizations.map(async (organization) => {
      const [students, summary] = await Promise.all([
        dataSource.listStudents(organization.id, { status: 'ACTIVE', page: 1, pageSize: 5 }),
        getPaySummary(organization.id),
      ])

      return {
        ...organization,
        students: students.total,
        gmv: summary.gmv,
        platformRevenue: summary.platformFee,
        overdueCount: summary.overdueCount,
      }
    }),
  )

  const totals = enriched.reduce(
    (acc, organization) => ({
      organizations: acc.organizations + 1,
      activeOrganizations: acc.activeOrganizations + (organization.status === 'ACTIVE' ? 1 : 0),
      students: acc.students + organization.students,
      gmv: acc.gmv + organization.gmv,
      platformRevenue: acc.platformRevenue + organization.platformRevenue,
      providerFees: acc.providerFees + roundMoney(organization.gmv * 0.0099),
      organizationRevenue: 0,
      mrr: 0,
      overdueCount: acc.overdueCount + organization.overdueCount,
    }),
    {
      organizations: 0,
      activeOrganizations: 0,
      students: 0,
      gmv: 0,
      platformRevenue: 0,
      providerFees: 0,
      organizationRevenue: 0,
      mrr: 0,
      overdueCount: 0,
    },
  )

  totals.organizationRevenue = roundMoney(totals.gmv - totals.platformRevenue - totals.providerFees)

  // MRR da Synse: assinaturas SynseHub das organizações ativas.
  const priceByTier = new Map(HUB_PLAN_CATALOG.map((plan) => [plan.tier, plan.price]))
  totals.mrr = roundMoney(
    enriched
      .filter((organization) => organization.status === 'ACTIVE')
      .reduce((sum, organization) => sum + (priceByTier.get(organization.hubPlan) ?? 0), 0),
  )

  totals.gmv = roundMoney(totals.gmv)
  totals.platformRevenue = roundMoney(totals.platformRevenue)
  totals.providerFees = roundMoney(totals.providerFees)

  return { organizations: enriched, totals }
}
