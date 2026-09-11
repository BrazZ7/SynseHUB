import type { Metadata } from 'next'
import { Timer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { BaselineWorkout } from '@/features/workouts/baseline-workout'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { MUSCLE_GROUP_LABELS } from '@/features/workouts/labels'

export const metadata: Metadata = { title: 'Treino' }

export default async function StudentWorkoutPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const assignments = await dataSource.listAssignmentsForStudent(
    session.organizationId,
    session.studentId,
  )
  const plans = await dataSource.listWorkoutPlans(session.organizationId)
  const planById = new Map(plans.map((plan) => [plan.id, plan]))

  const assigned = assignments
    .map((assignment) => planById.get(assignment.workoutPlanId))
    .filter((plan) => Boolean(plan))

  const withExercises = await Promise.all(
    assigned.map(async (plan) => ({
      plan: plan!,
      exercises: await dataSource.listWorkoutExercises(plan!.id),
    })),
  )

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-synse-text">Seus treinos</h1>
        <p className="text-sm text-synse-muted">
          Registre a carga a cada série para acompanhar a evolução.
        </p>
      </header>

      {/*
        Sem plano atribuído não é mais tela vazia: o treino base do Synse vale
        desde o primeiro minuto, com ou sem academia. Ele some no instante em
        que a academia atribuir um plano.
      */}
      {withExercises.length === 0 ? (
        <BaselineWorkout />
      ) : (
        withExercises.map(({ plan, exercises }) => (
          <section
            key={plan.id}
            className="overflow-hidden rounded-2xl border border-synse-border bg-synse-surface shadow-synse-sm"
          >
            <header className="bg-synse-surface-2/60 flex items-center justify-between gap-3 border-b border-synse-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-synse-text">
                  {plan.name.replace(/^Treino [A-Z]+ — /, '')}
                </h2>
                <p className="text-xs text-synse-muted">
                  {exercises.length} exercícios · {plan.goal ?? 'Sem objetivo definido'}
                </p>
              </div>
              <Badge variant="primary">{plan.splitLabel}</Badge>
            </header>

            <ol className="divide-y divide-synse-border">
              {exercises.map((item) => (
                <li key={item.id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <span
                    className="bg-synse-mint/50 flex size-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tabular-nums text-synse-dark"
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
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-synse-text">
                      {item.sets} × {item.reps}
                    </p>
                    <p className="flex items-center justify-end gap-1 text-xs tabular-nums text-synse-muted">
                      <Timer className="size-3" aria-hidden />
                      {item.restSeconds}s
                      {item.suggestedLoad != null && ` · ${item.suggestedLoad} kg`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  )
}
