import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { ActiveWorkoutScreen } from '@/features/active-workout/active-workout-screen'
import type { PlannedExercise } from '@/features/active-workout/engine/types'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'

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

  /*
   * `listWorkoutExercises` já traz o exercício junto (`select('*, exercises
   * (*)')`). Esta tela lia **a biblioteca inteira** ao lado só para montar um
   * mapa de id → nome dos cinco exercícios que ela desenha — e o nome que ela
   * já tinha na mão.
   */
  const [plan, workoutExercises, preferencias] = await Promise.all([
    dataSource.getWorkoutPlan(session.organizationId, planId),
    dataSource.listWorkoutExercises(planId),
    /*
     * Junto das outras, e não numa busca do cliente: a tela precisa delas para
     * desenhar os interruptores na posição certa já no primeiro quadro. Vindo
     * depois, eles apareceriam no padrão e pulariam para o valor da pessoa —
     * e quem visse só o primeiro estado concluiria que o ajuste não guardou.
     */
    dataSource.getWorkoutPreferences(session.userProfileId),
  ])
  if (!plan) notFound()

  const planejados: PlannedExercise[] = workoutExercises.map((item) => ({
    exerciseId: item.exerciseId,
    workoutExerciseId: item.id,
    name: item.exercise?.name ?? 'Exercício',
    sets: item.sets,
    reps: item.reps,
    restSeconds: item.restSeconds,
    suggestedLoad: item.suggestedLoad,
    notes: item.notes,
  }))

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-4">
      <BackLink href="/app/workout" label="Treinos" />
      <ActiveWorkoutScreen
        dono={session.studentId}
        planName={plan.name.replace(/^Treino [A-Z]+ — /, '')}
        workoutPlanId={plan.id}
        exercises={planejados}
        preferencias={preferencias}
      />
    </ColunaDeLeitura>
  )
}
