import 'server-only'

import { getDataSource } from '@/lib/database'
import { calculateSplit, DEFAULT_BILLING_SETTINGS } from '@/lib/payments/split'
import { daysBetween, roundMoney } from '@/lib/utils'
import type { ChargeWithStudent, CheckInWithStudent } from '@/lib/database/data-source'

/**
 * Métricas do painel da academia.
 *
 * Tudo aqui é derivado dos registros — nenhum número é escrito à mão. Se um
 * pagamento muda de status, o KPI muda junto.
 */

export type MonthlyRevenuePoint = {
  month: string
  label: string
  received: number
  pending: number
}

export type StudentFlowPoint = {
  month: string
  label: string
  joined: number
  left: number
}

export type AttendancePoint = {
  date: string
  label: string
  checkIns: number
}

export type DashboardData = {
  competenceLabel: string
  kpis: {
    activeStudents: number
    monthlyRevenue: number
    /** Em aberto apenas na competência corrente. */
    monthlyPending: number
    revenueDelta: number
    receivedCount: number
    /** Alunos com pendência. */
    overdueCount: number
    /** Cobranças em atraso (pode ser maior que o número de alunos). */
    overdueChargeCount: number
    overdueAmount: number
    checkInsToday: number
    newStudents: number
    retentionRate: number
    paymentComplianceRate: number
    mrr: number
    platformFee: number
  }
  revenueSeries: MonthlyRevenuePoint[]
  studentFlow: StudentFlowPoint[]
  attendance: AttendancePoint[]
  latestPayments: ChargeWithStudent[]
  overdueCharges: ChargeWithStudent[]
  upcomingCharges: ChargeWithStudent[]
  recentCheckIns: CheckInWithStudent[]
  alerts: Array<{ id: string; tone: 'warning' | 'danger' | 'info'; title: string; description: string }>
}

const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const COMPETENCE_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const WEEKDAY_LABEL = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit' })

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export async function getDashboardData(organizationId: string): Promise<DashboardData> {
  const dataSource = await getDataSource()
  const now = new Date()
  const currentMonth = monthKey(now)

  const [allCharges, checkIns, billingSettings] = await Promise.all([
    dataSource.listCharges(organizationId, { status: 'ALL', limit: 20000 }),
    dataSource.listCheckIns(organizationId, { since: new Date(now.getTime() - 35 * 86_400_000) }),
    dataSource.getBillingSettings(organizationId),
  ])

  const settings = billingSettings ?? { organizationId, ...DEFAULT_BILLING_SETTINGS }

  // ── Receita por competência (12 meses) ─────────────────────────────────────
  const revenueByMonth = new Map<string, { received: number; pending: number }>()
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    revenueByMonth.set(monthKey(date), { received: 0, pending: 0 })
  }

  let receivedThisMonth = 0
  let receivedCountThisMonth = 0
  let overdueAmount = 0
  let overdueCount = 0
  let pendingThisMonth = 0

  for (const charge of allCharges) {
    const reference = monthKey(new Date(charge.dueDate))
    const bucket = revenueByMonth.get(reference)

    if (charge.status === 'PAID') {
      if (bucket) bucket.received += charge.amount
      if (reference === currentMonth) {
        receivedThisMonth += charge.amount
        receivedCountThisMonth += 1
      }
    } else if (charge.status === 'OVERDUE') {
      if (bucket) bucket.pending += charge.amount
      overdueAmount += charge.amount
      overdueCount += 1
      if (reference === currentMonth) pendingThisMonth += charge.amount
    } else if (charge.status === 'PENDING' && reference === currentMonth) {
      if (bucket) bucket.pending += charge.amount
      pendingThisMonth += charge.amount
    }
  }

  const revenueSeries: MonthlyRevenuePoint[] = [...revenueByMonth.entries()].map(([month, value]) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const date = new Date(year, monthNumber - 1, 1)
    return {
      month,
      label: MONTH_LABEL.format(date).replace('.', ''),
      received: roundMoney(value.received),
      pending: roundMoney(value.pending),
    }
  })

  const previousMonth = revenueSeries[revenueSeries.length - 2]?.received ?? 0
  const revenueDelta =
    previousMonth > 0 ? ((receivedThisMonth - previousMonth) / previousMonth) * 100 : 0

  // ── Alunos ─────────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    dataSource.listStudents(organizationId, { status: 'ACTIVE', pageSize: 5, page: 1 }),
    dataSource.listStudents(organizationId, { status: 'OVERDUE', pageSize: 5, page: 1 }),
    dataSource.listStudents(organizationId, { status: 'INACTIVE', pageSize: 5, page: 1 }),
    dataSource.listStudents(organizationId, { status: 'ALL', newcomers: true, pageSize: 5, page: 1 }),
  ])

  const [activeResult, overdueResult, inactiveResult, newcomersResult] = counts
  const totalEnrolled = activeResult.total + overdueResult.total
  const retentionRate =
    totalEnrolled + inactiveResult.total > 0
      ? (totalEnrolled / (totalEnrolled + inactiveResult.total)) * 100
      : 0
  const paymentComplianceRate =
    totalEnrolled > 0 ? ((totalEnrolled - overdueResult.total) / totalEnrolled) * 100 : 100

  // ── Fluxo de alunos (entradas × saídas) ────────────────────────────────────
  const flowByMonth = new Map<string, { joined: number; left: number }>()
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    flowByMonth.set(monthKey(date), { joined: 0, left: 0 })
  }

  // Entradas pela data de matrícula; saídas pela data de cancelamento.
  const fullRoster = await collectAllStudents(dataSource, organizationId)
  for (const student of fullRoster) {
    const joinedBucket = flowByMonth.get(monthKey(new Date(student.enrolledAt)))
    if (joinedBucket) joinedBucket.joined += 1

    if (student.cancelledAt) {
      const leftBucket = flowByMonth.get(monthKey(new Date(student.cancelledAt)))
      if (leftBucket) leftBucket.left += 1
    }
  }

  const studentFlow: StudentFlowPoint[] = [...flowByMonth.entries()].map(([month, value]) => {
    const [year, monthNumber] = month.split('-').map(Number)
    return {
      month,
      label: MONTH_LABEL.format(new Date(year, monthNumber - 1, 1)).replace('.', ''),
      joined: value.joined,
      left: value.left,
    }
  })

  // ── Frequência (14 dias) ───────────────────────────────────────────────────
  const attendanceByDay = new Map<string, number>()
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    attendanceByDay.set(date.toISOString().slice(0, 10), 0)
  }
  let checkInsToday = 0
  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 10)

  for (const checkIn of checkIns) {
    const key = checkIn.checkedInAt.slice(0, 10)
    if (attendanceByDay.has(key)) attendanceByDay.set(key, (attendanceByDay.get(key) ?? 0) + 1)
    if (key === todayKey) checkInsToday += 1
  }

  const attendance: AttendancePoint[] = [...attendanceByDay.entries()].map(([date, value]) => ({
    date,
    label: WEEKDAY_LABEL.format(new Date(`${date}T12:00:00`)).replace('.', ''),
    checkIns: value,
  }))

  // ── Listas e alertas ───────────────────────────────────────────────────────
  const latestPayments = allCharges
    .filter((c) => c.status === 'PAID' && c.paidAt)
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))
    .slice(0, 6)

  const overdueCharges = allCharges
    .filter((c) => c.status === 'OVERDUE')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6)

  const upcomingCharges = allCharges
    .filter((c) => c.status === 'PENDING' && daysBetween(c.dueDate) >= -15 && daysBetween(c.dueDate) <= 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 6)

  const mrr = roundMoney(receivedThisMonth + pendingThisMonth)
  const platformFee = calculateSplit(receivedThisMonth, settings).platformAmount

  const alerts: DashboardData['alerts'] = []
  if (overdueResult.total > 0) {
    alerts.push({
      id: 'overdue',
      tone: 'danger',
      title: `${overdueResult.total} alunos inadimplentes`,
      description: 'Acione a régua de cobrança para recuperar os pagamentos em aberto.',
    })
  }
  const dormant = fullRoster.filter(
    (s) => s.status !== 'INACTIVE' && (!s.lastCheckInAt || daysBetween(s.lastCheckInAt) >= 21),
  ).length
  if (dormant > 0) {
    alerts.push({
      id: 'dormant',
      tone: 'warning',
      title: `${dormant} alunos sem frequência há 21 dias`,
      description: 'Risco de cancelamento. Vale um contato do professor responsável.',
    })
  }
  if (upcomingCharges.length > 0) {
    alerts.push({
      id: 'upcoming',
      tone: 'info',
      title: `${upcomingCharges.length} mensalidades vencem nos próximos dias`,
      description: 'Os lembretes automáticos já estão programados na régua.',
    })
  }

  return {
    competenceLabel: COMPETENCE_LABEL.format(now),
    kpis: {
      activeStudents: activeResult.total,
      monthlyRevenue: roundMoney(receivedThisMonth),
      monthlyPending: roundMoney(pendingThisMonth),
      revenueDelta: roundMoney(revenueDelta),
      receivedCount: receivedCountThisMonth,
      overdueCount: overdueResult.total,
      overdueChargeCount: overdueCount,
      overdueAmount: roundMoney(overdueAmount),
      checkInsToday,
      newStudents: newcomersResult.total,
      retentionRate: roundMoney(retentionRate),
      paymentComplianceRate: roundMoney(paymentComplianceRate),
      mrr,
      platformFee,
    },
    revenueSeries,
    studentFlow,
    attendance,
    latestPayments,
    overdueCharges,
    upcomingCharges,
    recentCheckIns: checkIns.slice(0, 8),
    alerts,
  }
}

/** Percorre todas as páginas de alunos. Usado só para agregação. */
async function collectAllStudents(
  dataSource: Awaited<ReturnType<typeof getDataSource>>,
  organizationId: string,
) {
  const pageSize = 100
  const first = await dataSource.listStudents(organizationId, { status: 'ALL', page: 1, pageSize })
  const pages = Math.ceil(first.total / pageSize)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      dataSource.listStudents(organizationId, { status: 'ALL', page: index + 2, pageSize }),
    ),
  )
  return [first, ...rest].flatMap((result) => result.rows)
}
