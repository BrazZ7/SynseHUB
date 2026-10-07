import { generateSynseId } from '@/lib/synse-id'
import { AppError } from '@/lib/errors'
import { FAIXAS, faixaDeDias, type OverdueBucket } from '@/features/payments/faixas-de-atraso'
import {
  baldeDoPeriodo,
  type BaldeDaSerie,
  type BodySeriesPoint,
} from '@/features/synse-body/baldes-da-serie'
import { daysBetween } from '@/lib/utils'
import type {
  ChargeHistoryFilters,
  LoadProgress,
  WorkoutLogFilters,
  ChargeWithStudent,
  CrmSummary,
  BodyHistoryFilters,
  LeadFilters,
  OverdueFilters,
  OverdueSummary,
  PairUserDeviceInput,
  CheckInWithStudent,
  DataSource,
  Paginated,
  SaveActivityInput,
  SaveAssessmentInput,
  LogWorkoutSetInput,
  SaveClassScheduleInput,
  SaveContentInput,
  SaveSynseContentInput,
  SaveGymChallengeInput,
  SaveLeadInput,
  SaveNutritionPlanInput,
  ScheduleWindow,
  StudentFilters,
  StudentListItem,
} from '@/lib/database/data-source'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
import { appendDemoMutation, type DemoMutation } from '@/lib/database/demo-journal'
import { BASELINE_CHALLENGES, currentCycle } from '@/lib/baseline/challenges'
import { CONSENT_DOCUMENTS } from '@/lib/consents/catalog'
import { BASELINE_MEAL_PLAN } from '@/lib/baseline/meal-plan'
import { DEFAULT_WORKOUT_PREFERENCES } from '@/types/domain'
import {
  densidadeCorporal,
  imc,
  percentualDeGordura,
  somaDasDobras,
} from '@/features/assessments/composition'
const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

import type {
  Activity,
  BodyMeasurement,
  BodyMeasurementShare,
  BodyPeriod,
  UserDevice,
  ActivityPrivacy,
  ActivityRoutePoint,
  ActivitySplit,
  ActivitySummary,
  AppNotification,
  Assessment,
  BaselineChallenge,
  ConsentState,
  ContentItem,
  ItemTrancado,
  Program,
  ProgramEnrollment,
  ProgramStep,
  ProgramaNaLista,
  ProgramaTrancado as ProgramaTrancadoTipo,
  Recipe,
  ReceitaTrancada as ReceitaTrancadaTipo,
  EquipeParaAutorizar,
  ConsentType,
  StaffInvite,
  UserRole,
  ChallengeEntry,
  ChallengeMedal,
  Charge,
  ClassBooking,
  ClassBookingStatus,
  ClassSchedule,
  ClassSession,
  ClassSessionForStudent,
  ClassOccupancyRow,
  ExercisePersonalRecord,
  ExerciseProgressPoint,
  GymChallenge,
  GymChallengeForStudent,
  GymChallengeRankRow,
  GymTrainingReport,
  NutritionPlan,
  NutritionPlanWithMeals,
  NutritionTotals,
  StudentAtRisk,
  OngoingWorkout,
  WorkoutPreferences,
  WorkoutSessionSummary,
  Friend,
  FriendRankRow,
  WorkoutAdherenceRow,
  WorkoutTotals,
  PersonalRecord,
  SportType,
  CheckIn,
  CollectionRule,
  Exercise,
  Lead,
  LeadEvent,
  LeadEventKind,
  LeadStage,
  Membership,
  MembershipPlan,
  Organization,
  OrganizationBillingSettings,
  PaymentAccount,
  Student,
  WorkoutAssignment,
  WorkoutExercise,
  WorkoutLog,
  WorkoutPlan,
  StudentStatus,
} from '@/types/domain'

/**
 * Data source em memória.
 *
 * O dataset base é determinístico e **nunca é alterado**: ele é reconstruído
 * idêntico em qualquer processo. O que o visitante muda vira uma entrada no
 * diário (`demo-journal`), guardado num cookie e aplicado como sobreposição na
 * leitura.
 *
 * Essa separação é o que faz a demonstração funcionar em ambiente serverless,
 * onde cada requisição pode cair numa execução diferente: escrita em variável
 * de módulo sumiria na navegação seguinte. E dá isolamento de graça — duas
 * pessoas testando o mesmo link não enxergam as alterações uma da outra.
 */
export class DemoDataSource implements DataSource {
  readonly kind = 'demo' as const

  /**
   * Dataset base, compartilhado e somente leitura. Precisa ser o primeiro
   * campo: os índices abaixo são inicializados a partir dele.
   */
  private readonly db = getDemoDataset()

  // ── Sobreposição do visitante ──────────────────────────────────────────────
  private readonly addedPlans: MembershipPlan[] = []
  private readonly addedStudents: Student[] = []
  private readonly addedMemberships: Membership[] = []
  private readonly addedCharges: Charge[] = []
  private readonly addedCheckIns: CheckIn[] = []
  /*
   * O dataset base é um singleton compartilhado entre todos os visitantes: o
   * que um monta não pode aparecer na demonstração do outro. Por isso o que é
   * criado aqui vive na instância, reconstruída a cada requisição a partir do
   * diário no cookie de quem está navegando.
   */
  private readonly addedWorkoutPlans: WorkoutPlan[] = []
  private readonly addedWorkoutExercises: WorkoutExercise[] = []
  private readonly addedAssignments: WorkoutAssignment[] = []
  /** Campos de cobrança alterados, sem tocar no objeto base. */
  private readonly chargePatches = new Map<string, Partial<Charge>>()
  private readonly studentStatusPatches = new Map<string, Student['status']>()
  /**
   * Treinos editados na demonstração.
   *
   * Um mapa de sobreposição, e não uma alteração no arranjo original: o treino
   * pode ser tanto um dos semeados quanto um criado na própria demonstração, e
   * só a sobreposição atende aos dois sem duplicar a lista.
   */
  private readonly workoutEdits = new Map<
    string,
    {
      name: string
      goal: string | null
      split: string
      ex: Array<[string, number, string, number]>
    }
  >()

  private readonly studentEdits = new Map<
    string,
    { name: string; phone: string | null; goal: string | null; trainerId: string | null }
  >()
  /** Instante em que o visitante abriu o sino. Antes disso, tudo lido. */
  private notificationsReadAt: string | null = null
  private consentAnswers = new Map<string, { accepted: boolean; at: string }>()
  private readonly demoInvites: StaffInvite[] = []
  private readonly addedAssessments: Assessment[] = []
  private readonly challengeEntries: ChallengeEntry[] = []
  private readonly demoSchedules: ClassSchedule[] = []
  private readonly demoSessions: ClassSession[] = []
  private readonly demoBookings: ClassBooking[] = []
  private agendaPronta = false
  /**
   * As amizades da visita, por cima das que a semente traz.
   *
   * `null` como valor significa desfeita: sobrescrever a semente exige poder
   * dizer "esta não existe mais", e remover da tabela não bastaria porque a
   * semente volta a valer na leitura seguinte.
   */
  private readonly friendEdits = new Map<string, Friend | null>()
  private readonly demoWorkoutSessions: WorkoutSessionSummary[] = []
  private readonly demoSetLogs = new Map<string, { reps: number; weight: number | null }[]>()
  /** `sessionId:clientId` já gravados. É o `unique` da 0026, aqui. */
  private readonly demoSetClientIds = new Set<string>()
  private demoWorkoutPrefs: WorkoutPreferences = { ...DEFAULT_WORKOUT_PREFERENCES }
  private readonly addedLeads: Lead[] = []
  private readonly leadEdits = new Map<string, Lead>()
  private readonly demoLeadEvents: LeadEvent[] = []
  private readonly demoGymChallenges: GymChallenge[] = []
  private readonly demoParticipations = new Map<
    string,
    { rankingOptIn: boolean; progress: number; completedAt: string | null }
  >()
  private desafiosProntos = false
  private readonly demoNutritionPlans: NutritionPlanWithMeals[] = []
  private nutricaoPronta = false
  private readonly demoContent: ContentItem[] = []
  /**
   * O acervo Synse da demonstração.
   *
   * Separado de `demoContent` porque é outra coisa: conteúdo sem dono, da
   * plataforma. Misturar os dois faria a tela da academia listar o acervo, que
   * é justamente o engano que a 0039 existe para impedir.
   */
  private readonly demoAcervo: ContentItem[] = []
  private acervoPronto = false
  private conteudosProntos = false

  // ── Índices ────────────────────────────────────────────────────────────────
  private readonly planById = new Map(this.db.plans.map((p) => [p.id, p]))
  private readonly staffById = new Map(this.db.staff.map((s) => [s.id, s]))

  private membershipByStudent!: Map<string, Membership>
  private studentById!: Map<string, Student>
  private lastCheckInIndex: Map<string, string> | null = null
  private nextChargeIndex: Map<string, Charge> | null = null

  /**
   * Quem está vendo assina o Synse+?
   *
   * Em produção ninguém pergunta isto à aplicação: a RLS esconde o que é pago
   * e `acervo_trancado` decide sozinha a quem mostrar a vitrine. Na
   * demonstração não há RLS nenhuma, então sem este campo o aluno do plano
   * grátis leria o e-book inteiro — e a vitrine do cadeado, que é justamente
   * o que a persona "Aluno no plano grátis" existe para mostrar, nunca
   * apareceria.
   *
   * Vem do cookie da persona, lido em `lib/database/index.ts`. Não é um
   * parâmetro de método de propósito: numa assinatura pública ele pareceria o
   * cliente declarando o próprio direito, que é a forma de um bug de
   * segurança mesmo quando não é um.
   */
  private readonly temPlus: boolean
  /** Conta de plataforma: enxerga o que publica, como `is_super_admin()`. */
  private readonly ehPlataforma: boolean

  constructor(
    journal: DemoMutation[] = [],
    opcoes: { temPlus?: boolean; ehPlataforma?: boolean; perfilAtual?: string | null } = {},
  ) {
    this.temPlus = opcoes.temPlus ?? false
    this.ehPlataforma = opcoes.ehPlataforma ?? false
    this.perfilAtual = opcoes.perfilAtual ?? null
    for (const mutation of journal) this.apply(mutation)
    this.reindex()
  }

  /** Reconstrói o diário de um visitante sobre o dataset base. */
  private apply(mutation: DemoMutation) {
    switch (mutation.t) {
      case 'student': {
        const plan = mutation.planId ? this.planById.get(mutation.planId) : undefined
        const enrolledAt = mutation.at.slice(0, 10)

        this.addedStudents.push({
          id: mutation.id,
          organizationId: DEMO_ORG_ID,
          userProfileId: mutation.profileId,
          synseId: mutation.synseId,
          name: mutation.name,
          email: mutation.email,
          // Em demonstração ninguém informa CPF: não há cobrança real para emitir.
          taxId: null,
          phone: mutation.phone,
          avatarUrl: null,
          birthDate: null,
          status: 'ACTIVE',
          goal: mutation.goal,
          enrolledAt,
          cancelledAt: null,
          trainerId: mutation.trainerId,
          membershipId: mutation.membershipId,
          notes: null,
        })

        if (plan && mutation.membershipId) {
          this.addedMemberships.push({
            id: mutation.membershipId,
            organizationId: DEMO_ORG_ID,
            studentId: mutation.id,
            planId: plan.id,
            startedAt: enrolledAt,
            endsAt: null,
            billingDay: mutation.billingDay,
            status: 'ACTIVE',
            price: plan.price,
          })

          if (mutation.chargeId) {
            const created = new Date(mutation.at)
            const due = new Date(created.getFullYear(), created.getMonth() + 1, mutation.billingDay)
            this.addedCharges.push({
              id: mutation.chargeId,
              organizationId: DEMO_ORG_ID,
              studentId: mutation.id,
              membershipId: mutation.membershipId,
              providerChargeId: null,
              description: `Mensalidade ${MONTH_YEAR.format(due)}`,
              amount: plan.price,
              dueDate: due.toISOString().slice(0, 10),
              paymentMethod: null,
              status: 'PENDING',
              paidAt: null,
              billingReference: `${mutation.membershipId}:${due.getFullYear()}-${due.getMonth() + 1}`,
              createdAt: mutation.at,
              updatedAt: mutation.at,
            })
          }
        }
        break
      }

      case 'plan': {
        const plan: MembershipPlan = {
          id: mutation.id,
          organizationId: DEMO_ORG_ID,
          name: mutation.name,
          description: mutation.description,
          price: mutation.price,
          billingCycle: mutation.billingCycle,
          enrollmentFee: mutation.enrollmentFee,
          weeklyAccessDays: mutation.weeklyAccessDays,
          benefits: mutation.benefits,
          autoCharge: mutation.autoCharge,
          status: 'ACTIVE',
          createdAt: mutation.at,
        }
        this.addedPlans.push(plan)
        this.planById.set(plan.id, plan)
        break
      }

      case 'paid': {
        this.chargePatches.set(mutation.chargeId, {
          status: 'PAID',
          paidAt: mutation.at,
          paymentMethod: mutation.method,
          updatedAt: mutation.at,
        })
        break
      }

      case 'chal': {
        this.challengeEntries.push({
          id: `entry_${mutation.code}_${mutation.cycle}`,
          challengeCode: mutation.code,
          cycle: mutation.cycle,
          targetValue:
            BASELINE_CHALLENGES.find((item) => item.code === mutation.code)?.targetValue ?? 0,
          progressValue: 0,
          chosenAt: mutation.at,
          closedAt: null,
        })
        break
      }
      case 'chalprog': {
        const entrada = this.challengeEntries.find(
          (item) => item.challengeCode === mutation.code && item.cycle === mutation.cycle,
        )
        if (entrada) entrada.progressValue += mutation.delta
        break
      }
      case 'prog': {
        /*
         * `montarProgramas` antes de tudo: o diário é reaplicado no
         * construtor, e sem a semente montada não há duração para recalcular
         * o próximo dia.
         */
        this.montarProgramas()
        const feitos = this.demoMatriculas.get(mutation.id)?.completedDays ?? []

        if (mutation.a === 'start') this.aplicarProgresso(mutation.id, [])
        else if (mutation.a === 'quit') {
          const atual = this.demoMatriculas.get(mutation.id)
          if (atual) this.demoMatriculas.set(mutation.id, { ...atual, status: 'ABANDONED' })
        } else if (mutation.d != null) {
          this.aplicarProgresso(
            mutation.id,
            mutation.a === 'day' ? [...feitos, mutation.d] : feitos.filter((d) => d !== mutation.d),
          )
        }
        break
      }
      case 'share': {
        /*
         * A autorização do corpo, reaplicada do cookie.
         *
         * Não vai para o mapa estático: o cabeçalho de `demo-journal.ts`
         * explica por quê — variável de módulo some na navegação seguinte, e
         * foi exatamente o que aconteceu aqui. Autorizar alguém na tela não
         * tinha efeito nenhum, e numa tela de privacidade esse é o pior
         * defeito possível: o gesto parece feito e não foi.
         */
        if (mutation.a === 'revoke') this.autorizacoesDaSessao.delete(mutation.id)
        else {
          this.autorizacoesDaSessao.set(mutation.id, {
            id: `share_${mutation.id}`,
            /*
             * O **perfil** do aluno, não a matrícula dele. Guardava
             * `studentIdForApp`, que é `students.id`, e ninguém notava porque
             * a tela do aluno só lia o nome de quem foi autorizado. Quando o
             * painel do professor passou a casar dono com perfil, a
             * autorização simplesmente não aparecia.
             */
            userProfileId: this.perfilDoAlunoDoApp(),
            sharedWithProfileId: mutation.id,
            sharedWithName: mutation.nome ?? null,
            organizationId: this.db.organization.id,
            grantedAt: new Date().toISOString(),
            revokedAt: null,
          })
        }
        break
      }
      case 'actpriv': {
        /*
         * Sem `p` é apagada. Guardadas em campos de instância, nunca nos
         * mapas estáticos: aquilo some entre requisições, e a corrida voltava
         * a aparecer — ou voltava a ficar pública.
         */
        if (mutation.p) this.privacidadeDaCorrida.set(mutation.id, mutation.p)
        else this.corridasApagadas.add(mutation.id)
        break
      }
      case 'wpref': {
        this.demoWorkoutPrefs = {
          autoRest: mutation.autoRest,
          sound: mutation.sound,
          vibration: mutation.vibration,
          autoAdvance: mutation.autoAdvance,
          keepScreenAwake: mutation.keepScreenAwake,
          defaultRestSeconds: mutation.rest,
        }
        break
      }
      case 'lead': {
        /*
         * Reaplica o que o visitante fez com o lead. Cada verbo reconstrói o
         * mesmo efeito do caminho normal — inclusive o evento no histórico,
         * que em produção é o gatilho da 0028 quem escreve.
         */
        const lead = this.leads().find((l) => l.id === mutation.id)
        if (!lead) break

        if (mutation.a === 'event') {
          this.demoLeadEvents.push(
            this.evento(mutation.id, mutation.k ?? 'NOTE', null, null, mutation.b ?? null),
          )
          break
        }

        if (mutation.a === 'convert') {
          this.demoLeadEvents.push(
            this.evento(mutation.id, 'STAGE_CHANGE', lead.stage, 'ENROLLED', null),
          )
          this.leadEdits.set(mutation.id, {
            ...lead,
            stage: 'ENROLLED',
            convertedStudentId: `stu_lead_${mutation.id}`,
            nextFollowUpAt: null,
          })
          break
        }

        if (!mutation.s || lead.stage === mutation.s) break
        this.demoLeadEvents.push(
          this.evento(mutation.id, 'STAGE_CHANGE', lead.stage, mutation.s, mutation.b ?? null),
        )
        this.leadEdits.set(mutation.id, {
          ...lead,
          stage: mutation.s,
          lostReason: mutation.b ?? null,
        })
        break
      }
      case 'wsess': {
        /*
         * Reconstrói o treino em andamento do visitante. `start` recria a
         * sessão, `set` incrementa a contagem, `finish` fecha — a mesma
         * ordem em que as três entradas foram gravadas.
         */
        if (mutation.a === 'start' && mutation.id) {
          this.demoWorkoutSessions.push({
            id: mutation.id,
            organizationId: DEMO_ORG_ID,
            studentId: this.db.studentIdForApp,
            workoutPlanId: mutation.plano ?? null,
            planName: null,
            clientId: mutation.id,
            status: 'IN_PROGRESS',
            startedAt: mutation.at ?? new Date().toISOString(),
            completedAt: null,
            durationSeconds: null,
            totalSets: 0,
            totalReps: 0,
            volumeKg: 0,
          })
          break
        }

        const aberta = this.demoWorkoutSessions.find((s) => s.status === 'IN_PROGRESS')
        if (!aberta) break
        if (mutation.a === 'set') aberta.totalSets += 1
        else {
          aberta.status = 'COMPLETED'
          aberta.completedAt = new Date().toISOString()
        }
        break
      }
      case 'notifread': {
        this.notificationsReadAt = mutation.at
        break
      }
      case 'sstatus': {
        this.studentStatusPatches.set(mutation.id, mutation.status)
        break
      }
      case 'sedit': {
        this.studentEdits.set(mutation.id, mutation)
        break
      }
      case 'wedit': {
        this.workoutEdits.set(mutation.id, {
          name: mutation.name,
          goal: mutation.goal,
          split: mutation.split,
          ex: mutation.ex,
        })
        break
      }
      case 'wplan': {
        this.addedWorkoutPlans.push({
          id: mutation.id,
          organizationId: DEMO_ORG_ID,
          name: mutation.name,
          goal: mutation.goal,
          splitLabel: mutation.split,
          createdByStaffId: null,
          status: 'PUBLISHED',
          createdAt: mutation.at,
        })
        mutation.ex.forEach(([exerciseId, sets, reps, rest], indice) => {
          this.addedWorkoutExercises.push({
            id: `${mutation.id}_ex${indice}`,
            workoutPlanId: mutation.id,
            exerciseId,
            order: indice + 1,
            sets,
            reps,
            restSeconds: rest,
            suggestedLoad: null,
            notes: null,
          })
        })
        break
      }
      case 'wassign': {
        this.addedAssignments.push({
          id: mutation.id,
          organizationId: DEMO_ORG_ID,
          workoutPlanId: mutation.planId,
          studentId: mutation.studentId,
          assignedAt: mutation.at,
          validUntil: mutation.until,
        })
        break
      }
      case 'consent': {
        this.consentAnswers.set(mutation.code, { accepted: mutation.ok, at: mutation.at })
        break
      }
      case 'friend': {
        if (mutation.action === 'remove') {
          this.friendEdits.set(mutation.id, null)
          break
        }

        const base =
          this.friendEdits.get(mutation.id) ??
          this.db.friends.find((amigo) => amigo.friendshipId === mutation.id)

        const outro = this.db.userProfiles.find((perfil) => perfil.id === mutation.profileId)
        if (!base && !outro) break

        this.friendEdits.set(mutation.id, {
          friendshipId: mutation.id,
          profileId: mutation.profileId,
          name: base?.name ?? outro?.name ?? 'Convidado',
          synseId: base?.synseId ?? outro?.synseId ?? '',
          // Recusar some da lista, como no banco: a linha vira "não existe".
          status: mutation.action === 'accept' ? 'ACCEPTED' : 'PENDING',
          souQuemPediu: mutation.action === 'request' ? true : (base?.souQuemPediu ?? false),
          noRanking: base?.noRanking ?? false,
          since: base?.since ?? mutation.at,
        })
        if (mutation.action === 'decline') this.friendEdits.set(mutation.id, null)
        break
      }
      case 'checkin': {
        this.addedCheckIns.push({
          id: mutation.id,
          organizationId: DEMO_ORG_ID,
          studentId: mutation.studentId,
          checkedInAt: mutation.at,
          method: mutation.method,
          deviceId: null,
        })
        break
      }
    }
  }

  /**
   * Um aluno é inadimplente quando tem cobrança vencida — nunca por um campo
   * de status que possa divergir. Depois de uma baixa, isso é recalculado.
   */
  private recomputeArrears() {
    if (this.chargePatches.size === 0) return
    const settled = new Set<string>()
    for (const charge of this.charges()) {
      if (charge.status === 'OVERDUE') settled.add(charge.studentId)
    }
    for (const [chargeId] of this.chargePatches) {
      const base = this.db.charges.find((c) => c.id === chargeId)
      const studentId =
        base?.studentId ?? this.addedCharges.find((c) => c.id === chargeId)?.studentId
      if (!studentId || settled.has(studentId)) continue
      const student =
        this.studentById?.get(studentId) ?? this.db.students.find((s) => s.id === studentId)
      if (student?.status === 'OVERDUE') this.studentStatusPatches.set(studentId, 'ACTIVE')
    }
  }

  private reindex() {
    this.membershipByStudent = new Map(this.memberships().map((m) => [m.studentId, m]))
    this.studentById = new Map(this.students().map((s) => [s.id, s]))
    this.recomputeArrears()
    if (this.studentStatusPatches.size > 0) {
      this.studentById = new Map(this.students().map((s) => [s.id, s]))
    }
    this.invalidate()
  }

  // ── Coleções com a sobreposição aplicada ───────────────────────────────────
  private students(): Student[] {
    /*
     * As alterações são aplicadas em cópias, nunca no objeto do dataset.
     *
     * O dataset é um singleton compartilhado por todos os visitantes: escrever
     * `aluno.status = ...` nele fazia a mudança de um aparecer na demonstração
     * do outro, e ficar lá até o processo reiniciar.
     */
    const alterado = this.studentStatusPatches.size > 0 || this.studentEdits.size > 0

    const base = !alterado
      ? this.db.students
      : this.db.students.map((s) => {
          const status = this.studentStatusPatches.get(s.id)
          const edicao = this.studentEdits.get(s.id)
          if (!status && !edicao) return s
          return { ...s, ...(status ? { status } : {}), ...(edicao ?? {}) }
        })

    return this.addedStudents.length ? [...base, ...this.addedStudents] : base
  }

  private plans(): MembershipPlan[] {
    return this.addedPlans.length ? [...this.db.plans, ...this.addedPlans] : this.db.plans
  }

  private memberships(): Membership[] {
    return this.addedMemberships.length
      ? [...this.db.memberships, ...this.addedMemberships]
      : this.db.memberships
  }

  private charges(): Charge[] {
    const base =
      this.chargePatches.size === 0
        ? this.db.charges
        : this.db.charges.map((c) => {
            const patch = this.chargePatches.get(c.id)
            return patch ? { ...c, ...patch } : c
          })
    if (!this.addedCharges.length) return base
    const added = this.addedCharges.map((c) => {
      const patch = this.chargePatches.get(c.id)
      return patch ? { ...c, ...patch } : c
    })
    return [...base, ...added]
  }

  /** Presenças novas primeiro: o restante já vem do mais recente ao mais antigo. */
  private checkIns(): CheckIn[] {
    if (!this.addedCheckIns.length) return this.db.checkIns
    const added = [...this.addedCheckIns].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
    return [...added, ...this.db.checkIns]
  }

  private invalidate() {
    this.lastCheckInIndex = null
    this.nextChargeIndex = null
  }

  private lastCheckInFor(studentId: string): string | null {
    if (!this.lastCheckInIndex) {
      const index = new Map<string, string>()
      // this.db.checkIns está ordenado do mais recente para o mais antigo.
      for (const checkIn of this.checkIns()) {
        if (!index.has(checkIn.studentId)) index.set(checkIn.studentId, checkIn.checkedInAt)
      }
      this.lastCheckInIndex = index
    }
    return this.lastCheckInIndex.get(studentId) ?? null
  }

  private nextChargeFor(studentId: string): Charge | null {
    if (!this.nextChargeIndex) {
      const index = new Map<string, Charge>()
      const open = this.charges()
        .filter((c) => c.status === 'PENDING' || c.status === 'OVERDUE')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      for (const charge of open) {
        if (!index.has(charge.studentId)) index.set(charge.studentId, charge)
      }
      this.nextChargeIndex = index
    }
    return this.nextChargeIndex.get(studentId) ?? null
  }

  private toListItem(student: Student): StudentListItem {
    const membership = this.membershipByStudent.get(student.id)
    const plan = membership ? (this.planById.get(membership.planId) ?? null) : null
    const trainer = student.trainerId ? this.staffById.get(student.trainerId) : undefined
    const nextCharge = this.nextChargeFor(student.id)
    return {
      ...student,
      planName: plan?.name ?? null,
      planPrice: membership?.price ?? plan?.price ?? null,
      trainerName: trainer?.name ?? null,
      nextChargeDueDate: nextCharge?.dueDate ?? null,
      nextChargeAmount: nextCharge?.amount ?? null,
      lastCheckInAt: this.lastCheckInFor(student.id),
    }
  }

  private scoped<T extends { organizationId: string }>(rows: T[], organizationId: string): T[] {
    // Espelha o que a RLS faz no Postgres.
    return rows.filter((row) => row.organizationId === organizationId)
  }

  // ── Organização ────────────────────────────────────────────────────────────
  async getOrganization(organizationId: string): Promise<Organization | null> {
    if (organizationId === DEMO_ORG_ID) return this.db.organization
    if (organizationId === this.db.secondOrganization.id) return this.db.secondOrganization
    return null
  }

  async listOrganizations(): Promise<Organization[]> {
    return [this.db.organization, this.db.secondOrganization]
  }

  async getBillingSettings(organizationId: string): Promise<OrganizationBillingSettings | null> {
    return organizationId === DEMO_ORG_ID ? this.db.billingSettings : null
  }

  /** Em demonstração o dado fiscal não abre subconta nenhuma: aceita e ignora. */
  async updateFiscalData(): Promise<void> {}

  async getPaymentAccount(organizationId: string): Promise<PaymentAccount | null> {
    return organizationId === DEMO_ORG_ID ? this.db.paymentAccount : null
  }

  async listStaff(organizationId: string) {
    return this.db.staff.filter((s) => s.organizationId === organizationId)
  }

  // ── Planos ─────────────────────────────────────────────────────────────────
  /** Em demonstração não há código de convite a validar: a academia é uma só. */
  async joinOrganizationAsStudent(): Promise<string> {
    throw new Error('Entrada por código de convite não existe em modo de demonstração.')
  }

  async joinSynseAsSoloStudent(): Promise<string> {
    throw new Error('Entrada sem academia não existe em modo de demonstração.')
  }

  async openProfessionalSpace(): Promise<string> {
    throw new Error('Abrir espaço profissional não existe em modo de demonstração.')
  }

  async updateStudentStatus(input: {
    organizationId: string
    studentId: string
    status: StudentStatus
  }): Promise<void> {
    await appendDemoMutation({ t: 'sstatus', id: input.studentId, status: input.status })
  }

  async updateStudent(input: {
    organizationId: string
    studentId: string
    name: string
    phone: string | null
    taxId: string | null
    goal: string | null
    trainerId: string | null
    planId: string | null
    billingDay: number
  }): Promise<void> {
    // O CPF não viaja no diário: a demonstração não guarda documento de
    // ninguém, e o orçamento do cookie é curto demais para o que não se usa.
    await appendDemoMutation({
      t: 'sedit',
      id: input.studentId,
      name: input.name,
      phone: input.phone,
      goal: input.goal,
      trainerId: input.trainerId,
      planId: input.planId,
      day: input.billingDay,
    })
  }

  async listPlans(organizationId: string): Promise<MembershipPlan[]> {
    return this.scoped(this.plans(), organizationId)
  }

  async createOrganization(): Promise<string> {
    // A demonstração roda sobre uma academia fixa e sem autenticação real.
    // Cadastrar outra não teria onde existir.
    throw new Error('Cadastro de academia não está disponível no modo de demonstração.')
  }

  async createPlan(input: Omit<MembershipPlan, 'id' | 'createdAt'>): Promise<MembershipPlan> {
    const mutation: DemoMutation = {
      t: 'plan',
      id: `plan_${generateSynseId().slice(4).toLowerCase()}`,
      name: input.name,
      description: input.description,
      price: input.price,
      billingCycle: input.billingCycle,
      enrollmentFee: input.enrollmentFee,
      weeklyAccessDays: input.weeklyAccessDays,
      benefits: input.benefits,
      autoCharge: input.autoCharge,
      at: new Date().toISOString(),
    }

    this.apply(mutation)
    await appendDemoMutation(mutation)

    return this.addedPlans[this.addedPlans.length - 1]
  }

  async countStudentsByPlan(organizationId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const membership of this.scoped(this.memberships(), organizationId)) {
      if (membership.status !== 'ACTIVE') continue
      counts[membership.planId] = (counts[membership.planId] ?? 0) + 1
    }
    return counts
  }

  async getActiveMembership(organizationId: string, studentId: string): Promise<Membership | null> {
    const membership = this.membershipByStudent.get(studentId)
    if (!membership || membership.organizationId !== organizationId) return null
    return membership
  }

  // ── Alunos ─────────────────────────────────────────────────────────────────
  async listStudents(
    organizationId: string,
    filters: StudentFilters,
  ): Promise<Paginated<StudentListItem>> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20))

    const search = filters.search?.trim().toLowerCase()
    let rows = this.scoped(this.students(), organizationId)

    if (filters.status && filters.status !== 'ALL') {
      rows = rows.filter((s) => s.status === filters.status)
    }
    if (filters.trainerId) {
      rows = rows.filter((s) => s.trainerId === filters.trainerId)
    }
    if (filters.planId) {
      rows = rows.filter((s) => this.membershipByStudent.get(s.id)?.planId === filters.planId)
    }
    if (filters.newcomers) {
      rows = rows.filter((s) => daysBetween(s.enrolledAt) <= 30)
    }
    if (search) {
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.email.toLowerCase().includes(search) ||
          s.synseId.toLowerCase().includes(search) ||
          (s.phone ?? '').includes(search),
      )
    }

    let items = rows.map((s) => this.toListItem(s))

    if (filters.inactiveAttendance) {
      items = items.filter((s) => !s.lastCheckInAt || daysBetween(s.lastCheckInAt) >= 21)
      /*
       * A aba "Sumidos" é ordenada pela urgência, como `alunos_dormentes`
       * (0049) faz no banco: quem nunca apareceu primeiro, depois do mais
       * antigo para o mais recente, desempatando pelo nome. Em ordem
       * alfabética a demonstração mostraria uma tela que o produto não tem.
       */
      items.sort(
        (a, b) =>
          (a.lastCheckInAt ?? '').localeCompare(b.lastCheckInAt ?? '') ||
          a.name.localeCompare(b.name, 'pt-BR'),
      )
    } else {
      items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    }

    const total = items.length
    const start = (page - 1) * pageSize
    return { rows: items.slice(start, start + pageSize), total, page, pageSize }
  }

  async getStudent(organizationId: string, studentId: string): Promise<StudentListItem | null> {
    const student = this.studentById.get(studentId)
    if (!student || student.organizationId !== organizationId) return null
    return this.toListItem(student)
  }

  async createStudent(input: {
    organizationId: string
    name: string
    email: string
    phone: string | null
    /** Aceito e descartado: em demonstração não há cobrança real para emitir. */
    taxId: string | null
    goal: string | null
    planId: string | null
    trainerId: string | null
    billingDay: number
  }): Promise<Student> {
    const suffix = generateSynseId().slice(4).toLowerCase()
    const hasPlan = Boolean(input.planId && this.planById.get(input.planId))

    // A matrícula vira uma entrada no diário. Reaplicá-la é o que a torna
    // visível — aqui e nas próximas requisições, mesmo em outra execução.
    const mutation: DemoMutation = {
      t: 'student',
      id: `stu_${suffix}`,
      profileId: `prof_${suffix}`,
      synseId: generateSynseId(),
      name: input.name,
      email: input.email,
      phone: input.phone,
      goal: input.goal,
      planId: hasPlan ? input.planId : null,
      trainerId: input.trainerId,
      billingDay: input.billingDay,
      membershipId: hasPlan ? `mbr_${suffix}` : null,
      chargeId: hasPlan ? `chg_${suffix}` : null,
      at: new Date().toISOString(),
    }

    this.apply(mutation)
    this.reindex()
    await appendDemoMutation(mutation)

    return this.addedStudents[this.addedStudents.length - 1]
  }

  // ── Synse Pay ──────────────────────────────────────────────────────────────
  private toChargeWithStudent(charge: Charge): ChargeWithStudent {
    const student = this.studentById.get(charge.studentId)
    const membership = charge.membershipId
      ? this.memberships().find((m) => m.id === charge.membershipId)
      : undefined
    return {
      ...charge,
      studentName: student?.name ?? 'Aluno removido',
      studentPhone: student?.phone ?? null,
      planName: membership ? (this.planById.get(membership.planId)?.name ?? null) : null,
    }
  }

  async listCharges(
    organizationId: string,
    filters: { status?: Charge['status'] | 'ALL'; studentId?: string; limit?: number },
  ): Promise<ChargeWithStudent[]> {
    let rows = this.scoped(this.charges(), organizationId)
    if (filters.status && filters.status !== 'ALL')
      rows = rows.filter((c) => c.status === filters.status)
    if (filters.studentId) rows = rows.filter((c) => c.studentId === filters.studentId)
    rows = [...rows].sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate))
    return rows.slice(0, filters.limit ?? 100).map((c) => this.toChargeWithStudent(c))
  }

  /**
   * As vencidas de uma academia, por página e por faixa — como na produção.
   *
   * A faixa recorta **antes** de paginar, e não depois, porque é isso que a
   * consulta do Supabase faz: filtrar a página já lida daria um total certo
   * com linhas de menos, e a demonstração deixaria passar o defeito que a
   * produção não tem.
   */
  async listOverdueCharges(
    organizationId: string,
    filters: OverdueFilters = {},
  ): Promise<Paginated<ChargeWithStudent>> {
    const hoje = filters.hoje ?? new Date()
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 50))

    let vencidas = this.vencidas(organizationId).sort((a, b) => a.dueDate.localeCompare(b.dueDate))

    if (filters.faixa && filters.faixa !== 'ALL') {
      const alvo = filters.faixa
      vencidas = vencidas.filter(
        (c) => faixaDeDias(Math.max(0, daysBetween(c.dueDate, hoje))) === alvo,
      )
    }

    const de = (page - 1) * pageSize
    return {
      rows: vencidas.slice(de, de + pageSize).map((c) => this.toChargeWithStudent(c)),
      total: vencidas.length,
      page,
      pageSize,
    }
  }

  /** Os números da tela de inadimplentes, como a 0051 os devolve. */
  async getOverdueSummary(organizationId: string, hoje = new Date()): Promise<OverdueSummary> {
    const porFaixa = Object.fromEntries(FAIXAS.map((nome) => [nome, 0])) as Record<
      OverdueBucket,
      number
    >
    const alunos = new Set<string>()
    let valor = 0
    let dias = 0

    const vencidas = this.vencidas(organizationId)
    for (const cobranca of vencidas) {
      const atraso = Math.max(0, daysBetween(cobranca.dueDate, hoje))
      porFaixa[faixaDeDias(atraso)] += 1
      alunos.add(cobranca.studentId)
      valor += cobranca.amount
      dias += atraso
    }

    return { cobrancas: vencidas.length, alunos: alunos.size, valor, dias, porFaixa }
  }

  private vencidas(organizationId: string) {
    return this.scoped(this.charges(), organizationId).filter((c) => c.status === 'OVERDUE')
  }

  /** As cobranças que ainda esperam pagamento, como na produção. */
  private static readonly STATUS_EM_ABERTO: Charge['status'][] = ['PENDING', 'OVERDUE']

  private cobrancasDoAluno(organizationId: string, studentId: string) {
    return this.scoped(this.charges(), organizationId).filter((c) => c.studentId === studentId)
  }

  async getChargesForStudent(
    organizationId: string,
    studentId: string,
    filters: ChargeHistoryFilters = {},
  ): Promise<Paginated<Charge>> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 24))

    const todas = this.cobrancasDoAluno(organizationId, studentId)
      .filter((c) => !filters.status || filters.status === 'ALL' || c.status === filters.status)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))

    // Recorta e **só então** conta: o total é do filtro.
    const start = (page - 1) * pageSize
    return { rows: todas.slice(start, start + pageSize), total: todas.length, page, pageSize }
  }

  /**
   * A mais antiga em aberto — a que a pessoa paga agora.
   *
   * A mais antiga, e não a mais nova: é a que está vencendo há mais tempo, e
   * quitar na ordem é o que zera a dívida. A ficha do aluno no painel pegava a
   * mais nova, e aí recepção e celular mostravam valores diferentes.
   */
  async getNextOpenCharge(organizationId: string, studentId: string): Promise<Charge | null> {
    return (
      this.cobrancasDoAluno(organizationId, studentId)
        .filter((c) => DemoDataSource.STATUS_EM_ABERTO.includes(c.status))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
    )
  }

  /** Uma cobrança do aluno, por id. O `studentId` é a conferência de dono. */
  async getStudentCharge(
    organizationId: string,
    studentId: string,
    chargeId: string,
  ): Promise<Charge | null> {
    return this.cobrancasDoAluno(organizationId, studentId).find((c) => c.id === chargeId) ?? null
  }

  async markChargeAsPaid(
    organizationId: string,
    chargeId: string,
    input: { method: Charge['paymentMethod']; paidAt: string },
  ): Promise<Charge | null> {
    const charge = this.charges().find(
      (c) => c.id === chargeId && c.organizationId === organizationId,
    )
    if (!charge) return null

    const mutation: DemoMutation = {
      t: 'paid',
      chargeId,
      method: input.method ?? 'CASH',
      at: input.paidAt,
    }

    this.apply(mutation)
    this.reindex()
    await appendDemoMutation(mutation)

    return this.charges().find((c) => c.id === chargeId) ?? null
  }

  /*
   * Em demonstração não há gateway: o provedor simulado inventa os ids e eles
   * vivem só nesta sessão. O contrato é o mesmo para que a diferença entre
   * demo e produção continue sendo só o data source.
   */
  private readonly providerCustomers = new Map<string, string>()

  async getProviderCustomerId(
    organizationId: string,
    studentId: string,
    provider: string,
  ): Promise<string | null> {
    return this.providerCustomers.get(`${organizationId}:${studentId}:${provider}`) ?? null
  }

  async saveProviderCustomerId(input: {
    organizationId: string
    studentId: string
    provider: string
    providerCustomerId: string
  }): Promise<void> {
    this.providerCustomers.set(
      `${input.organizationId}:${input.studentId}:${input.provider}`,
      input.providerCustomerId,
    )
  }

  async attachProviderCharge(input: {
    organizationId: string
    chargeId: string
    provider: string
    providerChargeId: string
  }): Promise<void> {
    const charge = this.charges().find((c) => c.id === input.chargeId)
    if (charge) charge.providerChargeId = input.providerChargeId
  }

  async listCollectionRules(organizationId: string): Promise<CollectionRule[]> {
    return this.scoped(this.db.collectionRules, organizationId)
  }

  // ── Check-in ───────────────────────────────────────────────────────────────
  async listCheckIns(
    organizationId: string,
    options: { since?: Date; limit?: number },
  ): Promise<CheckInWithStudent[]> {
    const sinceIso = options.since?.toISOString()
    let rows = this.scoped(this.checkIns(), organizationId)
    if (sinceIso) rows = rows.filter((c) => c.checkedInAt >= sinceIso)
    return rows.slice(0, options.limit ?? rows.length).map((c) => ({
      ...c,
      studentName: this.studentById.get(c.studentId)?.name ?? 'Aluno',
    }))
  }

  async listCheckInsForStudent(organizationId: string, studentId: string, limit = 60) {
    return this.scoped(this.checkIns(), organizationId)
      .filter((c) => c.studentId === studentId)
      .slice(0, limit)
  }

  async createCheckIn(input: {
    organizationId: string
    studentId: string
    method: CheckIn['method']
  }): Promise<CheckIn> {
    const mutation: DemoMutation = {
      t: 'checkin',
      id: `chk_${generateSynseId().slice(4).toLowerCase()}`,
      studentId: input.studentId,
      method: input.method,
      at: new Date().toISOString(),
    }

    this.apply(mutation)
    this.reindex()
    await appendDemoMutation(mutation)

    return this.addedCheckIns[this.addedCheckIns.length - 1]
  }

  // ── Treinos ────────────────────────────────────────────────────────────────
  async listExercises(organizationId: string): Promise<Exercise[]> {
    return this.db.exercises.filter(
      (e) => e.organizationId === null || e.organizationId === organizationId,
    )
  }

  private workoutPlans(): WorkoutPlan[] {
    return [...this.db.workoutPlans, ...this.addedWorkoutPlans]
  }

  /** Aplica a edição, se houver, sobre o plano vindo da semente ou do diário. */
  private comEdicao(plano: WorkoutPlan): WorkoutPlan {
    const edicao = this.workoutEdits.get(plano.id)
    if (!edicao) return plano
    return { ...plano, name: edicao.name, goal: edicao.goal, splitLabel: edicao.split }
  }

  async listWorkoutPlans(organizationId: string): Promise<WorkoutPlan[]> {
    return this.scoped(this.workoutPlans(), organizationId).map((p) => this.comEdicao(p))
  }

  async getWorkoutPlan(organizationId: string, planId: string): Promise<WorkoutPlan | null> {
    const plano = this.scoped(this.workoutPlans(), organizationId).find((p) => p.id === planId)
    return plano ? this.comEdicao(plano) : null
  }

  async listWorkoutExercises(workoutPlanId: string) {
    const exerciseById = new Map(this.db.exercises.map((e) => [e.id, e]))

    /*
     * Treino editado troca a lista inteira. Misturar a lista nova com a antiga
     * deixaria na tela os exercícios que o professor acabou de tirar.
     */
    const edicao = this.workoutEdits.get(workoutPlanId)
    const linhas = edicao
      ? edicao.ex.map(([exerciseId, sets, reps, restSeconds], indice) => ({
          id: `${workoutPlanId}_ed${indice}`,
          workoutPlanId,
          exerciseId,
          order: indice + 1,
          sets,
          reps,
          restSeconds,
          suggestedLoad: null,
          notes: null,
        }))
      : [...this.db.workoutExercises, ...this.addedWorkoutExercises].filter(
          (we) => we.workoutPlanId === workoutPlanId,
        )

    return linhas
      .sort((a, b) => a.order - b.order)
      .map((we) => ({ ...we, exercise: exerciseById.get(we.exerciseId)! }))
      .filter((we) => Boolean(we.exercise))
  }

  async listAssignmentsForStudent(
    organizationId: string,
    studentId: string,
  ): Promise<WorkoutAssignment[]> {
    return this.scoped(
      [...this.db.workoutAssignments, ...this.addedAssignments],
      organizationId,
    ).filter((a) => a.studentId === studentId)
  }

  async listAssignmentsForPlan(
    organizationId: string,
    workoutPlanId: string,
  ): Promise<WorkoutAssignment[]> {
    return this.scoped(
      [...this.db.workoutAssignments, ...this.addedAssignments],
      organizationId,
    ).filter((a) => a.workoutPlanId === workoutPlanId)
  }

  async createWorkoutPlan(input: {
    organizationId: string
    name: string
    goal: string | null
    splitLabel: string
    createdByStaffId: string | null
    exercises: Array<{
      exerciseId: string
      sets: number
      reps: string
      restSeconds: number
      suggestedLoad: number | null
      notes: string | null
    }>
  }): Promise<WorkoutPlan> {
    const id = `wplan_${generateSynseId().slice(4).toLowerCase()}`
    const at = new Date().toISOString()

    await appendDemoMutation({
      t: 'wplan',
      id,
      name: input.name,
      goal: input.goal,
      split: input.splitLabel,
      ex: input.exercises.map((e) => [e.exerciseId, e.sets, e.reps, e.restSeconds]),
      at,
    })

    return {
      id,
      organizationId: DEMO_ORG_ID,
      name: input.name,
      goal: input.goal,
      splitLabel: input.splitLabel,
      createdByStaffId: null,
      status: 'PUBLISHED',
      createdAt: at,
    }
  }

  async updateWorkoutPlan(input: {
    organizationId: string
    planId: string
    name: string
    goal: string | null
    splitLabel: string
    exercises: Array<{
      exerciseId: string
      sets: number
      reps: string
      restSeconds: number
      suggestedLoad: number | null
      notes: string | null
    }>
  }): Promise<WorkoutPlan> {
    const atual = await this.getWorkoutPlan(input.organizationId, input.planId)
    if (!atual) throw new Error('Treino não encontrado nesta academia.')

    await appendDemoMutation({
      t: 'wedit',
      id: input.planId,
      name: input.name,
      goal: input.goal,
      split: input.splitLabel,
      ex: input.exercises.map((e) => [e.exerciseId, e.sets, e.reps, e.restSeconds]),
    })

    return { ...atual, name: input.name, goal: input.goal, splitLabel: input.splitLabel }
  }

  async assignWorkoutPlan(input: {
    organizationId: string
    workoutPlanId: string
    studentId: string
    validUntil: string | null
  }): Promise<WorkoutAssignment> {
    const id = `wassign_${generateSynseId().slice(4).toLowerCase()}`
    const at = new Date().toISOString()

    await appendDemoMutation({
      t: 'wassign',
      id,
      planId: input.workoutPlanId,
      studentId: input.studentId,
      until: input.validUntil,
      at,
    })

    return {
      id,
      organizationId: DEMO_ORG_ID,
      workoutPlanId: input.workoutPlanId,
      studentId: input.studentId,
      assignedAt: at,
      validUntil: input.validUntil,
    }
  }

  async countAssignments(organizationId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const assignment of this.scoped(this.db.workoutAssignments, organizationId)) {
      counts[assignment.workoutPlanId] = (counts[assignment.workoutPlanId] ?? 0) + 1
    }
    return counts
  }

  /** Noventa dias, como na produção: é o que as duas telas anunciam. */
  private static readonly DIAS_DE_HISTORICO = 90

  private registrosDoAluno(organizationId: string, studentId: string) {
    return this.scoped(this.db.workoutLogs, organizationId)
      .filter((l) => l.studentId === studentId)
      .sort((a, b) => a.performedAt.localeCompare(b.performedAt))
  }

  async listWorkoutLogs(
    organizationId: string,
    studentId: string,
    filters: WorkoutLogFilters = {},
  ): Promise<WorkoutLog[]> {
    const desde =
      filters.since ??
      new Date(Date.now() - DemoDataSource.DIAS_DE_HISTORICO * 86_400_000).toISOString()

    return this.registrosDoAluno(organizationId, studentId)
      .filter((l) => l.performedAt >= desde)
      .slice(0, Math.max(1, filters.limit ?? 500))
  }

  async countWorkoutLogs(organizationId: string, studentId: string): Promise<number> {
    // Conta tudo, não a janela: o cartão diz quantos registros o aluno tem.
    return this.registrosDoAluno(organizationId, studentId).length
  }

  async getLoadProgress(organizationId: string, studentId: string): Promise<LoadProgress> {
    const comCarga = this.registrosDoAluno(organizationId, studentId).filter((l) => l.load != null)
    const primeiro = comCarga[0]
    const ultimo = comCarga[comCarga.length - 1]

    return { primeira: primeiro?.load ?? null, ultima: ultimo?.load ?? null }
  }

  // ── Avaliações ─────────────────────────────────────────────────────────────
  private avaliacoes(): Assessment[] {
    return [...this.db.assessments, ...this.addedAssessments]
  }

  async listAssessments(organizationId: string, studentId: string): Promise<Assessment[]> {
    return this.scoped(this.avaliacoes(), organizationId)
      .filter((a) => a.studentId === studentId)
      .sort((a, b) => a.assessedAt.localeCompare(b.assessedAt))
  }

  async getAssessment(organizationId: string, assessmentId: string): Promise<Assessment | null> {
    return this.scoped(this.avaliacoes(), organizationId).find((a) => a.id === assessmentId) ?? null
  }

  /**
   * A mesma fila de `fila_de_avaliacao` (0048), reproduzida inteira.
   *
   * Inteira, e não por aproximação: ordem sobre **todos** os ativos — nunca
   * avaliado primeiro, depois a avaliação mais antiga, desempate por nome —
   * e só então o recorte da página. Cortar antes de ordenar é exatamente o
   * defeito que a migration existe para consertar, e a demonstração
   * ensinando o contrário seria pior que não ter demonstração.
   */
  async listAssessmentQueue(organizationId: string, limite: number, deslocamento: number) {
    const ultimaDe = new Map<string, Assessment>()
    for (const a of this.scoped(this.avaliacoes(), organizationId)) {
      const atual = ultimaDe.get(a.studentId)
      if (!atual || a.assessedAt > atual.assessedAt) ultimaDe.set(a.studentId, a)
    }

    const hoje = new Date()
    const fila = this.students()
      .filter((aluno) => aluno.organizationId === organizationId && aluno.status === 'ACTIVE')
      .map((aluno) => {
        const ultima = ultimaDe.get(aluno.id) ?? null
        return {
          studentId: aluno.id,
          studentName: aluno.name,
          avatarUrl: aluno.avatarUrl,
          assessedAt: ultima?.assessedAt ?? null,
          weight: ultima?.weight ?? null,
          bmi: ultima?.bmi ?? null,
          bodyFatPercentage: ultima?.bodyFatPercentage ?? null,
          diasSemAvaliar: ultima
            ? Math.floor(
                (hoje.getTime() - new Date(`${ultima.assessedAt}T00:00:00`).getTime()) / 86_400_000,
              )
            : null,
        }
      })
      .sort((a, b) => {
        // Nunca avaliado encabeça; depois, a avaliação mais antiga.
        if (a.assessedAt === null && b.assessedAt !== null) return -1
        if (a.assessedAt !== null && b.assessedAt === null) return 1
        if (a.assessedAt !== b.assessedAt) {
          return (a.assessedAt ?? '').localeCompare(b.assessedAt ?? '')
        }
        /*
         * Desempate por nome, espelhando o `order by … , f.student_name` da
         * 0048. Aqui ele não é o que segura a paginação — o `sort` do V8 é
         * estável e a entrada é sempre a mesma, então empate já sairia na
         * mesma ordem. Mutei a linha para conferir e nenhum teste caiu.
         * Existe para a demonstração produzir a **mesma** ordem que o banco,
         * onde `order by` sem desempate não garante nada e a página 2 pode
         * repetir quem a 1 mostrou — isso está preso em
         * `tests/db/fila-de-avaliacao.test.ts`.
         */
        return a.studentName.localeCompare(b.studentName)
      })

    return { linhas: fila.slice(deslocamento, deslocamento + limite), total: fila.length }
  }

  async getAssessmentQueueSummary(organizationId: string, diasAteReavaliar: number) {
    const { linhas, total } = await this.listAssessmentQueue(organizationId, 10_000, 0)
    return {
      ativos: total,
      nuncaAvaliados: linhas.filter((l) => l.assessedAt === null).length,
      vencidas: linhas.filter(
        (l) => l.diasSemAvaliar != null && l.diasSemAvaliar > diasAteReavaliar,
      ).length,
    }
  }

  /*
   * A demonstração calcula a composição aqui, com as mesmas funções que a tela
   * usa para prever o resultado. No produto quem calcula é o gatilho no banco —
   * aqui não há banco, e deixar o número em branco faria a avaliação recém
   * gravada parecer incompleta.
   */
  async saveAssessment(input: SaveAssessmentInput): Promise<Assessment> {
    const soma = somaDasDobras(input.protocol, input.protocolSex, {
      chest: input.skinfoldChest,
      axilla: input.skinfoldAxilla,
      triceps: input.skinfoldTriceps,
      subscapular: input.skinfoldSubscapular,
      abdominal: input.skinfoldAbdominal,
      suprailiac: input.skinfoldSuprailiac,
      thigh: input.skinfoldThigh,
    })
    const densidade = densidadeCorporal(input.protocol, input.protocolSex, input.ageYears, soma)

    const avaliacao: Assessment = {
      id: input.id ?? `asm_${generateSynseId().slice(4).toLowerCase()}`,
      organizationId: DEMO_ORG_ID,
      studentId: input.studentId,
      assessedByStaffId: input.assessedByStaffId,
      assessedAt: input.assessedAt,
      weight: input.weight,
      height: input.height,
      bmi: imc(input.weight, input.height),
      bodyFatPercentage:
        input.protocol === 'MANUAL' ? input.bodyFatPercentage : percentualDeGordura(densidade),
      chest: input.chest,
      arm: input.arm,
      waist: input.waist,
      abdomen: input.abdomen,
      hip: input.hip,
      thigh: input.thigh,
      calf: input.calf,
      notes: input.notes,
      protocol: input.protocol,
      protocolSex: input.protocolSex,
      ageYears: input.ageYears,
      bodyDensity: densidade,
      skinfoldChest: input.skinfoldChest,
      skinfoldAxilla: input.skinfoldAxilla,
      skinfoldTriceps: input.skinfoldTriceps,
      skinfoldSubscapular: input.skinfoldSubscapular,
      skinfoldAbdominal: input.skinfoldAbdominal,
      skinfoldSuprailiac: input.skinfoldSuprailiac,
      skinfoldThigh: input.skinfoldThigh,
    }

    const existente = this.addedAssessments.findIndex((a) => a.id === avaliacao.id)
    if (existente >= 0) this.addedAssessments[existente] = avaliacao
    else this.addedAssessments.push(avaliacao)

    return avaliacao
  }

  // ── Amigos (0037) ──────────────────────────────────────────────────────────

  /**
   * A semente, com as alterações da visita por cima.
   *
   * O aluno da demonstração é quem tem amigos: as personas de equipe não caem
   * nesta tela, e inventar amizade para elas seria dado que nenhuma tela mostra.
   */
  async listFriends(): Promise<Friend[]> {
    const daSemente = this.db.friends.filter((amigo) => !this.friendEdits.has(amigo.friendshipId))
    const daVisita = [...this.friendEdits.values()].filter(
      (amigo): amigo is Friend => amigo !== null,
    )

    return [...daSemente, ...daVisita].sort(
      (a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name, 'pt-BR'),
    )
  }

  async requestFriendship(synseId: string): Promise<string> {
    const alvo = this.db.userProfiles.find(
      (perfil) => perfil.synseId.toUpperCase() === synseId.trim().toUpperCase(),
    )
    // As mesmas recusas do banco, com as mesmas mensagens: a demonstração tem
    // de errar igual, senão ela ensina um comportamento que não existe.
    if (!alvo) throw new Error('Não encontramos ninguém com esse Synse ID.')
    if (alvo.id === 'prof_0001') throw new Error('Esse Synse ID é o seu.')

    const jaExiste = (await this.listFriends()).find((amigo) => amigo.profileId === alvo.id)
    if (jaExiste) return jaExiste.friendshipId

    const id = `frd_${String(this.db.friends.length + this.friendEdits.size + 1).padStart(4, '0')}`
    this.friendEdits.set(id, {
      friendshipId: id,
      profileId: alvo.id,
      name: alvo.name,
      synseId: alvo.synseId,
      status: 'PENDING',
      souQuemPediu: true,
      noRanking: false,
      since: new Date().toISOString(),
    })
    await appendDemoMutation({
      t: 'friend',
      id,
      profileId: alvo.id,
      action: 'request',
      at: new Date().toISOString(),
    })
    return id
  }

  async respondFriendship(friendshipId: string, accept: boolean): Promise<void> {
    const atual =
      this.friendEdits.get(friendshipId) ??
      this.db.friends.find((amigo) => amigo.friendshipId === friendshipId)
    if (!atual) throw new Error('Pedido não encontrado, já respondido, ou não é seu.')
    if (atual.status !== 'PENDING' || atual.souQuemPediu) {
      throw new Error('Pedido não encontrado, já respondido, ou não é seu.')
    }

    this.friendEdits.set(friendshipId, accept ? { ...atual, status: 'ACCEPTED' } : null)
    await appendDemoMutation({
      t: 'friend',
      id: friendshipId,
      profileId: atual.profileId,
      action: accept ? 'accept' : 'decline',
      at: new Date().toISOString(),
    })
  }

  async removeFriendship(friendshipId: string): Promise<void> {
    const existe =
      this.friendEdits.get(friendshipId) ??
      this.db.friends.find((amigo) => amigo.friendshipId === friendshipId)
    if (!existe) throw new Error('Amizade não encontrada, ou não é sua.')

    this.friendEdits.set(friendshipId, null)
    await appendDemoMutation({
      t: 'friend',
      id: friendshipId,
      profileId: existe.profileId,
      action: 'remove',
      at: new Date().toISOString(),
    })
  }

  /**
   * O ranking, com as duas trancas do banco reproduzidas.
   *
   * Amizade aceita **e** consentimento da outra pessoa. A demonstração tem de
   * esconder quem não autorizou pelo mesmo motivo que o banco esconde — senão
   * ela ensina que o consentimento é decorativo.
   */
  async getFriendsRanking(from: string, to: string): Promise<FriendRankRow[]> {
    const amigos = (await this.listFriends()).filter(
      (amigo) => amigo.status === 'ACCEPTED' && amigo.noRanking,
    )

    const linhas = await Promise.all(
      [
        { profileId: 'prof_0001', name: 'Você', souEu: true },
        ...amigos.map((a) => ({ profileId: a.profileId, name: a.name, souEu: false })),
      ].map(async (pessoa) => {
        const aluno = this.db.students.find((s) => s.userProfileId === pessoa.profileId)
        const totais = aluno
          ? await this.getWorkoutTotals(aluno.id, from, to)
          : { workouts: 0, volumeKg: 0 }
        return { ...pessoa, workouts: totais.workouts, volumeKg: totais.volumeKg }
      }),
    )

    return linhas
      .sort((a, b) => b.workouts - a.workouts || b.volumeKg - a.volumeKg)
      .map((linha, indice) => ({
        position: indice + 1,
        profileId: linha.profileId,
        name: linha.souEu
          ? (this.db.userProfiles.find((p) => p.id === 'prof_0001')?.name ?? 'Você')
          : linha.name,
        souEu: linha.souEu,
        workouts: linha.workouts,
        volumeKg: linha.volumeKg,
      }))
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  // ── Agenda ─────────────────────────────────────────────────────────────────
  /**
   * A grade da academia de demonstração.
   *
   * Materializada na primeira leitura, e não na semente, porque as aulas são
   * relativas a hoje: um dataset com datas fixas envelhece e a agenda aparece
   * vazia para quem abrir a demonstração no mês seguinte.
   */
  private montarAgenda() {
    if (this.agendaPronta) return
    this.agendaPronta = true

    const professores = this.db.staff.filter(
      (membro) => membro.role === 'TRAINER' || membro.role === 'PROFESSIONAL',
    )
    const grade: Array<[string, number, string, number, number, string]> = [
      ['Spinning', 1, '06:00', 45, 18, 'Sala de bike'],
      ['Funcional', 1, '19:00', 50, 16, 'Área funcional'],
      ['Musculação guiada', 2, '07:00', 60, 12, 'Sala principal'],
      ['Spinning', 3, '19:00', 45, 18, 'Sala de bike'],
      ['Alongamento', 4, '08:00', 30, 20, 'Sala 2'],
      ['Funcional', 5, '18:30', 50, 16, 'Área funcional'],
      ['Treino livre assistido', 6, '09:00', 90, 25, 'Sala principal'],
    ]

    grade.forEach(([nome, diaDaSemana, hora, duracao, vagas, sala], indice) => {
      const professor = professores[indice % Math.max(professores.length, 1)]
      this.demoSchedules.push({
        id: `sched_${indice + 1}`,
        organizationId: DEMO_ORG_ID,
        name: nome,
        description: null,
        staffId: professor?.id ?? null,
        staffName: professor?.name ?? null,
        weekday: diaDaSemana,
        startTime: hora,
        durationMinutes: duracao,
        capacity: vagas,
        room: sala,
        startsOn: new Date().toISOString().slice(0, 10),
        endsOn: null,
        status: 'ACTIVE',
      })
    })

    this.materializar(21)
    this.semearReservas()
  }

  /** O mesmo que `generate_class_sessions` faz no banco, sem o `on conflict`. */
  private materializar(diasAFrente: number) {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    for (let passo = 0; passo <= diasAFrente; passo += 1) {
      const dia = new Date(hoje.getTime() + passo * 86_400_000)
      for (const regra of this.demoSchedules) {
        if (regra.status !== 'ACTIVE' || dia.getDay() !== regra.weekday) continue

        const [hora, minuto] = regra.startTime.split(':').map(Number)
        const comeca = new Date(dia)
        comeca.setHours(hora, minuto, 0, 0)
        const id = `sess_${regra.id}_${comeca.toISOString().slice(0, 10)}`
        if (this.demoSessions.some((sessao) => sessao.id === id)) continue

        this.demoSessions.push({
          id,
          organizationId: DEMO_ORG_ID,
          scheduleId: regra.id,
          name: regra.name,
          staffId: regra.staffId,
          staffName: regra.staffName,
          startsAt: comeca.toISOString(),
          endsAt: new Date(comeca.getTime() + regra.durationMinutes * 60_000).toISOString(),
          capacity: regra.capacity,
          room: regra.room,
          status: 'SCHEDULED',
          cancellationReason: null,
          bookedCount: 0,
        })
      }
    }
    this.demoSessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  }

  /**
   * Turmas com gente dentro.
   *
   * Uma agenda vazia esconde justamente o que a tela precisa mostrar: turma
   * cheia, fila de espera e a diferença entre as duas. A ocupação é derivada do
   * id da aula, então é estável entre recarregamentos.
   */
  private semearReservas() {
    const alunos = this.db.students.slice(0, 40)
    this.demoSessions.forEach((sessao, indice) => {
      // Uma das aulas nasce lotada com espera; as outras, parcialmente cheias.
      const lotada = indice % 5 === 2
      const quantos = lotada
        ? sessao.capacity + 2
        : Math.floor(sessao.capacity * 0.45) + (indice % 3)

      for (let i = 0; i < quantos && i < alunos.length; i += 1) {
        const aluno = alunos[(indice * 3 + i) % alunos.length]
        if (this.demoBookings.some((r) => r.sessionId === sessao.id && r.studentId === aluno.id))
          continue
        this.demoBookings.push({
          id: `book_${sessao.id}_${i}`,
          organizationId: DEMO_ORG_ID,
          sessionId: sessao.id,
          studentId: aluno.id,
          studentName: aluno.name,
          status: i < sessao.capacity ? 'BOOKED' : 'WAITLIST',
          createdAt: new Date(Date.now() - (quantos - i) * 3_600_000).toISOString(),
          cancelledAt: null,
          attendedAt: null,
        })
      }
      sessao.bookedCount = this.contarOcupadas(sessao.id)
    })
  }

  private contarOcupadas(sessionId: string) {
    return this.demoBookings.filter(
      (r) => r.sessionId === sessionId && (r.status === 'BOOKED' || r.status === 'ATTENDED'),
    ).length
  }

  async listClassSchedules(organizationId: string): Promise<ClassSchedule[]> {
    this.montarAgenda()
    return this.demoSchedules.filter((g) => g.organizationId === organizationId)
  }

  async getClassSchedule(organizationId: string, scheduleId: string) {
    this.montarAgenda()
    return (
      this.demoSchedules.find((g) => g.organizationId === organizationId && g.id === scheduleId) ??
      null
    )
  }

  async saveClassSchedule(input: SaveClassScheduleInput): Promise<ClassSchedule> {
    this.montarAgenda()
    const professor = this.staffById.get(input.staffId ?? '')
    const regra: ClassSchedule = {
      id: input.id ?? `sched_${this.demoSchedules.length + 1}`,
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      staffId: input.staffId,
      staffName: professor?.name ?? null,
      weekday: input.weekday,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      capacity: input.capacity,
      room: input.room,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      status: input.status,
    }

    const existente = this.demoSchedules.findIndex((g) => g.id === regra.id)
    if (existente >= 0) this.demoSchedules[existente] = regra
    else this.demoSchedules.push(regra)

    this.materializar(21)
    return regra
  }

  async listClassSessions(organizationId: string, window: ScheduleWindow) {
    this.montarAgenda()
    return this.demoSessions.filter(
      (sessao) =>
        sessao.organizationId === organizationId &&
        sessao.startsAt >= window.from &&
        sessao.startsAt < window.to,
    )
  }

  async getClassSession(organizationId: string, sessionId: string) {
    this.montarAgenda()
    return (
      this.demoSessions.find((s) => s.organizationId === organizationId && s.id === sessionId) ??
      null
    )
  }

  async listClassBookings(organizationId: string, sessionId: string): Promise<ClassBooking[]> {
    this.montarAgenda()
    return this.demoBookings
      .filter((r) => r.organizationId === organizationId && r.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async cancelClassSession(organizationId: string, sessionId: string, reason: string | null) {
    this.montarAgenda()
    const sessao = this.demoSessions.find(
      (s) => s.organizationId === organizationId && s.id === sessionId,
    )
    if (!sessao) return
    sessao.status = 'CANCELLED'
    sessao.cancellationReason = reason
    // O gatilho da 0024 faz isto no banco; aqui é na mão.
    for (const reserva of this.demoBookings) {
      if (reserva.sessionId !== sessionId) continue
      if (reserva.status === 'BOOKED' || reserva.status === 'WAITLIST') {
        reserva.status = 'CANCELLED'
        reserva.cancelledAt = new Date().toISOString()
      }
    }
    sessao.bookedCount = 0
  }

  async generateClassSessions(_organizationId: string, daysAhead: number): Promise<number> {
    return this.generateAllClassSessions(daysAhead)
  }

  async ensureClassSessions(_organizationId: string, daysAhead: number): Promise<number> {
    return this.generateAllClassSessions(daysAhead)
  }

  async generateAllClassSessions(daysAhead: number): Promise<number> {
    this.montarAgenda()
    const antes = this.demoSessions.length
    this.materializar(daysAhead)
    return this.demoSessions.length - antes
  }

  async markAttendance(
    organizationId: string,
    bookingId: string,
    status: 'ATTENDED' | 'NO_SHOW' | 'BOOKED',
  ) {
    this.montarAgenda()
    const reserva = this.demoBookings.find(
      (r) => r.organizationId === organizationId && r.id === bookingId,
    )
    if (!reserva) return
    reserva.status = status
    reserva.attendedAt = status === 'ATTENDED' ? new Date().toISOString() : null
  }

  /**
   * A mesma decisão que `book_class` toma no banco.
   *
   * Aqui não há trava, e nem precisa: a demonstração roda numa requisição por
   * vez, em memória. O que precisa ser igual é a *regra* — cheio vai para a
   * espera —, senão a tela ensina um comportamento que produção não tem.
   */
  async bookClass(sessionId: string, studentId?: string): Promise<ClassBookingStatus> {
    this.montarAgenda()
    const sessao = this.demoSessions.find((s) => s.id === sessionId)
    if (!sessao) throw new Error('Aula não encontrada.')
    if (sessao.status === 'CANCELLED') throw new Error('Esta aula foi cancelada.')
    if (new Date(sessao.startsAt).getTime() < Date.now()) throw new Error('Esta aula já começou.')

    const aluno = studentId ?? this.db.studentIdForApp
    const viva = this.demoBookings.find(
      (r) =>
        r.sessionId === sessionId &&
        r.studentId === aluno &&
        (r.status === 'BOOKED' || r.status === 'WAITLIST'),
    )
    if (viva) return viva.status

    const status: ClassBookingStatus =
      this.contarOcupadas(sessionId) >= sessao.capacity ? 'WAITLIST' : 'BOOKED'

    this.demoBookings.push({
      id: `book_${sessionId}_${this.demoBookings.length}`,
      organizationId: sessao.organizationId,
      sessionId,
      studentId: aluno,
      studentName: this.studentById.get(aluno)?.name ?? null,
      status,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
      attendedAt: null,
    })
    sessao.bookedCount = this.contarOcupadas(sessionId)
    return status
  }

  async cancelClassBooking(bookingId: string): Promise<void> {
    this.montarAgenda()
    const reserva = this.demoBookings.find((r) => r.id === bookingId)
    if (!reserva || (reserva.status !== 'BOOKED' && reserva.status !== 'WAITLIST')) return

    const eraConfirmada = reserva.status === 'BOOKED'
    reserva.status = 'CANCELLED'
    reserva.cancelledAt = new Date().toISOString()

    // Promoção da fila: o gatilho faz no banco, aqui é explícito.
    if (eraConfirmada) {
      const proxima = this.demoBookings
        .filter((r) => r.sessionId === reserva.sessionId && r.status === 'WAITLIST')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      if (proxima) proxima.status = 'BOOKED'
    }

    const sessao = this.demoSessions.find((s) => s.id === reserva.sessionId)
    if (sessao) sessao.bookedCount = this.contarOcupadas(sessao.id)
  }

  async listClassSessionsForStudent(
    organizationId: string,
    studentId: string,
    window: ScheduleWindow,
  ): Promise<ClassSessionForStudent[]> {
    const sessoes = await this.listClassSessions(organizationId, window)

    return sessoes.map((sessao) => {
      const minha = this.demoBookings.find(
        (r) =>
          r.sessionId === sessao.id &&
          r.studentId === studentId &&
          (r.status === 'BOOKED' || r.status === 'WAITLIST' || r.status === 'ATTENDED'),
      )
      const fila = this.demoBookings
        .filter((r) => r.sessionId === sessao.id && r.status === 'WAITLIST')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const posicao = fila.findIndex((r) => r.studentId === studentId)

      return {
        ...sessao,
        myBookingId: minha?.id ?? null,
        myBookingStatus: minha?.status ?? null,
        waitlistPosition: minha?.status === 'WAITLIST' && posicao >= 0 ? posicao + 1 : null,
      }
    })
  }

  // ── Treino Ativo ───────────────────────────────────────────────────────────
  /**
   * Em demonstração o treino vive em memória, com a mesma idempotência do
   * banco: reabrir com o mesmo `clientId` devolve a sessão que já existe.
   */
  async startWorkoutSession(clientId: string, workoutPlanId: string | null): Promise<string> {
    const existente = this.demoWorkoutSessions.find(
      (sessao) => sessao.clientId === clientId || sessao.status === 'IN_PROGRESS',
    )
    if (existente) return existente.id

    const id = `wsess_${this.demoWorkoutSessions.length + 1}`
    this.demoWorkoutSessions.push({
      id,
      organizationId: DEMO_ORG_ID,
      studentId: this.db.studentIdForApp,
      workoutPlanId,
      planName: null,
      clientId,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationSeconds: null,
      totalSets: 0,
      totalReps: 0,
      volumeKg: 0,
    })
    this.demoSetLogs.set(id, [])
    // No diário: sem isto o painel da recepção fica eternamente vazio na
    // demonstração, porque o data source é remontado a cada requisição.
    await appendDemoMutation({
      t: 'wsess',
      a: 'start',
      id,
      plano: workoutPlanId,
      at: new Date().toISOString(),
    })
    return id
  }

  async logWorkoutSet(input: LogWorkoutSetInput): Promise<string> {
    const sessao = this.demoWorkoutSessions.find((s) => s.id === input.sessionId)
    if (!sessao) throw new Error('Treino não encontrado.')

    const chave = `${input.sessionId}:${input.clientId}`
    const series = this.demoSetLogs.get(input.sessionId) ?? []

    /*
     * Mesma garantia do `unique (session_id, client_id)`: o reenvio não
     * duplica.
     *
     * A primeira versão comparava `${sessionId}:${clientId}` com
     * `${sessionId}:${índice}` — um identificador contra uma posição de
     * array. Só coincidia se o `clientId` fosse, por acaso, o número da
     * posição, então na prática **nunca** deduplicava: a fila offline
     * reenviava a série e a demonstração contava duas. Apareceu no painel
     * "Treinando agora", que mostrou "2 séries" depois de um toque só.
     */
    if (!this.demoSetClientIds.has(chave)) {
      this.demoSetClientIds.add(chave)
      series.push({ reps: input.repsCompleted, weight: input.weight })
      this.demoSetLogs.set(input.sessionId, series)
      sessao.totalSets = series.length
      sessao.totalReps = series.reduce((a, b) => a + b.reps, 0)
      sessao.volumeKg = Math.round(series.reduce((a, b) => a + (b.weight ?? 0) * b.reps, 0))
      await appendDemoMutation({ t: 'wsess', a: 'set' })
    }
    return chave
  }

  async finishWorkoutSession(
    sessionId: string,
    durationSeconds: number,
    status: 'COMPLETED' | 'ABANDONED',
  ): Promise<void> {
    const sessao = this.demoWorkoutSessions.find((s) => s.id === sessionId)
    if (!sessao) return
    sessao.status = status
    sessao.completedAt = new Date().toISOString()
    sessao.durationSeconds = durationSeconds
    await appendDemoMutation({ t: 'wsess', a: 'finish' })
  }

  async getActiveWorkoutSession(studentId: string): Promise<WorkoutSessionSummary | null> {
    return (
      this.demoWorkoutSessions.find(
        (s) => s.studentId === studentId && (s.status === 'IN_PROGRESS' || s.status === 'PAUSED'),
      ) ?? null
    )
  }

  /**
   * Quem está treinando agora, na demonstração.
   *
   * `demoWorkoutSessions` só ganha linha quando alguém usa o Treino Ativo
   * nesta sessão do navegador — a semente não produz treino em andamento, e
   * inventar um seria mostrar gente treinando numa academia onde ninguém
   * abriu o app. O painel vazio é a verdade aqui, e ele explica isso na tela.
   *
   * A janela de oito horas é a mesma da 0047 e da consulta de produção.
   */
  async listActiveWorkoutSessions(organizationId: string): Promise<OngoingWorkout[]> {
    const limite = Date.now() - 8 * 60 * 60 * 1000

    return this.demoWorkoutSessions
      .filter(
        (s) =>
          s.organizationId === organizationId &&
          (s.status === 'IN_PROGRESS' || s.status === 'PAUSED') &&
          new Date(s.startedAt).getTime() >= limite,
      )
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .map((s) => ({
        sessionId: s.id,
        studentId: s.studentId,
        studentName: this.studentById.get(s.studentId)?.name ?? 'Aluno',
        planName: s.planName,
        startedAt: s.startedAt,
        status: s.status as 'IN_PROGRESS' | 'PAUSED',
        totalSets: s.totalSets,
      }))
  }

  /**
   * As sessões do aluno, com o histórico da semente junto.
   *
   * `demoWorkoutSessions` só ganha linha depois de alguém treinar pelo Treino
   * Ativo — e a semente não produz nenhuma. Devolver só elas fazia a análise
   * mostrar "5 treinos" e "0 treinos por semana" lado a lado, porque
   * `getWorkoutTotals` lê o histórico achatado (`workout_logs`) e a constância
   * lia daqui. Dois números da mesma tela discordando é pior que qualquer um
   * dos dois sozinho.
   *
   * Em produção as duas leituras saem de `workout_sessions` e já concordam;
   * isto é remendo de demonstração, e por isso mora só aqui.
   */
  async listWorkoutSessions(studentId: string, limite: number): Promise<WorkoutSessionSummary[]> {
    const reais = this.demoWorkoutSessions.filter(
      (s) => s.studentId === studentId && s.status === 'COMPLETED',
    )
    const diasJaCobertos = new Set(reais.map((s) => s.startedAt.slice(0, 10)))

    const doHistorico = new Map<string, WorkoutSessionSummary>()
    for (const log of this.db.workoutLogs) {
      if (log.studentId !== studentId) continue
      const dia = log.performedAt.slice(0, 10)
      // O dia em que a pessoa treinou de verdade na demonstração manda: uma
      // sessão sintética por cima duplicaria o treino dela.
      if (diasJaCobertos.has(dia)) continue

      const series = log.sets ?? 0
      const atual = doHistorico.get(dia)
      if (atual) {
        atual.totalSets += series
        atual.totalReps += series * (log.reps ?? 0)
        atual.volumeKg += Math.round(series * (log.reps ?? 0) * (log.load ?? 0))
        continue
      }

      doHistorico.set(dia, {
        id: `demo-sessao-${dia}`,
        organizationId: log.organizationId,
        studentId,
        workoutPlanId: log.workoutPlanId,
        planName: null,
        clientId: `demo-sessao-${dia}`,
        status: 'COMPLETED',
        startedAt: log.performedAt,
        completedAt: log.performedAt,
        durationSeconds: 3600,
        totalSets: series,
        totalReps: series * (log.reps ?? 0),
        volumeKg: Math.round(series * (log.reps ?? 0) * (log.load ?? 0)),
      })
    }

    return [...reais, ...doHistorico.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limite)
  }

  async getWorkoutPreferences(): Promise<WorkoutPreferences> {
    return this.demoWorkoutPrefs
  }

  async saveWorkoutPreferences(_userProfileId: string, p: WorkoutPreferences) {
    this.demoWorkoutPrefs = p
    // No diário também: o campo de instância não sobrevive à próxima
    // requisição, e sem isto o ajuste volta atrás ao recarregar a tela.
    await appendDemoMutation({
      t: 'wpref',
      autoRest: p.autoRest,
      sound: p.sound,
      vibration: p.vibration,
      autoAdvance: p.autoAdvance,
      keepScreenAwake: p.keepScreenAwake,
      rest: p.defaultRestSeconds,
    })
    return p
  }

  // ── Relatórios ─────────────────────────────────────────────────────────────
  /**
   * `workout_logs` aponta para a linha da prescrição, não para o exercício.
   * Este índice faz a ponte — e evita varrer `workoutExercises` por log.
   */
  private exercicioDoLog(workoutExerciseId: string | null): string | null {
    if (!workoutExerciseId) return null
    const todos = [...this.db.workoutExercises, ...this.addedWorkoutExercises]
    return todos.find((item) => item.id === workoutExerciseId)?.exerciseId ?? null
  }
  /**
   * Em demonstração os números saem do histórico achatado (`workout_logs`) que
   * a semente já produz, e não das séries do Treino Ativo — que só existem
   * depois de alguém treinar de verdade. Uma tela de relatório vazia esconderia
   * justamente o que ela serve para mostrar.
   */
  async getExerciseProgress(studentId: string, exerciseId: string, weeks: number) {
    const logs = this.db.workoutLogs
      .filter(
        (log) =>
          log.studentId === studentId && this.exercicioDoLog(log.workoutExerciseId) === exerciseId,
      )
      .slice(-weeks)

    return logs.map((log, indice) => ({
      week: new Date(Date.now() - (logs.length - indice) * 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      maxWeight: log.load,
      volumeKg: (log.load ?? 0) * (log.reps ?? 0) * (log.sets ?? 1),
      sets: log.sets ?? 0,
      reps: (log.reps ?? 0) * (log.sets ?? 1),
    })) satisfies ExerciseProgressPoint[]
  }

  async getPersonalRecords(studentId: string) {
    const melhorPorExercicio = new Map<string, ExercisePersonalRecord>()

    for (const log of this.db.workoutLogs) {
      const exerciseId = this.exercicioDoLog(log.workoutExerciseId)
      if (log.studentId !== studentId || log.load == null || !exerciseId) continue
      const atual = melhorPorExercicio.get(exerciseId)
      if (atual && atual.maxWeight >= log.load) continue

      melhorPorExercicio.set(exerciseId, {
        exerciseId,
        exerciseName: this.db.exercises.find((e) => e.id === exerciseId)?.name ?? 'Exercício',
        maxWeight: log.load,
        reps: log.reps ?? 0,
        achievedAt: log.performedAt,
      })
    }

    return [...melhorPorExercicio.values()].sort((a, b) =>
      a.exerciseName.localeCompare(b.exerciseName),
    )
  }

  async getWorkoutTotals(studentId: string, from: string, to: string): Promise<WorkoutTotals> {
    const logs = this.db.workoutLogs.filter(
      (log) => log.studentId === studentId && log.performedAt >= from && log.performedAt < to,
    )
    const series = logs.reduce((soma, log) => soma + (log.sets ?? 0), 0)

    return {
      workouts: new Set(logs.map((log) => log.performedAt.slice(0, 10))).size,
      sets: series,
      reps: logs.reduce((soma, log) => soma + (log.reps ?? 0) * (log.sets ?? 1), 0),
      volumeKg: Math.round(
        logs.reduce((soma, log) => soma + (log.load ?? 0) * (log.reps ?? 0) * (log.sets ?? 1), 0),
      ),
      averageDurationSeconds: series > 0 ? 3600 : null,
      averageRestSeconds: series > 0 ? 75 : null,
      distinctExercises: new Set(logs.map((log) => log.workoutExerciseId)).size,
    }
  }

  /**
   * Aderência na demonstração.
   *
   * Segue a convenção já usada aqui: os números saem do histórico achatado
   * (`workout_logs`), porque as séries do Treino Ativo só existem depois de
   * alguém treinar de verdade, e uma tela vazia esconderia o recurso de quem
   * está avaliando o produto.
   *
   * O "planejado" não é inventado: vem do próprio plano (`workout_exercises`),
   * que é de onde `reps_planned` sai no banco de verdade. Log sem plano
   * atrelado fica de fora, como a série sem previsão fica no SQL da 0035.
   */
  async getWorkoutAdherence(
    studentId: string,
    from: string,
    to: string,
  ): Promise<WorkoutAdherenceRow[]> {
    const doPlano = new Map(
      [...this.db.workoutExercises, ...this.addedWorkoutExercises].map((item) => [item.id, item]),
    )

    const porDia = new Map<string, WorkoutAdherenceRow>()

    for (const log of this.db.workoutLogs) {
      if (log.studentId !== studentId) continue
      if (log.performedAt < from || log.performedAt >= to) continue

      const previsto = log.workoutExerciseId ? doPlano.get(log.workoutExerciseId) : undefined
      // `reps` do plano é texto e aceita faixa ("8-12"): vale o piso, que é o
      // que a pessoa se comprometeu a fazer.
      const repsPrevistas = Number.parseInt(String(previsto?.reps ?? ''), 10)
      if (!previsto || !Number.isFinite(repsPrevistas) || repsPrevistas <= 0) continue

      const dia = log.performedAt.slice(0, 10)
      const series = log.sets ?? previsto.sets
      const linha = porDia.get(dia) ?? {
        sessionId: `demo-aderencia-${dia}`,
        startedAt: log.performedAt,
        plannedSets: 0,
        plannedReps: 0,
        completedReps: 0,
        setsBelowPlan: 0,
      }

      linha.plannedSets += series
      linha.plannedReps += series * repsPrevistas
      linha.completedReps += series * (log.reps ?? 0)
      if ((log.reps ?? 0) < repsPrevistas) linha.setsBelowPlan += series

      porDia.set(dia, linha)
    }

    return [...porDia.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  }

  async getGymTrainingReport(organizationId: string, from: string, to: string) {
    const logs = this.db.workoutLogs.filter(
      (log) => log.performedAt >= from && log.performedAt < to,
    )
    const dias = new Set(logs.map((log) => `${log.studentId}:${log.performedAt.slice(0, 10)}`))

    return {
      workouts: dias.size,
      studentsTraining: new Set(logs.map((log) => log.studentId)).size,
      sets: logs.reduce((soma, log) => soma + (log.sets ?? 0), 0),
      volumeKg: Math.round(
        logs.reduce((soma, log) => soma + (log.load ?? 0) * (log.reps ?? 0) * (log.sets ?? 1), 0),
      ),
      averageDurationSeconds: dias.size > 0 ? 3480 : null,
    } satisfies GymTrainingReport
  }

  async listStudentsAtRisk(organizationId: string, dias: number): Promise<StudentAtRisk[]> {
    const limite = Date.now() - dias * 86_400_000

    return this.db.students
      .filter((aluno) => aluno.status === 'ACTIVE' || aluno.status === 'OVERDUE')
      .map((aluno) => {
        const ultima = this.lastCheckInFor(aluno.id)
        return {
          studentId: aluno.id,
          name: aluno.name,
          lastVisitAt: ultima,
          daysAbsent: ultima
            ? Math.floor((Date.now() - new Date(ultima).getTime()) / 86_400_000)
            : 9999,
        }
      })
      .filter((linha) => !linha.lastVisitAt || new Date(linha.lastVisitAt).getTime() < limite)
      .sort((a, b) => b.daysAbsent - a.daysAbsent)
      .slice(0, 50)
  }

  async getClassOccupancyReport(organizationId: string, from: string, to: string) {
    this.montarAgenda()
    const porNome = new Map<string, ClassOccupancyRow>()

    for (const sessao of this.demoSessions) {
      if (sessao.status !== 'SCHEDULED' || sessao.startsAt < from || sessao.startsAt >= to) continue

      const linha = porNome.get(sessao.name) ?? {
        className: sessao.name,
        occurrences: 0,
        capacityOffered: 0,
        bookings: 0,
        attended: 0,
        noShows: 0,
      }
      const reservas = this.demoBookings.filter((r) => r.sessionId === sessao.id)

      linha.occurrences += 1
      linha.capacityOffered += sessao.capacity
      linha.bookings += reservas.filter((r) => r.status !== 'CANCELLED').length
      linha.attended += reservas.filter((r) => r.status === 'ATTENDED').length
      linha.noShows += reservas.filter((r) => r.status === 'NO_SHOW').length
      porNome.set(sessao.name, linha)
    }

    return [...porNome.values()].sort((a, b) => b.occurrences - a.occurrences)
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  // ── Conteúdos ──────────────────────────────────────────────────────────────
  /** Três publicações de exemplo, relativas a hoje, mais um rascunho. */
  private montarConteudos() {
    if (this.conteudosProntos) return
    this.conteudosProntos = true

    const staff = this.db.staff[0]
    const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

    this.demoContent.push(
      {
        id: 'cont_1',
        organizationId: DEMO_ORG_ID,
        type: 'ARTICLE',
        title: 'Novo horário da musculação aos sábados',
        summary: 'A partir deste mês abrimos às 8h e fechamos às 14h.',
        body: 'A sala de musculação passa a abrir às 8h aos sábados...',
        coverUrl: null,
        mediaUrl: null,
        visibility: 'ORGANIZATION',
        publishedAt: dias(20),
        pinned: true,
        authorStaffId: staff?.id ?? null,
        authorName: staff?.name ?? null,
        createdAt: dias(20),
      },
      {
        id: 'cont_2',
        organizationId: DEMO_ORG_ID,
        type: 'VIDEO',
        title: 'Como executar o agachamento com segurança',
        summary: 'Três minutos com os erros mais comuns.',
        body: null,
        coverUrl: null,
        mediaUrl: 'https://exemplo.test/agachamento',
        visibility: 'ORGANIZATION',
        publishedAt: dias(4),
        pinned: false,
        authorStaffId: staff?.id ?? null,
        authorName: staff?.name ?? null,
        createdAt: dias(4),
      },
      {
        id: 'cont_3',
        organizationId: DEMO_ORG_ID,
        type: 'GUIDE',
        title: 'Guia: o que comer antes do treino',
        summary: 'Sugestões para treinar de manhã, à tarde e à noite.',
        body: 'Treinar em jejum funciona para algumas pessoas...',
        coverUrl: null,
        mediaUrl: null,
        visibility: 'ORGANIZATION',
        publishedAt: null,
        pinned: false,
        authorStaffId: staff?.id ?? null,
        authorName: staff?.name ?? null,
        createdAt: dias(1),
      },
    )
  }

  async listContent(organizationId: string): Promise<ContentItem[]> {
    this.montarConteudos()
    return this.demoContent
      .filter((c) => c.organizationId === organizationId)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.createdAt.localeCompare(a.createdAt)
      })
  }

  async getContent(organizationId: string, contentId: string) {
    this.montarConteudos()
    return (
      this.demoContent.find((c) => c.organizationId === organizationId && c.id === contentId) ??
      null
    )
  }

  async saveContent(input: SaveContentInput): Promise<ContentItem> {
    this.montarConteudos()
    const existente = input.id ? this.demoContent.find((c) => c.id === input.id) : undefined

    const item: ContentItem = {
      id: input.id ?? `cont_${this.demoContent.length + 1}`,
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      summary: input.summary,
      body: input.body,
      coverUrl: input.coverUrl,
      mediaUrl: input.mediaUrl,
      // Sempre ORGANIZATION, como na produção: FREE é da plataforma.
      visibility: 'ORGANIZATION',
      publishedAt: input.publishedAt,
      pinned: input.pinned,
      authorStaffId: input.authorStaffId,
      authorName: this.staffById.get(input.authorStaffId ?? '')?.name ?? null,
      createdAt: existente?.createdAt ?? new Date().toISOString(),
    }

    const indice = this.demoContent.findIndex((c) => c.id === item.id)
    if (indice >= 0) this.demoContent[indice] = item
    else this.demoContent.push(item)
    return item
  }

  async deleteContent(organizationId: string, contentId: string): Promise<void> {
    this.montarConteudos()
    const indice = this.demoContent.findIndex(
      (c) => c.organizationId === organizationId && c.id === contentId,
    )
    if (indice >= 0) this.demoContent.splice(indice, 1)
  }

  // ── Push ───────────────────────────────────────────────────────────────────

  /*
   * A demonstração aceita e esquece. Não há chave VAPID nem aparelho de
   * verdade, e guardar a inscrição só para nunca entregar nada seria pior do
   * que não guardar — a tela diria "ligado" para quem não vai receber.
   */
  async registerPushSubscription(): Promise<void> {}
  async removePushSubscription(): Promise<void> {}

  // ── Acervo Synse ───────────────────────────────────────────────────────────

  private montarAcervo() {
    if (this.acervoPronto) return
    this.acervoPronto = true

    const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
    /*
     * Dois itens, e os dois de propósito: um aberto e um do Synse+. É o par
     * mínimo para a demonstração mostrar o cadeado funcionando — o aluno com
     * assinatura vê os dois, o do plano grátis vê um.
     */
    this.demoAcervo.push(
      {
        id: 'acv_1',
        organizationId: null,
        type: 'GUIDE',
        title: 'Como montar sua primeira semana de treino',
        summary: 'O guia que abre o Synse: por onde começar sem se machucar.',
        body: [
          'A primeira semana não é para provar nada. Ela é para o seu corpo descobrir o movimento e para você descobrir o horário que consegue cumprir.',
          'Três dias bastam. Dois seriam pouco para criar hábito, cinco seriam muito para quem está voltando — e a semana que você não cumpre é a que faz desistir na terceira.',
          'Em cada dia, seis exercícios: dois para pernas, dois para o tronco empurrando, dois para o tronco puxando. Três séries de dez, com uma carga que deixa você terminar a última série ainda conseguindo mais duas.',
          'Se no dia seguinte doer a ponto de atrapalhar, foi carga demais. Dor muscular de treino incomoda; dor que limita é aviso.',
        ].join('\n\n'),
        coverUrl: null,
        mediaUrl: null,
        visibility: 'FREE',
        publishedAt: dias(20),
        pinned: false,
        authorStaffId: null,
        authorName: 'Synse',
        createdAt: dias(20),
      },
      {
        id: 'acv_2',
        organizationId: null,
        type: 'EBOOK',
        title: 'E-book: hipertrofia sem achismo',
        summary: 'Volume, frequência e descanso, com o que a evidência sustenta.',
        body: [
          'Três variáveis explicam quase tudo em hipertrofia, e nenhuma delas é o exercício da moda.',
          'Volume é o número de séries duras por grupo muscular por semana. A faixa que a literatura sustenta vai de dez a vinte; abaixo disso o estímulo é pequeno, acima o retorno cai e a recuperação começa a cobrar.',
          'Frequência é como esse volume se espalha. Vinte séries de peito num dia só rendem menos que dez em dois dias, porque a síntese proteica responde por volta de quarenta e oito horas e depois volta ao normal.',
          'Descanso entre séries é o mais subestimado. Menos de um minuto derruba a carga da série seguinte, e carga derrubada é estímulo perdido. Dois a três minutos nos exercícios grandes.',
          'O resto — ordem dos exercícios, máquina contra peso livre, cadência — muda pouco perto disso.',
        ].join('\n\n'),
        coverUrl: null,
        mediaUrl: null,
        visibility: 'SYNSE_PLUS',
        publishedAt: dias(6),
        pinned: true,
        authorStaffId: null,
        authorName: 'Synse',
        createdAt: dias(6),
      },
    )
  }

  async listSynseContent(): Promise<ContentItem[]> {
    this.montarAcervo()
    return [...this.demoAcervo].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.createdAt.localeCompare(a.createdAt)
    })
  }

  async getSynseContent(contentId: string): Promise<ContentItem | null> {
    this.montarAcervo()
    return this.demoAcervo.find((c) => c.id === contentId) ?? null
  }

  async saveSynseContent(input: SaveSynseContentInput): Promise<string> {
    this.montarAcervo()
    const existente = input.id ? this.demoAcervo.find((c) => c.id === input.id) : undefined

    const item: ContentItem = {
      id: input.id ?? `acv_${this.demoAcervo.length + 1}`,
      organizationId: null,
      type: input.type,
      title: input.title,
      summary: input.summary,
      body: input.body,
      coverUrl: input.coverUrl,
      mediaUrl: input.mediaUrl,
      visibility: input.visibility,
      publishedAt: input.publishedAt,
      pinned: input.pinned,
      authorStaffId: null,
      authorName: 'Synse',
      createdAt: existente?.createdAt ?? new Date().toISOString(),
    }

    const indice = this.demoAcervo.findIndex((c) => c.id === item.id)
    if (indice >= 0) this.demoAcervo[indice] = item
    else this.demoAcervo.push(item)

    /*
     * Sem diário, como o conteúdo de academia: o journal vive num cookie de
     * orçamento apertado, e o acervo da demonstração é para ser visto, não
     * para sobreviver a um reinício do processo.
     */
    return item.id
  }

  async deleteSynseContent(contentId: string): Promise<void> {
    this.montarAcervo()
    const indice = this.demoAcervo.findIndex((c) => c.id === contentId)
    if (indice >= 0) this.demoAcervo.splice(indice, 1)
  }

  /**
   * O que o aluno vê: o mural da academia dele **e** o acervo da plataforma.
   *
   * A primeira versão só chamava `listContent(organizationId)`, que filtra por
   * dono e portanto descartava tudo que tem `organizationId: null`. Em
   * produção a `published_content` traz os dois (`or c.organization_id is
   * null`, 0031), então a demonstração mostrava um app sem acervo nenhum —
   * justamente a parte que o Synse+ vende. A divergência é o defeito: a
   * demonstração existe para parecer o produto.
   */
  private async publicados(organizationId: string): Promise<ContentItem[]> {
    this.montarAcervo()
    const daAcademia = await this.listContent(organizationId)
    const agora = new Date().toISOString()

    // Mesma regra da produção: rascunho e agendado ficam de fora, e o que é
    // do Synse+ só chega a quem assina — lá quem faz isso é a RLS.
    return [...daAcademia, ...this.demoAcervo]
      .filter((c) => c.publishedAt !== null && c.publishedAt <= agora)
      .filter((c) => c.visibility !== 'SYNSE_PLUS' || this.temPlus)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
      })
  }

  async listPublishedContent(organizationId: string, limite: number): Promise<ContentItem[]> {
    return (await this.publicados(organizationId)).slice(0, limite)
  }

  async getPublishedContent(
    organizationId: string,
    contentId: string,
  ): Promise<ContentItem | null> {
    return (await this.publicados(organizationId)).find((c) => c.id === contentId) ?? null
  }

  /**
   * A vitrine, do lado da demonstração.
   *
   * Espelha a projeção de `acervo_trancado` (0041) à mão: o tipo `ItemTrancado`
   * não tem onde guardar o corpo, então nem por descuido o conteúdo pago sai
   * por aqui.
   */
  private trancados(): ItemTrancado[] {
    if (this.temPlus) return []
    this.montarAcervo()
    const agora = new Date().toISOString()

    return this.demoAcervo
      .filter(
        (c) => c.visibility === 'SYNSE_PLUS' && c.publishedAt !== null && c.publishedAt <= agora,
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
      })
      .map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        summary: c.summary,
        coverUrl: c.coverUrl,
        publishedAt: c.publishedAt!,
        pinned: c.pinned,
      }))
  }

  // ── Programas guiados ──────────────────────────────────────────────────────
  /**
   * Dois programas na demonstração: um aberto e um do Synse+.
   *
   * O par mínimo para mostrar o cadeado funcionando, como no acervo. Os dias
   * são gerados por um ciclo de três — é o que um programa de verdade faz, e
   * escrever 21 dias à mão na semente seria conteúdo falso ocupando espaço.
   */
  private programasProntos = false
  private readonly demoProgramas: Program[] = []
  private readonly demoPassos = new Map<string, ProgramStep[]>()
  private readonly demoMatriculas = new Map<string, ProgramEnrollment>()

  private montarProgramas() {
    if (this.programasProntos) return
    this.programasProntos = true

    const CICLO = [
      { titulo: 'Corpo inteiro', tarefas: ['Agachamento 3x10', 'Remada 3x10', 'Prancha 3x30s'] },
      { titulo: 'Caminhada leve', tarefas: ['25 minutos em ritmo de conversa'] },
      {
        titulo: 'Empurrar e puxar',
        tarefas: ['Supino 3x10', 'Puxada 3x10', 'Elevação lateral 2x15'],
      },
    ]

    const montar = (p: Program) => {
      this.demoProgramas.push(p)
      this.demoPassos.set(
        p.id,
        Array.from({ length: p.durationDays }, (_, i) => {
          const dia = i + 1
          const base = CICLO[i % CICLO.length]
          return {
            id: `${p.id}-d${dia}`,
            dayNumber: dia,
            title: dia % 7 === 0 ? 'Descanso' : base.titulo,
            tasks: dia % 7 === 0 ? ['Dia de recuperação. Durma bem.'] : base.tarefas,
          }
        }),
      )
    }

    montar({
      id: 'prog_livre',
      code: 'LIVRE_7',
      title: 'Primeira semana',
      description: 'Sete dias para criar o hábito, sem equipamento além do seu corpo.',
      durationDays: 7,
      coverUrl: null,
      visibility: 'FREE',
    })
    montar({
      id: 'prog_21',
      code: 'SYNSE_21',
      title: 'Programa 21 dias',
      description: 'Três semanas de treino guiado, com progressão de carga a cada ciclo.',
      durationDays: 21,
      coverUrl: null,
      visibility: 'SYNSE_PLUS',
    })
  }

  /**
   * O que esta sessão enxerga. Em produção quem decide é a RLS.
   *
   * A conta de plataforma enxerga tudo, como o `or is_super_admin()` que a
   * 0043 pôs em `programs_read`. Sem isto a tela de autoria listava zero
   * programas pagos — encontrado clicando, não lendo: a conta de plataforma
   * da demonstração não assina nada.
   */
  private programasVisiveis(): Program[] {
    this.montarProgramas()
    return this.demoProgramas.filter(
      (p) => p.visibility !== 'SYNSE_PLUS' || this.temPlus || this.ehPlataforma,
    )
  }

  async listPrograms(): Promise<ProgramaNaLista[]> {
    return this.programasVisiveis().map((p) => ({
      ...p,
      matricula: this.demoMatriculas.get(p.id) ?? null,
    }))
  }

  async getProgram(programId: string) {
    const programa = this.programasVisiveis().find((p) => p.id === programId)
    if (!programa) return null

    return {
      programa,
      passos: this.demoPassos.get(programId) ?? [],
      matricula: this.demoMatriculas.get(programId) ?? null,
    }
  }

  /** Espelha a recusa da 0043: programa que não se enxerga não se inicia. */
  private exigirVisivel(programId: string): Program {
    const programa = this.programasVisiveis().find((p) => p.id === programId)
    if (!programa) throw new AppError('programa_indisponivel', 'Programa indisponível.', 403)
    return programa
  }

  async startProgram(programId: string): Promise<void> {
    this.exigirVisivel(programId)
    this.aplicarProgresso(programId, [])
    await appendDemoMutation({ t: 'prog', id: programId, a: 'start' })
  }

  /**
   * O menor dia que falta, como no banco — pular um não o apaga.
   *
   * Não exige visibilidade: isto também roda ao reaplicar o diário, no
   * construtor, e ali o estado já foi autorizado quando foi gravado. A
   * conferência fica nos métodos públicos, que é por onde a tela entra.
   */
  private aplicarProgresso(programId: string, dias: number[]) {
    this.montarProgramas()
    const programa = this.demoProgramas.find((p) => p.id === programId)
    if (!programa) return

    const unicos = [...new Set(dias)].sort((a, b) => a - b)
    const proximo = Array.from({ length: programa.durationDays }, (_, i) => i + 1).find(
      (d) => !unicos.includes(d),
    )
    const atual = this.demoMatriculas.get(programId)

    this.demoMatriculas.set(programId, {
      startedAt: atual?.startedAt ?? new Date().toISOString().slice(0, 10),
      completedDays: unicos,
      currentDay: proximo ?? programa.durationDays,
      status: proximo ? 'ACTIVE' : 'COMPLETED',
    })
  }

  async completeProgramDay(programId: string, dia: number): Promise<void> {
    const programa = this.exigirVisivel(programId)
    if (dia < 1 || dia > programa.durationDays) {
      throw new AppError('dia_invalido', `O dia ${dia} não existe neste programa.`, 400)
    }
    this.aplicarProgresso(programId, [
      ...(this.demoMatriculas.get(programId)?.completedDays ?? []),
      dia,
    ])
    await appendDemoMutation({ t: 'prog', id: programId, a: 'day', d: dia })
  }

  async undoProgramDay(programId: string, dia: number): Promise<void> {
    const feitos = this.demoMatriculas.get(programId)?.completedDays ?? []
    this.aplicarProgresso(
      programId,
      feitos.filter((d) => d !== dia),
    )
    await appendDemoMutation({ t: 'prog', id: programId, a: 'undo', d: dia })
  }

  async abandonProgram(programId: string): Promise<void> {
    const atual = this.demoMatriculas.get(programId)
    if (atual) this.demoMatriculas.set(programId, { ...atual, status: 'ABANDONED' })
    await appendDemoMutation({ t: 'prog', id: programId, a: 'quit' })
  }

  /*
   * A autoria não persiste entre requisições, como o acervo: o data source é
   * remontado a cada pedido e só o diário do cookie sobrevive. Em
   * demonstração o que importa é a tela responder, não o dado durar.
   */
  async listLockedPrograms(): Promise<ProgramaTrancadoTipo[]> {
    if (this.temPlus || this.ehPlataforma) return []
    this.montarProgramas()

    return this.demoProgramas
      .filter((p) => p.visibility === 'SYNSE_PLUS')
      .map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        durationDays: p.durationDays,
      }))
  }

  async saveProgram(input: {
    id?: string
    code: string
    title: string
    description: string | null
    durationDays: number
    coverUrl: string | null
    visibility: 'FREE' | 'SYNSE_PLUS'
  }): Promise<string> {
    this.montarProgramas()
    const id = input.id ?? `prog_${this.demoProgramas.length + 1}`
    const programa: Program = { ...input, id }

    const indice = this.demoProgramas.findIndex((p) => p.id === id)
    if (indice >= 0) this.demoProgramas[indice] = programa
    else this.demoProgramas.push(programa)

    return id
  }

  async saveProgramStep(input: {
    programId: string
    dayNumber: number
    title: string
    tasks: string[]
  }): Promise<void> {
    this.montarProgramas()
    const passos = this.demoPassos.get(input.programId) ?? []
    const outros = passos.filter((p) => p.dayNumber !== input.dayNumber)

    this.demoPassos.set(
      input.programId,
      [
        ...outros,
        {
          id: `${input.programId}-d${input.dayNumber}`,
          dayNumber: input.dayNumber,
          title: input.title,
          tasks: input.tasks,
        },
      ].sort((a, b) => a.dayNumber - b.dayNumber),
    )
  }

  async deleteProgram(programId: string): Promise<void> {
    this.montarProgramas()
    const indice = this.demoProgramas.findIndex((p) => p.id === programId)
    if (indice >= 0) this.demoProgramas.splice(indice, 1)
    this.demoPassos.delete(programId)
    this.demoMatriculas.delete(programId)
  }

  // ── Biblioteca de receitas (0003, 0044) ────────────────────────────────────

  private readonly demoReceitas: Recipe[] = []
  private receitasProntas = false

  /**
   * Um punhado de receitas, metade grátis e metade do Synse+.
   *
   * A divisão é o ponto: com tudo grátis a vitrine do cadeado nunca apareceria
   * na demonstração, e com tudo pago a tela abriria vazia no plano grátis —
   * nenhum dos dois é o que acontece em produção.
   */
  private montarReceitas() {
    if (this.receitasProntas) return
    this.receitasProntas = true

    this.demoReceitas.push(
      {
        id: 'rec_ovos',
        title: 'Ovos mexidos com aveia salgada',
        description: 'Café da manhã de 10 minutos, com proteína de verdade.',
        category: 'CAFE',
        ingredients: [
          '3 ovos',
          '3 colheres de sopa de aveia em flocos',
          '1 pitada de sal',
          'Cebolinha a gosto',
        ],
        instructions:
          'Cozinhe a aveia com um pouco de água até soltar do fundo.\n\nJunte os ovos batidos e mexa em fogo baixo até firmar. Tempere no fim.',
        prepMinutes: 10,
        servings: 1,
        imageUrl: null,
        tags: ['proteico', 'rápido'],
        nutritionFacts: { kcal: 380, protein: 26, carbs: 22, fat: 20 },
        visibility: 'FREE',
      },
      {
        id: 'rec_frango',
        title: 'Frango desfiado com batata-doce',
        description: 'A marmita que aguenta a semana inteira na geladeira.',
        category: 'ALMOCO',
        ingredients: [
          '500 g de peito de frango',
          '2 batatas-doces médias',
          '1 cebola',
          'Azeite, sal e páprica',
        ],
        instructions:
          'Cozinhe o frango na água com a cebola e desfie ainda morno.\n\nAsse a batata-doce em cubos por 30 minutos. Junte tudo, tempere e divida em quatro potes.',
        prepMinutes: 45,
        servings: 4,
        imageUrl: null,
        tags: ['marmita', 'proteico'],
        nutritionFacts: { kcal: 420, protein: 38, carbs: 40, fat: 10 },
        visibility: 'FREE',
      },
      {
        id: 'rec_panqueca',
        title: 'Panqueca de banana pré-treino',
        description: 'Carboidrato rápido 40 minutos antes de treinar.',
        category: 'PRE_TREINO',
        ingredients: ['1 banana madura', '2 ovos', '2 colheres de aveia', 'Canela'],
        instructions:
          'Amasse a banana e misture tudo.\n\nFrite em frigideira antiaderente, dois minutos de cada lado.',
        prepMinutes: 8,
        servings: 1,
        imageUrl: null,
        tags: ['pré-treino', 'rápido'],
        nutritionFacts: { kcal: 310, protein: 15, carbs: 38, fat: 11 },
        visibility: 'SYNSE_PLUS',
      },
      {
        id: 'rec_salmao',
        title: 'Salmão ao forno com legumes',
        description: 'Jantar leve, pronto numa assadeira só.',
        category: 'JANTAR',
        ingredients: ['2 postas de salmão', '1 abobrinha', '1 pimentão', 'Limão, azeite e ervas'],
        instructions:
          'Corte os legumes em tiras e espalhe na assadeira.\n\nPonha o salmão por cima, regue com limão e azeite, e asse 20 minutos a 200 °C.',
        prepMinutes: 30,
        servings: 2,
        imageUrl: null,
        tags: ['leve', 'ômega-3'],
        nutritionFacts: { kcal: 460, protein: 34, carbs: 14, fat: 29 },
        visibility: 'SYNSE_PLUS',
      },
      {
        id: 'rec_shake',
        title: 'Shake de recuperação',
        description: 'Proteína e carboidrato na janela pós-treino.',
        category: 'POS_TREINO',
        ingredients: ['300 ml de leite', '1 scoop de whey', '1 banana', '1 colher de mel'],
        instructions: 'Bata tudo no liquidificador e tome logo depois do treino.',
        prepMinutes: 3,
        servings: 1,
        imageUrl: null,
        tags: ['pós-treino', 'rápido'],
        nutritionFacts: { kcal: 400, protein: 32, carbs: 48, fat: 7 },
        visibility: 'SYNSE_PLUS',
      },
    )
  }

  /**
   * O que esta sessão enxerga.
   *
   * Em produção quem decide é a RLS da 0038 com o `or is_super_admin()` da
   * 0044. Aqui a condição é reproduzida inteira, e não aproximada: foi
   * aproximar que fez `listPublishedContent` perder o acervo da plataforma na
   * demonstração enquanto produção o mostrava.
   */
  private receitasVisiveis(): Recipe[] {
    this.montarReceitas()
    return this.demoReceitas.filter(
      (r) => r.visibility !== 'SYNSE_PLUS' || this.temPlus || this.ehPlataforma,
    )
  }

  async listRecipes(): Promise<Recipe[]> {
    return this.receitasVisiveis()
      .slice()
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  }

  async getRecipe(recipeId: string): Promise<Recipe | null> {
    return this.receitasVisiveis().find((r) => r.id === recipeId) ?? null
  }

  /** A vitrine: vazia para quem já lê, como `receitas_trancadas` (0044). */
  private receitasTrancadas(): ReceitaTrancadaTipo[] {
    if (this.temPlus || this.ehPlataforma) return []
    this.montarReceitas()

    return this.demoReceitas
      .filter((r) => r.visibility === 'SYNSE_PLUS')
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        prepMinutes: r.prepMinutes,
        servings: r.servings,
        imageUrl: r.imageUrl,
      }))
  }

  async listLockedRecipes(): Promise<ReceitaTrancadaTipo[]> {
    return this.receitasTrancadas()
  }

  async getLockedRecipe(recipeId: string): Promise<ReceitaTrancadaTipo | null> {
    return this.receitasTrancadas().find((r) => r.id === recipeId) ?? null
  }

  /*
   * A autoria não persiste entre requisições, como o acervo e os programas: o
   * data source é remontado a cada pedido e só o diário do cookie sobrevive.
   */
  async saveRecipe(input: {
    id?: string
    title: string
    description: string | null
    category: string
    ingredients: string[]
    instructions: string | null
    prepMinutes: number | null
    servings: number | null
    imageUrl: string | null
    tags: string[]
    nutritionFacts: Record<string, number> | null
    visibility: 'FREE' | 'SYNSE_PLUS'
  }): Promise<string> {
    this.montarReceitas()
    const id = input.id ?? `rec_${this.demoReceitas.length + 1}`
    const receita: Recipe = { ...input, id }

    const indice = this.demoReceitas.findIndex((r) => r.id === id)
    if (indice >= 0) this.demoReceitas[indice] = receita
    else this.demoReceitas.push(receita)

    return id
  }

  async deleteRecipe(recipeId: string): Promise<void> {
    this.montarReceitas()
    const indice = this.demoReceitas.findIndex((r) => r.id === recipeId)
    if (indice >= 0) this.demoReceitas.splice(indice, 1)
  }

  async listLockedShowcase(): Promise<ItemTrancado[]> {
    return this.trancados()
  }

  async getLockedShowcase(contentId: string): Promise<ItemTrancado | null> {
    return this.trancados().find((c) => c.id === contentId) ?? null
  }

  // ── Nutrição ───────────────────────────────────────────────────────────────
  /**
   * Em demonstração o plano nasce do plano base, para a tela ter o que mostrar
   * sem ninguém precisar digitar uma consulta inteira antes.
   */
  private montarNutricao() {
    if (this.nutricaoPronta) return
    this.nutricaoPronta = true

    const staff = this.db.staff.find((m) => m.role === 'NUTRITIONIST') ?? this.db.staff[0]
    const plano: NutritionPlanWithMeals = {
      id: 'nplan_1',
      organizationId: DEMO_ORG_ID,
      studentId: this.db.studentIdForApp,
      studentName: this.studentById.get(this.db.studentIdForApp)?.name ?? null,
      authorStaffId: staff?.id ?? 'staff_1',
      authorName: staff?.name ?? null,
      title: 'Plano de manutenção',
      version: 1,
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      notes: 'Beber 2,5 litros de água por dia. Ajustar após a próxima avaliação.',
      targetCalories: 2200,
      targetProteinG: 150,
      targetCarbsG: 230,
      targetFatG: 70,
      createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      meals: BASELINE_MEAL_PLAN.meals.map((refeicao, indice) => ({
        id: `nmeal_${indice + 1}`,
        nutritionPlanId: 'nplan_1',
        name: refeicao.name,
        timeOfDay: refeicao.time ?? null,
        position: indice + 1,
        items: [refeicao.suggestion, ...refeicao.swaps].map((descricao, ordem) => ({
          id: `nitem_${indice + 1}_${ordem + 1}`,
          mealId: `nmeal_${indice + 1}`,
          description: ordem === 0 ? descricao : `Troca: ${descricao}`,
          quantity: null,
          // Só o item principal soma: as trocas substituem, não acrescentam.
          calories: ordem === 0 ? 380 : null,
          proteinG: ordem === 0 ? 26 : null,
          carbsG: ordem === 0 ? 42 : null,
          fatG: ordem === 0 ? 12 : null,
          position: ordem + 1,
        })),
      })),
      totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, items: 0 },
    }

    plano.totals = this.somar(plano)

    /*
     * ── A versão anterior, arquivada ───────────────────────────────────────
     *
     * A demonstração tinha um plano só, e com um plano só a aba "Nutrição" da
     * ficha mostra o vigente e nada mais — o histórico, que é a razão de ela
     * existir, ficaria invisível justamente onde a academia conhece o
     * produto.
     *
     * Reproduz o que `publish_nutrition_plan` (0030) faz em produção ao
     * publicar a nova: a anterior vira `ARCHIVED` e continua com autor, data
     * e versão. Mesmas refeições, metas mais baixas — é o ajuste que um
     * nutricionista faz entre uma consulta e outra, e é o que torna o
     * "por que mudou?" uma pergunta respondível.
     */
    const anterior: NutritionPlanWithMeals = {
      ...plano,
      id: 'nplan_0',
      title: 'Plano de adaptação',
      version: 1,
      status: 'ARCHIVED',
      publishedAt: new Date(Date.now() - 68 * 86_400_000).toISOString(),
      createdAt: new Date(Date.now() - 70 * 86_400_000).toISOString(),
      notes: 'Primeiras semanas. Foco em criar rotina de café da manhã.',
      targetCalories: 2000,
      targetProteinG: 130,
      targetCarbsG: 210,
      targetFatG: 65,
    }

    // A vigente é a 2: publicar a nova empurra a anterior para o histórico.
    plano.version = 2
    plano.title = 'Plano de manutenção'

    this.demoNutritionPlans.push(anterior, plano)
  }

  /** A mesma conta da função da 0030, para os números baterem. */
  private somar(plano: NutritionPlanWithMeals): NutritionTotals {
    const itens = plano.meals.flatMap((refeicao) => refeicao.items)
    return {
      calories: itens.reduce((soma, i) => soma + (i.calories ?? 0), 0),
      proteinG: itens.reduce((soma, i) => soma + (i.proteinG ?? 0), 0),
      carbsG: itens.reduce((soma, i) => soma + (i.carbsG ?? 0), 0),
      fatG: itens.reduce((soma, i) => soma + (i.fatG ?? 0), 0),
      items: itens.length,
    }
  }

  async listNutritionPlans(organizationId: string): Promise<NutritionPlan[]> {
    this.montarNutricao()
    return this.demoNutritionPlans.filter((p) => p.organizationId === organizationId)
  }

  async listNutritionPlansForStudent(organizationId: string, studentId: string) {
    const planos = await this.listNutritionPlans(organizationId)
    return planos.filter((p) => p.studentId === studentId).sort((a, b) => b.version - a.version)
  }

  async getNutritionPlan(organizationId: string, planId: string) {
    this.montarNutricao()
    return (
      this.demoNutritionPlans.find((p) => p.organizationId === organizationId && p.id === planId) ??
      null
    )
  }

  async getPublishedNutritionPlan(organizationId: string, studentId: string) {
    this.montarNutricao()
    return (
      this.demoNutritionPlans.find(
        (p) =>
          p.organizationId === organizationId &&
          p.studentId === studentId &&
          p.status === 'PUBLISHED',
      ) ?? null
    )
  }

  async saveNutritionPlan(input: SaveNutritionPlanInput): Promise<NutritionPlan> {
    this.montarNutricao()
    const existente = input.id ? this.demoNutritionPlans.find((p) => p.id === input.id) : undefined

    const id = input.id ?? `nplan_${this.demoNutritionPlans.length + 1}`
    const plano: NutritionPlanWithMeals = {
      id,
      organizationId: input.organizationId,
      studentId: input.studentId,
      studentName: this.studentById.get(input.studentId)?.name ?? null,
      authorStaffId: input.authorStaffId,
      authorName: this.staffById.get(input.authorStaffId)?.name ?? null,
      title: input.title,
      version:
        existente?.version ??
        Math.max(
          0,
          ...this.demoNutritionPlans
            .filter((p) => p.studentId === input.studentId)
            .map((p) => p.version),
        ) + 1,
      status: existente?.status ?? 'DRAFT',
      publishedAt: existente?.publishedAt ?? null,
      notes: input.notes,
      targetCalories: input.targetCalories,
      targetProteinG: input.targetProteinG,
      targetCarbsG: input.targetCarbsG,
      targetFatG: input.targetFatG,
      createdAt: existente?.createdAt ?? new Date().toISOString(),
      meals: input.meals.map((refeicao, indice) => ({
        id: `${id}_m${indice + 1}`,
        nutritionPlanId: id,
        name: refeicao.name,
        timeOfDay: refeicao.timeOfDay,
        position: indice + 1,
        items: refeicao.items.map((item, ordem) => ({
          id: `${id}_m${indice + 1}_i${ordem + 1}`,
          mealId: `${id}_m${indice + 1}`,
          description: item.description,
          quantity: item.quantity,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          position: ordem + 1,
        })),
      })),
      totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, items: 0 },
    }
    plano.totals = this.somar(plano)

    const indice = this.demoNutritionPlans.findIndex((p) => p.id === id)
    if (indice >= 0) this.demoNutritionPlans[indice] = plano
    else this.demoNutritionPlans.push(plano)
    return plano
  }

  async publishNutritionPlan(planId: string): Promise<void> {
    this.montarNutricao()
    const plano = this.demoNutritionPlans.find((p) => p.id === planId)
    if (!plano) throw new Error('Plano não encontrado.')
    if (plano.meals.length === 0) throw new Error('Um plano sem refeições não vai ajudar ninguém.')

    // Só um publicado por aluno, como o índice parcial garante no banco.
    for (const outro of this.demoNutritionPlans) {
      if (
        outro.studentId === plano.studentId &&
        outro.status === 'PUBLISHED' &&
        outro.id !== planId
      ) {
        outro.status = 'ARCHIVED'
      }
    }
    plano.status = 'PUBLISHED'
    plano.publishedAt = plano.publishedAt ?? new Date().toISOString()
  }

  async newNutritionPlanVersion(planId: string): Promise<string> {
    this.montarNutricao()
    const base = this.demoNutritionPlans.find((p) => p.id === planId)
    if (!base) throw new Error('Plano não encontrado.')

    const nova = await this.saveNutritionPlan({
      organizationId: base.organizationId,
      studentId: base.studentId,
      authorStaffId: base.authorStaffId,
      title: base.title,
      notes: base.notes,
      targetCalories: base.targetCalories,
      targetProteinG: base.targetProteinG,
      targetCarbsG: base.targetCarbsG,
      targetFatG: base.targetFatG,
      meals: base.meals.map((refeicao) => ({
        name: refeicao.name,
        timeOfDay: refeicao.timeOfDay,
        items: refeicao.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
        })),
      })),
    })
    return nova.id
  }

  // ── Desafios da academia ───────────────────────────────────────────────────
  /**
   * Dois desafios de exemplo, relativos a hoje.
   *
   * Datas fixas envelheceriam: quem abrisse a demonstração no mês seguinte
   * veria só desafio encerrado.
   */
  private montarDesafios() {
    if (this.desafiosProntos) return
    this.desafiosProntos = true

    const hoje = new Date()
    const dia = (n: number) => new Date(hoje.getTime() + n * 86_400_000).toISOString().slice(0, 10)

    this.demoGymChallenges.push(
      {
        id: 'gch_1',
        organizationId: DEMO_ORG_ID,
        title: 'Constância do mês',
        description: 'Quinze check-ins no mês. Conta sozinho, pela catraca.',
        metric: 'CHECKINS',
        targetValue: 15,
        unit: 'check-ins',
        startsAt: dia(-12),
        endsAt: dia(18),
        rankingEnabled: true,
        status: 'ACTIVE',
        reward: 'Camiseta da academia',
        participants: 34,
        createdAt: new Date(hoje.getTime() - 12 * 86_400_000).toISOString(),
      },
      {
        id: 'gch_2',
        organizationId: DEMO_ORG_ID,
        title: 'Tonelada do mês',
        description: 'Somar 50 toneladas de volume: carga vezes repetições.',
        metric: 'VOLUME_KG',
        targetValue: 50_000,
        unit: 'kg',
        startsAt: dia(-5),
        endsAt: dia(25),
        rankingEnabled: false,
        status: 'ACTIVE',
        reward: null,
        participants: 11,
        createdAt: new Date(hoje.getTime() - 5 * 86_400_000).toISOString(),
      },
    )
  }

  async listGymChallenges(organizationId: string): Promise<GymChallenge[]> {
    this.montarDesafios()
    return this.demoGymChallenges.filter((d) => d.organizationId === organizationId)
  }

  async getGymChallenge(organizationId: string, challengeId: string) {
    this.montarDesafios()
    return (
      this.demoGymChallenges.find(
        (d) => d.organizationId === organizationId && d.id === challengeId,
      ) ?? null
    )
  }

  async saveGymChallenge(input: SaveGymChallengeInput): Promise<GymChallenge> {
    this.montarDesafios()
    const desafio: GymChallenge = {
      id: input.id ?? `gch_${this.demoGymChallenges.length + 1}`,
      organizationId: input.organizationId,
      title: input.title,
      description: input.description,
      metric: input.metric,
      targetValue: input.targetValue,
      unit: input.unit,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      rankingEnabled: input.rankingEnabled,
      status: input.status,
      reward: input.reward,
      participants: 0,
      createdAt: new Date().toISOString(),
    }

    const existente = this.demoGymChallenges.findIndex((d) => d.id === desafio.id)
    if (existente >= 0) {
      this.demoGymChallenges[existente] = {
        ...desafio,
        participants: this.demoGymChallenges[existente].participants,
      }
    } else this.demoGymChallenges.push(desafio)

    return desafio
  }

  async listGymChallengesForStudent(organizationId: string): Promise<GymChallengeForStudent[]> {
    const desafios = await this.listGymChallenges(organizationId)
    return desafios.map((desafio) => {
      const minha = this.demoParticipations.get(desafio.id)
      return {
        ...desafio,
        joined: Boolean(minha),
        rankingOptIn: Boolean(minha?.rankingOptIn),
        progressValue: minha?.progress ?? 0,
        completedAt: minha?.completedAt ?? null,
      }
    })
  }

  async joinGymChallenge(challengeId: string, rankingOptIn: boolean): Promise<void> {
    this.montarDesafios()
    const atual = this.demoParticipations.get(challengeId)
    // Idempotente como no banco: entrar de novo muda o consentimento e mantém
    // o progresso.
    this.demoParticipations.set(challengeId, {
      rankingOptIn,
      progress: atual?.progress ?? 0,
      completedAt: atual?.completedAt ?? null,
    })
    const desafio = this.demoGymChallenges.find((d) => d.id === challengeId)
    if (desafio && !atual) desafio.participants += 1
  }

  async getGymChallengeRanking(challengeId: string): Promise<GymChallengeRankRow[]> {
    this.montarDesafios()
    const desafio = this.demoGymChallenges.find((d) => d.id === challengeId)
    // A mesma tranca da produção: sem ranking ligado, não há quadro.
    if (!desafio?.rankingEnabled) return []

    return this.db.students.slice(0, 8).map((aluno, indice) => ({
      position: indice + 1,
      name: aluno.name,
      progressValue: Math.max(desafio.targetValue - indice * 2, 1),
      completedAt: indice < 3 ? new Date().toISOString() : null,
    }))
  }

  private leads(): Lead[] {
    const base = [...this.db.leads, ...this.addedLeads]
    return base.map((lead) => this.leadEdits.get(lead.id) ?? lead)
  }

  /** As etapas que saíram do funil, como na produção. */
  private static readonly ETAPAS_DECIDIDAS: LeadStage[] = ['ENROLLED', 'LOST']

  async listLeads(organizationId: string, filters: LeadFilters): Promise<Paginated<Lead>> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 50))

    const decidido = (lead: Lead) => DemoDataSource.ETAPAS_DECIDIDAS.includes(lead.stage)
    const todos = this.scoped(this.leads(), organizationId).filter((lead) =>
      filters.decided ? decidido(lead) : !decidido(lead),
    )

    // Mesma ordem da produção: quem tem retorno marcado vem primeiro.
    todos.sort((a, b) => {
      if (a.nextFollowUpAt && b.nextFollowUpAt) {
        return a.nextFollowUpAt.localeCompare(b.nextFollowUpAt)
      }
      if (a.nextFollowUpAt) return -1
      if (b.nextFollowUpAt) return 1
      return b.createdAt.localeCompare(a.createdAt)
    })

    // Recorta e **só então** conta: o total é do filtro, não da academia.
    const start = (page - 1) * pageSize
    return { rows: todos.slice(start, start + pageSize), total: todos.length, page, pageSize }
  }

  async getCrmSummary(organizationId: string): Promise<CrmSummary> {
    const todos = this.scoped(this.leads(), organizationId)
    const abertos = todos.filter((lead) => !DemoDataSource.ETAPAS_DECIDIDAS.includes(lead.stage))
    const agora = new Date().toISOString()

    return {
      emNegociacao: abertos.length,
      // Retorno vencido de quem já decidiu não é trabalho pendente, é resíduo.
      retornoAtrasado: abertos.filter((lead) => lead.nextFollowUpAt && lead.nextFollowUpAt < agora)
        .length,
      matriculados: todos.filter((lead) => lead.stage === 'ENROLLED').length,
      perdidos: todos.filter((lead) => lead.stage === 'LOST').length,
    }
  }

  async getLead(organizationId: string, leadId: string) {
    return this.leads().find((l) => l.organizationId === organizationId && l.id === leadId) ?? null
  }

  async saveLead(input: SaveLeadInput): Promise<Lead> {
    const existente = input.id ? await this.getLead(input.organizationId, input.id) : null
    const staff = this.staffById.get(input.ownerStaffId ?? '')

    const lead: Lead = {
      id: input.id ?? `lead_novo_${this.addedLeads.length + 1}`,
      organizationId: input.organizationId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      stage: existente?.stage ?? 'NEW',
      source: input.source,
      ownerStaffId: input.ownerStaffId,
      ownerName: staff?.name ?? null,
      notes: input.notes,
      nextFollowUpAt: input.nextFollowUpAt,
      convertedStudentId: existente?.convertedStudentId ?? null,
      lostReason: existente?.lostReason ?? null,
      createdAt: existente?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (existente) this.leadEdits.set(lead.id, lead)
    else {
      this.addedLeads.push(lead)
      // O gatilho da 0028 faz isto no banco; aqui é explícito.
      this.demoLeadEvents.push(this.evento(lead.id, 'CREATED', null, 'NEW', 'Lead cadastrado'))
    }
    return lead
  }

  private evento(
    leadId: string,
    kind: LeadEventKind,
    fromStage: LeadStage | null,
    toStage: LeadStage | null,
    body: string | null,
  ): LeadEvent {
    return {
      id: `levent_${this.demoLeadEvents.length + 1}`,
      leadId,
      kind,
      fromStage,
      toStage,
      body,
      actorName: null,
      createdAt: new Date().toISOString(),
    }
  }

  async moveLeadStage(
    organizationId: string,
    leadId: string,
    stage: LeadStage,
    lostReason: string | null,
  ) {
    const lead = await this.getLead(organizationId, leadId)
    if (!lead || lead.stage === stage) return

    this.demoLeadEvents.push(this.evento(leadId, 'STAGE_CHANGE', lead.stage, stage, lostReason))
    this.leadEdits.set(leadId, {
      ...lead,
      stage,
      lostReason,
      updatedAt: new Date().toISOString(),
    })
    await appendDemoMutation({
      t: 'lead',
      id: leadId,
      a: 'stage',
      s: stage,
      b: lostReason ?? undefined,
    })
  }

  async addLeadEvent(_organizationId: string, leadId: string, kind: LeadEventKind, body: string) {
    this.demoLeadEvents.push(this.evento(leadId, kind, null, null, body))
    // No diário também: `demoLeadEvents` é campo de instância, e sem isto o
    // contato recém-registrado some no recarregar seguinte.
    await appendDemoMutation({ t: 'lead', id: leadId, a: 'event', k: kind, b: body })
  }

  /**
   * O histórico do lead: o da semente mais o que o visitante fez.
   *
   * Os dois juntos, e não só o da sessão: sem a semente a ficha abriria vazia
   * em toda a demonstração, e a tela nova pareceria a tela quebrada.
   */
  async listLeadEvents(_organizationId: string, leadId: string): Promise<LeadEvent[]> {
    return [...this.db.leadEvents, ...this.demoLeadEvents]
      .filter((e) => e.leadId === leadId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async convertLead(leadId: string): Promise<string> {
    const lead = this.leads().find((l) => l.id === leadId)
    if (!lead) throw new Error('Lead não encontrado.')
    // Idempotente, como no banco: converter duas vezes devolve o mesmo aluno.
    if (lead.convertedStudentId) return lead.convertedStudentId

    const aluno = `stu_lead_${leadId}`
    this.demoLeadEvents.push(this.evento(leadId, 'STAGE_CHANGE', lead.stage, 'ENROLLED', null))
    this.leadEdits.set(leadId, {
      ...lead,
      stage: 'ENROLLED',
      convertedStudentId: aluno,
      nextFollowUpAt: null,
      updatedAt: new Date().toISOString(),
    })
    await appendDemoMutation({ t: 'lead', id: leadId, a: 'convert' })
    return aluno
  }

  // ── Notificações ───────────────────────────────────────────────────────────
  /*
   * Em produção quem escreve os avisos é o banco, por gatilho. Aqui não há
   * banco, então eles são derivados do próprio dataset: os mesmos fatos que
   * gerariam aviso lá (matrícula pendente, cobrança, pagamento) viram aviso
   * aqui, na leitura.
   *
   * A alternativa — uma lista fixa escrita à mão — mostraria avisos que não
   * correspondem a nada na tela ao lado, e a demonstração passaria a mentir
   * justamente sobre a função que o sino tem.
   */
  private buildNotifications(userProfileId: string): AppNotification[] {
    const student = this.students().find((item) => item.userProfileId === userProfileId)
    const at = (iso: string) => iso

    const notifications: Array<Omit<AppNotification, 'readAt'>> = []

    if (student) {
      const charges = this.charges()
        .filter((charge) => charge.studentId === student.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4)

      for (const charge of charges) {
        notifications.push({
          id: `notif_charge_${charge.id}`,
          organizationId: DEMO_ORG_ID,
          userProfileId,
          category: 'PAYMENT',
          title:
            charge.status === 'PAID' ? 'Pagamento confirmado' : `Cobrança de ${charge.description}`,
          body: `R$ ${charge.amount.toFixed(2).replace('.', ',')} · vence em ${charge.dueDate
            .split('-')
            .reverse()
            .join('/')}`,
          actionUrl: '/app/finance',
          createdAt: at(charge.createdAt),
        })
      }

      const assignment = this.db.workoutAssignments.find((item) => item.studentId === student.id)
      if (assignment) {
        const plan = this.db.workoutPlans.find((item) => item.id === assignment.workoutPlanId)
        notifications.push({
          id: `notif_workout_${assignment.id}`,
          organizationId: DEMO_ORG_ID,
          userProfileId,
          category: 'WORKOUT',
          title: 'Novo treino disponível',
          body: `${plan?.name ?? 'Um treino'} foi atribuído a você.`,
          actionUrl: '/app/workout',
          createdAt: at(assignment.assignedAt),
        })
      }
    } else {
      for (const pending of this.students()
        .filter((item) => item.status === 'PENDING')
        .slice(0, 5)) {
        notifications.push({
          id: `notif_pending_${pending.id}`,
          organizationId: DEMO_ORG_ID,
          userProfileId,
          category: 'GYM',
          title: `${pending.name} entrou pelo código de convite`,
          body: 'A matrícula está aguardando a confirmação da academia.',
          actionUrl: '/students?status=PENDING',
          createdAt: at(`${pending.enrolledAt}T09:00:00.000Z`),
        })
      }

      for (const paid of this.charges()
        .filter((charge) => charge.status === 'PAID' && charge.paidAt)
        .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))
        .slice(0, 5)) {
        const name = this.studentById.get(paid.studentId)?.name ?? 'aluno'
        notifications.push({
          id: `notif_paid_${paid.id}`,
          organizationId: DEMO_ORG_ID,
          userProfileId,
          category: 'PAYMENT',
          title: `Pagamento recebido de ${name}`,
          body: `${paid.description} · R$ ${paid.amount.toFixed(2).replace('.', ',')}`,
          actionUrl: '/finance',
          createdAt: at(paid.paidAt as string),
        })
      }
    }

    return notifications
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        ...item,
        readAt:
          this.notificationsReadAt && this.notificationsReadAt >= item.createdAt
            ? this.notificationsReadAt
            : null,
      }))
  }

  // ── Consentimento ──────────────────────────────────────────────────────────
  /*
   * Na demonstração ninguém aceitou nada ainda: o catálogo aparece inteiro, com
   * tudo por responder, e o que o visitante marcar viaja no diário. Fingir
   * consentimentos já dados seria repetir na demonstração exatamente a mentira
   * que a 0017 veio corrigir no produto.
   */
  // ── Convite de equipe ──────────────────────────────────────────────────────
  /*
   * A demonstração não convida ninguém de verdade: mandar e-mail a partir de um
   * ambiente de demonstração alcançaria uma pessoa real, com o nome de uma
   * academia fictícia. O convite vira um cartão na lista, com um token de
   * mentira que não abre nada.
   */
  async createStaffInvite(input: {
    organizationId: string
    email: string
    role: UserRole
    jobTitle: string | null
    registrationNumber: string | null
  }): Promise<string> {
    this.demoInvites.push({
      id: `invite_${generateSynseId().slice(4).toLowerCase()}`,
      organizationId: DEMO_ORG_ID,
      email: input.email.toLowerCase().trim(),
      role: input.role,
      jobTitle: input.jobTitle,
      registrationNumber: input.registrationNumber,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      acceptedAt: null,
      createdAt: new Date().toISOString(),
    })
    return 'demonstracao-sem-token'
  }

  async listStaffInvites(): Promise<StaffInvite[]> {
    return this.demoInvites
  }

  async acceptStaffInvite(): Promise<string> {
    throw new Error('A demonstração não aceita convites de equipe.')
  }

  async revokeStaffInvite(inviteId: string): Promise<void> {
    const convite = this.demoInvites.find((item) => item.id === inviteId)
    if (convite) convite.status = 'REVOKED'
  }

  async listConsents(): Promise<ConsentState[]> {
    return CONSENT_DOCUMENTS.map((documento) => {
      const resposta = this.consentAnswers.get(documento.consentType)
      return {
        ...documento,
        accepted: resposta?.accepted ?? false,
        respondedAt: resposta?.at ?? null,
        revokedAt: resposta && !resposta.accepted ? resposta.at : null,
        outdated: false,
      }
    })
  }

  async recordConsent(input: { consentType: ConsentType; accepted: boolean }): Promise<void> {
    const documento = CONSENT_DOCUMENTS.find((item) => item.consentType === input.consentType)
    if (!documento) throw new Error(`Consentimento desconhecido: ${input.consentType}`)
    if (documento.required && !input.accepted) {
      throw new Error('Este consentimento não pode ser revogado sem encerrar a conta.')
    }

    await appendDemoMutation({
      t: 'consent',
      code: input.consentType,
      ok: input.accepted,
      at: new Date().toISOString(),
    })
  }

  async closeOwnAccount(): Promise<Record<string, number>> {
    // A demonstração é compartilhada e reinicia sozinha: encerrar "a conta"
    // aqui apagaria o passeio de quem entrar depois.
    throw new Error('A demonstração não encerra contas.')
  }

  async listNotifications(userProfileId: string, limit = 20): Promise<AppNotification[]> {
    return this.buildNotifications(userProfileId).slice(0, limit)
  }

  async countUnreadNotifications(userProfileId: string): Promise<number> {
    return this.buildNotifications(userProfileId).filter((item) => item.readAt === null).length
  }

  async markNotificationsRead(userProfileId: string): Promise<number> {
    const unread = await this.countUnreadNotifications(userProfileId)
    await appendDemoMutation({ t: 'notifread', at: new Date().toISOString() })
    return unread
  }

  // ── Desafios base ──────────────────────────────────────────────────────────
  /*
   * O catálogo vem da cópia em `@/lib/baseline/challenges`, que
   * `tests/db/challenges.test.ts` compara com o SQL. A escolha e o progresso
   * do visitante viajam no diário, como todo o resto da demonstração.
   *
   * Medalha não é simulada: ela nasce do fechamento de um ciclo passado, e uma
   * demonstração que dura minutos não tem mês anterior. Inventar uma seria
   * mostrar conquista que não aconteceu.
   */
  async listBaselineChallenges(): Promise<BaselineChallenge[]> {
    return BASELINE_CHALLENGES
  }

  async listChallengeEntries(): Promise<ChallengeEntry[]> {
    return this.challengeEntries
  }

  /**
   * Medalhas plausíveis para a demonstração.
   *
   * Voltavam vazias, e a estante de medalhas no perfil ficava com o texto de
   * "nenhuma ainda" — quem abre o link para ver o produto não via o recurso
   * existir. Três ciclos, com um de participação no meio: é o que mostra que
   * o mês em que a meta não fechou também vira registro.
   */
  async listChallengeMedals(): Promise<ChallengeMedal[]> {
    const ciclo = (mesesAtras: number) => {
      const d = new Date()
      d.setMonth(d.getMonth() - mesesAtras)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    const premiadaEm = (mesesAtras: number) => {
      const d = new Date()
      d.setMonth(d.getMonth() - mesesAtras)
      return d.toISOString()
    }

    return [
      {
        id: 'medal_demo_1',
        challengeCode: 'CONSTANCIA_12',
        cycle: ciclo(1),
        level: 'OURO',
        progressValue: 14,
        targetValue: 12,
        awardedAt: premiadaEm(1),
      },
      {
        id: 'medal_demo_2',
        challengeCode: 'CORRIDA_20KM',
        cycle: ciclo(2),
        level: 'PARTICIPACAO',
        progressValue: 11,
        targetValue: 20,
        awardedAt: premiadaEm(2),
      },
      {
        id: 'medal_demo_3',
        challengeCode: 'CARGA_PROGRESSIVA',
        cycle: ciclo(3),
        level: 'PRATA',
        progressValue: 8,
        targetValue: 10,
        awardedAt: premiadaEm(3),
      },
    ]
  }

  async chooseBaselineChallenge(code: string): Promise<void> {
    const challenge = BASELINE_CHALLENGES.find((item) => item.code === code)
    if (!challenge) throw new Error('Desafio não encontrado.')

    const cycle = currentCycle()
    if (challenge.minTier === 'PRO') throw new Error('Este desafio é do plano Pro.')
    if (this.challengeEntries.some((item) => item.cycle === cycle)) {
      throw new Error('No plano gratuito você escolhe um desafio por mês.')
    }

    await appendDemoMutation({ t: 'chal', code, cycle, at: new Date().toISOString() })
  }

  async recordChallengeProgress(code: string, delta: number): Promise<number> {
    const cycle = currentCycle()
    const entrada = this.challengeEntries.find(
      (item) => item.challengeCode === code && item.cycle === cycle,
    )
    if (!entrada) throw new Error('Você não tem este desafio em andamento.')

    await appendDemoMutation({ t: 'chalprog', code, cycle, delta })
    return entrada.progressValue + delta
  }

  async closeOwnChallengeCycles(): Promise<number> {
    return 0
  }

  // ── SynseRun ───────────────────────────────────────────────────────────────
  /*
   * A demonstração guarda as corridas na memória do processo.
   *
   * Diferente do resto, elas não viajam no diário: uma corrida com a rota
   * inteira passa de 100 KB, e o orçamento do cookie é de 4. Some ao recarregar
   * a página, e é o comportamento honesto para uma demonstração — melhor sumir
   * do que fingir um histórico que ninguém correu.
   */
  private static readonly corridas = new Map<string, Activity>()
  private static readonly rotas = new Map<string, ActivityRoutePoint[]>()
  private static readonly parciais = new Map<string, ActivitySplit[]>()

  // ── Foto de perfil ─────────────────────────────────────────────────────────
  /*
   * Na demonstração a foto vive em memória, como data URL. Não há balde para
   * onde subir, e inventar um endereço externo faria a tela mostrar uma foto
   * que não é de ninguém.
   */
  private static fotoDemo: string | null = null

  async uploadAvatar(file: { bytes: ArrayBuffer; contentType: string }): Promise<string> {
    const base64 = Buffer.from(file.bytes).toString('base64')
    DemoDataSource.fotoDemo = `data:${file.contentType};base64,${base64}`
    return 'demo/avatar'
  }

  async removeAvatar(): Promise<void> {
    DemoDataSource.fotoDemo = null
  }

  async getAvatarUrl(path: string | null): Promise<string | null> {
    return path ? DemoDataSource.fotoDemo : null
  }

  // ── Synse Body ─────────────────────────────────────────────────────────────
  /*
   * Mesma escolha das corridas: memória do processo, e não o diário. Uma
   * pesagem carrega o pacote bruto do aparelho, e o orçamento do cookie é de
   * 4 KB. Some ao recarregar, e é o comportamento honesto numa demonstração —
   * melhor sumir do que fingir um histórico que ninguém pesou.
   */
  private static readonly pesagens = new Map<string, BodyMeasurement>()
  private static readonly aparelhos = new Map<string, UserDevice>()
  /**
   * As autorizações desta sessão, reconstruídas do diário a cada requisição.
   *
   * Instância, e não `static`: o mapa estático que estava aqui sobrevivia
   * dentro de um processo e sumia entre requisições servidas por módulos
   * diferentes — a tela autorizava e nada acontecia. Quem transporta estado
   * de visitante na demonstração é o cookie, não a memória do servidor.
   */
  private readonly autorizacoesDaSessao = new Map<string, BodyMeasurementShare>()

  /**
   * O perfil de quem está vendo, quando a pergunta depende disso.
   *
   * Só a autorização nominal do Synse Body usa. Em produção quem responde é a
   * RLS pelo `auth_profile_id()`; aqui não há RLS, e sem saber quem pergunta a
   * demonstração entregaria a qualquer professor o histórico que o aluno
   * autorizou a um só.
   */
  private readonly perfilAtual: string | null

  /** A privacidade escolhida nesta sessão, do diário. Vence a do dataset. */
  private readonly privacidadeDaCorrida = new Map<string, ActivityPrivacy>()

  /** O que o visitante apagou. Some das listas, como no banco. */
  private readonly corridasApagadas = new Set<string>()

  /**
   * Um histórico plausível para a demonstração começar com gráfico.
   *
   * Quinze semanas descendo devagar, com as oscilações que um corpo real tem —
   * uma linha reta faria a tela parecer inventada, que é o que ela seria.
   */
  private semearPesagens() {
    if (DemoDataSource.pesagens.size) return

    const aparelho: UserDevice = {
      id: 'dev_demo_1',
      deviceType: 'SCALE',
      provider: 'mock',
      manufacturer: 'Synse',
      model: 'Scale One',
      displayName: 'Balança do banheiro',
      platformDeviceId: 'mock-scale-0001',
      protocol: 'BLE_BODY_COMPOSITION',
      capabilities: { weight: true, bodyComposition: true, impedance: true },
      firmwareVersion: '1.4.0',
      pairedAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
      lastSeenAt: new Date(Date.now() - 86_400_000).toISOString(),
      status: 'ACTIVE',
    }
    DemoDataSource.aparelhos.set(aparelho.id, aparelho)

    const oscilacao = [0, 0.3, -0.2, 0.1, -0.4, 0.2, 0, -0.3, 0.4, -0.1, 0.2, -0.2, 0.1, 0, -0.3]
    oscilacao.forEach((delta, i) => {
      const semanasAtras = oscilacao.length - 1 - i
      const peso = 74.6 - i * 0.28 + delta
      const gordura = 24.8 - i * 0.16
      const clientId = `demo-body-${i}`

      DemoDataSource.pesagens.set(clientId, {
        id: `bm_demo_${i}`,
        clientId,
        measuredAt: new Date(Date.now() - semanasAtras * 7 * 86_400_000).toISOString(),
        source: 'BLUETOOTH_SCALE',
        deviceId: aparelho.id,
        weightKg: Math.round(peso * 100) / 100,
        bmi: Math.round((peso / (1.76 * 1.76)) * 100) / 100,
        bodyFatPercent: Math.round(gordura * 10) / 10,
        muscleMassKg: Math.round(peso * 0.385 * 100) / 100,
        leanMassKg: Math.round(peso * (1 - gordura / 100) * 100) / 100,
        bodyWaterPercent: Math.round((55 + i * 0.08) * 10) / 10,
        visceralFat: null,
        boneMassKg: null,
        bmrKcal: Math.round(1580 + i * 2),
        impedanceOhm: Math.round((508 + delta * 10) * 10) / 10,
        fieldOrigin: {
          weightKg: 'MEASURED',
          impedanceOhm: 'MEASURED',
          bodyFatPercent: 'ESTIMATED',
          muscleMassKg: 'ESTIMATED',
          leanMassKg: 'ESTIMATED',
          bmrKcal: 'ESTIMATED',
          bodyWaterPercent: 'CALCULATED',
          bmi: 'CALCULATED',
          visceralFat: 'ABSENT',
          boneMassKg: 'ABSENT',
        },
        rawPayload: null,
        createdAt: new Date(Date.now() - semanasAtras * 7 * 86_400_000).toISOString(),
      })
    })
  }

  private dentroDoPeriodo(medida: BodyMeasurement, period: BodyPeriod): boolean {
    const desde = inicioDoPeriodoDemo(period)
    return desde === null || new Date(medida.measuredAt).getTime() >= desde
  }

  async listBodyMeasurements(
    period: BodyPeriod,
    filters: BodyHistoryFilters = {},
  ): Promise<Paginated<BodyMeasurement>> {
    return paginarPesagens(this.pesagensDaJanela(period), filters)
  }

  /** As pesagens da janela, da mais nova para trás — como a consulta pede. */
  private pesagensDaJanela(period: BodyPeriod): BodyMeasurement[] {
    this.semearPesagens()
    return [...DemoDataSource.pesagens.values()]
      .filter((m) => this.dentroDoPeriodo(m, period))
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
  }

  /** A série do gráfico, agrupada como a 0052 agrupa. */
  async getBodySeries(period: BodyPeriod, userProfileId?: string): Promise<BodySeriesPoint[]> {
    if (userProfileId && !this.podeVerPesagensDe(userProfileId)) return []
    return agruparSerieDemo(this.pesagensDaJanela(period), baldeDoPeriodo(period))
  }

  /**
   * O perfil do aluno que a persona do app representa.
   *
   * Lê do dataset base e **não** do índice `studentById`: o diário é aplicado
   * no construtor antes do `reindex()`, e o índice ainda não existe quando a
   * autorização é reconstruída. O aluno do app vem da semente, nunca do
   * diário, então o dataset base basta.
   */
  private perfilDoAlunoDoApp(): string {
    const aluno = this.db.students.find((s) => s.id === this.db.studentIdForApp)
    return aluno?.userProfileId ?? this.db.studentIdForApp
  }

  /**
   * As pesagens que um aluno compartilhou com quem está vendo.
   *
   * Devolvia `[]` fixo, com o comentário "na demonstração ninguém autorizou
   * ninguém" — verdade até a 0045 dar ao aluno a tela de autorizar. Depois
   * dela a frase ficou velha e o `[]` virou mentira: o visitante autorizava o
   * professor, trocava de persona, e o painel mostrava "nenhuma pesagem".
   *
   * A regra é reproduzida inteira, e não por aproximação: precisa existir uma
   * autorização **deste** aluno para **este** perfil, e não revogada. É o que
   * a RLS faz em produção (`body_measurements_self` → `body_shared_with_me`),
   * e afrouxar aqui faria a demonstração ensinar o contrário do produto.
   */
  async listSharedBodyMeasurements(
    userProfileId: string,
    period: BodyPeriod,
    filters: BodyHistoryFilters = {},
  ): Promise<Paginated<BodyMeasurement>> {
    if (!this.podeVerPesagensDe(userProfileId)) {
      return { rows: [], total: 0, page: 1, pageSize: 30 }
    }
    return paginarPesagens(this.pesagensDaJanela(period), filters)
  }

  /**
   * A mesma tranca da RLS, nos dois caminhos.
   *
   * Mora num lugar só porque a série e o histórico precisam concordar: se um
   * recusasse e o outro não, a demonstração mostraria gráfico sem lista — um
   * estado que a produção não tem.
   */
  private podeVerPesagensDe(userProfileId: string): boolean {
    const autorizado = [...this.autorizacoesDaSessao.values()].some(
      (a) =>
        a.userProfileId === userProfileId &&
        a.sharedWithProfileId === this.perfilAtual &&
        a.revokedAt === null,
    )
    if (!autorizado) return false

    // Só o aluno do app tem histórico semeado; os outros 519 não pesam.
    return userProfileId === this.perfilDoAlunoDoApp()
  }

  async recordBodyMeasurement(measurement: BodyMeasurement): Promise<string> {
    this.semearPesagens()
    // Idempotente pelo clientId, como o banco: reenviar não cria linha nova.
    const existente = DemoDataSource.pesagens.get(measurement.clientId)
    const id = existente?.id ?? `bm_${measurement.clientId}`

    DemoDataSource.pesagens.set(measurement.clientId, {
      ...measurement,
      id,
      createdAt: existente?.createdAt ?? new Date().toISOString(),
    })
    return id
  }

  async deleteBodyMeasurement(measurementId: string): Promise<void> {
    for (const [chave, medida] of DemoDataSource.pesagens) {
      if (medida.id === measurementId) DemoDataSource.pesagens.delete(chave)
    }
  }

  async listUserDevices(): Promise<UserDevice[]> {
    this.semearPesagens()
    return [...DemoDataSource.aparelhos.values()]
      .filter((d) => d.status !== 'REMOVED')
      .sort((a, b) => b.pairedAt.localeCompare(a.pairedAt))
  }

  async pairUserDevice(input: PairUserDeviceInput): Promise<string> {
    this.semearPesagens()
    const existente = [...DemoDataSource.aparelhos.values()].find(
      (d) => d.platformDeviceId === input.platformDeviceId,
    )
    const id = existente?.id ?? `dev_${DemoDataSource.aparelhos.size + 1}`

    DemoDataSource.aparelhos.set(id, {
      id,
      deviceType: 'SCALE',
      provider: input.provider ?? 'standard_ble',
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      displayName: input.displayName,
      platformDeviceId: input.platformDeviceId,
      protocol: input.protocol ?? null,
      capabilities: input.capabilities ?? {},
      firmwareVersion: input.firmwareVersion ?? existente?.firmwareVersion ?? null,
      pairedAt: existente?.pairedAt ?? new Date().toISOString(),
      lastSeenAt: existente?.lastSeenAt ?? null,
      // Revincular um aparelho removido o traz de volta, como no banco.
      status: 'ACTIVE',
    })
    return id
  }

  async renameUserDevice(deviceId: string, displayName: string): Promise<void> {
    const aparelho = DemoDataSource.aparelhos.get(deviceId)
    if (aparelho) DemoDataSource.aparelhos.set(deviceId, { ...aparelho, displayName })
  }

  async unpairUserDevice(deviceId: string): Promise<void> {
    const aparelho = DemoDataSource.aparelhos.get(deviceId)
    if (aparelho) DemoDataSource.aparelhos.set(deviceId, { ...aparelho, status: 'REMOVED' })
  }

  async listBodyShares(): Promise<BodyMeasurementShare[]> {
    return [...this.autorizacoesDaSessao.values()]
  }

  /**
   * A equipe que esta conta pode autorizar.
   *
   * Reproduz `equipe_para_autorizar` (0045) inteira, e não por aproximação:
   * equipe ativa da academia do aluno, menos quem já está autorizado. Foi
   * aproximar que fez `listPublishedContent` perder o acervo da plataforma na
   * demonstração enquanto produção o mostrava.
   */
  async listStaffToAuthorize(): Promise<EquipeParaAutorizar[]> {
    const jaAutorizados = new Set(
      [...this.autorizacoesDaSessao.values()].map((a) => a.sharedWithProfileId),
    )

    return this.db.staff
      .filter(
        (m) =>
          m.status === 'ACTIVE' &&
          m.organizationId === this.db.organization.id &&
          m.userProfileId !== this.db.studentIdForApp &&
          !jaAutorizados.has(m.userProfileId),
      )
      .map((m) => ({
        profileId: m.userProfileId,
        name: m.name,
        role: m.role,
        organizationId: m.organizationId,
        organizationName: this.db.organization.name,
      }))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }

  async grantBodyShare(sharedWithProfileId: string, organizationId: string | null): Promise<void> {
    const id = `share_${sharedWithProfileId}`
    const pessoa = this.db.staff.find((m) => m.userProfileId === sharedWithProfileId)

    /*
     * A trava que `autorizar_corpo` (0045) dá no banco: só equipe ativa de
     * uma academia desta conta. Em demonstração não há RLS, e sem isto a tela
     * passaria com um id qualquer — justamente o buraco que a função fecha.
     */
    if (
      !pessoa ||
      pessoa.status !== 'ACTIVE' ||
      pessoa.organizationId !== this.db.organization.id
    ) {
      throw new AppError(
        'autorizacao_invalida',
        'Esta pessoa não é da equipe de uma academia sua.',
        403,
      )
    }

    this.autorizacoesDaSessao.set(sharedWithProfileId, {
      id,
      userProfileId: this.db.studentIdForApp,
      sharedWithProfileId,
      sharedWithName: pessoa.name,
      organizationId,
      grantedAt: new Date().toISOString(),
      revokedAt: null,
    })

    await appendDemoMutation({ t: 'share', id: sharedWithProfileId, a: 'grant', nome: pessoa.name })
  }

  /**
   * Revogar recebe o id da autorização, e o diário guarda o do perfil.
   *
   * A conversão é aqui porque a tela trabalha com o que `listBodyShares`
   * devolve, e o diário precisa de uma chave estável entre requisições — o id
   * da autorização é inventado a cada remontagem.
   */
  async revokeBodyShare(shareId: string): Promise<void> {
    const atual = [...this.autorizacoesDaSessao.values()].find((a) => a.id === shareId)
    if (!atual) return

    this.autorizacoesDaSessao.delete(atual.sharedWithProfileId)
    await appendDemoMutation({ t: 'share', id: atual.sharedWithProfileId, a: 'revoke' })
  }

  async saveActivity(input: SaveActivityInput): Promise<string> {
    const id = `act_${input.clientId}`

    DemoDataSource.corridas.set(id, {
      id,
      userProfileId: input.userProfileId,
      organizationId: input.organizationId,
      sport: input.sport,
      status: 'COMPLETED',
      title: input.title,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      elapsedSeconds: input.elapsedSeconds,
      movingSeconds: input.movingSeconds,
      distanceMeters: input.distanceMeters,
      averagePace: input.averagePace,
      bestPace: input.bestPace,
      averageSpeed: input.averageSpeed,
      maxSpeed: input.maxSpeed,
      elevationGain: input.elevationGain,
      elevationLoss: input.elevationLoss,
      minAltitude: input.minAltitude,
      maxAltitude: input.maxAltitude,
      calories: input.calories,
      startLatitude: input.route[0]?.latitude ?? null,
      startLongitude: input.route[0]?.longitude ?? null,
      privacy: input.privacy,
      privacyZoneMeters: 0,
      createdAt: new Date().toISOString(),
    })

    DemoDataSource.rotas.set(
      id,
      input.route.map((ponto) => ({
        latitude: ponto.latitude,
        longitude: ponto.longitude,
        altitude: ponto.altitude,
        speed: ponto.speed,
        recordedAt: ponto.recordedAt,
        totalDistance: ponto.totalDistance,
      })),
    )
    DemoDataSource.parciais.set(id, input.splits)

    return id
  }

  /**
   * As atividades da pessoa: as da semente mais as gravadas na visita.
   *
   * A semente só corre para o perfil da persona de aluno. Antes disto, a aba
   * SynseRun abria vazia para quem estava avaliando o produto — o recurso
   * existia e a vitrine mostrava tela em branco.
   *
   * Corrida gravada na demonstração entra na frente da semente, e não no
   * lugar dela: quem grava quer ver a própria, e o histórico continua ali
   * para a meta da semana ter de onde sair.
   */
  async listActivities(
    userProfileId: string,
    filters: { sport?: SportType; since?: string; limit?: number } = {},
  ): Promise<Activity[]> {
    const daSemente = this.db.runnerProfileIds.includes(userProfileId)
      ? this.db.activities.filter((atividade) => atividade.userProfileId === userProfileId)
      : []

    return [...DemoDataSource.corridas.values(), ...daSemente]
      .filter((atividade) => atividade.userProfileId === userProfileId)
      .filter((atividade) => !this.corridasApagadas.has(atividade.id))
      .filter((atividade) => !filters.sport || atividade.sport === filters.sport)
      .filter((atividade) => !filters.since || atividade.startedAt >= filters.since)
      .map((atividade) => this.comPrivacidadeDoDiario(atividade))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, filters.limit ?? 50)
  }

  /**
   * A escolha do visitante vence a do dataset.
   *
   * O dataset base é o mesmo em toda requisição, e é dele que vem a
   * privacidade original. Sem esta sobreposição, mudar para "Só eu" durava
   * até o próximo carregamento — e um controle de privacidade que volta
   * atrás sozinho é pior que não existir.
   */
  private comPrivacidadeDoDiario(atividade: Activity): Activity {
    const escolhida = this.privacidadeDaCorrida.get(atividade.id)
    return escolhida ? { ...atividade, privacy: escolhida } : atividade
  }

  async getActivity(activityId: string): Promise<Activity | null> {
    if (this.corridasApagadas.has(activityId)) return null

    const atividade =
      DemoDataSource.corridas.get(activityId) ??
      this.db.activities.find((a) => a.id === activityId) ??
      null

    return atividade ? this.comPrivacidadeDoDiario(atividade) : null
  }

  async getActivityRoute(activityId: string): Promise<ActivityRoutePoint[]> {
    /*
     * A semente traça rota só das mais recentes. Abrir uma corrida antiga
     * devolve lista vazia, e a tela já trata isso — desenhar um traçado
     * inventado para trinta atividades encheria a memória sem ninguém abrir.
     */
    return DemoDataSource.rotas.get(activityId) ?? this.db.activityRoutes.get(activityId) ?? []
  }

  async getActivitySplits(activityId: string): Promise<ActivitySplit[]> {
    return DemoDataSource.parciais.get(activityId) ?? this.db.activitySplits.get(activityId) ?? []
  }

  /**
   * Os recordes da semente.
   *
   * Antes isto devolvia lista vazia, porque recorde nasce da comparação com um
   * histórico — e o histórico é justamente o que faltava. Com ele, os recordes
   * saem das mesmas marcas que a 0016 usa no banco.
   */
  async listPersonalRecords(userProfileId: string): Promise<PersonalRecord[]> {
    return this.db.personalRecords.get(userProfileId) ?? []
  }

  async summarizeActivities(userProfileId: string, since: string): Promise<ActivitySummary> {
    const corridas = await this.listActivities(userProfileId, { since })

    return corridas.reduce<ActivitySummary>(
      (total, atividade) => ({
        activities: total.activities + 1,
        distanceMeters: total.distanceMeters + atividade.distanceMeters,
        movingSeconds: total.movingSeconds + atividade.movingSeconds,
        calories: total.calories + atividade.calories,
        elevationGain: total.elevationGain + atividade.elevationGain,
      }),
      { activities: 0, distanceMeters: 0, movingSeconds: 0, calories: 0, elevationGain: 0 },
    )
  }

  async updateActivityPrivacy(activityId: string, privacy: ActivityPrivacy): Promise<void> {
    this.privacidadeDaCorrida.set(activityId, privacy)
    await appendDemoMutation({ t: 'actpriv', id: activityId, p: privacy })
  }

  async deleteActivity(activityId: string): Promise<void> {
    this.corridasApagadas.add(activityId)
    await appendDemoMutation({ t: 'actpriv', id: activityId })
  }
}

/** O começo da janela escolhida, em milissegundos — ou nulo para "tudo". */
function inicioDoPeriodoDemo(period: BodyPeriod, agora = new Date()): number | null {
  const data = new Date(agora)
  switch (period) {
    case '7d':
      data.setDate(data.getDate() - 7)
      break
    case '30d':
      data.setDate(data.getDate() - 30)
      break
    case '3m':
      data.setMonth(data.getMonth() - 3)
      break
    case '6m':
      data.setMonth(data.getMonth() - 6)
      break
    case '1a':
      data.setFullYear(data.getFullYear() - 1)
      break
    default:
      return null
  }
  return data.getTime()
}

/** Uma página do histórico de pesagens, sobre a lista já recortada e ordenada. */
function paginarPesagens(
  todas: BodyMeasurement[],
  filters: BodyHistoryFilters,
): Paginated<BodyMeasurement> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(200, Math.max(5, filters.pageSize ?? 30))
  const de = (page - 1) * pageSize
  return { rows: todas.slice(de, de + pageSize), total: todas.length, page, pageSize }
}

/**
 * O que a `serie_de_peso` faz, na demonstração.
 *
 * Recebe em ordem decrescente, então a **primeira** de cada balde é a última
 * pesagem dele — a mesma escolha do `distinct on` da 0052. Média aqui faria a
 * demonstração ensinar um número que a produção não mostra.
 */
function agruparSerieDemo(todas: BodyMeasurement[], balde: BaldeDaSerie): BodySeriesPoint[] {
  const pontos = new Map<string, BodySeriesPoint>()
  for (const m of todas) {
    const d = new Date(m.measuredAt)
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    let chave = `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`
    if (balde === 'month') chave = `${d.getFullYear()}-${mes}`
    if (balde === 'week') {
      const segunda = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7))
      chave = segunda.toISOString().slice(0, 10)
    }
    const ponto = pontos.get(chave)
    if (ponto) {
      ponto.medicoes += 1
      continue
    }
    pontos.set(chave, { instante: m.measuredAt, pesoKg: m.weightKg, medicoes: 1 })
  }
  return [...pontos.values()].sort((a, b) => a.instante.localeCompare(b.instante))
}
