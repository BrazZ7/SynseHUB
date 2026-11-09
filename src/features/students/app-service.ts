import 'server-only'

import {
  diasComRegistro,
  inicioDaJanelaDeDias,
  inicioDoDiaLocal,
  inicioDoMesLocal,
} from '@/features/students/janelas'
import { metaDaSemana, percentualDaMeta } from '@/features/students/semana'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import { TIMEZONE } from '@/config/app'
import { getDataSource } from '@/lib/database'
import { daysBetween } from '@/lib/utils'
import type { Charge, StudentIntake, WorkoutPlan } from '@/types/domain'

/** Dados consolidados da tela Hoje do Synse App. */
export type StudentHomeData = {
  name: string
  synseId: string
  planName: string | null
  todayWorkout: (WorkoutPlan & { exerciseCount: number }) | null
  /**
   * Dias treinados nos **últimos sete dias**, não registros.
   *
   * Dois check-ins no mesmo dia são um dia treinado; check-in na recepção e
   * Treino Ativo no mesmo dia também. Contar registros era a contagem duplicada
   * que o pedido manda evitar.
   *
   * ── Sete dias corridos, e não a semana civil ──────────────────────────────
   *
   * Esta janela é "hoje e os seis anteriores", e a do resumo semanal (0066) é
   * a semana de segunda a domingo. São duas perguntas diferentes e as duas
   * valem: esta nunca zera, e a do resumo fecha um ciclo.
   *
   * O risco é a tela — e não a conta: dois números parecidos com rótulos
   * iguais seriam lidos como o mesmo número. Por isso o rótulo aqui diz
   * "últimos 7 dias", e o do resumo diz a semana com as datas.
   *
   * `target` é o que o aluno declarou na entrada guiada (0063); `declarada`
   * diz se foi ele quem escolheu, para a tela não fingir que escolheu.
   */
  weeklyGoal: { done: number; target: number; percentage: number; declarada: boolean }
  monthlyCheckIns: number
  checkedInToday: boolean
  nextCharge: Charge | null
  currentLoad: number | null
  loadGain: number | null
  loadExercise: { id: string; nome: string } | null
  programDay: { current: number; total: number; percentage: number }
  lastCheckInAt: string | null
  /**
   * O que o aluno declarou na entrada guiada, ou nulo.
   *
   * Devolvido daqui porque a tela de hoje já precisava dele para o desvio da
   * entrada guiada e lia por conta própria: agora é uma leitura só, usada
   * pelos dois — o desvio e a meta.
   */
  intake: StudentIntake | null
}

export async function getStudentHome(
  organizationId: string,
  studentId: string,
): Promise<StudentHomeData> {
  const dataSource = await getDataSource()

  const [student, assignments, checkIns, treinos, nextCharge, cargas, intake] =
    await Promise.all([
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
    /*
     * A entrada guiada, dentro do lote: ela decide a **meta** da semana, e
     * ler em série acrescentaria uma ida ao banco a toda abertura da tela mais
     * vista do produto.
     *
     * `seAindaNaoMigrou` porque a 0063 pode não ter sido colada: sem a tabela,
     * `intake` é nulo e a meta cai no padrão, que é o comportamento de antes.
     */
    dataSource.getStudentIntake(studentId).catch(seAindaNaoMigrou(null)),
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

  const meta = metaDaSemana(intake?.daysPerWeek)

  // Programa Synse 30: derivado da data de matrícula, ciclo de 30 dias.
  const enrolledDays = student ? daysBetween(student.enrolledAt) : 0
  const programCurrent = (enrolledDays % 30) + 1

  return {
    name: student?.name ?? 'Aluno',
    synseId: student?.synseId ?? '',
    planName: student?.planName ?? null,
    todayWorkout: todayPlan ? { ...todayPlan, exerciseCount: exercises.length } : null,
    /*
     * A meta é a declarada, e não mais um 5 cravado aqui.
     *
     * Quem respondeu "três dias por semana" na entrada guiada e treinou três
     * via 60% e um anel pela metade: a tela chamava de fracasso a semana que a
     * pessoa cumpriu. Sem resposta, cai em `META_PADRAO` e a tela diz que é
     * padrão.
     */
    weeklyGoal: {
      done: weeklyDone,
      target: meta.dias,
      percentage: percentualDaMeta(weeklyDone, meta.dias),
      declarada: meta.declarada,
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
    intake,
  }
}
