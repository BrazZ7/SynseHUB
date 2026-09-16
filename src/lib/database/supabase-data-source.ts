import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { logger } from '@/lib/logger'
import { daysBetween } from '@/lib/utils'
import type {
  ChargeWithStudent,
  CheckInWithStudent,
  DataSource,
  Paginated,
  PairUserDeviceInput,
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
  FiscalData,
} from '@/lib/database/data-source'
import type { DemoStaff } from '@/lib/database/demo-seed'
import { DEFAULT_WORKOUT_PREFERENCES } from '@/types/domain'
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
  ChallengeEntry,
  ChallengeMedal,
  Charge,
  ConsentState,
  ContentItem,
  ConsentType,
  StaffInvite,
  UserRole,
  PersonalRecord,
  SportType,
  CheckIn,
  ClassBooking,
  ClassBookingStatus,
  ClassSchedule,
  ClassSession,
  ClassSessionForStudent,
  CollectionRule,
  ClassOccupancyRow,
  ExerciseProgressPoint,
  GymChallenge,
  GymChallengeForStudent,
  GymChallengeRankRow,
  GymTrainingReport,
  NutritionPlan,
  NutritionPlanWithMeals,
  ExercisePersonalRecord,
  StudentAtRisk,
  WorkoutPreferences,
  WorkoutSessionSummary,
  WorkoutTotals,
  Exercise,
  Lead,
  LeadEvent,
  LeadEventKind,
  LeadStage,
  Meal,
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
 * Data source Postgres/Supabase.
 *
 * Cada consulta filtra por `organization_id` explicitamente — redundante em
 * relação à Row Level Security, e essa redundância é intencional: se uma
 * policy for afrouxada por engano, a aplicação continua isolada.
 *
 * ESTADO: as 26 consultas distintas deste arquivo já foram exercitadas contra
 * um Supabase real e respondem 200 sobre o schema de `src/db/migrations`. O que
 * ainda não foi verificado com dado real é o resultado delas — em especial os
 * joins aninhados e o filtro de "sem frequência", que passam sintaticamente
 * mas nunca foram conferidos contra uma academia em uso.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const ATTENDANCE_INACTIVE_DAYS = 21

export class SupabaseDataSource implements DataSource {
  readonly kind = 'supabase' as const

  constructor(private readonly client: SupabaseClient) {}

  private fail(operation: string, error: unknown): never {
    logger.error('supabase:query_failed', { operation, error: String(error) })
    /*
     * O erro original viaja em `cause`.
     *
     * Sem ele, quem pega esta exceção lá em cima só recebe "supabase query
     * failed: X" e não tem como distinguir uma tabela que ainda não existe
     * (migration pendente, contornável) de uma consulta errada (defeito).
     */
    throw new Error(`supabase query failed: ${operation}`, { cause: error })
  }

  private async select<T>(
    operation: string,
    query: PromiseLike<{ data: T | null; error: unknown }>,
  ) {
    const { data, error } = await query
    if (error) this.fail(operation, error)
    return data
  }

  // ── Organização ────────────────────────────────────────────────────────────
  private mapOrganization(row: Row): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      legalName: row.legal_name,
      taxId: row.tax_id,
      logoUrl: row.logo_url,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code ?? null,
      address: row.address ?? null,
      addressNumber: row.address_number ?? null,
      district: row.district ?? null,
      phone: row.phone ?? null,
      companyType: row.company_type ?? null,
      monthlyRevenue: row.monthly_revenue != null ? Number(row.monthly_revenue) : null,
      inviteCode: row.invite_code ?? null,
      timezone: row.timezone,
      hubPlan: row.hub_plan,
      status: row.status,
      onboardingCompleted: row.onboarding_completed,
      createdAt: row.created_at,
    }
  }

  async getOrganization(organizationId: string) {
    const row = await this.select<Row>(
      'getOrganization',
      this.client.from('organizations').select('*').eq('id', organizationId).maybeSingle(),
    )
    return row ? this.mapOrganization(row) : null
  }

  async listOrganizations() {
    const rows =
      (await this.select<Row[]>(
        'listOrganizations',
        this.client.from('organizations').select('*').order('created_at', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapOrganization(row))
  }

  async getBillingSettings(organizationId: string): Promise<OrganizationBillingSettings | null> {
    const row = await this.select<Row>(
      'getBillingSettings',
      this.client
        .from('organization_billing_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    )
    if (!row) return null
    return {
      organizationId: row.organization_id,
      platformFeePercentage: Number(row.platform_fee_percentage),
      platformFixedFee: Number(row.platform_fixed_fee),
      paymentProviderFeeStrategy: row.payment_provider_fee_strategy,
    }
  }

  async updateFiscalData(input: FiscalData & { organizationId: string }): Promise<void> {
    const { error } = await this.client
      .from('organizations')
      .update({
        legal_name: input.legalName,
        tax_id: input.taxId,
        company_type: input.companyType,
        postal_code: input.postalCode,
        address: input.address,
        address_number: input.addressNumber,
        district: input.district,
        city: input.city,
        state: input.state,
        phone: input.phone,
        monthly_revenue: input.monthlyRevenue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.organizationId)
    if (error) this.fail('updateFiscalData', error)
  }

  async getPaymentAccount(organizationId: string): Promise<PaymentAccount | null> {
    const row = await this.select<Row>(
      'getPaymentAccount',
      this.client
        .from('payment_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    if (!row) return null
    return {
      id: row.id,
      organizationId: row.organization_id,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      status: row.status,
      onboardingStatus: row.onboarding_status,
      createdAt: row.created_at,
    }
  }

  async listStaff(organizationId: string): Promise<DemoStaff[]> {
    const rows =
      (await this.select<Row[]>(
        'listStaff',
        this.client
          .from('staff')
          .select(
            'id, organization_id, user_profile_id, role, registration_number, status, user_profiles(name, email)',
          )
          .eq('organization_id', organizationId)
          .eq('status', 'ACTIVE'),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userProfileId: row.user_profile_id,
      name: row.user_profiles?.name ?? '—',
      email: row.user_profiles?.email ?? '',
      role: row.role,
      jobTitle: row.role,
      registrationNumber: row.registration_number,
      status: 'ACTIVE' as const,
    }))
  }

  // ── Planos ─────────────────────────────────────────────────────────────────
  private mapPlan(row: Row): MembershipPlan {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      billingCycle: row.billing_cycle,
      enrollmentFee: Number(row.enrollment_fee),
      weeklyAccessDays: row.weekly_access_days,
      benefits: row.benefits ?? [],
      autoCharge: row.auto_charge,
      status: row.status,
      createdAt: row.created_at,
    }
  }

  async joinOrganizationAsStudent(input: {
    inviteCode: string
    studentName: string
  }): Promise<string> {
    /*
     * Função com `security definer` no banco: o aluno não tem — e não deve ter
     * — permissão de inserir em `students` de uma academia à qual ainda não
     * pertence. A função valida o código e é a única porta.
     */
    const { data, error } = await this.client.rpc('join_organization_as_student', {
      p_invite_code: input.inviteCode,
      p_student_name: input.studentName,
    })
    if (error) this.fail('joinOrganizationAsStudent', error)
    return String(data)
  }

  async joinSynseAsSoloStudent(input: { studentName: string }): Promise<string> {
    const { data, error } = await this.client.rpc('join_synse_as_solo_student', {
      p_student_name: input.studentName,
    })
    if (error) this.fail('joinSynseAsSoloStudent', error)
    return String(data)
  }

  async openProfessionalSpace(input: { name: string; slug: string; ownerName: string }) {
    const { data, error } = await this.client.rpc('open_professional_space', {
      p_name: input.name,
      p_slug: input.slug,
      p_owner_name: input.ownerName,
    })
    if (error) this.fail('openProfessionalSpace', error)
    return String(data)
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
    const aluno = await this.getStudent(input.organizationId, input.studentId)
    if (!aluno) this.fail('updateStudent', { message: 'Aluno não encontrado.' })

    /*
     * Nome e telefone vivem no perfil, que é da pessoa e atravessa academias.
     * O CPF só é preenchido quando está vazio: trocar documento de alguém é
     * operação de correção de cadastro, não de edição de aluno — e um erro de
     * digitação aqui apontaria a cobrança para outra pessoa.
     */
    const perfil: Record<string, unknown> = { name: input.name, phone: input.phone }
    if (input.taxId && !aluno!.taxId) perfil.tax_id = input.taxId

    const { error: erroPerfil } = await this.client
      .from('user_profiles')
      .update(perfil)
      .eq('id', aluno!.userProfileId)
    if (erroPerfil) this.fail('updateStudent:profile', erroPerfil)

    const { error: erroAluno } = await this.client
      .from('students')
      .update({ goal: input.goal, trainer_id: input.trainerId, updated_at: new Date().toISOString() })
      .eq('organization_id', input.organizationId)
      .eq('id', input.studentId)
    if (erroAluno) this.fail('updateStudent:student', erroAluno)

    if (!input.planId) return

    const plano = await this.getPlan(input.organizationId, input.planId)
    if (!plano) return

    const atual = await this.getActiveMembership(input.organizationId, input.studentId)

    if (atual) {
      /*
       * O preço é copiado do plano no momento da troca, e não lido do plano na
       * hora de cobrar: quem já estava matriculado não deve ser surpreendido
       * por um reajuste feito na tela de planos. A matrícula guarda o valor
       * combinado.
       */
      const { error } = await this.client
        .from('memberships')
        .update({
          plan_id: plano.id,
          price: plano.price,
          billing_day: input.billingDay,
          updated_at: new Date().toISOString(),
        })
        .eq('id', atual.id)
      if (error) this.fail('updateStudent:membership', error)
      return
    }

    const { error } = await this.client.from('memberships').insert({
      organization_id: input.organizationId,
      student_id: input.studentId,
      plan_id: plano.id,
      price: plano.price,
      billing_day: input.billingDay,
    })
    if (error) this.fail('updateStudent:newMembership', error)
  }

  async updateStudentStatus(input: {
    organizationId: string
    studentId: string
    status: StudentStatus
  }): Promise<void> {
    const { error } = await this.client
      .from('students')
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq('organization_id', input.organizationId)
      .eq('id', input.studentId)
    if (error) this.fail('updateStudentStatus', error)
  }

  async listPlans(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'listPlans',
        this.client
          .from('membership_plans')
          .select('*')
          .eq('organization_id', organizationId)
          .order('price', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapPlan(row))
  }

  async getPlan(organizationId: string, planId: string) {
    const row = await this.select<Row>(
      'getPlan',
      this.client
        .from('membership_plans')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', planId)
        .maybeSingle(),
    )
    return row ? this.mapPlan(row) : null
  }

  async createOrganization(input: {
    name: string
    slug: string
    ownerName: string
    legalName: string | null
    taxId: string | null
    city: string | null
    state: string | null
    type?: 'GYM' | 'STUDIO'
  }): Promise<string> {
    const { data, error } = await this.client.rpc('create_organization_with_owner', {
      p_org_name: input.name,
      p_org_slug: input.slug,
      p_owner_name: input.ownerName,
      p_legal_name: input.legalName,
      p_tax_id: input.taxId,
      p_city: input.city,
      p_state: input.state,
      p_type: input.type ?? 'GYM',
    })
    if (error) this.fail('createOrganization', error)
    return data as string
  }

  async createPlan(input: Omit<MembershipPlan, 'id' | 'createdAt'>) {
    const row = await this.select<Row>(
      'createPlan',
      this.client
        .from('membership_plans')
        .insert({
          organization_id: input.organizationId,
          name: input.name,
          description: input.description,
          price: input.price,
          billing_cycle: input.billingCycle,
          enrollment_fee: input.enrollmentFee,
          weekly_access_days: input.weeklyAccessDays,
          benefits: input.benefits,
          auto_charge: input.autoCharge,
          status: input.status,
        })
        .select('*')
        .single(),
    )
    return this.mapPlan(row!)
  }

  async countStudentsByPlan(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'countStudentsByPlan',
        this.client
          .from('memberships')
          .select('plan_id')
          .eq('organization_id', organizationId)
          .eq('status', 'ACTIVE'),
      )) ?? []
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.plan_id] = (acc[row.plan_id] ?? 0) + 1
      return acc
    }, {})
  }

  async getActiveMembership(organizationId: string, studentId: string): Promise<Membership | null> {
    const row = await this.select<Row>(
      'getActiveMembership',
      this.client
        .from('memberships')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('student_id', studentId)
        .eq('status', 'ACTIVE')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    if (!row) return null
    return {
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      planId: row.plan_id,
      startedAt: row.started_at,
      endsAt: row.ends_at,
      billingDay: row.billing_day,
      status: row.status,
      price: Number(row.price),
    }
  }

  // ── Alunos ─────────────────────────────────────────────────────────────────
  private readonly studentSelect = `
    id, organization_id, user_profile_id, status, goal, enrolled_at, cancelled_at, trainer_id, notes,
    user_profiles ( synse_id, name, email, phone, tax_id, avatar_url, birth_date ),
    memberships ( id, plan_id, price, status, membership_plans ( name ) ),
    staff:trainer_id ( user_profiles ( name ) )
  `

  private mapStudent(row: Row): StudentListItem {
    const profile = row.user_profiles ?? {}
    const membership = (Array.isArray(row.memberships) ? row.memberships : [row.memberships])
      .filter(Boolean)
      .find((m: Row) => m?.status === 'ACTIVE')

    return {
      id: row.id,
      organizationId: row.organization_id,
      userProfileId: row.user_profile_id,
      synseId: profile.synse_id ?? '',
      name: profile.name ?? '—',
      email: profile.email ?? '',
      phone: profile.phone ?? null,
      taxId: profile.tax_id ?? null,
      avatarUrl: profile.avatar_url ?? null,
      birthDate: profile.birth_date ?? null,
      status: row.status,
      goal: row.goal,
      enrolledAt: row.enrolled_at,
      cancelledAt: row.cancelled_at ?? null,
      trainerId: row.trainer_id,
      membershipId: membership?.id ?? null,
      notes: row.notes,
      planName: membership?.membership_plans?.name ?? null,
      planPrice: membership?.price != null ? Number(membership.price) : null,
      trainerName: row.staff?.user_profiles?.name ?? null,
      nextChargeDueDate: null,
      nextChargeAmount: null,
      lastCheckInAt: null,
    }
  }

  /** Enriquece a página corrente com próxima cobrança e última presença. */
  private async decorateStudents(organizationId: string, students: StudentListItem[]) {
    if (students.length === 0) return students
    const ids = students.map((s) => s.id)

    const [charges, checkIns] = await Promise.all([
      this.select<Row[]>(
        'decorate:charges',
        this.client
          .from('charges')
          .select('student_id, due_date, amount')
          .eq('organization_id', organizationId)
          .in('student_id', ids)
          .in('status', ['PENDING', 'OVERDUE'])
          .order('due_date', { ascending: true }),
      ),
      this.select<Row[]>(
        'decorate:check_ins',
        this.client
          .from('check_ins')
          .select('student_id, checked_in_at')
          .eq('organization_id', organizationId)
          .in('student_id', ids)
          .order('checked_in_at', { ascending: false }),
      ),
    ])

    const nextCharge = new Map<string, Row>()
    for (const row of charges ?? [])
      if (!nextCharge.has(row.student_id)) nextCharge.set(row.student_id, row)

    const lastCheckIn = new Map<string, string>()
    for (const row of checkIns ?? [])
      if (!lastCheckIn.has(row.student_id)) lastCheckIn.set(row.student_id, row.checked_in_at)

    return students.map((student) => ({
      ...student,
      nextChargeDueDate: nextCharge.get(student.id)?.due_date ?? null,
      nextChargeAmount: nextCharge.get(student.id)
        ? Number(nextCharge.get(student.id)!.amount)
        : null,
      lastCheckInAt: lastCheckIn.get(student.id) ?? null,
    }))
  }

  async listStudents(
    organizationId: string,
    filters: StudentFilters,
  ): Promise<Paginated<StudentListItem>> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 20))
    const from = (page - 1) * pageSize

    let query = this.client
      .from('students')
      .select(this.studentSelect, { count: 'exact' })
      .eq('organization_id', organizationId)

    if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status)
    if (filters.trainerId) query = query.eq('trainer_id', filters.trainerId)
    if (filters.newcomers) {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      query = query.gte('enrolled_at', since)
    }
    if (filters.search) {
      // Busca no perfil relacionado — requer o join declarado acima.
      query = query.or(
        `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,synse_id.ilike.%${filters.search}%`,
        { referencedTable: 'user_profiles' },
      )
    }

    const { data, error, count } = await query
      .order('enrolled_at', { ascending: false })
      .range(from, from + pageSize - 1)

    if (error) this.fail('listStudents', error)

    let rows = ((data as Row[]) ?? []).map((row) => this.mapStudent(row))
    rows = await this.decorateStudents(organizationId, rows)

    if (filters.planId) rows = rows.filter((r) => r.planName != null)
    if (filters.inactiveAttendance) {
      rows = rows.filter(
        (r) => !r.lastCheckInAt || daysBetween(r.lastCheckInAt) >= ATTENDANCE_INACTIVE_DAYS,
      )
    }

    return { rows, total: count ?? rows.length, page, pageSize }
  }

  async getStudent(organizationId: string, studentId: string) {
    const row = await this.select<Row>(
      'getStudent',
      this.client
        .from('students')
        .select(this.studentSelect)
        .eq('organization_id', organizationId)
        .eq('id', studentId)
        .maybeSingle(),
    )
    if (!row) return null
    const [decorated] = await this.decorateStudents(organizationId, [this.mapStudent(row)])
    return decorated
  }

  async createStudent(input: {
    organizationId: string
    name: string
    email: string
    phone: string | null
    taxId: string | null
    goal: string | null
    planId: string | null
    trainerId: string | null
    billingDay: number
  }): Promise<Student> {
    // O perfil é do usuário e sobrevive ao vínculo: reaproveita se já existir.
    const existing = await this.select<Row>(
      'createStudent:findProfile',
      this.client.from('user_profiles').select('*').eq('email', input.email).maybeSingle(),
    )

    let profile =
      existing ??
      (await this.select<Row>(
        'createStudent:insertProfile',
        this.client
          .from('user_profiles')
          .insert({
            name: input.name,
            email: input.email,
            phone: input.phone,
            tax_id: input.taxId,
          })
          .select('*')
          .single(),
      ))!

    /*
     * Perfil que já existia e ainda não tinha CPF recebe o informado agora.
     *
     * Sem isso, matricular numa segunda academia alguém já cadastrado descartaria
     * o documento em silêncio — e a cobrança falharia lá na frente, sem que
     * ninguém ligasse uma coisa à outra. Um CPF já gravado nunca é sobrescrito
     * por aqui: trocar documento de pessoa é operação de correção, não de
     * matrícula.
     */
    if (existing && input.taxId && !existing.tax_id) {
      profile =
        (await this.select<Row>(
          'createStudent:fillTaxId',
          this.client
            .from('user_profiles')
            .update({ tax_id: input.taxId })
            .eq('id', existing.id)
            .select('*')
            .single(),
        )) ?? profile
    }

    const student = (await this.select<Row>(
      'createStudent:insertStudent',
      this.client
        .from('students')
        .insert({
          organization_id: input.organizationId,
          user_profile_id: profile.id,
          goal: input.goal,
          trainer_id: input.trainerId,
          status: 'ACTIVE',
        })
        .select('*')
        .single(),
    ))!

    if (input.planId) {
      const plan = await this.getPlan(input.organizationId, input.planId)
      if (plan) {
        await this.client.from('memberships').insert({
          organization_id: input.organizationId,
          student_id: student.id,
          plan_id: plan.id,
          price: plan.price,
          billing_day: input.billingDay,
        })
      }
    }

    return {
      id: student.id,
      organizationId: student.organization_id,
      userProfileId: profile.id,
      synseId: profile.synse_id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      taxId: profile.tax_id ?? null,
      avatarUrl: profile.avatar_url,
      birthDate: profile.birth_date,
      status: student.status,
      goal: student.goal,
      enrolledAt: student.enrolled_at,
      cancelledAt: student.cancelled_at ?? null,
      trainerId: student.trainer_id,
      membershipId: null,
      notes: student.notes,
    }
  }

  // ── Synse Pay ──────────────────────────────────────────────────────────────
  private mapCharge(row: Row): Charge {
    return {
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      membershipId: row.membership_id,
      providerChargeId: row.provider_charge_id,
      description: row.description,
      amount: Number(row.amount),
      dueDate: row.due_date,
      paymentMethod: row.payment_method,
      status: row.status,
      paidAt: row.paid_at,
      billingReference: row.billing_reference ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapChargeWithStudent(row: Row): ChargeWithStudent {
    return {
      ...this.mapCharge(row),
      studentName: row.students?.user_profiles?.name ?? '—',
      studentPhone: row.students?.user_profiles?.phone ?? null,
      planName: row.memberships?.membership_plans?.name ?? null,
    }
  }

  private readonly chargeSelect = `
    *, students ( user_profiles ( name, phone ) ),
    memberships ( membership_plans ( name ) )
  `

  async listCharges(
    organizationId: string,
    filters: { status?: Charge['status'] | 'ALL'; studentId?: string; limit?: number },
  ) {
    let query = this.client
      .from('charges')
      .select(this.chargeSelect)
      .eq('organization_id', organizationId)

    if (filters.status && filters.status !== 'ALL') query = query.eq('status', filters.status)
    if (filters.studentId) query = query.eq('student_id', filters.studentId)

    const rows =
      (await this.select<Row[]>(
        'listCharges',
        query.order('due_date', { ascending: false }).limit(filters.limit ?? 100),
      )) ?? []
    return rows.map((row) => this.mapChargeWithStudent(row))
  }

  async listOverdueCharges(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'listOverdueCharges',
        this.client
          .from('charges')
          .select(this.chargeSelect)
          .eq('organization_id', organizationId)
          .eq('status', 'OVERDUE')
          .order('due_date', { ascending: true }),
      )) ?? []
    return rows.map((row) => this.mapChargeWithStudent(row))
  }

  async getChargesForStudent(organizationId: string, studentId: string) {
    const rows =
      (await this.select<Row[]>(
        'getChargesForStudent',
        this.client
          .from('charges')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .order('due_date', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapCharge(row))
  }

  async markChargeAsPaid(
    organizationId: string,
    chargeId: string,
    input: { method: Charge['paymentMethod']; paidAt: string },
  ) {
    const row = await this.select<Row>(
      'markChargeAsPaid',
      this.client
        .from('charges')
        .update({ status: 'PAID', paid_at: input.paidAt, payment_method: input.method })
        .eq('organization_id', organizationId)
        .eq('id', chargeId)
        .select('*')
        .maybeSingle(),
    )
    return row ? this.mapCharge(row) : null
  }

  /*
   * Referências do provedor.
   *
   * `provider_charge_id` é o que liga a cobrança do Synse à do gateway. É por
   * ele que o webhook encontra a cobrança para dar baixa; sem gravá-lo, o
   * pagamento chega e não acha o que confirmar.
   */
  async getProviderCustomerId(
    organizationId: string,
    studentId: string,
    provider: string,
  ): Promise<string | null> {
    const row = await this.select<Row>(
      'getProviderCustomerId',
      this.client
        .from('payment_customers')
        .select('provider_customer_id')
        .eq('organization_id', organizationId)
        .eq('student_id', studentId)
        .eq('provider', provider)
        .maybeSingle(),
    )
    return row ? row.provider_customer_id : null
  }

  async saveProviderCustomerId(input: {
    organizationId: string
    studentId: string
    provider: string
    providerCustomerId: string
  }): Promise<void> {
    const { error } = await this.client.from('payment_customers').upsert(
      {
        organization_id: input.organizationId,
        student_id: input.studentId,
        provider: input.provider,
        provider_customer_id: input.providerCustomerId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,provider' },
    )
    if (error) this.fail('saveProviderCustomerId', error)
  }

  async attachProviderCharge(input: {
    organizationId: string
    chargeId: string
    provider: string
    providerChargeId: string
  }): Promise<void> {
    const { error } = await this.client
      .from('charges')
      .update({
        provider: input.provider,
        provider_charge_id: input.providerChargeId,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', input.organizationId)
      .eq('id', input.chargeId)
    if (error) this.fail('attachProviderCharge', error)
  }

  async listCollectionRules(organizationId: string): Promise<CollectionRule[]> {
    const rows =
      (await this.select<Row[]>(
        'listCollectionRules',
        this.client
          .from('collection_rules')
          .select('*')
          .eq('organization_id', organizationId)
          .order('offset_days', { ascending: true }),
      )) ?? []
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      offsetDays: row.offset_days,
      channels: row.channels,
      template: row.template,
      enabled: row.enabled,
    }))
  }

  // ── Check-in ───────────────────────────────────────────────────────────────
  async listCheckIns(
    organizationId: string,
    options: { since?: Date; limit?: number },
  ): Promise<CheckInWithStudent[]> {
    let query = this.client
      .from('check_ins')
      // Sem espaço em volta dos parênteses: o parser do PostgREST recusa
      // `a ( b ( c ) )` numa linha só, embora aceite o mesmo texto quebrado
      // em várias linhas. Aninhamento colado é a forma que sempre funciona.
      .select('*,students(user_profiles(name))')
      .eq('organization_id', organizationId)

    if (options.since) query = query.gte('checked_in_at', options.since.toISOString())

    const rows =
      (await this.select<Row[]>(
        'listCheckIns',
        query.order('checked_in_at', { ascending: false }).limit(options.limit ?? 1000),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      checkedInAt: row.checked_in_at,
      method: row.method,
      deviceId: row.device_id,
      studentName: row.students?.user_profiles?.name ?? 'Aluno',
    }))
  }

  async listCheckInsForStudent(organizationId: string, studentId: string, limit = 60) {
    const rows =
      (await this.select<Row[]>(
        'listCheckInsForStudent',
        this.client
          .from('check_ins')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .order('checked_in_at', { ascending: false })
          .limit(limit),
      )) ?? []
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      checkedInAt: row.checked_in_at,
      method: row.method,
      deviceId: row.device_id,
    }))
  }

  async createCheckIn(input: {
    organizationId: string
    studentId: string
    method: CheckIn['method']
  }): Promise<CheckIn> {
    const row = (await this.select<Row>(
      'createCheckIn',
      this.client
        .from('check_ins')
        .insert({
          organization_id: input.organizationId,
          student_id: input.studentId,
          method: input.method,
        })
        .select('*')
        .single(),
    ))!
    return {
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      checkedInAt: row.checked_in_at,
      method: row.method,
      deviceId: row.device_id,
    }
  }

  // ── Treinos ────────────────────────────────────────────────────────────────
  private mapExercise(row: Row): Exercise {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      muscleGroup: row.muscle_group,
      equipment: row.equipment,
      description: row.description,
      videoUrl: row.video_url,
      imageUrl: row.image_url,
      slug: row.slug ?? null,
      primaryMuscle: row.primary_muscle ?? null,
      secondaryMuscles: row.secondary_muscles ?? [],
      region: row.region ?? null,
      pattern: row.pattern ?? null,
      mechanics: row.mechanics ?? null,
      utility: row.utility ?? null,
      equipmentType: row.equipment_type ?? null,
      unilateral: Boolean(row.unilateral),
      level: row.level ?? null,
      aliases: row.aliases ?? [],
    }
  }

  async listExercises(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'listExercises',
        this.client
          .from('exercises')
          .select('*')
          .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
          .order('name'),
      )) ?? []
    return rows.map((row) => this.mapExercise(row))
  }

  private mapWorkoutPlan(row: Row): WorkoutPlan {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      goal: row.goal,
      splitLabel: row.split_label,
      createdByStaffId: row.created_by_staff_id,
      status: row.status,
      createdAt: row.created_at,
    }
  }

  async listWorkoutPlans(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'listWorkoutPlans',
        this.client
          .from('workout_plans')
          .select('*')
          .eq('organization_id', organizationId)
          .order('split_label'),
      )) ?? []
    return rows.map((row) => this.mapWorkoutPlan(row))
  }

  async getWorkoutPlan(organizationId: string, planId: string) {
    const row = await this.select<Row>(
      'getWorkoutPlan',
      this.client
        .from('workout_plans')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', planId)
        .maybeSingle(),
    )
    return row ? this.mapWorkoutPlan(row) : null
  }

  async listWorkoutExercises(workoutPlanId: string) {
    const rows =
      (await this.select<Row[]>(
        'listWorkoutExercises',
        this.client
          .from('workout_exercises')
          .select('*, exercises (*)')
          .eq('workout_plan_id', workoutPlanId)
          .order('position'),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      workoutPlanId: row.workout_plan_id,
      exerciseId: row.exercise_id,
      order: row.position,
      sets: row.sets,
      reps: row.reps,
      restSeconds: row.rest_seconds,
      suggestedLoad: row.suggested_load != null ? Number(row.suggested_load) : null,
      notes: row.notes,
      exercise: this.mapExercise(row.exercises),
    })) satisfies Array<WorkoutExercise & { exercise: Exercise }>
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
    const row = await this.select<Row>(
      'createWorkoutPlan',
      this.client
        .from('workout_plans')
        .insert({
          organization_id: input.organizationId,
          name: input.name,
          goal: input.goal,
          split_label: input.splitLabel,
          created_by_staff_id: input.createdByStaffId,
          status: 'PUBLISHED',
        })
        .select('*')
        .single(),
    )
    const plan = this.mapWorkoutPlan(row!)

    /*
     * Duas escritas sem transação, porque o PostgREST não oferece uma. O que
     * fica no lugar dela é a limpeza abaixo: se os exercícios falharem, o plano
     * vazio é removido em vez de ficar na lista como um treino que abre em
     * branco. Um plano órfão é pior que um erro — o erro a pessoa refaz.
     */
    try {
      const { error } = await this.client.from('workout_exercises').insert(
        input.exercises.map((exercicio, indice) => ({
          workout_plan_id: plan.id,
          exercise_id: exercicio.exerciseId,
          position: indice + 1,
          sets: exercicio.sets,
          reps: exercicio.reps,
          rest_seconds: exercicio.restSeconds,
          suggested_load: exercicio.suggestedLoad,
          notes: exercicio.notes,
        })),
      )
      if (error) this.fail('createWorkoutPlan:exercises', error)
    } catch (erro) {
      await this.client.from('workout_plans').delete().eq('id', plan.id)
      throw erro
    }

    return plan
  }

  async assignWorkoutPlan(input: {
    organizationId: string
    workoutPlanId: string
    studentId: string
    validUntil: string | null
  }): Promise<WorkoutAssignment> {
    /*
     * `onConflict` porque a tabela tem uma única atribuição por par
     * (treino, aluno): reatribuir o mesmo treino é renovar a validade, não um
     * erro para mostrar na tela de quem só quis estender o prazo.
     */
    const row = await this.select<Row>(
      'assignWorkoutPlan',
      this.client
        .from('workout_assignments')
        .upsert(
          {
            organization_id: input.organizationId,
            workout_plan_id: input.workoutPlanId,
            student_id: input.studentId,
            valid_until: input.validUntil,
            assigned_at: new Date().toISOString(),
          },
          { onConflict: 'workout_plan_id,student_id' },
        )
        .select('*')
        .single(),
    )

    return {
      id: row!.id,
      organizationId: row!.organization_id,
      workoutPlanId: row!.workout_plan_id,
      studentId: row!.student_id,
      assignedAt: row!.assigned_at,
      validUntil: row!.valid_until,
    }
  }

  async listAssignmentsForStudent(organizationId: string, studentId: string) {
    const rows =
      (await this.select<Row[]>(
        'listAssignmentsForStudent',
        this.client
          .from('workout_assignments')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId),
      )) ?? []
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workoutPlanId: row.workout_plan_id,
      studentId: row.student_id,
      assignedAt: row.assigned_at,
      validUntil: row.valid_until,
    })) satisfies WorkoutAssignment[]
  }

  async listAssignmentsForPlan(organizationId: string, workoutPlanId: string) {
    const rows =
      (await this.select<Row[]>(
        'listAssignmentsForPlan',
        this.client
          .from('workout_assignments')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('workout_plan_id', workoutPlanId),
      )) ?? []
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      workoutPlanId: row.workout_plan_id,
      studentId: row.student_id,
      assignedAt: row.assigned_at,
      validUntil: row.valid_until,
    })) satisfies WorkoutAssignment[]
  }

  async countAssignments(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'countAssignments',
        this.client
          .from('workout_assignments')
          .select('workout_plan_id')
          .eq('organization_id', organizationId),
      )) ?? []
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.workout_plan_id] = (acc[row.workout_plan_id] ?? 0) + 1
      return acc
    }, {})
  }

  async listWorkoutLogs(organizationId: string, studentId: string) {
    const rows =
      (await this.select<Row[]>(
        'listWorkoutLogs',
        this.client
          .from('workout_logs')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .order('performed_at', { ascending: true }),
      )) ?? []
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      workoutPlanId: row.workout_plan_id,
      workoutExerciseId: row.workout_exercise_id,
      performedAt: row.performed_at,
      load: row.load != null ? Number(row.load) : null,
      reps: row.reps,
      sets: row.sets,
      rpe: row.rpe,
      notes: row.notes,
    })) satisfies WorkoutLog[]
  }

  // ── Avaliações ─────────────────────────────────────────────────────────────
  private mapAssessment(row: Row): Assessment {
    const num = (v: unknown) => (v != null ? Number(v) : null)
    return {
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      assessedByStaffId: row.assessed_by_staff_id,
      assessedAt: row.assessed_at,
      weight: num(row.weight),
      height: num(row.height),
      bmi: num(row.bmi),
      bodyFatPercentage: num(row.body_fat_percentage),
      chest: num(row.chest),
      arm: num(row.arm),
      waist: num(row.waist),
      abdomen: num(row.abdomen),
      hip: num(row.hip),
      thigh: num(row.thigh),
      calf: num(row.calf),
      notes: row.notes,
      protocol: row.protocol ?? 'MANUAL',
      protocolSex: row.protocol_sex ?? null,
      ageYears: num(row.age_years),
      bodyDensity: num(row.body_density),
      skinfoldChest: num(row.sf_chest),
      skinfoldAxilla: num(row.sf_axilla),
      skinfoldTriceps: num(row.sf_triceps),
      skinfoldSubscapular: num(row.sf_subscapular),
      skinfoldAbdominal: num(row.sf_abdominal),
      skinfoldSuprailiac: num(row.sf_suprailiac),
      skinfoldThigh: num(row.sf_thigh),
    }
  }

  async listAssessments(organizationId: string, studentId: string) {
    const rows =
      (await this.select<Row[]>(
        'listAssessments',
        this.client
          .from('assessments')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .order('assessed_at', { ascending: true }),
      )) ?? []

    return rows.map((row) => this.mapAssessment(row))
  }

  async getAssessment(organizationId: string, assessmentId: string): Promise<Assessment | null> {
    const row = await this.select<Row>(
      'getAssessment',
      this.client
        .from('assessments')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', assessmentId)
        .maybeSingle(),
    )
    return row ? this.mapAssessment(row) : null
  }

  async listLatestAssessments(organizationId: string): Promise<Assessment[]> {
    /*
     * A última avaliação de cada aluno. Vem tudo e o corte é aqui porque o
     * PostgREST não faz `distinct on`; a ordem descendente garante que a
     * primeira que aparece de cada aluno é a mais recente.
     */
    const rows =
      (await this.select<Row[]>(
        'listLatestAssessments',
        this.client
          .from('assessments')
          .select('*')
          .eq('organization_id', organizationId)
          .order('assessed_at', { ascending: false })
          .limit(500),
      )) ?? []

    const vistos = new Set<string>()
    const ultimas: Assessment[] = []
    for (const row of rows) {
      if (vistos.has(row.student_id)) continue
      vistos.add(row.student_id)
      ultimas.push(this.mapAssessment(row))
    }
    return ultimas
  }

  /**
   * Grava a avaliação.
   *
   * Nada de IMC, densidade ou percentual calculado sai daqui: o gatilho da 0023
   * recalcula na escrita. Mandar o número junto seria oferecer ao cliente a
   * chance de contar outra história sobre o mesmo corpo.
   */
  async saveAssessment(input: SaveAssessmentInput): Promise<Assessment> {
    const linha = {
      organization_id: input.organizationId,
      student_id: input.studentId,
      assessed_by_staff_id: input.assessedByStaffId,
      assessed_at: input.assessedAt,
      weight: input.weight,
      height: input.height,
      chest: input.chest,
      arm: input.arm,
      waist: input.waist,
      abdomen: input.abdomen,
      hip: input.hip,
      thigh: input.thigh,
      calf: input.calf,
      notes: input.notes,
      protocol: input.protocol,
      protocol_sex: input.protocolSex,
      age_years: input.ageYears,
      sf_chest: input.skinfoldChest,
      sf_axilla: input.skinfoldAxilla,
      sf_triceps: input.skinfoldTriceps,
      sf_subscapular: input.skinfoldSubscapular,
      sf_abdominal: input.skinfoldAbdominal,
      sf_suprailiac: input.skinfoldSuprailiac,
      sf_thigh: input.skinfoldThigh,
      /* Só vale quando o protocolo é manual; o gatilho ignora nos demais. */
      body_fat_percentage: input.protocol === 'MANUAL' ? input.bodyFatPercentage : null,
    }

    const row = input.id
      ? await this.select<Row>(
          'saveAssessment:update',
          this.client
            .from('assessments')
            .update(linha)
            .eq('organization_id', input.organizationId)
            .eq('id', input.id)
            .select('*')
            .single(),
        )
      : await this.select<Row>(
          'saveAssessment:insert',
          this.client.from('assessments').insert(linha).select('*').single(),
        )

    return this.mapAssessment(row!)
  }

  // ── Agenda ─────────────────────────────────────────────────────────────────
  private mapSchedule(row: Row): ClassSchedule {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description ?? null,
      staffId: row.staff_id ?? null,
      staffName: row.staff?.user_profiles?.name ?? null,
      weekday: Number(row.weekday),
      // `time` volta como 'HH:MM:SS'; a tela e o formulário falam 'HH:MM'.
      startTime: String(row.start_time ?? '').slice(0, 5),
      durationMinutes: Number(row.duration_minutes),
      capacity: Number(row.capacity),
      room: row.room ?? null,
      startsOn: row.starts_on,
      endsOn: row.ends_on ?? null,
      status: row.status ?? 'ACTIVE',
    }
  }

  private mapSession(row: Row): ClassSession {
    return {
      id: row.id,
      organizationId: row.organization_id,
      scheduleId: row.schedule_id ?? null,
      name: row.name,
      staffId: row.staff_id ?? null,
      staffName: row.staff?.user_profiles?.name ?? null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: Number(row.capacity),
      room: row.room ?? null,
      status: row.status ?? 'SCHEDULED',
      cancellationReason: row.cancellation_reason ?? null,
      bookedCount: Number(row.booked_count ?? 0),
    }
  }

  /** O professor vem por join aninhado: staff → user_profiles → name. */
  private static readonly SESSAO_SELECT =
    '*, staff:staff_id(user_profiles:user_profile_id(name))'

  async listClassSchedules(organizationId: string): Promise<ClassSchedule[]> {
    const rows =
      (await this.select<Row[]>(
        'listClassSchedules',
        this.client
          .from('class_schedules')
          .select(SupabaseDataSource.SESSAO_SELECT)
          .eq('organization_id', organizationId)
          .order('weekday')
          .order('start_time'),
      )) ?? []
    return rows.map((row) => this.mapSchedule(row))
  }

  async getClassSchedule(organizationId: string, scheduleId: string) {
    const row = await this.select<Row>(
      'getClassSchedule',
      this.client
        .from('class_schedules')
        .select(SupabaseDataSource.SESSAO_SELECT)
        .eq('organization_id', organizationId)
        .eq('id', scheduleId)
        .maybeSingle(),
    )
    return row ? this.mapSchedule(row) : null
  }

  async saveClassSchedule(input: SaveClassScheduleInput): Promise<ClassSchedule> {
    const linha = {
      organization_id: input.organizationId,
      name: input.name,
      description: input.description,
      staff_id: input.staffId,
      weekday: input.weekday,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      capacity: input.capacity,
      room: input.room,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: input.status,
      updated_at: new Date().toISOString(),
    }

    const row = input.id
      ? await this.select<Row>(
          'saveClassSchedule:update',
          this.client
            .from('class_schedules')
            .update(linha)
            .eq('organization_id', input.organizationId)
            .eq('id', input.id)
            .select(SupabaseDataSource.SESSAO_SELECT)
            .single(),
        )
      : await this.select<Row>(
          'saveClassSchedule:insert',
          this.client
            .from('class_schedules')
            .insert(linha)
            .select(SupabaseDataSource.SESSAO_SELECT)
            .single(),
        )

    return this.mapSchedule(row!)
  }

  async listClassSessions(organizationId: string, window: ScheduleWindow) {
    const rows =
      (await this.select<Row[]>(
        'listClassSessions',
        this.client
          .from('class_sessions')
          .select(SupabaseDataSource.SESSAO_SELECT)
          .eq('organization_id', organizationId)
          .gte('starts_at', window.from)
          .lt('starts_at', window.to)
          .order('starts_at'),
      )) ?? []
    return rows.map((row) => this.mapSession(row))
  }

  async getClassSession(organizationId: string, sessionId: string) {
    const row = await this.select<Row>(
      'getClassSession',
      this.client
        .from('class_sessions')
        .select(SupabaseDataSource.SESSAO_SELECT)
        .eq('organization_id', organizationId)
        .eq('id', sessionId)
        .maybeSingle(),
    )
    return row ? this.mapSession(row) : null
  }

  async listClassBookings(organizationId: string, sessionId: string): Promise<ClassBooking[]> {
    const rows =
      (await this.select<Row[]>(
        'listClassBookings',
        this.client
          .from('class_bookings')
          .select('*, students:student_id(user_profiles:user_profile_id(name))')
          .eq('organization_id', organizationId)
          .eq('session_id', sessionId)
          // Ordem de chegada: é ela que define a fila de espera.
          .order('created_at'),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      sessionId: row.session_id,
      studentId: row.student_id,
      studentName: row.students?.user_profiles?.name ?? null,
      status: row.status,
      createdAt: row.created_at,
      cancelledAt: row.cancelled_at ?? null,
      attendedAt: row.attended_at ?? null,
    }))
  }

  async cancelClassSession(organizationId: string, sessionId: string, reason: string | null) {
    /*
     * Só marca o status. Avisar quem ia e desfazer as reservas é do gatilho da
     * 0024 — fazer aqui deixaria o aluno sem aviso quando a aula fosse
     * cancelada por qualquer outro caminho.
     */
    const { error } = await this.client
      .from('class_sessions')
      .update({ status: 'CANCELLED', cancellation_reason: reason, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', sessionId)
    if (error) this.fail('cancelClassSession', error)
  }

  async generateClassSessions(organizationId: string, daysAhead: number): Promise<number> {
    const { data, error } = await this.client.rpc('generate_org_class_sessions', {
      p_organization_id: organizationId,
      p_days_ahead: daysAhead,
    })
    if (error) this.fail('generateClassSessions', error)
    return Number(data ?? 0)
  }

  async ensureClassSessions(organizationId: string, daysAhead: number): Promise<number> {
    const { data, error } = await this.client.rpc('ensure_org_class_sessions', {
      p_organization_id: organizationId,
      p_days_ahead: daysAhead,
    })
    /*
     * Falha aqui não derruba a tela. A agenda que já existe continua legível, e
     * uma academia sem a 0024 aplicada veria erro numa página que deveria
     * apenas mostrar o que tem.
     */
    if (error) {
      logger.warn('ensureClassSessions:ignorado', { erro: String((error as Error).message) })
      return 0
    }
    return Number(data ?? 0)
  }

  async generateAllClassSessions(daysAhead: number): Promise<number> {
    const { data, error } = await this.client.rpc('generate_class_sessions', {
      p_days_ahead: daysAhead,
    })
    if (error) this.fail('generateAllClassSessions', error)
    return Number(data ?? 0)
  }

  async markAttendance(
    organizationId: string,
    bookingId: string,
    status: 'ATTENDED' | 'NO_SHOW' | 'BOOKED',
  ) {
    const { error } = await this.client
      .from('class_bookings')
      .update({ status, attended_at: status === 'ATTENDED' ? new Date().toISOString() : null })
      .eq('organization_id', organizationId)
      .eq('id', bookingId)
    if (error) this.fail('markAttendance', error)
  }

  async bookClass(sessionId: string, studentId?: string): Promise<ClassBookingStatus> {
    /*
     * A vaga é decidida no banco, sob trava. Contar aqui e inserir depois é a
     * corrida que coloca duas pessoas na última vaga.
     */
    const { data, error } = await this.client.rpc('book_class', {
      p_session_id: sessionId,
      p_student_id: studentId ?? null,
    })
    if (error) this.fail('bookClass', error)
    return data as ClassBookingStatus
  }

  async cancelClassBooking(bookingId: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_class_booking', { p_booking_id: bookingId })
    if (error) this.fail('cancelClassBooking', error)
  }

  async listClassSessionsForStudent(
    organizationId: string,
    studentId: string,
    window: ScheduleWindow,
  ): Promise<ClassSessionForStudent[]> {
    const [sessoes, minhas] = await Promise.all([
      this.listClassSessions(organizationId, window),
      this.select<Row[]>(
        'listClassSessionsForStudent:bookings',
        this.client
          .from('class_bookings')
          .select('id, session_id, student_id, status, created_at')
          .eq('organization_id', organizationId)
          .in('status', ['BOOKED', 'WAITLIST', 'ATTENDED'])
          .order('created_at'),
      ),
    ])

    const todas = minhas ?? []
    const minhasPorSessao = new Map(
      todas.filter((linha) => linha.student_id === studentId).map((l) => [l.session_id, l]),
    )

    /*
     * A posição na fila é contada entre as esperas anteriores da mesma aula.
     * "Você está na lista" sem dizer em que lugar não ajuda ninguém a decidir
     * se vale esperar.
     */
    const esperaPorSessao = new Map<string, string[]>()
    for (const linha of todas) {
      if (linha.status !== 'WAITLIST') continue
      const fila = esperaPorSessao.get(linha.session_id) ?? []
      fila.push(linha.student_id)
      esperaPorSessao.set(linha.session_id, fila)
    }

    return sessoes.map((sessao) => {
      const minha = minhasPorSessao.get(sessao.id)
      const fila = esperaPorSessao.get(sessao.id) ?? []
      const posicao = minha?.status === 'WAITLIST' ? fila.indexOf(studentId) + 1 : 0

      return {
        ...sessao,
        myBookingId: minha?.id ?? null,
        myBookingStatus: (minha?.status as ClassBookingStatus | undefined) ?? null,
        waitlistPosition: posicao > 0 ? posicao : null,
      }
    })
  }

  // ── Treino Ativo ───────────────────────────────────────────────────────────
  async startWorkoutSession(clientId: string, workoutPlanId: string | null): Promise<string> {
    /*
     * A regra de quem é o aluno vive no banco, em `start_workout_session`.
     * Mandar `student_id` daqui deixaria a aplicação decidir em nome de quem o
     * treino é gravado — e é exatamente isso que não pode.
     */
    const { data, error } = await this.client.rpc('start_workout_session', {
      p_client_id: clientId,
      p_workout_plan_id: workoutPlanId,
    })
    if (error) this.fail('startWorkoutSession', error)
    return String(data)
  }

  async logWorkoutSet(input: LogWorkoutSetInput): Promise<string> {
    const { data, error } = await this.client.rpc('log_workout_set', {
      p_session_id: input.sessionId,
      p_exercise_id: input.exerciseId,
      p_set_number: input.setNumber,
      p_reps_completed: input.repsCompleted,
      p_client_id: input.clientId,
      p_weight: input.weight,
      p_reps_planned: input.repsPlanned,
      p_rest_seconds: input.restSeconds,
      p_started_at: input.startedAt,
      p_completed_at: input.completedAt,
    })
    if (error) this.fail('logWorkoutSet', error)
    return String(data)
  }

  async finishWorkoutSession(
    sessionId: string,
    durationSeconds: number,
    status: 'COMPLETED' | 'ABANDONED',
  ): Promise<void> {
    const { error } = await this.client.rpc('finish_workout_session', {
      p_session_id: sessionId,
      p_duration_seconds: durationSeconds,
      p_status: status,
    })
    if (error) this.fail('finishWorkoutSession', error)
  }

  private mapWorkoutSession(row: Row): WorkoutSessionSummary {
    const series = (row.workout_set_logs ?? []) as Row[]
    return {
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      workoutPlanId: row.workout_plan_id ?? null,
      planName: row.workout_plans?.name ?? null,
      clientId: row.client_id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? null,
      durationSeconds: row.duration_seconds ?? null,
      totalSets: series.length,
      totalReps: series.reduce((soma, s) => soma + Number(s.reps_completed ?? 0), 0),
      volumeKg: Math.round(
        series.reduce((soma, s) => soma + Number(s.weight ?? 0) * Number(s.reps_completed ?? 0), 0),
      ),
    }
  }

  private static readonly SESSAO_TREINO_SELECT =
    '*, workout_plans:workout_plan_id(name), workout_set_logs(reps_completed, weight)'

  async getActiveWorkoutSession(studentId: string): Promise<WorkoutSessionSummary | null> {
    const row = await this.select<Row>(
      'getActiveWorkoutSession',
      this.client
        .from('workout_sessions')
        .select(SupabaseDataSource.SESSAO_TREINO_SELECT)
        .eq('student_id', studentId)
        .in('status', ['IN_PROGRESS', 'PAUSED'])
        .maybeSingle(),
    )
    return row ? this.mapWorkoutSession(row) : null
  }

  async listWorkoutSessions(studentId: string, limite: number): Promise<WorkoutSessionSummary[]> {
    const rows =
      (await this.select<Row[]>(
        'listWorkoutSessions',
        this.client
          .from('workout_sessions')
          .select(SupabaseDataSource.SESSAO_TREINO_SELECT)
          .eq('student_id', studentId)
          .eq('status', 'COMPLETED')
          .order('started_at', { ascending: false })
          .limit(limite),
      )) ?? []
    return rows.map((row) => this.mapWorkoutSession(row))
  }

  async getWorkoutPreferences(userProfileId: string): Promise<WorkoutPreferences> {
    const row = await this.select<Row>(
      'getWorkoutPreferences',
      this.client
        .from('workout_preferences')
        .select('*')
        .eq('user_profile_id', userProfileId)
        .maybeSingle(),
    )
    // Sem linha é quem nunca mexeu nas preferências: o padrão serve.
    if (!row) return DEFAULT_WORKOUT_PREFERENCES
    return {
      autoRest: row.auto_rest,
      sound: row.sound_enabled,
      vibration: row.vibration_enabled,
      autoAdvance: row.auto_advance,
      keepScreenAwake: row.keep_screen_awake,
      defaultRestSeconds: Number(row.default_rest_seconds),
    }
  }

  async saveWorkoutPreferences(userProfileId: string, p: WorkoutPreferences) {
    const { error } = await this.client.from('workout_preferences').upsert({
      user_profile_id: userProfileId,
      auto_rest: p.autoRest,
      sound_enabled: p.sound,
      vibration_enabled: p.vibration,
      auto_advance: p.autoAdvance,
      keep_screen_awake: p.keepScreenAwake,
      default_rest_seconds: p.defaultRestSeconds,
      updated_at: new Date().toISOString(),
    })
    if (error) this.fail('saveWorkoutPreferences', error)
    return p
  }

  // ── Relatórios ─────────────────────────────────────────────────────────────
  /**
   * As funções da 0027 são SECURITY INVOKER: rodam com o privilégio de quem
   * chama, e a RLS filtra sozinha. Por isso não há checagem de academia aqui —
   * duplicá-la criaria um segundo lugar para a regra divergir.
   */
  private async rpc<T>(nome: string, args: Record<string, unknown>, padrao: T): Promise<T> {
    const { data, error } = await this.client.rpc(nome, args)
    if (error) {
      /*
       * Relatório é leitura: falhar aqui não pode derrubar a página. Uma
       * academia sem a 0027 aplicada veria erro numa tela que deveria mostrar
       * o que tem.
       */
      logger.warn(`report:${nome}`, { erro: String((error as Error).message) })
      return padrao
    }
    return (data as T) ?? padrao
  }

  async getExerciseProgress(studentId: string, exerciseId: string, weeks: number) {
    const rows = await this.rpc<Row[]>(
      'exercise_progress',
      { p_student_id: studentId, p_exercise_id: exerciseId, p_weeks: weeks },
      [],
    )
    return rows.map((row) => ({
      week: row.semana,
      maxWeight: row.carga_max === null ? null : Number(row.carga_max),
      volumeKg: Number(row.volume_kg ?? 0),
      sets: Number(row.series ?? 0),
      reps: Number(row.reps ?? 0),
    })) satisfies ExerciseProgressPoint[]
  }

  async getPersonalRecords(studentId: string) {
    const rows = await this.rpc<Row[]>('personal_records', { p_student_id: studentId }, [])
    return rows.map((row) => ({
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name,
      maxWeight: Number(row.carga_max),
      reps: Number(row.reps),
      achievedAt: row.alcancado_em,
    })) satisfies ExercisePersonalRecord[]
  }

  async getWorkoutTotals(studentId: string, from: string, to: string): Promise<WorkoutTotals> {
    const rows = await this.rpc<Row[]>(
      'workout_totals',
      { p_student_id: studentId, p_from: from, p_to: to },
      [],
    )
    return mapTotals(rows[0])
  }

  async getGymTrainingReport(organizationId: string, from: string, to: string) {
    const rows = await this.rpc<Row[]>(
      'gym_training_report',
      { p_organization_id: organizationId, p_from: from, p_to: to },
      [],
    )
    const row = rows[0]
    return {
      workouts: Number(row?.treinos ?? 0),
      studentsTraining: Number(row?.alunos_treinando ?? 0),
      sets: Number(row?.series ?? 0),
      volumeKg: Number(row?.volume_kg ?? 0),
      averageDurationSeconds: row?.duracao_media_seg == null ? null : Number(row.duracao_media_seg),
    } satisfies GymTrainingReport
  }

  async listStudentsAtRisk(organizationId: string, dias: number) {
    const rows = await this.rpc<Row[]>(
      'students_at_risk',
      { p_organization_id: organizationId, p_dias: dias },
      [],
    )
    return rows.map((row) => ({
      studentId: row.student_id,
      name: row.nome,
      lastVisitAt: row.ultima_visita ?? null,
      daysAbsent: Number(row.dias_ausente ?? 0),
    })) satisfies StudentAtRisk[]
  }

  async getClassOccupancyReport(organizationId: string, from: string, to: string) {
    const rows = await this.rpc<Row[]>(
      'class_occupancy_report',
      { p_organization_id: organizationId, p_from: from, p_to: to },
      [],
    )
    return rows.map((row) => ({
      className: row.aula,
      occurrences: Number(row.ocorrencias ?? 0),
      capacityOffered: Number(row.vagas_ofertadas ?? 0),
      bookings: Number(row.reservas ?? 0),
      attended: Number(row.presencas ?? 0),
      noShows: Number(row.faltas ?? 0),
    })) satisfies ClassOccupancyRow[]
  }

  // ── Conteúdos ──────────────────────────────────────────────────────────────
  private mapContent(row: Row): ContentItem {
    return {
      id: row.id,
      organizationId: row.organization_id ?? null,
      type: row.type,
      title: row.title,
      summary: row.summary ?? null,
      body: row.body ?? null,
      coverUrl: row.cover_url ?? null,
      mediaUrl: row.media_url ?? null,
      visibility: row.visibility,
      publishedAt: row.published_at ?? null,
      pinned: Boolean(row.pinned),
      authorStaffId: row.author_staff_id ?? null,
      authorName: row.staff?.user_profiles?.name ?? null,
      createdAt: row.created_at,
    }
  }

  private static readonly CONTEUDO_SELECT =
    '*, staff:author_staff_id(user_profiles:user_profile_id(name))'

  async listContent(organizationId: string): Promise<ContentItem[]> {
    const rows =
      (await this.select<Row[]>(
        'listContent',
        this.client
          .from('content_library')
          .select(SupabaseDataSource.CONTEUDO_SELECT)
          .eq('organization_id', organizationId)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapContent(row))
  }

  async getContent(organizationId: string, contentId: string) {
    const row = await this.select<Row>(
      'getContent',
      this.client
        .from('content_library')
        .select(SupabaseDataSource.CONTEUDO_SELECT)
        .eq('organization_id', organizationId)
        .eq('id', contentId)
        .maybeSingle(),
    )
    return row ? this.mapContent(row) : null
  }

  async saveContent(input: SaveContentInput): Promise<ContentItem> {
    const linha = {
      organization_id: input.organizationId,
      type: input.type,
      title: input.title,
      summary: input.summary,
      body: input.body,
      cover_url: input.coverUrl,
      media_url: input.mediaUrl,
      /*
       * Sempre ORGANIZATION. FREE é da plataforma, e a 0031 recusa a combinação
       * com academia dona — a tela nem oferece a escolha, para ninguém publicar
       * para a internet achando que publicou para os alunos.
       */
      visibility: 'ORGANIZATION',
      pinned: input.pinned,
      published_at: input.publishedAt,
      author_staff_id: input.authorStaffId,
      updated_at: new Date().toISOString(),
    }

    const row = input.id
      ? await this.select<Row>(
          'saveContent:update',
          this.client
            .from('content_library')
            .update(linha)
            .eq('organization_id', input.organizationId)
            .eq('id', input.id)
            .select(SupabaseDataSource.CONTEUDO_SELECT)
            .single(),
        )
      : await this.select<Row>(
          'saveContent:insert',
          this.client
            .from('content_library')
            .insert(linha)
            .select(SupabaseDataSource.CONTEUDO_SELECT)
            .single(),
        )

    return this.mapContent(row!)
  }

  async deleteContent(organizationId: string, contentId: string): Promise<void> {
    const { error } = await this.client
      .from('content_library')
      .delete()
      .eq('organization_id', organizationId)
      .eq('id', contentId)
    if (error) this.fail('deleteContent', error)
  }

  async listPublishedContent(organizationId: string, limite: number): Promise<ContentItem[]> {
    const { data, error } = await this.client.rpc('published_content', {
      p_organization_id: organizationId,
      p_limite: limite,
    })
    if (error) {
      // Leitura: falhar aqui não derruba a tela do aluno.
      logger.warn('listPublishedContent', { erro: String((error as Error).message) })
      return []
    }

    return ((data as Row[]) ?? []).map((row) => ({
      id: row.id,
      organizationId,
      type: row.tipo,
      title: row.titulo,
      summary: row.resumo ?? null,
      body: null,
      coverUrl: row.capa_url ?? null,
      mediaUrl: row.midia_url ?? null,
      visibility: 'ORGANIZATION' as const,
      publishedAt: row.publicado_em ?? null,
      pinned: Boolean(row.fixado),
      authorStaffId: null,
      authorName: row.autor ?? null,
      createdAt: row.publicado_em ?? new Date().toISOString(),
    }))
  }

  // ── Nutrição ───────────────────────────────────────────────────────────────
  private mapNutritionPlan(row: Row): NutritionPlan {
    return {
      id: row.id,
      organizationId: row.organization_id,
      studentId: row.student_id,
      studentName: row.students?.user_profiles?.name ?? null,
      authorStaffId: row.author_staff_id,
      authorName: row.staff?.user_profiles?.name ?? null,
      title: row.title,
      version: Number(row.version),
      status: row.status,
      publishedAt: row.published_at ?? null,
      notes: row.notes ?? null,
      targetCalories: numero(row.target_calories),
      targetProteinG: numero(row.target_protein_g),
      targetCarbsG: numero(row.target_carbs_g),
      targetFatG: numero(row.target_fat_g),
      createdAt: row.created_at,
    }
  }

  private static readonly NUTRICAO_SELECT =
    '*, students:student_id(user_profiles:user_profile_id(name)), staff:author_staff_id(user_profiles:user_profile_id(name))'

  async listNutritionPlans(organizationId: string): Promise<NutritionPlan[]> {
    const rows =
      (await this.select<Row[]>(
        'listNutritionPlans',
        this.client
          .from('nutrition_plans')
          .select(SupabaseDataSource.NUTRICAO_SELECT)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapNutritionPlan(row))
  }

  async listNutritionPlansForStudent(organizationId: string, studentId: string) {
    const rows =
      (await this.select<Row[]>(
        'listNutritionPlansForStudent',
        this.client
          .from('nutrition_plans')
          .select(SupabaseDataSource.NUTRICAO_SELECT)
          .eq('organization_id', organizationId)
          .eq('student_id', studentId)
          .order('version', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapNutritionPlan(row))
  }

  /** Monta o plano com refeições, itens e totais numa leitura só. */
  private async montarPlano(row: Row): Promise<NutritionPlanWithMeals> {
    const plano = this.mapNutritionPlan(row)

    const refeicoes =
      (await this.select<Row[]>(
        'getNutritionPlan:meals',
        this.client
          .from('meals')
          .select('*, meal_items(*)')
          .eq('nutrition_plan_id', plano.id)
          .order('position'),
      )) ?? []

    const meals: Meal[] = refeicoes.map((refeicao) => ({
      id: refeicao.id,
      nutritionPlanId: refeicao.nutrition_plan_id,
      name: refeicao.name,
      // `time` volta como 'HH:MM:SS'; a tela fala 'HH:MM'.
      timeOfDay: refeicao.time_of_day ? String(refeicao.time_of_day).slice(0, 5) : null,
      position: Number(refeicao.position),
      items: ((refeicao.meal_items ?? []) as Row[])
        .map((item) => ({
          id: item.id,
          mealId: item.meal_id,
          description: item.description,
          quantity: item.quantity ?? null,
          calories: numero(item.calories),
          proteinG: numero(item.protein_g),
          carbsG: numero(item.carbs_g),
          fatG: numero(item.fat_g),
          position: Number(item.position ?? 1),
        }))
        .sort((a, b) => a.position - b.position),
    }))

    /*
     * Os totais vêm da função da 0030, e não de uma soma aqui: a tela do aluno
     * e a do profissional mostram o mesmo número, e duas contas em lugares
     * diferentes divergem.
     */
    const { data } = await this.client.rpc('nutrition_plan_totals', { p_plan_id: plano.id })
    const t = (data as Row[] | null)?.[0]

    return {
      ...plano,
      meals,
      totals: {
        calories: Number(t?.calories ?? 0),
        proteinG: Number(t?.protein_g ?? 0),
        carbsG: Number(t?.carbs_g ?? 0),
        fatG: Number(t?.fat_g ?? 0),
        items: Number(t?.itens ?? 0),
      },
    }
  }

  async getNutritionPlan(organizationId: string, planId: string) {
    const row = await this.select<Row>(
      'getNutritionPlan',
      this.client
        .from('nutrition_plans')
        .select(SupabaseDataSource.NUTRICAO_SELECT)
        .eq('organization_id', organizationId)
        .eq('id', planId)
        .maybeSingle(),
    )
    return row ? this.montarPlano(row) : null
  }

  async getPublishedNutritionPlan(organizationId: string, studentId: string) {
    const row = await this.select<Row>(
      'getPublishedNutritionPlan',
      this.client
        .from('nutrition_plans')
        .select(SupabaseDataSource.NUTRICAO_SELECT)
        .eq('organization_id', organizationId)
        .eq('student_id', studentId)
        .eq('status', 'PUBLISHED')
        .maybeSingle(),
    )
    return row ? this.montarPlano(row) : null
  }

  async saveNutritionPlan(input: SaveNutritionPlanInput): Promise<NutritionPlan> {
    const cabecalho = {
      organization_id: input.organizationId,
      student_id: input.studentId,
      author_staff_id: input.authorStaffId,
      title: input.title,
      notes: input.notes,
      target_calories: input.targetCalories,
      target_protein_g: input.targetProteinG,
      target_carbs_g: input.targetCarbsG,
      target_fat_g: input.targetFatG,
      updated_at: new Date().toISOString(),
    }

    let planoId = input.id
    let row: Row | null

    if (planoId) {
      row = await this.select<Row>(
        'saveNutritionPlan:update',
        this.client
          .from('nutrition_plans')
          .update(cabecalho)
          .eq('organization_id', input.organizationId)
          .eq('id', planoId)
          .select(SupabaseDataSource.NUTRICAO_SELECT)
          .single(),
      )
    } else {
      /*
       * A próxima versão livre deste aluno. `unique (student_id, version)` é o
       * que garante de fato — se duas abas salvarem ao mesmo tempo, a segunda
       * falha em vez de sobrescrever.
       */
      const existentes =
        (await this.select<Row[]>(
          'saveNutritionPlan:versions',
          this.client
            .from('nutrition_plans')
            .select('version')
            .eq('student_id', input.studentId)
            .order('version', { ascending: false })
            .limit(1),
        )) ?? []

      row = await this.select<Row>(
        'saveNutritionPlan:insert',
        this.client
          .from('nutrition_plans')
          .insert({ ...cabecalho, version: Number(existentes[0]?.version ?? 0) + 1 })
          .select(SupabaseDataSource.NUTRICAO_SELECT)
          .single(),
      )
      planoId = row!.id
    }

    /*
     * Refeições são reescritas por inteiro a cada salvamento. Casar linha a
     * linha exigiria id estável na tela e produziria diffs errados quando o
     * nutricionista reordena as refeições — e o `on delete cascade` dos itens
     * torna a troca barata. Isto só acontece em rascunho: plano publicado é
     * editado abrindo uma versão nova.
     */
    await this.client.from('meals').delete().eq('nutrition_plan_id', planoId)

    for (const [indice, refeicao] of input.meals.entries()) {
      const criada = await this.select<Row>(
        'saveNutritionPlan:meal',
        this.client
          .from('meals')
          .insert({
            nutrition_plan_id: planoId,
            name: refeicao.name,
            time_of_day: refeicao.timeOfDay,
            position: indice + 1,
          })
          .select('id')
          .single(),
      )

      if (refeicao.items.length === 0) continue
      const { error } = await this.client.from('meal_items').insert(
        refeicao.items.map((item, ordem) => ({
          meal_id: criada!.id,
          description: item.description,
          quantity: item.quantity,
          calories: item.calories,
          protein_g: item.proteinG,
          carbs_g: item.carbsG,
          fat_g: item.fatG,
          position: ordem + 1,
        })),
      )
      if (error) this.fail('saveNutritionPlan:items', error)
    }

    return this.mapNutritionPlan(row!)
  }

  async publishNutritionPlan(planId: string): Promise<void> {
    const { error } = await this.client.rpc('publish_nutrition_plan', { p_plan_id: planId })
    if (error) this.fail('publishNutritionPlan', error)
  }

  async newNutritionPlanVersion(planId: string): Promise<string> {
    const { data, error } = await this.client.rpc('new_nutrition_plan_version', {
      p_plan_id: planId,
    })
    if (error) this.fail('newNutritionPlanVersion', error)
    return String(data)
  }

  // ── Synse Body ─────────────────────────────────────────────────────────────
  private static readonly BODY_SELECT = `
    id, client_id, measured_at, source, device_id, weight_kg, bmi,
    body_fat_percent, muscle_mass_kg, lean_mass_kg, body_water_percent,
    visceral_fat, bone_mass_kg, bmr_kcal, impedance_ohm, field_origin,
    raw_payload, created_at
  `

  private mapBodyMeasurement(row: Row): BodyMeasurement {
    return {
      id: row.id,
      clientId: row.client_id,
      measuredAt: row.measured_at,
      source: row.source,
      deviceId: row.device_id ?? null,
      weightKg: Number(row.weight_kg),
      bmi: numero(row.bmi),
      bodyFatPercent: numero(row.body_fat_percent),
      muscleMassKg: numero(row.muscle_mass_kg),
      leanMassKg: numero(row.lean_mass_kg),
      bodyWaterPercent: numero(row.body_water_percent),
      visceralFat: numero(row.visceral_fat),
      boneMassKg: numero(row.bone_mass_kg),
      bmrKcal: numero(row.bmr_kcal),
      impedanceOhm: numero(row.impedance_ohm),
      fieldOrigin: row.field_origin ?? {},
      rawPayload: row.raw_payload ?? null,
      createdAt: row.created_at,
    }
  }

  async listBodyMeasurements(period: BodyPeriod): Promise<BodyMeasurement[]> {
    /*
     * Sem `user_profile_id` no filtro: a RLS já devolve só o que é da pessoa.
     * Filtrar aqui exigiria descobrir o perfil antes, numa ida a mais ao banco,
     * para chegar no mesmo lugar.
     */
    let query = this.client
      .from('body_measurements')
      .select(SupabaseDataSource.BODY_SELECT)
      .order('measured_at', { ascending: false })

    const desde = inicioDoPeriodo(period)
    if (desde) query = query.gte('measured_at', desde)

    const rows = (await this.select<Row[]>('listBodyMeasurements', query)) ?? []
    return rows.map((row) => this.mapBodyMeasurement(row))
  }

  async listSharedBodyMeasurements(
    userProfileId: string,
    period: BodyPeriod,
  ): Promise<BodyMeasurement[]> {
    let query = this.client
      .from('body_measurements')
      .select(SupabaseDataSource.BODY_SELECT)
      .eq('user_profile_id', userProfileId)
      .order('measured_at', { ascending: false })

    const desde = inicioDoPeriodo(period)
    if (desde) query = query.gte('measured_at', desde)

    const rows = (await this.select<Row[]>('listSharedBodyMeasurements', query)) ?? []
    return rows.map((row) => this.mapBodyMeasurement(row))
  }

  /**
   * Grava pela função, nunca por insert.
   *
   * `insert` está revogado na tabela de propósito: é a função que resolve a
   * pessoa pelo `auth.uid()` e confere se o aparelho é dela. Numa balança de
   * família, aceitar o dono vindo do cliente gravaria a pesagem de um no
   * histórico de outro.
   */
  async recordBodyMeasurement(measurement: BodyMeasurement): Promise<string> {
    const { data, error } = await this.client.rpc('record_body_measurement', {
      p_client_id: measurement.clientId,
      p_measured_at: measurement.measuredAt,
      p_source: measurement.source,
      p_weight_kg: measurement.weightKg,
      p_device_id: measurement.deviceId ?? null,
      p_bmi: measurement.bmi ?? null,
      p_body_fat: measurement.bodyFatPercent ?? null,
      p_muscle_mass: measurement.muscleMassKg ?? null,
      p_lean_mass: measurement.leanMassKg ?? null,
      p_body_water: measurement.bodyWaterPercent ?? null,
      p_visceral_fat: measurement.visceralFat ?? null,
      p_bone_mass: measurement.boneMassKg ?? null,
      p_bmr_kcal: measurement.bmrKcal ?? null,
      p_impedance: measurement.impedanceOhm ?? null,
      p_raw_payload: measurement.rawPayload ?? null,
      p_field_origin: measurement.fieldOrigin ?? {},
    })
    if (error) this.fail('recordBodyMeasurement', error)
    return String(data)
  }

  async deleteBodyMeasurement(measurementId: string): Promise<void> {
    const { error } = await this.client.from('body_measurements').delete().eq('id', measurementId)
    if (error) this.fail('deleteBodyMeasurement', error)
  }

  async listUserDevices(): Promise<UserDevice[]> {
    const rows =
      (await this.select<Row[]>(
        'listUserDevices',
        this.client
          .from('user_devices')
          .select('*')
          .neq('status', 'REMOVED')
          .order('paired_at', { ascending: false }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      deviceType: row.device_type,
      provider: row.provider,
      manufacturer: row.manufacturer ?? null,
      model: row.model ?? null,
      displayName: row.display_name,
      platformDeviceId: row.platform_device_identifier,
      protocol: row.protocol ?? null,
      capabilities: row.capabilities ?? {},
      firmwareVersion: row.firmware_version ?? null,
      pairedAt: row.paired_at,
      lastSeenAt: row.last_seen_at ?? null,
      status: row.status,
    }))
  }

  async pairUserDevice(input: PairUserDeviceInput): Promise<string> {
    const { data, error } = await this.client.rpc('pair_user_device', {
      p_platform_identifier: input.platformDeviceId,
      p_display_name: input.displayName,
      p_provider: input.provider ?? 'standard_ble',
      p_manufacturer: input.manufacturer ?? null,
      p_model: input.model ?? null,
      p_protocol: input.protocol ?? null,
      p_capabilities: input.capabilities ?? {},
      p_firmware: input.firmwareVersion ?? null,
    })
    if (error) this.fail('pairUserDevice', error)
    return String(data)
  }

  async renameUserDevice(deviceId: string, displayName: string): Promise<void> {
    const { error } = await this.client
      .from('user_devices')
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq('id', deviceId)
    if (error) this.fail('renameUserDevice', error)
  }

  /**
   * Desvincular marca como removido, não apaga a linha.
   *
   * As pesagens apontam para o aparelho, e o histórico do aparelho é o que diz
   * de onde cada número veio. Apagar deixaria medições órfãs sem explicação.
   */
  async unpairUserDevice(deviceId: string): Promise<void> {
    const { error } = await this.client
      .from('user_devices')
      .update({ status: 'REMOVED', updated_at: new Date().toISOString() })
      .eq('id', deviceId)
    if (error) this.fail('unpairUserDevice', error)
  }

  async listBodyShares(): Promise<BodyMeasurementShare[]> {
    const rows =
      (await this.select<Row[]>(
        'listBodyShares',
        this.client
          .from('body_measurement_shares')
          .select('id, user_profile_id, shared_with_profile_id, organization_id, granted_at, revoked_at, shared_with:user_profiles!body_measurement_shares_shared_with_profile_id_fkey(name)')
          .is('revoked_at', null)
          .order('granted_at', { ascending: false }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      userProfileId: row.user_profile_id,
      sharedWithProfileId: row.shared_with_profile_id,
      sharedWithName: row.shared_with?.name ?? null,
      organizationId: row.organization_id ?? null,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at ?? null,
    }))
  }

  async grantBodyShare(sharedWithProfileId: string, organizationId: string | null): Promise<void> {
    const { data: perfil, error: erroPerfil } = await this.client
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', (await this.client.auth.getUser()).data.user?.id ?? '')
      .maybeSingle()
    if (erroPerfil) this.fail('grantBodyShare:profile', erroPerfil)
    if (!perfil) this.fail('grantBodyShare:profile', new Error('perfil não encontrado'))

    /*
     * `upsert` e não `insert`: reautorizar quem foi revogado é o caso comum —
     * a pessoa troca de professor e volta. Sem isto, a segunda autorização
     * esbarraria na unicidade e a tela mostraria erro por um gesto legítimo.
     */
    const { error } = await this.client.from('body_measurement_shares').upsert(
      {
        user_profile_id: perfil.id,
        shared_with_profile_id: sharedWithProfileId,
        organization_id: organizationId,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'user_profile_id,shared_with_profile_id' },
    )
    if (error) this.fail('grantBodyShare', error)
  }

  /** Revogar carimba a hora; a linha fica, para a pessoa ver o que já autorizou. */
  async revokeBodyShare(shareId: string): Promise<void> {
    const { error } = await this.client
      .from('body_measurement_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', shareId)
    if (error) this.fail('revokeBodyShare', error)
  }

  // ── Desafios da academia ───────────────────────────────────────────────────
  private mapChallenge(row: Row): GymChallenge {
    return {
      id: row.id,
      organizationId: row.organization_id,
      title: row.title,
      description: row.description ?? null,
      metric: row.metric,
      targetValue: Number(row.target_value),
      unit: row.unit ?? 'pontos',
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      rankingEnabled: Boolean(row.ranking_enabled),
      status: row.status ?? 'ACTIVE',
      reward: row.reward ?? null,
      // PostgREST devolve a contagem do relacionamento como [{count}].
      participants: Number(row.challenge_participants?.[0]?.count ?? 0),
      createdAt: row.created_at,
    }
  }

  private static readonly DESAFIO_SELECT = '*, challenge_participants(count)'

  async listGymChallenges(organizationId: string): Promise<GymChallenge[]> {
    const rows =
      (await this.select<Row[]>(
        'listGymChallenges',
        this.client
          .from('challenges')
          .select(SupabaseDataSource.DESAFIO_SELECT)
          .eq('organization_id', organizationId)
          .order('ends_at', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapChallenge(row))
  }

  async getGymChallenge(organizationId: string, challengeId: string) {
    const row = await this.select<Row>(
      'getGymChallenge',
      this.client
        .from('challenges')
        .select(SupabaseDataSource.DESAFIO_SELECT)
        .eq('organization_id', organizationId)
        .eq('id', challengeId)
        .maybeSingle(),
    )
    return row ? this.mapChallenge(row) : null
  }

  async saveGymChallenge(input: SaveGymChallengeInput): Promise<GymChallenge> {
    const linha = {
      organization_id: input.organizationId,
      title: input.title,
      description: input.description,
      metric: input.metric,
      target_value: input.targetValue,
      unit: input.unit,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      ranking_enabled: input.rankingEnabled,
      status: input.status,
      reward: input.reward,
      created_by_staff_id: input.createdByStaffId,
    }

    const row = input.id
      ? await this.select<Row>(
          'saveGymChallenge:update',
          this.client
            .from('challenges')
            .update(linha)
            .eq('organization_id', input.organizationId)
            .eq('id', input.id)
            .select(SupabaseDataSource.DESAFIO_SELECT)
            .single(),
        )
      : await this.select<Row>(
          'saveGymChallenge:insert',
          this.client
            .from('challenges')
            .insert(linha)
            .select(SupabaseDataSource.DESAFIO_SELECT)
            .single(),
        )

    return this.mapChallenge(row!)
  }

  async listGymChallengesForStudent(
    organizationId: string,
    userProfileId: string,
  ): Promise<GymChallengeForStudent[]> {
    const [desafios, minhas] = await Promise.all([
      this.listGymChallenges(organizationId),
      this.select<Row[]>(
        'listGymChallengesForStudent:participations',
        this.client
          .from('challenge_participants')
          .select('*')
          .eq('user_profile_id', userProfileId),
      ),
    ])

    const porDesafio = new Map((minhas ?? []).map((linha) => [linha.challenge_id, linha]))

    return desafios.map((desafio) => {
      const minha = porDesafio.get(desafio.id)
      return {
        ...desafio,
        joined: Boolean(minha),
        rankingOptIn: Boolean(minha?.ranking_opt_in),
        progressValue: Number(minha?.progress_value ?? 0),
        completedAt: minha?.completed_at ?? null,
      }
    })
  }

  async joinGymChallenge(challengeId: string, rankingOptIn: boolean): Promise<void> {
    /*
     * A academia, a matrícula e a janela são conferidas no banco. O consentimento
     * do ranking viaja como argumento porque é escolha da pessoa, não do plano.
     */
    const { error } = await this.client.rpc('join_gym_challenge', {
      p_challenge_id: challengeId,
      p_ranking_opt_in: rankingOptIn,
    })
    if (error) this.fail('joinGymChallenge', error)
  }

  async getGymChallengeRanking(challengeId: string): Promise<GymChallengeRankRow[]> {
    const { data, error } = await this.client.rpc('gym_challenge_ranking', {
      p_challenge_id: challengeId,
    })
    if (error) {
      logger.warn('gymChallengeRanking', { erro: String((error as Error).message) })
      return []
    }
    return ((data as Row[]) ?? []).map((row) => ({
      position: Number(row.posicao),
      name: row.nome,
      progressValue: Number(row.progresso),
      completedAt: row.concluido_em ?? null,
    }))
  }

  // ── CRM ────────────────────────────────────────────────────────────────────
  private mapLead(row: Row): Lead {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      stage: row.stage,
      source: row.source,
      ownerStaffId: row.owner_staff_id ?? null,
      ownerName: row.staff?.user_profiles?.name ?? null,
      notes: row.notes ?? null,
      nextFollowUpAt: row.next_follow_up_at ?? null,
      convertedStudentId: row.converted_student_id ?? null,
      lostReason: row.lost_reason ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    }
  }

  private static readonly LEAD_SELECT = '*, staff:owner_staff_id(user_profiles:user_profile_id(name))'

  async listLeads(organizationId: string) {
    const rows =
      (await this.select<Row[]>(
        'listLeads',
        this.client
          .from('leads')
          .select(SupabaseDataSource.LEAD_SELECT)
          .eq('organization_id', organizationId)
          /*
           * Quem tem retorno marcado vem primeiro, do mais atrasado para o mais
           * distante. Ordenar por criação deixaria o lead de hoje no topo e o
           * contato vencido de terça no fim — e o vencido é o que esfria.
           */
          .order('next_follow_up_at', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
      )) ?? []
    return rows.map((row) => this.mapLead(row))
  }

  async getLead(organizationId: string, leadId: string) {
    const row = await this.select<Row>(
      'getLead',
      this.client
        .from('leads')
        .select(SupabaseDataSource.LEAD_SELECT)
        .eq('organization_id', organizationId)
        .eq('id', leadId)
        .maybeSingle(),
    )
    return row ? this.mapLead(row) : null
  }

  async saveLead(input: SaveLeadInput): Promise<Lead> {
    const linha = {
      organization_id: input.organizationId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      source: input.source,
      owner_staff_id: input.ownerStaffId,
      notes: input.notes,
      next_follow_up_at: input.nextFollowUpAt,
    }

    const row = input.id
      ? await this.select<Row>(
          'saveLead:update',
          this.client
            .from('leads')
            .update(linha)
            .eq('organization_id', input.organizationId)
            .eq('id', input.id)
            .select(SupabaseDataSource.LEAD_SELECT)
            .single(),
        )
      : await this.select<Row>(
          'saveLead:insert',
          this.client.from('leads').insert(linha).select(SupabaseDataSource.LEAD_SELECT).single(),
        )

    return this.mapLead(row!)
  }

  async moveLeadStage(
    organizationId: string,
    leadId: string,
    stage: LeadStage,
    lostReason: string | null,
  ) {
    /*
     * Só o status. O evento de histórico é do gatilho da 0028 — escrever aqui
     * deixaria a etapa mudada por importação ou por SQL fora do funil.
     */
    const { error } = await this.client
      .from('leads')
      .update({ stage, lost_reason: lostReason })
      .eq('organization_id', organizationId)
      .eq('id', leadId)
    if (error) this.fail('moveLeadStage', error)
  }

  async addLeadEvent(
    organizationId: string,
    leadId: string,
    kind: LeadEventKind,
    body: string,
    actorStaffId: string | null,
  ) {
    const { error } = await this.client.from('lead_events').insert({
      organization_id: organizationId,
      lead_id: leadId,
      kind,
      body,
      actor_staff_id: actorStaffId,
    })
    if (error) this.fail('addLeadEvent', error)
  }

  async listLeadEvents(organizationId: string, leadId: string): Promise<LeadEvent[]> {
    const rows =
      (await this.select<Row[]>(
        'listLeadEvents',
        this.client
          .from('lead_events')
          .select('*, staff:actor_staff_id(user_profiles:user_profile_id(name))')
          .eq('organization_id', organizationId)
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      kind: row.kind,
      fromStage: row.from_stage ?? null,
      toStage: row.to_stage ?? null,
      body: row.body ?? null,
      actorName: row.staff?.user_profiles?.name ?? null,
      createdAt: row.created_at,
    }))
  }

  async convertLead(leadId: string, planId: string | null, billingDay: number): Promise<string> {
    /*
     * Perfil, aluno, matrícula e fechamento do lead numa transação só, no
     * banco. Em três chamadas daqui, a falha da segunda deixaria aluno criado
     * com lead aberto — e ninguém percebe até ligar duas vezes para a mesma
     * pessoa.
     */
    const { data, error } = await this.client.rpc('convert_lead_to_student', {
      p_lead_id: leadId,
      p_plan_id: planId,
      p_billing_day: billingDay,
    })
    if (error) this.fail('convertLead', error)
    return String(data)
  }

  // ── Notificações ───────────────────────────────────────────────────────────
  /*
   * Sem filtro por perfil na consulta, de propósito: a política
   * `notifications_self` já restringe a linha a quem está autenticado. O
   * `userProfileId` entra como conferência — se a sessão e a política
   * discordarem, o sino fica vazio em vez de mostrar aviso de outra pessoa.
   */
  /**
   * O que esta pessoa autorizou, sobre os documentos que estão no ar.
   *
   * A junção é feita aqui e não no banco porque o lado que manda é o dos
   * documentos: consentimento que ainda não existe na tela precisa aparecer
   * como "nunca respondido", e resposta antiga a um documento que ganhou
   * versão nova precisa aparecer como desatualizada, não como aceita.
   */
  async createStaffInvite(input: {
    organizationId: string
    email: string
    role: UserRole
    jobTitle: string | null
    registrationNumber: string | null
  }): Promise<string> {
    /*
     * `security definer` no banco, e as regras que importam ficam lá: quem
     * convida precisa ser da direção, e ninguém convida acima do próprio
     * acesso. Se essa checagem morasse aqui, um caminho novo até a tabela a
     * contornaria.
     */
    const { data, error } = await this.client.rpc('create_staff_invite', {
      p_organization_id: input.organizationId,
      p_email: input.email,
      p_role: input.role,
      p_job_title: input.jobTitle,
      p_registration_number: input.registrationNumber,
    })
    if (error) this.fail('createStaffInvite', error)
    return String(data)
  }

  async listStaffInvites(organizationId: string): Promise<StaffInvite[]> {
    const rows =
      (await this.select<Row[]>(
        'listStaffInvites',
        this.client
          .from('staff_invites_public')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      email: row.email,
      role: row.role,
      jobTitle: row.job_title,
      registrationNumber: row.registration_number,
      status: row.status,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    })) satisfies StaffInvite[]
  }

  async acceptStaffInvite(token: string): Promise<string> {
    const { data, error } = await this.client.rpc('accept_staff_invite', { p_token: token })
    if (error) this.fail('acceptStaffInvite', error)
    return String(data)
  }

  async revokeStaffInvite(inviteId: string): Promise<void> {
    const { error } = await this.client.rpc('revoke_staff_invite', { p_invite_id: inviteId })
    if (error) this.fail('revokeStaffInvite', error)
  }

  async listConsents(userProfileId: string): Promise<ConsentState[]> {
    const [documentos, respostas] = await Promise.all([
      this.select<Row[]>(
        'listConsentDocuments',
        this.client
          .from('consent_documents')
          .select('*')
          .lte('effective_at', new Date().toISOString())
          .order('effective_at', { ascending: false }),
      ),
      this.select<Row[]>(
        'listConsents',
        this.client.from('consents').select('*').eq('user_profile_id', userProfileId),
      ),
    ])

    // Mais de uma versão por tipo pode estar publicada; a primeira de cada tipo
    // é a vigente, porque a consulta veio ordenada da mais recente.
    const vigentes = new Map<string, Row>()
    for (const linha of documentos ?? []) {
      if (!vigentes.has(linha.consent_type)) vigentes.set(linha.consent_type, linha)
    }

    return [...vigentes.values()].map((documento) => {
      const doTipo = (respostas ?? []).filter((r) => r.consent_type === documento.consent_type)
      const naVersao = doTipo.find((r) => r.version === documento.version)
      const anterior = doTipo.find((r) => r.accepted)

      return {
        consentType: documento.consent_type,
        version: documento.version,
        title: documento.title,
        description: documento.description,
        url: documento.url,
        required: documento.required,
        accepted: naVersao ? Boolean(naVersao.accepted) : false,
        respondedAt: naVersao ? (naVersao.accepted_at ?? naVersao.revoked_at) : null,
        revokedAt: naVersao?.revoked_at ?? null,
        outdated: !naVersao && Boolean(anterior),
      }
    }) satisfies ConsentState[]
  }

  async recordConsent(input: { consentType: ConsentType; accepted: boolean }): Promise<void> {
    /*
     * `security definer` no banco, e por dois motivos: a tabela não aceita mais
     * escrita direta (o registro que prova o consentimento não pode ser apagado
     * por quem ele documenta), e a versão do documento é resolvida lá dentro.
     */
    const { error } = await this.client.rpc('record_consent', {
      p_type: input.consentType,
      p_accepted: input.accepted,
    })
    if (error) this.fail('recordConsent', error)
  }

  async closeOwnAccount(confirmation: string): Promise<Record<string, number>> {
    const { data, error } = await this.client.rpc('close_own_account', {
      p_confirmacao: confirmation,
    })
    if (error) this.fail('closeOwnAccount', error)
    return (data ?? {}) as Record<string, number>
  }

  async listNotifications(userProfileId: string, limit = 20) {
    const rows =
      (await this.select<Row[]>(
        'listNotifications',
        this.client
          .from('notifications')
          .select('*')
          .eq('user_profile_id', userProfileId)
          .order('created_at', { ascending: false })
          .limit(limit),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      userProfileId: row.user_profile_id,
      category: row.category,
      title: row.title,
      body: row.body,
      actionUrl: row.action_url,
      readAt: row.read_at,
      createdAt: row.created_at,
    })) satisfies AppNotification[]
  }

  async countUnreadNotifications(userProfileId: string) {
    const { count, error } = await this.client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_profile_id', userProfileId)
      .is('read_at', null)

    if (error) this.fail('countUnreadNotifications', error)
    return count ?? 0
  }

  async markNotificationsRead(_userProfileId: string) {
    // A função no banco resolve o perfil pelo próprio JWT: o cliente não
    // escolhe de quem são os avisos que vai marcar.
    const { data, error } = await this.client.rpc('mark_notifications_read')
    if (error) this.fail('markNotificationsRead', error)
    return Number(data ?? 0)
  }

  // ── Desafios base ──────────────────────────────────────────────────────────
  async listBaselineChallenges() {
    const rows =
      (await this.select<Row[]>(
        'listBaselineChallenges',
        this.client
          .from('baseline_challenges')
          .select('*')
          .eq('active', true)
          .order('position', { ascending: true }),
      )) ?? []

    return rows.map((row) => ({
      code: row.code,
      title: row.title,
      description: row.description,
      metric: row.metric,
      unit: row.unit,
      targetValue: Number(row.target_value),
      minTier: row.min_tier,
      position: row.position,
    })) satisfies BaselineChallenge[]
  }

  async listChallengeEntries(userProfileId: string) {
    const rows =
      (await this.select<Row[]>(
        'listChallengeEntries',
        this.client
          .from('challenge_entries')
          .select('*')
          .eq('user_profile_id', userProfileId)
          .order('cycle', { ascending: false }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      challengeCode: row.challenge_code,
      cycle: row.cycle,
      targetValue: Number(row.target_value),
      progressValue: Number(row.progress_value),
      chosenAt: row.chosen_at,
      closedAt: row.closed_at,
    })) satisfies ChallengeEntry[]
  }

  async listChallengeMedals(userProfileId: string) {
    const rows =
      (await this.select<Row[]>(
        'listChallengeMedals',
        this.client
          .from('challenge_medals')
          .select('*')
          .eq('user_profile_id', userProfileId)
          .order('cycle', { ascending: false }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      challengeCode: row.challenge_code,
      cycle: row.cycle,
      level: row.level,
      progressValue: Number(row.progress_value),
      targetValue: Number(row.target_value),
      awardedAt: row.awarded_at,
    })) satisfies ChallengeMedal[]
  }

  /*
   * As três escritas abaixo são RPC porque a regra mora no banco: o limite do
   * plano gratuito, o desafio que é só do Pro e o nível da medalha. Deixar
   * qualquer uma delas na aplicação abriria a porta de escrever direto na
   * tabela — e a medalha de ouro viraria um POST.
   */
  async chooseBaselineChallenge(code: string) {
    const { error } = await this.client.rpc('choose_baseline_challenge', { p_code: code })
    if (error) this.fail('chooseBaselineChallenge', error)
  }

  async recordChallengeProgress(code: string, delta: number) {
    const { data, error } = await this.client.rpc('record_challenge_progress', {
      p_code: code,
      p_delta: delta,
    })
    if (error) this.fail('recordChallengeProgress', error)
    return Number(data ?? 0)
  }

  async closeOwnChallengeCycles() {
    const { data, error } = await this.client.rpc('close_own_challenge_cycles')
    if (error) this.fail('closeOwnChallengeCycles', error)
    return Number(data ?? 0)
  }

  // ── SynseRun ───────────────────────────────────────────────────────────────
  private mapActivity(row: Row): Activity {
    return {
      id: row.id,
      userProfileId: row.user_profile_id,
      organizationId: row.organization_id,
      sport: row.sport,
      status: row.status,
      title: row.title,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      elapsedSeconds: Number(row.elapsed_seconds),
      movingSeconds: Number(row.moving_seconds),
      distanceMeters: Number(row.distance_meters),
      averagePace: row.average_pace === null ? null : Number(row.average_pace),
      bestPace: row.best_pace === null ? null : Number(row.best_pace),
      averageSpeed: Number(row.average_speed),
      maxSpeed: Number(row.max_speed),
      elevationGain: Number(row.elevation_gain),
      elevationLoss: Number(row.elevation_loss),
      minAltitude: row.min_altitude === null ? null : Number(row.min_altitude),
      maxAltitude: row.max_altitude === null ? null : Number(row.max_altitude),
      calories: Number(row.calories),
      startLatitude: row.start_latitude === null ? null : Number(row.start_latitude),
      startLongitude: row.start_longitude === null ? null : Number(row.start_longitude),
      privacy: row.privacy,
      privacyZoneMeters: Number(row.privacy_zone_meters),
      createdAt: row.created_at,
    }
  }

  /**
   * Grava a atividade inteira: cabeçalho, rota e parciais.
   *
   * Em três passos, e não num só, porque o PostgREST não abre transação entre
   * chamadas. A ordem escolhida é a que menos machuca quando a rede cai no
   * meio: o cabeçalho primeiro, com `client_id` — se a rota falhar, o reenvio
   * encontra a atividade existente e completa, em vez de criar outra.
   */
  async saveActivity(input: SaveActivityInput): Promise<string> {
    const { data: cabecalho, error } = await this.client
      .from('activities')
      .upsert(
        {
          user_profile_id: input.userProfileId,
          organization_id: input.organizationId,
          sport: input.sport,
          status: 'COMPLETED',
          title: input.title,
          started_at: input.startedAt,
          ended_at: input.endedAt,
          elapsed_seconds: Math.round(input.elapsedSeconds),
          moving_seconds: Math.round(input.movingSeconds),
          distance_meters: input.distanceMeters,
          average_pace: input.averagePace,
          best_pace: input.bestPace,
          average_speed: input.averageSpeed,
          max_speed: input.maxSpeed,
          elevation_gain: input.elevationGain,
          elevation_loss: input.elevationLoss,
          min_altitude: input.minAltitude,
          max_altitude: input.maxAltitude,
          calories: input.calories,
          start_latitude: input.route[0]?.latitude ?? null,
          start_longitude: input.route[0]?.longitude ?? null,
          end_latitude: input.route[input.route.length - 1]?.latitude ?? null,
          end_longitude: input.route[input.route.length - 1]?.longitude ?? null,
          privacy: input.privacy,
          client_id: input.clientId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_profile_id,client_id' },
      )
      .select('id')
      .single()

    if (error) this.fail('saveActivity', error)
    const activityId = cabecalho.id as string

    if (input.route.length > 0) {
      // Reenvio não duplica rota: o que já estava lá sai antes de entrar de novo.
      await this.client.from('activity_points').delete().eq('activity_id', activityId)

      /*
       * Em lotes: uma corrida de uma hora tem milhares de pontos, e um único
       * insert desse tamanho estoura o limite de corpo da requisição.
       */
      const LOTE = 500
      for (let i = 0; i < input.route.length; i += LOTE) {
        const { error: erroRota } = await this.client.from('activity_points').insert(
          input.route.slice(i, i + LOTE).map((ponto) => ({
            activity_id: activityId,
            latitude: ponto.latitude,
            longitude: ponto.longitude,
            altitude: ponto.altitude,
            speed: ponto.speed,
            accuracy: ponto.accuracy,
            heading: ponto.heading,
            recorded_at: ponto.recordedAt,
            distance_from_previous: ponto.distanceFromPrevious,
            total_distance: ponto.totalDistance,
          })),
        )
        if (erroRota) this.fail('saveActivity:route', erroRota)
      }
    }

    if (input.splits.length > 0) {
      await this.client.from('activity_splits').delete().eq('activity_id', activityId)
      const { error: erroSplits } = await this.client.from('activity_splits').insert(
        input.splits.map((parcial) => ({
          activity_id: activityId,
          kilometer: parcial.kilometer,
          split_seconds: parcial.splitSeconds,
          pace_seconds: parcial.paceSeconds,
          elevation_gain: parcial.elevationGain,
        })),
      )
      if (erroSplits) this.fail('saveActivity:splits', erroSplits)
    }

    // Recorde é reconhecido pelo banco, com a rota já gravada.
    const { error: erroRecordes } = await this.client.rpc('claim_personal_records', {
      p_activity_id: activityId,
    })
    if (erroRecordes) {
      logger.warn('synse-run:records_failed', { error: String(erroRecordes.message) })
    }

    return activityId
  }

  async listActivities(
    userProfileId: string,
    filters: { sport?: SportType; since?: string; limit?: number } = {},
  ) {
    let consulta = this.client
      .from('activities')
      .select('*')
      .eq('user_profile_id', userProfileId)
      .eq('status', 'COMPLETED')
      .order('started_at', { ascending: false })
      .limit(filters.limit ?? 50)

    if (filters.sport) consulta = consulta.eq('sport', filters.sport)
    if (filters.since) consulta = consulta.gte('started_at', filters.since)

    const rows = (await this.select<Row[]>('listActivities', consulta)) ?? []
    return rows.map((row) => this.mapActivity(row))
  }

  async getActivity(activityId: string) {
    const row = await this.select<Row>(
      'getActivity',
      this.client.from('activities').select('*').eq('id', activityId).maybeSingle(),
    )
    return row ? this.mapActivity(row) : null
  }

  async getActivityRoute(activityId: string) {
    const rows =
      (await this.select<Row[]>(
        'getActivityRoute',
        this.client
          .from('activity_points')
          .select('latitude, longitude, altitude, speed, recorded_at, total_distance')
          .eq('activity_id', activityId)
          .order('recorded_at', { ascending: true }),
      )) ?? []

    return rows.map((row) => ({
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      altitude: row.altitude === null ? null : Number(row.altitude),
      speed: row.speed === null ? null : Number(row.speed),
      recordedAt: row.recorded_at,
      totalDistance: Number(row.total_distance),
    })) satisfies ActivityRoutePoint[]
  }

  async getActivitySplits(activityId: string) {
    const rows =
      (await this.select<Row[]>(
        'getActivitySplits',
        this.client
          .from('activity_splits')
          .select('*')
          .eq('activity_id', activityId)
          .order('kilometer', { ascending: true }),
      )) ?? []

    return rows.map((row) => ({
      kilometer: Number(row.kilometer),
      splitSeconds: Number(row.split_seconds),
      paceSeconds: Number(row.pace_seconds),
      elevationGain: Number(row.elevation_gain),
    })) satisfies ActivitySplit[]
  }

  async listPersonalRecords(userProfileId: string) {
    const rows =
      (await this.select<Row[]>(
        'listPersonalRecords',
        this.client
          .from('personal_records')
          .select('*')
          .eq('user_profile_id', userProfileId)
          .order('distance_meters', { ascending: true }),
      )) ?? []

    return rows.map((row) => ({
      id: row.id,
      sport: row.sport,
      distanceMeters: Number(row.distance_meters),
      seconds: Number(row.seconds),
      paceSeconds: Number(row.pace_seconds),
      activityId: row.activity_id,
      achievedAt: row.achieved_at,
    })) satisfies PersonalRecord[]
  }

  /**
   * Resumo do período.
   *
   * Somado na aplicação, e não no banco, porque o PostgREST não faz agregação
   * sem uma view — e uma view a mais para somar cinco números de algumas
   * dezenas de linhas não se paga. Quando o volume crescer, vira função.
   */
  async summarizeActivities(userProfileId: string, since: string) {
    const rows =
      (await this.select<Row[]>(
        'summarizeActivities',
        this.client
          .from('activities')
          .select('distance_meters, moving_seconds, calories, elevation_gain')
          .eq('user_profile_id', userProfileId)
          .eq('status', 'COMPLETED')
          .gte('started_at', since),
      )) ?? []

    return rows.reduce<ActivitySummary>(
      (total, row) => ({
        activities: total.activities + 1,
        distanceMeters: total.distanceMeters + Number(row.distance_meters),
        movingSeconds: total.movingSeconds + Number(row.moving_seconds),
        calories: total.calories + Number(row.calories),
        elevationGain: total.elevationGain + Number(row.elevation_gain),
      }),
      { activities: 0, distanceMeters: 0, movingSeconds: 0, calories: 0, elevationGain: 0 },
    )
  }

  async updateActivityPrivacy(activityId: string, privacy: ActivityPrivacy) {
    const { error } = await this.client
      .from('activities')
      .update({ privacy, updated_at: new Date().toISOString() })
      .eq('id', activityId)
    if (error) this.fail('updateActivityPrivacy', error)
  }

  async deleteActivity(activityId: string) {
    const { error } = await this.client.from('activities').delete().eq('id', activityId)
    if (error) this.fail('deleteActivity', error)
  }
}

/** Zero em vez de nulo: a tela mostra um número, e "—" esconde se é zero ou falha. */
function mapTotals(row: Row | undefined): WorkoutTotals {
  return {
    workouts: Number(row?.treinos ?? 0),
    sets: Number(row?.series ?? 0),
    reps: Number(row?.reps ?? 0),
    volumeKg: Number(row?.volume_kg ?? 0),
    averageDurationSeconds: row?.duracao_media_seg == null ? null : Number(row.duracao_media_seg),
    averageRestSeconds: row?.descanso_medio_seg == null ? null : Number(row.descanso_medio_seg),
    distinctExercises: Number(row?.exercicios_distintos ?? 0),
  }
}

/** Numérico do Postgres vira número, e nulo continua nulo. */
function numero(v: unknown): number | null {
  return v == null ? null : Number(v)
}

/**
 * O começo da janela escolhida na tela, em ISO — ou nulo para "tudo".
 *
 * Meses contados em meses de calendário, e não em blocos de 30 dias: quem
 * escolhe "3 meses" espera desde o mesmo dia três meses atrás.
 */
function inicioDoPeriodo(period: BodyPeriod, agora = new Date()): string | null {
  const data = new Date(agora)
  switch (period) {
    case '7d':
      data.setDate(data.getDate() - 7)
      return data.toISOString()
    case '30d':
      data.setDate(data.getDate() - 30)
      return data.toISOString()
    case '3m':
      data.setMonth(data.getMonth() - 3)
      return data.toISOString()
    case '6m':
      data.setMonth(data.getMonth() - 6)
      return data.toISOString()
    case '1a':
      data.setFullYear(data.getFullYear() - 1)
      return data.toISOString()
    default:
      return null
  }
}
