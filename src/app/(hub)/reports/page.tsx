import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  Dumbbell,
  TrendingUp,
  Users,
} from 'lucide-react'

import { AttendanceChart } from '@/components/synse/charts/attendance-chart'
import { RevenueChart } from '@/components/synse/charts/revenue-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboardData } from '@/features/dashboard/service'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Relatórios' }

/** Períodos oferecidos. Trimestre é o padrão: um mês é ruído, um ano é tarde. */
const PERIODOS = { 30: '30 dias', 90: '3 meses', 180: '6 meses', 365: '12 meses' } as const
type Periodo = keyof typeof PERIODOS

const DIAS_SEM_APARECER = 14

type Search = Promise<{ dias?: string }>

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  const { dias } = await searchParams
  const session = await requireHubSession('reports:read')
  const dataSource = await getDataSource()

  const periodo = (Number(dias) in PERIODOS ? Number(dias) : 90) as Periodo
  const ate = new Date()
  const de = new Date(ate.getTime() - periodo * 86_400_000)

  const [dashboard, treino, emRisco, aulas] = await Promise.all([
    // A receita já é agregada pelo painel; refazê-la aqui seria uma segunda
    // verdade sobre o mesmo dinheiro.
    getDashboardData(session.organizationId),
    dataSource.getGymTrainingReport(session.organizationId, de.toISOString(), ate.toISOString()),
    dataSource.listStudentsAtRisk(session.organizationId, DIAS_SEM_APARECER),
    dataSource.getClassOccupancyReport(
      session.organizationId,
      de.toISOString(),
      ate.toISOString(),
    ),
  ])

  const duracaoMedia = treino.averageDurationSeconds
    ? `${Math.round(treino.averageDurationSeconds / 60)} min`
    : '—'

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Relatórios"
        description={`De ${formatDate(de.toISOString())} a ${formatDate(ate.toISOString())}.`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(PERIODOS) as unknown as Periodo[]).map((opcao) => (
              <Button
                key={opcao}
                variant={Number(opcao) === periodo ? 'default' : 'outline'}
                size="sm"
                asChild
              >
                <Link href={`/reports?dias=${opcao}`}>{PERIODOS[opcao]}</Link>
              </Button>
            ))}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          label="Treinos realizados"
          value={formatNumber(treino.workouts)}
          icon={Dumbbell}
          accent="primary"
        />
        <MetricCard
          label="Alunos treinando"
          value={formatNumber(treino.studentsTraining)}
          icon={Users}
          accent="default"
          hint="Quem apareceu, não quem paga"
        />
        <MetricCard
          label="Volume levantado"
          value={`${formatNumber(Math.round(treino.volumeKg / 1000))} t`}
          icon={TrendingUp}
          accent="success"
          hint={`${formatNumber(treino.sets)} séries`}
        />
        <MetricCard
          label="Duração média"
          value={duracaoMedia}
          icon={CalendarCheck}
          accent="default"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Receita" description="Recebido e pendente por mês.">
          <RevenueChart data={dashboard.revenueSeries} />
        </ChartCard>
        <ChartCard title="Frequência" description="Check-ins por dia.">
          <AttendanceChart data={dashboard.attendance} />
        </ChartCard>
      </div>

      {/* ── Quem está sumindo ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-synse-warning" aria-hidden />
            Alunos em risco
          </CardTitle>
          <p className="text-sm text-synse-muted">
            Matrícula ativa, sem check-in nem treino há mais de {DIAS_SEM_APARECER} dias.
            Cancelamento avisa tarde: quando a pessoa pede para sair, já parou de vir há semanas.
          </p>
        </CardHeader>
        <CardContent>
          {emRisco.length === 0 ? (
            <p className="py-6 text-center text-sm text-synse-muted">
              Ninguém sumido. Todo mundo apareceu nos últimos {DIAS_SEM_APARECER} dias.
            </p>
          ) : (
            <ul className="divide-y divide-synse-border">
              {emRisco.slice(0, 12).map((aluno) => (
                <li key={aluno.studentId} className="flex items-center gap-3 py-2.5">
                  <StudentAvatar name={aluno.name} size="sm" />
                  <Link
                    href={`/students/${aluno.studentId}`}
                    className="flex-1 truncate text-sm font-medium text-synse-text hover:underline"
                  >
                    {aluno.name}
                  </Link>
                  <span className="text-xs text-synse-muted">
                    {aluno.lastVisitAt ? formatDate(aluno.lastVisitAt) : 'Nunca apareceu'}
                  </span>
                  <Badge variant={aluno.daysAbsent > 30 ? 'danger' : 'warning'}>
                    {aluno.daysAbsent > 999 ? '—' : `${aluno.daysAbsent} dias`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Aulas ── */}
      <Card>
        <CardHeader>
          <CardTitle>Ocupação das aulas</CardTitle>
          <p className="text-sm text-synse-muted">
            Quantas vagas viraram presença. Aula com muita reserva e pouca presença é vaga que
            ficou vazia com fila de espera do lado.
          </p>
        </CardHeader>
        <CardContent>
          {aulas.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Nenhuma aula no período"
              description="A ocupação aparece assim que houver aulas na agenda."
            />
          ) : (
            <div className="synse-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Ocupação das aulas no período</caption>
                <thead>
                  <tr className="border-b border-synse-border text-left text-xs uppercase tracking-wide text-synse-muted">
                    <th scope="col" className="py-2 pr-4 font-semibold">Aula</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Ocorrências</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Reservas</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Presenças</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Faltas</th>
                    <th scope="col" className="py-2 font-semibold">Ocupação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-synse-border">
                  {aulas.map((linha) => {
                    const ocupacao =
                      linha.capacityOffered > 0
                        ? Math.round((linha.bookings / linha.capacityOffered) * 100)
                        : 0
                    return (
                      <tr key={linha.className}>
                        <td className="py-2.5 pr-4 font-medium text-synse-text">
                          {linha.className}
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">{linha.occurrences}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{linha.bookings}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{linha.attended}</td>
                        <td className="py-2.5 pr-4 tabular-nums">{linha.noShows}</td>
                        <td className="py-2.5 tabular-nums">
                          <Badge variant={ocupacao >= 80 ? 'success' : 'default'}>{ocupacao}%</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-synse-muted">
        Receita do mês corrente: {formatCurrency(dashboard.kpis.monthlyRevenue)} recebidos,{' '}
        {formatCurrency(dashboard.kpis.overdueAmount)} em atraso.
      </p>
    </div>
  )
}
