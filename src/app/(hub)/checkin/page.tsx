import type { Metadata } from 'next'
import { CalendarCheck, QrCode, Users } from 'lucide-react'

import { AttendanceChart } from '@/components/synse/charts/attendance-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckInConsole } from '@/features/checkin/checkin-console'
import { QrPanel } from '@/features/checkin/qr-panel'
import { getDashboardData } from '@/features/dashboard/service'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { formatNumber, formatTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Check-in' }

export default async function CheckInPage() {
  const session = await requireHubSession('checkin:read')
  const dataSource = await getDataSource()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(now.getTime() - 7 * 86_400_000)

  const [organization, todayCheckIns, weekCheckIns, students, dashboard] = await Promise.all([
    dataSource.getOrganization(session.organizationId),
    dataSource.listCheckIns(session.organizationId, { since: todayStart }),
    dataSource.listCheckIns(session.organizationId, { since: weekStart }),
    dataSource.listStudents(session.organizationId, { status: 'ALL', page: 1, pageSize: 100 }),
    getDashboardData(session.organizationId),
  ])

  const canWrite = can(session.role, 'checkin:write')
  const uniqueToday = new Set(todayCheckIns.map((c) => c.studentId)).size
  const peakHour = findPeakHour(todayCheckIns.map((c) => c.checkedInAt))

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Check-in"
        description="QR Code dinâmico no totem, registro manual na recepção e histórico de presença em tempo real."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Check-ins hoje" value={formatNumber(todayCheckIns.length)} icon={QrCode} accent="primary" />
        <MetricCard label="Alunos distintos" value={formatNumber(uniqueToday)} icon={Users} accent="success" />
        <MetricCard label="Últimos 7 dias" value={formatNumber(weekCheckIns.length)} icon={CalendarCheck} accent="default" />
        <MetricCard label="Horário de pico" value={peakHour} icon={CalendarCheck} accent="default" hint="Maior fluxo hoje" />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {canWrite && (
            <Card>
              <CardHeader>
                <CardTitle>Registrar presença na recepção</CardTitle>
              </CardHeader>
              <CardContent>
                <CheckInConsole
                  students={students.rows.map((student) => ({
                    id: student.id,
                    name: student.name,
                    synseId: student.synseId,
                    planName: student.planName,
                  }))}
                />
              </CardContent>
            </Card>
          )}

          <ChartCard title="Frequência" description="Check-ins registrados nos últimos 14 dias.">
            <AttendanceChart data={dashboard.attendance} />
          </ChartCard>

          <Card>
            <CardHeader>
              <CardTitle>Entradas de hoje</CardTitle>
            </CardHeader>
            <CardContent>
              {todayCheckIns.length === 0 ? (
                <EmptyState
                  icon={QrCode}
                  title="Nenhum check-in hoje ainda"
                  description="As entradas aparecem aqui assim que o primeiro aluno escanear o QR Code."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-synse-border">
                  {todayCheckIns.slice(0, 25).map((checkIn) => (
                    <li key={checkIn.id} className="flex items-center gap-3 py-2.5">
                      <StudentAvatar name={checkIn.studentName} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm text-synse-text">
                        {checkIn.studentName}
                      </span>
                      <Badge variant="outline">
                        {checkIn.method === 'MANUAL' ? 'Recepção' : 'QR Code'}
                      </Badge>
                      <span className="text-xs tabular-nums text-synse-muted">
                        {formatTime(checkIn.checkedInAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>QR Code da academia</CardTitle>
          </CardHeader>
          <CardContent>
            <QrPanel organizationSlug={organization?.slug ?? 'synse'} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function findPeakHour(timestamps: string[]) {
  if (timestamps.length === 0) return '—'
  const byHour = new Map<number, number>()
  for (const timestamp of timestamps) {
    const hour = new Date(timestamp).getHours()
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1)
  }
  const [hour] = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0]
  return `${String(hour).padStart(2, '0')}h`
}
