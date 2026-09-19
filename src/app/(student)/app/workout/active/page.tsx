import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { ActiveWorkoutScreen } from '@/features/active-workout/active-workout-screen'
import type { PlannedExercise } from '@/features/active-workout/engine/types'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Treino Ativo' }

type Search = Promise<{ plano?: string }>

export default async function ActiveWorkoutPage({ searchParams }: { searchParams: Search }) {
  const { plano } = await searchParams
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  const assignments = await dataSource.listAssignmentsForStudent(
    session.organizationId,
    session.studentId,
  )
  /*
   * Sem `?plano=`, o primeiro treino atribuído. É o caso comum: quem tem um
   * plano só não deveria precisar escolher nada para começar.
   */
  const planId = plano ?? assignments[0]?.workoutPlanId
  if (!planId) notFound()

  // O plano precisa ser um dos atribuídos a este aluno: um id colado na URL
  // não pode virar treino de outra pessoa.
  if (!assignments.some((a) => a.workoutPlanId === planId)) notFound()

  const [plan, workoutExercises, exercises] = await Promise.all([
    dataSource.getWorkoutPlan(session.organizationId, planId),
    dataSource.listWorkoutExercises(planId),
    dataSource.listExercises(session.organizationId),
  ])
  if (!plan) notFound()

  const nomePorId = new Map(exercises.map((e) => [e.id, e.name]))

  const planejados: PlannedExercise[] = workoutExercises.map((item) => ({
    exerciseId: item.exerciseId,
    workoutExerciseId: item.id,
    name: nomePorId.get(item.exerciseId) ?? 'Exercício',
    sets: item.sets,
    reps: item.reps,
    restSeconds: item.restSeconds,
    suggestedLoad: item.suggestedLoad,
    notes: item.notes,
  }))

  return (
    <div className="animate-fade-in-up space-y-4">
      <BackLink href="/app/workout" label="Treinos" />
      <ActiveWorkoutScreen
        planName={plan.name.replace(/^Treino [A-Z]+ — /, '')}
        workoutPlanId={plan.id}
        exercises={planejados}
      />
    </div>
  )
}
