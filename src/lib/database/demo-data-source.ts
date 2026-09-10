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
 * Mutações feitas durante a sessão (novo aluno, check-in, baixa manual) são
 * aplicadas nos arrays do seed e persistem enquanto o processo viver. É
 * proposital: permite exercitar os fluxos de escrita de ponta a ponta sem
 * banco. Ao reiniciar, o dataset volta ao estado determinístico.
 */
export class DemoDataSource implements DataSource {
  readonly kind = 'demo' as const

  /**
   * Dataset compartilhado por todo o processo. Precisa ser o primeiro campo:
   * os índices abaixo são inicializados a partir dele.
   */
  private readonly db = getDemoDataset()

  // ── Índices ────────────────────────────────────────────────────────────────
  private readonly membershipByStudent = new Map(this.db.memberships.map((m) => [m.studentId, m]))
  private readonly planById = new Map(this.db.plans.map((p) => [p.id, p]))
  private readonly staffById = new Map(this.db.staff.map((s) => [s.id, s]))
  private readonly studentById = new Map(this.db.students.map((s) => [s.id, s]))

  private lastCheckInIndex: Map<string, string> | null = null
  private nextChargeIndex: Map<string, Charge> | null = null

  private invalidate() {
    this.lastCheckInIndex = null
    this.nextChargeIndex = null
  }

  private lastCheckInFor(studentId: string): string | null {
    if (!this.lastCheckInIndex) {
      const index = new Map<string, string>()
      // this.db.checkIns está ordenado do mais recente para o mais antigo.
      for (const checkIn of this.db.checkIns) {
        if (!index.has(checkIn.studentId)) index.set(checkIn.studentId, checkIn.checkedInAt)
      }
      this.lastCheckInIndex = index
    }
    return this.lastCheckInIndex.get(studentId) ?? null
  }

  private nextChargeFor(studentId: string): Charge | null {
    if (!this.nextChargeIndex) {
      const index = new Map<string, Charge>()
      const open = this.db.charges
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
    return this.scoped(this.db.plans, organizationId)
  }

  async getPlan(organizationId: string, planId: string): Promise<MembershipPlan | null> {
    const plan = this.planById.get(planId)
    return plan && plan.organizationId === organizationId ? plan : null
  }

  async createPlan(input: Omit<MembershipPlan, 'id' | 'createdAt'>): Promise<MembershipPlan> {
    const plan: MembershipPlan = {
      ...input,
      id: `plan_${generateSynseId().slice(4).toLowerCase()}`,
      createdAt: new Date().toISOString(),
    }
    this.db.plans.push(plan)
    this.planById.set(plan.id, plan)
    return plan
  }

  async countStudentsByPlan(organizationId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {}
    for (const membership of this.scoped(this.db.memberships, organizationId)) {
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
    let rows = this.scoped(this.db.students, organizationId)

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
    const synseId = generateSynseId()
    const studentId = `stu_${suffix}`

    const student: Student = {
      id: studentId,
      organizationId: input.organizationId,
      userProfileId: `prof_${suffix}`,
      synseId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      avatarUrl: null,
      birthDate: null,
      status: 'ACTIVE',
      goal: input.goal,
      enrolledAt: new Date().toISOString().slice(0, 10),
      cancelledAt: null,
      trainerId: input.trainerId,
      membershipId: null,
      notes: null,
    }

    if (input.planId) {
      const plan = this.planById.get(input.planId)
      if (plan) {
        const membership: Membership = {
          id: `mbr_${suffix}`,
          organizationId: input.organizationId,
          studentId,
          planId: plan.id,
          startedAt: student.enrolledAt,
          endsAt: null,
          billingDay: input.billingDay,
          status: 'ACTIVE',
          price: plan.price,
        }
        this.db.memberships.push(membership)
        this.membershipByStudent.set(studentId, membership)
        student.membershipId = membership.id

        // Primeira mensalidade já nasce em aberto.
        const now = new Date()
        const due = new Date(now.getFullYear(), now.getMonth() + 1, input.billingDay)
        this.db.charges.push({
          id: `chg_${suffix}`,
          organizationId: input.organizationId,
          studentId,
          membershipId: membership.id,
          providerChargeId: null,
          description: `Mensalidade ${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(due)}`,
          amount: plan.price,
          dueDate: due.toISOString().slice(0, 10),
          paymentMethod: null,
          status: 'PENDING',
          paidAt: null,
          billingReference: `${membership.id}:${due.getFullYear()}-${due.getMonth() + 1}`,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        })
      }
    }

    this.db.students.push(student)
    this.studentById.set(studentId, student)
    this.invalidate()
    return student
  }

  // ── Synse Pay ──────────────────────────────────────────────────────────────
  private toChargeWithStudent(charge: Charge): ChargeWithStudent {
    const student = this.studentById.get(charge.studentId)
    const membership = charge.membershipId
      ? this.db.memberships.find((m) => m.id === charge.membershipId)
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
    let rows = this.scoped(this.db.charges, organizationId)
    if (filters.status && filters.status !== 'ALL') rows = rows.filter((c) => c.status === filters.status)
    if (filters.studentId) rows = rows.filter((c) => c.studentId === filters.studentId)
    rows = [...rows].sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate))
    return rows.slice(0, filters.limit ?? 100).map((c) => this.toChargeWithStudent(c))
  }

  async listOverdueCharges(organizationId: string): Promise<ChargeWithStudent[]> {
    return this.scoped(this.db.charges, organizationId)
      .filter((c) => c.status === 'OVERDUE')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((c) => this.toChargeWithStudent(c))
  }

  async getChargesForStudent(organizationId: string, studentId: string): Promise<Charge[]> {
    return this.scoped(this.db.charges, organizationId)
      .filter((c) => c.studentId === studentId)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  }

  async markChargeAsPaid(
    organizationId: string,
    chargeId: string,
    input: { method: Charge['paymentMethod']; paidAt: string },
  ): Promise<Charge | null> {
    const charge = this.db.charges.find((c) => c.id === chargeId && c.organizationId === organizationId)
    if (!charge) return null
    charge.status = 'PAID'
    charge.paidAt = input.paidAt
    charge.paymentMethod = input.method
    charge.updatedAt = new Date().toISOString()

    // Se o aluno não tem mais cobrança vencida, ele deixa de ser inadimplente.
    const stillOverdue = this.db.charges.some(
      (c) => c.studentId === charge.studentId && c.status === 'OVERDUE',
    )
    const student = this.studentById.get(charge.studentId)
    if (student && !stillOverdue && student.status === 'OVERDUE') student.status = 'ACTIVE'

    this.invalidate()
    return charge
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
    let rows = this.scoped(this.db.checkIns, organizationId)
    if (sinceIso) rows = rows.filter((c) => c.checkedInAt >= sinceIso)
    return rows.slice(0, options.limit ?? rows.length).map((c) => ({
      ...c,
      studentName: this.studentById.get(c.studentId)?.name ?? 'Aluno',
    }))
  }

  async listCheckInsForStudent(organizationId: string, studentId: string, limit = 60) {
    return this.scoped(this.db.checkIns, organizationId)
      .filter((c) => c.studentId === studentId)
      .slice(0, limit)
  }

  async createCheckIn(input: {
    organizationId: string
    studentId: string
    method: CheckIn['method']
  }): Promise<CheckIn> {
    const checkIn: CheckIn = {
      id: `chk_${generateSynseId().slice(4).toLowerCase()}`,
      organizationId: input.organizationId,
      studentId: input.studentId,
      checkedInAt: new Date().toISOString(),
      method: input.method,
      deviceId: null,
    }
    this.db.checkIns.unshift(checkIn)
    this.invalidate()
    return checkIn
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
