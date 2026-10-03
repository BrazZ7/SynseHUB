import 'server-only'

import { getDataSource } from '@/lib/database'
import { calculateSplit, DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { daysOverdue, roundMoney } from '@/lib/utils'
import type { ChargeWithStudent } from '@/lib/database/data-source'

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

export type OverdueBucket = '1-5' | '6-15' | '16-30' | '30+'

export const OVERDUE_BUCKETS: Array<{ value: OverdueBucket | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: '1-5', label: '1 a 5 dias' },
  { value: '6-15', label: '6 a 15 dias' },
  { value: '16-30', label: '16 a 30 dias' },
  { value: '30+', label: 'Mais de 30 dias' },
]

export function bucketOf(dueDate: string): OverdueBucket {
  const days = daysOverdue(dueDate)
  if (days <= 5) return '1-5'
  if (days <= 15) return '6-15'
  if (days <= 30) return '16-30'
  return '30+'
}

export function filterByBucket(charges: ChargeWithStudent[], bucket: string) {
  if (!bucket || bucket === 'ALL') return charges
  return charges.filter((charge) => bucketOf(charge.dueDate) === bucket)
}
