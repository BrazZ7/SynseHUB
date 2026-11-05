import 'server-only'

import { getDataSource } from '@/lib/database'
import { resumoParaPaySummary } from '@/features/payments/service'
import {
  ACADEMIAS_NO_RESUMO,
  ACADEMIAS_POR_PAGINA,
  RESUMO_VAZIO,
  type ResumoDaAcademia,
} from '@/features/organizations/resumo'
import { DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { roundMoney } from '@/lib/utils'
import type { HubPlanTier, Organization } from '@/types/domain'

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
  /** A página da lista — os totais não dependem dela. */
  page: number
  pageSize: number
  /** Sobre quantas academias os totais foram calculados. */
  totaisSobre: number
  /** Falso quando o teto do resumo cortou: a tela avisa em vez de calar. */
  totaisCompletos: boolean
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

/**
 * ── O painel da plataforma, em três consultas ───────────────────────────────
 *
 * Como era: lia **todas** as organizações, sem teto, e para cada uma disparava
 * duas consultas — sendo que uma delas, o `getPaySummary`, trazia vinte mil
 * cobranças para somar quatro números num laço. Com cinquenta academias, 151
 * consultas e um milhão de linhas de cobrança para produzir dez números. O
 * painel ficava mais lento a cada cliente novo.
 *
 * Como é: a 0054 soma no banco e devolve uma linha curta por academia; os
 * acordos de cobrança vêm numa consulta só; a lista da tela pagina. Três
 * consultas, independentemente de quantas academias existirem.
 *
 * ── Por que uma linha por academia, e não um total pronto ───────────────────
 *
 * Porque a comissão depende do acordo de cada uma: a taxa fixa é somada uma
 * vez por academia, então `split(soma dos recebidos)` **não** é a soma dos
 * splits. Totalizar exige o bruto de cada uma — e `calculateSplit` continua
 * sendo chamado aqui, no único lugar onde a regra existe.
 */
export async function getPlatformMetrics(
  options: { page?: number; pageSize?: number } = {},
): Promise<PlatformMetrics> {
  const dataSource = await getDataSource()

  const [pagina, resumos, porPlano] = await Promise.all([
    dataSource.listOrganizations({
      page: options.page ?? 1,
      pageSize: options.pageSize ?? ACADEMIAS_POR_PAGINA,
    }),
    dataSource.resumoDasAcademias(null, ACADEMIAS_NO_RESUMO),
    dataSource.academiasPorPlano(),
  ])

  const acordos = await dataSource.listBillingSettings(resumos.map((r) => r.organizationId))
  const consolidado = (resumo: ResumoDaAcademia) =>
    resumoParaPaySummary(resumo, acordos.get(resumo.organizationId) ?? DEFAULT_BILLING_SETTINGS)

  /*
   * Os totais somam **todas** as academias do resumo, não as da página — um
   * painel que totalizasse a página mudaria o GMV da plataforma conforme o
   * botão "próxima" seria pior que o problema que esta mudança resolve.
   */
  const totals = resumos.reduce(
    (acc, resumo) => {
      const pay = consolidado(resumo)
      return {
        ...acc,
        students: acc.students + resumo.alunosAtivos,
        gmv: acc.gmv + pay.gmv,
        platformRevenue: acc.platformRevenue + pay.platformFee,
        providerFees: acc.providerFees + pay.providerFees,
        overdueCount: acc.overdueCount + resumo.atrasadoQtd,
      }
    },
    {
      organizations: pagina.total,
      activeOrganizations: Object.values(porPlano).reduce((soma, n) => soma + n, 0),
      students: 0,
      gmv: 0,
      platformRevenue: 0,
      providerFees: 0,
      organizationRevenue: 0,
      mrr: 0,
      overdueCount: 0,
    },
  )

  // A lista da tela: só a página, e cada linha com o consolidado dela.
  const porAcademia = new Map(resumos.map((resumo) => [resumo.organizationId, resumo]))
  const organizations = pagina.rows.map((organization) => {
    const resumo = porAcademia.get(organization.id) ?? RESUMO_VAZIO(organization.id)
    const pay = consolidado(resumo)
    return {
      ...organization,
      students: resumo.alunosAtivos,
      gmv: pay.gmv,
      platformRevenue: pay.platformFee,
      overdueCount: resumo.atrasadoQtd,
    }
  })

  totals.gmv = roundMoney(totals.gmv)
  totals.platformRevenue = roundMoney(totals.platformRevenue)
  totals.providerFees = roundMoney(totals.providerFees)
  totals.organizationRevenue = roundMoney(
    totals.gmv - totals.platformRevenue - totals.providerFees,
  )

  // MRR da Synse: assinaturas SynseHub das academias ativas, contadas por
  // plano no banco e multiplicadas pelo preço, que é catálogo comercial daqui.
  const priceByTier = new Map(HUB_PLAN_CATALOG.map((plan) => [plan.tier, plan.price]))
  totals.mrr = roundMoney(
    Object.entries(porPlano).reduce(
      (soma, [tier, quantas]) => soma + (priceByTier.get(tier as HubPlanTier) ?? 0) * quantas,
      0,
    ),
  )

  return {
    organizations,
    totals,
    page: pagina.page,
    pageSize: pagina.pageSize,
    /*
     * Os totais saem de `ACADEMIAS_NO_RESUMO` academias no máximo. Quando a
     * Synse passar disso, a tela diz — teto anunciado é o oposto de resposta
     * cortada em silêncio, que é o defeito que isto fecha.
     */
    totaisSobre: resumos.length,
    totaisCompletos: resumos.length >= pagina.total,
  }
}
