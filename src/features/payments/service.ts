import 'server-only'

import { getDataSource } from '@/lib/database'
import { calculateSplit, DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
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

export async function getPaySummary(organizationId: string): Promise<PaySummary> {
  const dataSource = await getDataSource()
  const [charges, settings] = await Promise.all([
    dataSource.listCharges(organizationId, { status: 'ALL', limit: 20000 }),
    dataSource.getBillingSettings(organizationId),
  ])

  const billing = settings ?? { organizationId, ...DEFAULT_BILLING_SETTINGS }

  let totalReceived = 0
  let totalPending = 0
  let overdueAmount = 0
  let overdueCount = 0
  let forecast = 0

  for (const charge of charges) {
    switch (charge.status) {
      case 'PAID':
        totalReceived += charge.amount
        break
      case 'OVERDUE':
        overdueAmount += charge.amount
        overdueCount += 1
        totalPending += charge.amount
        break
      case 'PENDING':
        totalPending += charge.amount
        forecast += charge.amount
        break
      default:
        break
    }
  }

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
