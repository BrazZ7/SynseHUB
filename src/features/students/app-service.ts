import 'server-only'

import {
  diasComRegistro,
  inicioDaJanelaDeDias,
  inicioDoDiaLocal,
  inicioDoMesLocal,
} from '@/features/students/janelas'
import { TIMEZONE } from '@/config/app'
import { getDataSource } from '@/lib/database'
import { daysBetween } from '@/lib/utils'
import type { Charge, WorkoutPlan } from '@/types/domain'

/** Dados consolidados da tela Hoje do Synse App. */
export type StudentHomeData = {
  name: string
  synseId: string
  planName: string | null
  todayWorkout: (WorkoutPlan & { exerciseCount: number }) | null
  /**
   * Dias treinados na semana, não registros.
   *
   * Dois check-ins no mesmo dia são um dia treinado; check-in na recepção e
   * Treino Ativo no mesmo dia também. Contar registros era a contagem duplicada
   * que o pedido manda evitar.
   */
  weeklyGoal: { done: number; target: number; percentage: number }
  monthlyCheckIns: number
  checkedInToday: boolean
  nextCharge: Charge | null
  currentLoad: number | null
  loadGain: number | null
  loadExercise: { id: string; nome: string } | null
  programDay: { current: number; total: number; percentage: number }
  lastCheckInAt: string | null
}

const WEEKLY_TARGET = 5

export async function getStudentHome(
  organizationId: string,
  studentId: string,
): Promise<StudentHomeData> {
  const dataSource = await getDataSource()

  const [student, assignments, checkIns, treinos, nextCharge, cargas] = await Promise.all([
    dataSource.getStudent(organizationId, studentId),
    dataSource.listAssignmentsForStudent(organizationId, studentId),
    dataSource.listCheckInsForStudent(organizationId, studentId, 90),
    /*
     * Os treinos concluídos entram na conta da semana.
     *
     * A meta dizia "X de 5 treinos" e contava **check-ins** — presença na
     * academia. Quem treina em casa, sem academia vinculada, nunca saía de
     * zero por mais que treinasse todo dia; e quem passava na recepção sem
     * treinar somava.
     *
     * Trinta linhas bastam: a janela é de sete dias, e ninguém faz trinta
     * treinos numa semana.
     */
    dataSource.listWorkoutSessions(studentId, 30),
    dataSource.getNextOpenCharge(organizationId, studentId),
    /*
     * Duas linhas, e não o histórico inteiro. A home usava exatamente a
     * primeira e a última carga — e como `listWorkoutLogs` vem em ordem
     * crescente, o corte do PostgREST levava justamente a última: o "ganho de
     * carga" congelava num valor antigo sem nada na tela indicando isso.
     */
    dataSource.getLoadProgress(organizationId, studentId),
  ])

  /*
   * As fichas **deste aluno**, e não as da academia.
   *
   * A home lia todas as fichas da organização para achar as duas ou três
   * atribuídas. Sem teto, e numa academia de anos isso são centenas de linhas
   * na tela mais aberta do produto — para nomear três. Agora a pergunta leva
   * os ids das atribuições, então ela é limitada pelo aluno.
   *
   * Depois das outras, e não junto: ela depende de `assignments`.
   */
  const plans = await dataSource.listWorkoutPlansByIds(
    organizationId,
    assignments.map((assignment) => assignment.workoutPlanId),
  )

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

  /*
   * ── As janelas são do fuso do produto, não do servidor ───────────────────
   *
   * Eram `new Date(ano, mes, dia)`, isto é, meia-noite de quem executa o
   * código — UTC no servidor. No horário de Brasília o dia virava às 21h: a
   * sequência de dias, logo acima nesta mesma tela, usa `diaLocal` com o fuso
   * e dizia "treinou hoje" enquanto este cartão dizia que não.
   *
   * A semana é "hoje e os seis dias anteriores", e não "168 horas atrás": a
   * janela por horas faz o número cair no meio do dia conforme o relógio anda,
   * e quem abre o app à noite vê menos do que viu de manhã sem ter feito nada.
   */
  const now = new Date()
  const weekStart = inicioDaJanelaDeDias(now, TIMEZONE, 7)
  const monthStart = inicioDoMesLocal(now, TIMEZONE)
  const todayStart = inicioDoDiaLocal(now, TIMEZONE)

  /*
   * Dias treinados: check-in ou treino concluído, contados por dia distinto.
   * Dois registros no mesmo dia são um dia.
   */
  const diasDeTreino = [
    ...checkIns.map((c) => c.checkedInAt),
    ...treinos
      .filter((sessao) => sessao.status === 'COMPLETED')
      .map((sessao) => sessao.completedAt ?? sessao.startedAt),
  ]

  const weeklyDone = diasComRegistro(diasDeTreino, TIMEZONE, weekStart)
  const monthlyCheckIns = checkIns.filter((c) => c.checkedInAt >= monthStart).length
  const checkedInToday = checkIns.some((c) => c.checkedInAt >= todayStart)

  /*
   * ── O que estes dois números significam agora ───────────────────────────
   *
   * A evolução **num exercício só**: o que a pessoa mais treinou. Antes era a
   * primeira carga de qualquer exercício contra a última de qualquer
   * exercício — uma rosca de 20 kg seguida de um agachamento de 100 aparecia
   * como "+80 kg de ganho". Decisão do dono do produto, 13/10/2026.
   *
   * E vinham de `workout_logs`, que **nada no produto escreve**: em academia
   * real os dois eram `—` para sempre. Agora saem de onde o treino entra.
   *
   * Sem dois dias do mesmo exercício não há ganho, e `null` é o certo: zero
   * diria "você não evoluiu" para quem acabou de começar.
   */
  const currentLoad = cargas.ultima
  const firstLoad = cargas.primeira
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
    /** De qual exercício os dois números falam. A tela diz o nome. */
    loadExercise: cargas.exercicio,
    programDay: {
      current: programCurrent,
      total: 30,
      percentage: Math.round((programCurrent / 30) * 100),
    },
    lastCheckInAt: checkIns[0]?.checkedInAt ?? null,
  }
}
