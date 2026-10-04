import 'server-only'

import { getDataSource } from '@/lib/database'
import { daysBetween } from '@/lib/utils'
import type { Charge, WorkoutPlan } from '@/types/domain'

/** Dados consolidados da tela Hoje do Synse App. */
export type StudentHomeData = {
  name: string
  synseId: string
  planName: string | null
  todayWorkout: (WorkoutPlan & { exerciseCount: number }) | null
  weeklyGoal: { done: number; target: number; percentage: number }
  monthlyCheckIns: number
  checkedInToday: boolean
  nextCharge: Charge | null
  currentLoad: number | null
  loadGain: number | null
  programDay: { current: number; total: number; percentage: number }
  lastCheckInAt: string | null
}

const WEEKLY_TARGET = 5

export async function getStudentHome(
  organizationId: string,
  studentId: string,
): Promise<StudentHomeData> {
  const dataSource = await getDataSource()

  const [student, assignments, plans, checkIns, nextCharge, cargas] = await Promise.all([
    dataSource.getStudent(organizationId, studentId),
    dataSource.listAssignmentsForStudent(organizationId, studentId),
    dataSource.listWorkoutPlans(organizationId),
    dataSource.listCheckInsForStudent(organizationId, studentId, 90),
    dataSource.getNextOpenCharge(organizationId, studentId),
    /*
     * Duas linhas, e não o histórico inteiro. A home usava exatamente a
     * primeira e a última carga — e como `listWorkoutLogs` vem em ordem
     * crescente, o corte do PostgREST levava justamente a última: o "ganho de
     * carga" congelava num valor antigo sem nada na tela indicando isso.
     */
    dataSource.getLoadProgress(organizationId, studentId),
  ])

  const planById = new Map(plans.map((plan) => [plan.id, plan]))
  const assignedPlans = assignments
    .map((assignment) => planById.get(assignment.workoutPlanId))
    .filter((plan): plan is WorkoutPlan => Boolean(plan))

  // Rotaciona a divisão pelo dia do ano — A, B, C…
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  )
  const todayPlan =
    assignedPlans.length > 0 ? assignedPlans[dayOfYear % assignedPlans.length] : null

  const exercises = todayPlan ? await dataSource.listWorkoutExercises(todayPlan.id) : []

  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  const weeklyDone = checkIns.filter((c) => c.checkedInAt >= weekStart).length
  const monthlyCheckIns = checkIns.filter((c) => c.checkedInAt >= monthStart).length
  const checkedInToday = checkIns.some((c) => c.checkedInAt >= todayStart)

  const currentLoad = cargas.ultima
  const firstLoad = cargas.primeira
  /*
   * O mesmo cálculo de antes, agora sobre as cargas certas. Ele continua
   * comparando a primeira carga registrada em **qualquer** exercício com a
   * última em qualquer exercício — o que não é ganho de força, e está anotado
   * em `docs/pre-producao.md` para decidir. Não mudei aqui de propósito:
   * corrigir o corte e trocar o significado do número são duas coisas, e a
   * segunda não é minha para escolher.
   */
  const loadGain = currentLoad != null && firstLoad != null ? currentLoad - firstLoad : null

  // Programa Synse 30: derivado da data de matrícula, ciclo de 30 dias.
  const enrolledDays = student ? daysBetween(student.enrolledAt) : 0
  const programCurrent = (enrolledDays % 30) + 1

  return {
    name: student?.name ?? 'Aluno',
    synseId: student?.synseId ?? '',
    planName: student?.planName ?? null,
    todayWorkout: todayPlan ? { ...todayPlan, exerciseCount: exercises.length } : null,
    weeklyGoal: {
      done: weeklyDone,
      target: WEEKLY_TARGET,
      percentage: Math.min(100, Math.round((weeklyDone / WEEKLY_TARGET) * 100)),
    },
    monthlyCheckIns,
    checkedInToday,
    nextCharge,
    currentLoad,
    loadGain,
    programDay: {
      current: programCurrent,
      total: 30,
      percentage: Math.round((programCurrent / 30) * 100),
    },
    lastCheckInAt: checkIns[0]?.checkedInAt ?? null,
  }
}
