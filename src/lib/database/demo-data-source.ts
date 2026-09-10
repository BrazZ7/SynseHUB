import { generateSynseId } from '@/lib/synse-id'
import { daysBetween } from '@/lib/utils'
import type {
  ChargeWithStudent,
  CheckInWithStudent,
  DataSource,
  Paginated,
  StudentFilters,
  StudentListItem,
} from '@/lib/database/data-source'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
import { appendDemoMutation, type DemoMutation } from '@/lib/database/demo-journal'
const MONTH_YEAR = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

import type {
  Assessment,
  Charge,
  CheckIn,
  CollectionRule,
  Exercise,
  Lead,
  Membership,
  MembershipPlan,
  Organization,
  OrganizationBillingSettings,
  PaymentAccount,
  Student,
  WorkoutAssignment,
  WorkoutLog,
  WorkoutPlan,
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
  /** Campos de cobrança alterados, sem tocar no objeto base. */
  private readonly chargePatches = new Map<string, Partial<Charge>>()
  private readonly studentStatusPatches = new Map<string, Student['status']>()

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
      const studentId = base?.studentId ?? this.addedCharges.find((c) => c.id === chargeId)?.studentId
      if (!studentId || settled.has(studentId)) continue
      const student = this.studentById?.get(studentId) ?? this.db.students.find((s) => s.id === studentId)
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
    const base =
      this.studentStatusPatches.size === 0
        ? this.db.students
        : this.db.students.map((s) => {
            const status = this.studentStatusPatches.get(s.id)
            return status ? { ...s, status } : s
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

  async getPaymentAccount(organizationId: string): Promise<PaymentAccount | null> {
    return organizationId === DEMO_ORG_ID ? this.db.paymentAccount : null
  }

  async listStaff(organizationId: string) {
    return this.db.staff.filter((s) => s.organizationId === organizationId)
  }

  // ── Planos ─────────────────────────────────────────────────────────────────
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
      items = items.filter(
        (s) => !s.lastCheckInAt || daysBetween(s.lastCheckInAt) >= 21,
      )
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
    if (filters.status && filters.status !== 'ALL') rows = rows.filter((c) => c.status === filters.status)
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

  async listWorkoutPlans(organizationId: string): Promise<WorkoutPlan[]> {
    return this.scoped(this.db.workoutPlans, organizationId)
  }

  async getWorkoutPlan(organizationId: string, planId: string): Promise<WorkoutPlan | null> {
    return (
      this.scoped(this.db.workoutPlans, organizationId).find((p) => p.id === planId) ?? null
    )
  }

  async listWorkoutExercises(workoutPlanId: string) {
    const exerciseById = new Map(this.db.exercises.map((e) => [e.id, e]))
    return this.db.workoutExercises
      .filter((we) => we.workoutPlanId === workoutPlanId)
      .sort((a, b) => a.order - b.order)
      .map((we) => ({ ...we, exercise: exerciseById.get(we.exerciseId)! }))
      .filter((we) => Boolean(we.exercise))
  }

  async listAssignmentsForStudent(
    organizationId: string,
    studentId: string,
  ): Promise<WorkoutAssignment[]> {
    return this.scoped(this.db.workoutAssignments, organizationId).filter(
      (a) => a.studentId === studentId,
    )
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
  async listAssessments(organizationId: string, studentId: string): Promise<Assessment[]> {
    return this.scoped(this.db.assessments, organizationId)
      .filter((a) => a.studentId === studentId)
      .sort((a, b) => a.assessedAt.localeCompare(b.assessedAt))
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  async listLeads(organizationId: string): Promise<Lead[]> {
    return this.scoped(this.db.leads, organizationId)
  }
}
