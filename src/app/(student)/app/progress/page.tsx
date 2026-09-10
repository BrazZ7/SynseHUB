import type { Metadata } from 'next'
import { Activity, Dumbbell, Flame, TrendingUp } from 'lucide-react'

import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { ProgressRing } from '@/components/synse/progress-ring'
import { getStudentHome } from '@/features/students/app-service'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Progresso' }

export default async function StudentProgressPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const [home, logs, assessments] = await Promise.all([
    getStudentHome(session.organizationId, session.studentId),
    dataSource.listWorkoutLogs(session.organizationId, session.studentId),
    dataSource.listAssessments(session.organizationId, session.studentId),
  ])

  const loadSeries = logs
    .filter((log) => log.load != null)
    .map((log) => ({ label: formatDate(log.performedAt), value: log.load as number }))

  const weightSeries = assessments
    .filter((assessment) => assessment.weight != null)
    .map((assessment) => ({
      label: formatDate(assessment.assessedAt),
      value: assessment.weight as number,
    }))

  const latest = assessments[assessments.length - 1]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <header>
        <h1 className="text-2xl font-semibold text-synse-text">Seu progresso</h1>
        <p className="text-sm text-synse-muted">
          O que mudou desde que você começou — carga, frequência e medidas.
        </p>
      </header>

      <section className="flex items-center gap-5 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <ProgressRing value={home.weeklyGoal.percentage} size={96} caption="semana" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-synse-text">
            {home.weeklyGoal.done} de {home.weeklyGoal.target} treinos
          </p>
          <p className="text-xs text-synse-muted">
            {home.monthlyCheckIns} check-ins registrados neste mês.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <StatTile
          icon={Dumbbell}
          label="Carga atual"
          value={home.currentLoad != null ? `${home.currentLoad} kg` : '—'}
          caption="Supino reto"
        />
        <StatTile
          icon={TrendingUp}
          label="Ganho de carga"
          value={home.loadGain != null ? `+${home.loadGain.toFixed(1)} kg` : '—'}
          caption="Desde o início"
          positive
        />
        <StatTile
          icon={Activity}
          label="Peso"
          value={latest?.weight != null ? `${latest.weight} kg` : '—'}
          caption={latest ? formatDate(latest.assessedAt) : 'Sem avaliação'}
        />
        <StatTile
          icon={Flame}
          label="Treinos"
          value={String(logs.length)}
          caption="Séries registradas"
        />
      </section>

      {loadSeries.length > 1 ? (
        <ChartCard title="Evolução de carga" description="Supino reto, semana a semana.">
          <ProgressLineChart data={loadSeries} unit=" kg" height={180} />
        </ChartCard>
      ) : (
        <EmptyState
          icon={Dumbbell}
          title="Sem histórico de carga"
          description="Registre a carga dos seus treinos para ver a evolução aqui."
        />
      )}

      {weightSeries.length > 1 && (
        <ChartCard title="Evolução do peso" description="Registrado nas avaliações físicas.">
          <ProgressLineChart data={weightSeries} unit=" kg" height={180} />
        </ChartCard>
      )}
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  caption,
  positive = false,
}: {
  icon: typeof Dumbbell
  label: string
  value: string
  caption: string
  positive?: boolean
}) {
  return (
    <div className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm">
      <Icon className="size-4 text-synse-muted" aria-hidden />
      <p className="mt-2.5 text-xs text-synse-muted">{label}</p>
      <p
        className={
          positive
            ? 'text-xl font-semibold tabular-nums text-synse-success'
            : 'text-xl font-semibold tabular-nums text-synse-text'
        }
      >
        {value}
      </p>
      <p className="text-[11px] text-synse-muted">{caption}</p>
    </div>
  )
}
