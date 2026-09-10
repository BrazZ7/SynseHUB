import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Timer } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MUSCLE_GROUP_LABELS } from '@/features/workouts/labels'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const session = await requireHubSession('workouts:read')
  const dataSource = await getDataSource()
  const plan = await dataSource.getWorkoutPlan(session.organizationId, id)
  return { title: plan?.name ?? 'Treino' }
}

export default async function WorkoutDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('workouts:read')
  const dataSource = await getDataSource()

  const plan = await dataSource.getWorkoutPlan(session.organizationId, id)
  if (!plan) notFound()

  const exercises = await dataSource.listWorkoutExercises(plan.id)

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/workouts">
          <ChevronLeft className="size-4" />
          Treinos
        </Link>
      </Button>

      <PageHeader
        eyebrow={`Divisão ${plan.splitLabel}`}
        title={plan.name}
        description={plan.goal ?? undefined}
      />

      {exercises.length === 0 ? (
        <EmptyState
          title="Nenhum exercício neste treino"
          description="Adicione exercícios da biblioteca para montar a sequência."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <ol className="divide-y divide-synse-border">
              {exercises.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-synse-surface-2 text-xs font-semibold tabular-nums text-synse-muted"
                    aria-hidden
                  >
                    {item.order}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-synse-text">
                      {item.exercise.name}
                    </p>
                    <p className="truncate text-xs text-synse-muted">
                      {MUSCLE_GROUP_LABELS[item.exercise.muscleGroup]}
                      {item.exercise.equipment && ` · ${item.exercise.equipment}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="tabular-nums">
                      {item.sets} × {item.reps}
                    </Badge>
                    {item.suggestedLoad != null && (
                      <Badge variant="primary" className="tabular-nums">
                        {item.suggestedLoad} kg
                      </Badge>
                    )}
                    <span className="flex items-center gap-1 tabular-nums text-synse-muted">
                      <Timer className="size-3.5" aria-hidden />
                      {item.restSeconds}s
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
