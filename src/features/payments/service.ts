import 'server-only'

import { getDataSource } from '@/lib/database'
import { calculateSplit, DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { RESUMO_VAZIO, type ResumoDaAcademia } from '@/features/organizations/resumo'
import { roundMoney } from '@/lib/utils'

/** Consolidado do Synse Pay para a organização. */
export type PaySummary = {
  totalReceived: number
  totalPending: number
  overdueAmount: number
  overdueCount: number
  platformFee: number
  providerFees: number
  paymentRate: number
  forecast: number
  gmv: number
}

/**
 * ── Quem soma ───────────────────────────────────────────────────────────────
 *
 * Isto lia **vinte mil cobranças** da academia para somar quatro números num
 * laço aqui — e o `limit: 20000` era um corte silencioso igual ao do
 * PostgREST: a academia que passasse dele veria GMV menor do que faturou, sem
 * nada na tela dizendo isso. A 0054 soma no banco e devolve uma linha.
 *
 * O que **não** foi para o banco é o split. Ele tem percentual por academia,
 * taxa fixa, três estratégias de quem absorve a tarifa do provedor e padrões
 * vindos de variável de ambiente — que o banco não lê. A conta que paga as
 * contas da empresa fica em um lugar só.
 */
export async function getPaySummary(organizationId: string): Promise<PaySummary> {
  const dataSource = await getDataSource()
  const [resumos, settings] = await Promise.all([
    dataSource.resumoDasAcademias([organizationId]),
    dataSource.getBillingSettings(organizationId),
  ])

  const billing = settings ?? { organizationId, ...DEFAULT_BILLING_SETTINGS }
  const resumo = resumos[0] ?? RESUMO_VAZIO(organizationId)

  return resumoParaPaySummary(resumo, billing)
}

/**
 * O resumo bruto vira o consolidado da tela.
 *
 * Separado de `getPaySummary` porque o painel da plataforma precisa da mesma
 * conta para dezenas de academias de uma vez, a partir de resumos que ele já
 * leu em bloco. Duas cópias desta aritmética divergiriam no primeiro ajuste —
 * e uma delas é a comissão da Synse.
 */
export function resumoParaPaySummary(
  resumo: ResumoDaAcademia,
  billing: Parameters<typeof calculateSplit>[1] & { organizationId?: string },
): PaySummary {
  const totalReceived = resumo.recebido
  const totalPending = resumo.previsto + resumo.atrasadoValor
  const overdueAmount = resumo.atrasadoValor
  const overdueCount = resumo.atrasadoQtd
  const forecast = resumo.previsto

  // A tarifa do provedor é estimada com a mesma regra usada no split.
  const providerFees = roundMoney(totalReceived * 0.0099)
  const split = calculateSplit(totalReceived, billing, providerFees)
  const billed = totalReceived + totalPending

  return {
    totalReceived: roundMoney(totalReceived),
    totalPending: roundMoney(totalPending),
    overdueAmount: roundMoney(overdueAmount),
    overdueCount,
    platformFee: split.platformAmount,
    providerFees,
    paymentRate: billed > 0 ? roundMoney((totalReceived / billed) * 100) : 100,
    forecast: roundMoney(forecast),
    gmv: roundMoney(totalReceived),
  }
}

/*
 * As faixas de atraso moram em `faixas-de-atraso.ts`, fora deste arquivo.
 * Este é `server-only`, e os limites precisam ser lidos pelo data source
 * (que os traduz em janela de datas para o Postgres filtrar) e pelos testes
 * de banco — ver o cabeçalho de lá.
 */
