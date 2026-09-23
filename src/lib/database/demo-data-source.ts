import { generateSynseId } from '@/lib/synse-id'
import { daysBetween } from '@/lib/utils'
import type {
  ChargeWithStudent,
  PairUserDeviceInput,
  CheckInWithStudent,
  DataSource,
  Paginated,
  SaveActivityInput,
  SaveAssessmentInput,
  LogWorkoutSetInput,
  SaveClassScheduleInput,
  SaveContentInput,
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
  WorkoutPreferences,
  WorkoutSessionSummary,
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
  private readonly demoWorkoutSessions: WorkoutSessionSummary[] = []
  private readonly demoSetLogs = new Map<string, { reps: number; weight: number | null }[]>()
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
  private conteudosProntos = false

  // ── Índices ────────────────────────────────────────────────────────────────
  private readonly planById = new Map(this.db.plans.map((p) => [p.id, p]))
  private readonly staffById = new Map(this.db.staff.map((s) => [s.id, s]))

  private membershipByStudent!: Map<string, Membership>
  private studentById!: Map<string, Student>
  private lastCheckInIndex: Map<string, string> | null = null
  private nextChargeIndex: Map<string, Charge> | null = null

  constructor(journal: DemoMutation[] = []) {
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

  async getPlan(organizationId: string, planId: string): Promise<MembershipPlan | null> {
    const plan = this.planById.get(planId)
    return plan && plan.organizationId === organizationId ? plan : null
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
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

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

  async listOverdueCharges(organizationId: string): Promise<ChargeWithStudent[]> {
    return this.scoped(this.charges(), organizationId)
      .filter((c) => c.status === 'OVERDUE')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((c) => this.toChargeWithStudent(c))
  }

  async getChargesForStudent(organizationId: string, studentId: string): Promise<Charge[]> {
    return this.scoped(this.charges(), organizationId)
      .filter((c) => c.studentId === studentId)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
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

  async listWorkoutLogs(organizationId: string, studentId: string): Promise<WorkoutLog[]> {
    return this.scoped(this.db.workoutLogs, organizationId)
      .filter((l) => l.studentId === studentId)
      .sort((a, b) => a.performedAt.localeCompare(b.performedAt))
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

  async listLatestAssessments(organizationId: string): Promise<Assessment[]> {
    const ultima = new Map<string, Assessment>()
    for (const a of this.scoped(this.avaliacoes(), organizationId)) {
      const atual = ultima.get(a.studentId)
      if (!atual || a.assessedAt > atual.assessedAt) ultima.set(a.studentId, a)
    }
    return [...ultima.values()]
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
    return id
  }

  async logWorkoutSet(input: LogWorkoutSetInput): Promise<string> {
    const sessao = this.demoWorkoutSessions.find((s) => s.id === input.sessionId)
    if (!sessao) throw new Error('Treino não encontrado.')

    const chave = `${input.sessionId}:${input.clientId}`
    const series = this.demoSetLogs.get(input.sessionId) ?? []

    // Mesma garantia do `unique (session_id, client_id)`: o reenvio não duplica.
    if (!series.some((_, i) => `${input.sessionId}:${i}` === chave)) {
      series.push({ reps: input.repsCompleted, weight: input.weight })
      this.demoSetLogs.set(input.sessionId, series)
      sessao.totalSets = series.length
      sessao.totalReps = series.reduce((a, b) => a + b.reps, 0)
      sessao.volumeKg = Math.round(series.reduce((a, b) => a + (b.weight ?? 0) * b.reps, 0))
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
  }

  async getActiveWorkoutSession(studentId: string): Promise<WorkoutSessionSummary | null> {
    return (
      this.demoWorkoutSessions.find(
        (s) => s.studentId === studentId && (s.status === 'IN_PROGRESS' || s.status === 'PAUSED'),
      ) ?? null
    )
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
      [...this.db.workoutExercises, ...this.addedWorkoutExercises].map((item) => [
        item.id,
        item,
      ]),
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

  async listPublishedContent(organizationId: string, limite: number): Promise<ContentItem[]> {
    const agora = new Date().toISOString()
    const todos = await this.listContent(organizationId)
    // Mesma regra da produção: rascunho e agendado ficam de fora.
    return todos
      .filter((c) => c.publishedAt !== null && c.publishedAt <= agora)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
      })
      .slice(0, limite)
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
    this.demoNutritionPlans.push(plano)
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

  async listLeads(organizationId: string): Promise<Lead[]> {
    // Mesma ordem da produção: quem tem retorno marcado vem primeiro.
    return this.scoped(this.leads(), organizationId).sort((a, b) => {
      if (a.nextFollowUpAt && b.nextFollowUpAt) {
        return a.nextFollowUpAt.localeCompare(b.nextFollowUpAt)
      }
      if (a.nextFollowUpAt) return -1
      if (b.nextFollowUpAt) return 1
      return b.createdAt.localeCompare(a.createdAt)
    })
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
  }

  async addLeadEvent(_organizationId: string, leadId: string, kind: LeadEventKind, body: string) {
    this.demoLeadEvents.push(this.evento(leadId, kind, null, null, body))
  }

  async listLeadEvents(_organizationId: string, leadId: string): Promise<LeadEvent[]> {
    return this.demoLeadEvents
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
  private static readonly autorizacoes = new Map<string, BodyMeasurementShare>()

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

  async listBodyMeasurements(period: BodyPeriod): Promise<BodyMeasurement[]> {
    this.semearPesagens()
    return [...DemoDataSource.pesagens.values()]
      .filter((m) => this.dentroDoPeriodo(m, period))
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
  }

  /**
   * Na demonstração ninguém autorizou ninguém, então não há o que devolver.
   *
   * Devolver o próprio histórico aqui seria simular uma autorização que não
   * existe — e esta é justamente a regra que o produto não pode afrouxar nem
   * de brincadeira.
   */
  async listSharedBodyMeasurements(): Promise<BodyMeasurement[]> {
    return []
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
    return [...DemoDataSource.autorizacoes.values()].filter((a) => a.revokedAt === null)
  }

  async grantBodyShare(sharedWithProfileId: string, organizationId: string | null): Promise<void> {
    const id = `share_${sharedWithProfileId}`
    const pessoa = this.db.staff.find((m) => m.userProfileId === sharedWithProfileId)

    DemoDataSource.autorizacoes.set(id, {
      id,
      userProfileId: this.db.studentIdForApp,
      sharedWithProfileId,
      sharedWithName: pessoa?.name ?? null,
      organizationId,
      grantedAt: new Date().toISOString(),
      revokedAt: null,
    })
  }

  async revokeBodyShare(shareId: string): Promise<void> {
    const atual = DemoDataSource.autorizacoes.get(shareId)
    if (atual) {
      DemoDataSource.autorizacoes.set(shareId, {
        ...atual,
        revokedAt: new Date().toISOString(),
      })
    }
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
    const daSemente = userProfileId === this.db.runnerProfileId ? this.db.activities : []

    return [...DemoDataSource.corridas.values(), ...daSemente]
      .filter((atividade) => atividade.userProfileId === userProfileId)
      .filter((atividade) => !filters.sport || atividade.sport === filters.sport)
      .filter((atividade) => !filters.since || atividade.startedAt >= filters.since)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, filters.limit ?? 50)
  }

  async getActivity(activityId: string): Promise<Activity | null> {
    return (
      DemoDataSource.corridas.get(activityId) ??
      this.db.activities.find((atividade) => atividade.id === activityId) ??
      null
    )
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
    return (
      DemoDataSource.parciais.get(activityId) ?? this.db.activitySplits.get(activityId) ?? []
    )
  }

  /**
   * Os recordes da semente.
   *
   * Antes isto devolvia lista vazia, porque recorde nasce da comparação com um
   * histórico — e o histórico é justamente o que faltava. Com ele, os recordes
   * saem das mesmas marcas que a 0016 usa no banco.
   */
  async listPersonalRecords(userProfileId: string): Promise<PersonalRecord[]> {
    return userProfileId === this.db.runnerProfileId ? this.db.personalRecords : []
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
    const atividade = DemoDataSource.corridas.get(activityId)
    if (atividade) DemoDataSource.corridas.set(activityId, { ...atividade, privacy })
  }

  async deleteActivity(activityId: string): Promise<void> {
    DemoDataSource.corridas.delete(activityId)
    DemoDataSource.rotas.delete(activityId)
    DemoDataSource.parciais.delete(activityId)
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
