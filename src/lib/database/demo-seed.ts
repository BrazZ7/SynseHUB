/**
 * Dataset de demonstração do SynseHub.
 *
 * Determinístico (PRNG com semente fixa): o mesmo dado em todo render, em todo
 * ambiente. Serve para desenvolver e revisar o produto inteiro antes de existir
 * um Supabase provisionado — e para o `db:seed` popular o banco real.
 *
 * Nenhuma senha real é gerada. As contas de demonstração são criadas pelo
 * script de seed via convite/magic link (ver `scripts/db-seed.mjs`).
 */

import type {
  Activity,
  ActivityRoutePoint,
  ActivitySplit,
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
  PersonalRecord,
  OrganizationMember,
  PaymentAccount,
  PaymentSplit,
  SportType,
  Student,
  UserProfile,
  WorkoutAssignment,
  WorkoutExercise,
  WorkoutLog,
  WorkoutPlan,
} from '@/types/domain'
import { calculateSplit } from '@/lib/payments/split'
import { roundMoney } from '@/lib/utils'

/** Identificador da academia de demonstração. Constante pura. */
export const DEMO_ORG_ID = 'org_0001'

type StaffSeed = {
  id: string
  name: string
  role: OrganizationMember['role']
  jobTitle: string
  registration?: string
}
export type DemoStaff = {
  id: string
  organizationId: string
  userProfileId: string
  name: string
  email: string
  role: OrganizationMember['role']
  jobTitle: string
  registrationNumber: string | null
  status: 'ACTIVE'
}
/** Alunos com histórico completo (treinos, cargas, avaliações). */
export const DETAILED_STUDENT_COUNT = 20

/** Nome, grupo, aparelho e os apelidos pelos quais o exercício é procurado. */
type ExerciseSeed = [string, Exercise['muscleGroup'], string, string[]?]

export type DemoDataset = ReturnType<typeof buildDemoDataset>

/** Gera o dataset completo. Chamado uma única vez por processo. */
function buildDemoDataset() {
  // ── PRNG determinístico ──────────────────────────────────────────────────────
  function mulberry32(seed: number) {
    let a = seed
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const rand = mulberry32(20260910)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]
  const between = (min: number, max: number) => min + rand() * (max - min)
  const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))

  /** IDs estáveis e legíveis — em produção são UUIDs do Postgres. */
  const id = (prefix: string, n: number | string) => `${prefix}_${String(n).padStart(4, '0')}`

  // ── Referência temporal ──────────────────────────────────────────────────────
  const DEMO_NOW = new Date()
  const YEAR = DEMO_NOW.getFullYear()
  const MONTH = DEMO_NOW.getMonth()

  const isoDate = (d: Date) => d.toISOString().slice(0, 10)
  const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  // ── Vocabulário ──────────────────────────────────────────────────────────────
  const FIRST_NAMES = [
    'Ana',
    'Beatriz',
    'Camila',
    'Daniela',
    'Eduarda',
    'Fernanda',
    'Gabriela',
    'Helena',
    'Isabela',
    'Juliana',
    'Larissa',
    'Mariana',
    'Natália',
    'Patrícia',
    'Rafaela',
    'Sofia',
    'Tatiane',
    'Vanessa',
    'André',
    'Bruno',
    'Carlos',
    'Diego',
    'Eduardo',
    'Felipe',
    'Gustavo',
    'Henrique',
    'Igor',
    'João',
    'Lucas',
    'Marcelo',
    'Nicolas',
    'Otávio',
    'Paulo',
    'Rafael',
    'Thiago',
    'Vinícius',
    'Emerson',
    'Letícia',
    'Renata',
    'Murilo',
  ]

  const LAST_NAMES = [
    'Silva',
    'Santos',
    'Oliveira',
    'Souza',
    'Rodrigues',
    'Ferreira',
    'Alves',
    'Pereira',
    'Lima',
    'Gomes',
    'Ribeiro',
    'Carvalho',
    'Almeida',
    'Lopes',
    'Soares',
    'Fernandes',
    'Vieira',
    'Barbosa',
    'Rocha',
    'Dias',
    'Nascimento',
    'Moreira',
    'Cardoso',
    'Teixeira',
    'Correia',
    'Mendes',
    'Araújo',
    'Braz',
    'Monteiro',
    'Freitas',
  ]

  const GOALS = [
    'Emagrecimento',
    'Hipertrofia',
    'Condicionamento',
    'Saúde e bem-estar',
    'Performance',
    'Reabilitação',
    'Qualidade de vida',
  ]

  // ── Synse ID determinístico ──────────────────────────────────────────────────
  const SYNSE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  function demoSynseId() {
    let out = ''
    for (let i = 0; i < 8; i += 1) out += SYNSE_ALPHABET[Math.floor(rand() * SYNSE_ALPHABET.length)]
    return `SYN-${out}`
  }

  function phone() {
    return `119${intBetween(10000000, 99999999)}`
  }

  function emailFor(name: string, index: number) {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z]+/g, '.')
    return `${slug}${index}@exemplo.com.br`
  }

  // ── Organização ──────────────────────────────────────────────────────────────
  // DEMO_ORG_ID vive no escopo do módulo: é uma constante pura.

  const demoOrganization: Organization = {
    id: DEMO_ORG_ID,
    name: 'Academia Alpha',
    slug: 'academia-alpha',
    type: 'GYM',
    legalName: 'Alpha Saúde e Performance LTDA',
    taxId: null,
    // Demonstração não abre subconta: o provedor é simulado.
    postalCode: null,
    address: null,
    addressNumber: null,
    district: null,
    phone: null,
    companyType: null,
    monthlyRevenue: null,
    inviteCode: null,
    logoUrl: null,
    city: 'São Paulo',
    state: 'SP',
    timezone: 'America/Sao_Paulo',
    hubPlan: 'PREMIUM',
    status: 'ACTIVE',
    onboardingCompleted: true,
    createdAt: new Date(YEAR - 2, 2, 14).toISOString(),
  }

  /** Segunda organização: prova viva do isolamento multi-tenant. */
  const demoSecondOrganization: Organization = {
    id: 'org_0002',
    name: 'Studio Vitta',
    slug: 'studio-vitta',
    type: 'STUDIO',
    legalName: 'Vitta Studio de Treinamento LTDA',
    taxId: null,
    // Demonstração não abre subconta: o provedor é simulado.
    postalCode: null,
    address: null,
    addressNumber: null,
    district: null,
    phone: null,
    companyType: null,
    monthlyRevenue: null,
    inviteCode: null,
    logoUrl: null,
    city: 'Campinas',
    state: 'SP',
    timezone: 'America/Sao_Paulo',
    hubPlan: 'PRO',
    status: 'ACTIVE',
    onboardingCompleted: true,
    createdAt: new Date(YEAR - 1, 7, 2).toISOString(),
  }

  const demoBillingSettings: OrganizationBillingSettings = {
    organizationId: DEMO_ORG_ID,
    platformFeePercentage: 2,
    platformFixedFee: 0,
    paymentProviderFeeStrategy: 'ORGANIZATION_ABSORBS',
  }

  const demoPaymentAccount: PaymentAccount = {
    id: 'pacc_0001',
    organizationId: DEMO_ORG_ID,
    provider: 'mock',
    providerAccountId: 'acc_demo_alpha',
    status: 'ACTIVE',
    onboardingStatus: 'APPROVED',
    createdAt: new Date(YEAR - 1, 0, 12).toISOString(),
  }

  // ── Equipe ───────────────────────────────────────────────────────────────────

  const STAFF_SEEDS: StaffSeed[] = [
    { id: 'staff_0001', name: 'Emerson Braz', role: 'OWNER', jobTitle: 'Proprietário' },
    { id: 'staff_0002', name: 'Marina Duarte', role: 'MANAGER', jobTitle: 'Gerente operacional' },
    {
      id: 'staff_0003',
      name: 'Rafael Nunes',
      role: 'TRAINER',
      jobTitle: 'Professor',
      registration: 'CREF 012345-G/SP',
    },
    {
      id: 'staff_0004',
      name: 'Carolina Prado',
      role: 'TRAINER',
      jobTitle: 'Professora',
      registration: 'CREF 023456-G/SP',
    },
    {
      id: 'staff_0005',
      name: 'Bianca Rezende',
      role: 'NUTRITIONIST',
      jobTitle: 'Nutricionista',
      registration: 'CRN 34567',
    },
    { id: 'staff_0006', name: 'Lucas Ferraz', role: 'RECEPTIONIST', jobTitle: 'Recepção' },
  ]

  const demoUserProfiles: UserProfile[] = []
  const demoOrganizationMembers: OrganizationMember[] = []
  const demoStaff: DemoStaff[] = []

  STAFF_SEEDS.forEach((seed, index) => {
    const profileId = id('prof_staff', index + 1)
    const email = emailFor(seed.name, index + 1)
    demoUserProfiles.push({
      id: profileId,
      authUserId: null,
      synseId: demoSynseId(),
      name: seed.name,
      email,
      avatarUrl: null,
      phone: phone(),
      birthDate: null,
      gender: null,
      createdAt: demoOrganization.createdAt,
    })
    demoOrganizationMembers.push({
      id: id('member', index + 1),
      organizationId: DEMO_ORG_ID,
      userProfileId: profileId,
      role: seed.role,
      status: 'ACTIVE',
      jobTitle: seed.jobTitle,
      createdAt: demoOrganization.createdAt,
    })
    demoStaff.push({
      id: seed.id,
      organizationId: DEMO_ORG_ID,
      userProfileId: profileId,
      name: seed.name,
      email,
      role: seed.role,
      jobTitle: seed.jobTitle,
      registrationNumber: seed.registration ?? null,
      status: 'ACTIVE',
    })
  })

  /** Conta Synse (plataforma). Não pertence a nenhuma academia. */
  const superAdminProfileId = 'prof_super_0001'
  demoUserProfiles.push({
    id: superAdminProfileId,
    authUserId: null,
    synseId: demoSynseId(),
    name: 'Synse Plataforma',
    email: 'admin@synse.com.br',
    avatarUrl: null,
    phone: null,
    birthDate: null,
    gender: null,
    createdAt: demoOrganization.createdAt,
  })
  demoOrganizationMembers.push({
    id: 'member_super_0001',
    organizationId: DEMO_ORG_ID,
    userProfileId: superAdminProfileId,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    jobTitle: 'Plataforma Synse',
    createdAt: demoOrganization.createdAt,
  })

  const TRAINER_IDS = demoStaff.filter((s) => s.role === 'TRAINER').map((s) => s.id)

  // ── Planos ───────────────────────────────────────────────────────────────────
  const demoPlans: MembershipPlan[] = [
    {
      id: 'plan_0001',
      organizationId: DEMO_ORG_ID,
      name: 'Mensal',
      description: 'Acesso livre à musculação e às aulas coletivas, sem fidelidade.',
      price: 109.9,
      billingCycle: 'MONTHLY',
      enrollmentFee: 49.9,
      weeklyAccessDays: 7,
      benefits: ['Musculação', 'Aulas coletivas', 'Avaliação física trimestral'],
      autoCharge: true,
      status: 'ACTIVE',
      createdAt: demoOrganization.createdAt,
    },
    {
      id: 'plan_0002',
      organizationId: DEMO_ORG_ID,
      name: 'Trimestral',
      description: 'Três meses com desconto e acompanhamento de treino.',
      price: 94.9,
      billingCycle: 'QUARTERLY',
      enrollmentFee: 0,
      weeklyAccessDays: 7,
      benefits: ['Musculação', 'Aulas coletivas', 'Plano de treino personalizado'],
      autoCharge: true,
      status: 'ACTIVE',
      createdAt: demoOrganization.createdAt,
    },
    {
      id: 'plan_0003',
      organizationId: DEMO_ORG_ID,
      name: 'Semestral',
      description: 'Seis meses com avaliação física a cada ciclo.',
      price: 84.9,
      billingCycle: 'SEMIANNUAL',
      enrollmentFee: 0,
      weeklyAccessDays: 7,
      benefits: [
        'Musculação',
        'Aulas coletivas',
        'Avaliação física bimestral',
        'Acesso ao Synse App',
      ],
      autoCharge: true,
      status: 'ACTIVE',
      createdAt: demoOrganization.createdAt,
    },
    {
      id: 'plan_0004',
      organizationId: DEMO_ORG_ID,
      name: 'Anual',
      description: 'O melhor custo por mês. Inclui Synse+ durante a vigência.',
      price: 74.9,
      billingCycle: 'ANNUAL',
      enrollmentFee: 0,
      weeklyAccessDays: 7,
      benefits: ['Musculação', 'Aulas coletivas', 'Synse+ incluso', 'Avaliação física mensal'],
      autoCharge: true,
      status: 'ACTIVE',
      createdAt: demoOrganization.createdAt,
    },
    {
      id: 'plan_0005',
      organizationId: DEMO_ORG_ID,
      name: 'Personalizado',
      description: 'Acompanhamento individual com professor dedicado.',
      price: 159.9,
      billingCycle: 'MONTHLY',
      enrollmentFee: 0,
      weeklyAccessDays: 3,
      benefits: ['Personal trainer', 'Plano nutricional', 'Synse+ incluso'],
      autoCharge: true,
      status: 'ACTIVE',
      createdAt: demoOrganization.createdAt,
    },
  ]

  const PLAN_DISTRIBUTION: Array<{ planId: string; weight: number }> = [
    { planId: 'plan_0001', weight: 30 },
    { planId: 'plan_0002', weight: 25 },
    { planId: 'plan_0003', weight: 20 },
    { planId: 'plan_0004', weight: 15 },
    { planId: 'plan_0005', weight: 10 },
  ]

  function weightedPlan(): MembershipPlan {
    const total = PLAN_DISTRIBUTION.reduce((sum, p) => sum + p.weight, 0)
    let roll = rand() * total
    for (const entry of PLAN_DISTRIBUTION) {
      roll -= entry.weight
      if (roll <= 0) return demoPlans.find((p) => p.id === entry.planId)!
    }
    return demoPlans[0]
  }

  // ── Alunos ───────────────────────────────────────────────────────────────────
  /**
   * 500 alunos: 478 adimplentes, 22 inadimplentes — os números do painel são
   * calculados a partir destes registros, nunca escritos à mão.
   * Os 20 primeiros têm histórico completo (treinos, avaliações, logs).
   */
  const ACTIVE_STUDENTS = 478
  const OVERDUE_STUDENTS = 22
  const INACTIVE_STUDENTS = 34
  const TOTAL_STUDENTS = ACTIVE_STUDENTS + OVERDUE_STUDENTS + INACTIVE_STUDENTS

  const demoStudents: Student[] = []
  const demoMemberships: Membership[] = []

  for (let i = 0; i < TOTAL_STUDENTS; i += 1) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
    const profileId = id('prof', i + 1)
    const studentId = id('stu', i + 1)
    const synseId = demoSynseId()
    const plan = weightedPlan()

    const status: Student['status'] =
      i < ACTIVE_STUDENTS
        ? 'ACTIVE'
        : i < ACTIVE_STUDENTS + OVERDUE_STUDENTS
          ? 'OVERDUE'
          : 'INACTIVE'

    // Matrículas espalhadas nos últimos 24 meses, levemente concentradas nos
    // meses recentes — o expoente calibra ~25 novas matrículas por mês.
    const monthsAgo = Math.floor(Math.pow(rand(), 1.05) * 24)
    const enrolledAt = new Date(YEAR, MONTH - monthsAgo, intBetween(1, 28))

    demoUserProfiles.push({
      id: profileId,
      authUserId: null,
      synseId,
      name,
      email: emailFor(name, i + 1),
      avatarUrl: null,
      phone: phone(),
      birthDate: isoDate(new Date(YEAR - intBetween(18, 58), intBetween(0, 11), intBetween(1, 28))),
      gender: null,
      createdAt: enrolledAt.toISOString(),
    })

    const membershipId = id('mbr', i + 1)
    // Quem saiu, saiu em algum mês dos últimos 12 — nunca antes de se matricular.
    const cancelledAt =
      status === 'INACTIVE'
        ? isoDate(
            new Date(
              YEAR,
              Math.max(MONTH - Math.min(11, monthsAgo), MONTH - 11) +
                intBetween(0, 11 - Math.min(11, 11)),
              intBetween(1, 28),
            ),
          )
        : null

    demoStudents.push({
      id: studentId,
      organizationId: DEMO_ORG_ID,
      userProfileId: profileId,
      synseId,
      name,
      taxId: null,
      email: emailFor(name, i + 1),
      phone: phone(),
      avatarUrl: null,
      birthDate: null,
      status,
      goal: pick(GOALS),
      enrolledAt: isoDate(enrolledAt),
      cancelledAt,
      trainerId: pick(TRAINER_IDS),
      membershipId: status === 'INACTIVE' ? null : membershipId,
      notes: null,
    })

    if (status !== 'INACTIVE') {
      demoMemberships.push({
        id: membershipId,
        organizationId: DEMO_ORG_ID,
        studentId,
        planId: plan.id,
        startedAt: isoDate(enrolledAt),
        endsAt: null,
        billingDay: intBetween(1, 28),
        status: 'ACTIVE',
        price: plan.price,
      })
    }
  }

  const membershipByStudent = new Map(demoMemberships.map((m) => [m.studentId, m]))

  // ── Cobranças ────────────────────────────────────────────────────────────────
  const demoCharges: Charge[] = []
  const demoSplits: PaymentSplit[] = []

  let chargeSeq = 0

  function pushCharge(input: {
    student: Student
    membership: Membership
    competence: Date
    status: Charge['status']
    method: Charge['paymentMethod']
  }) {
    chargeSeq += 1
    const { student, membership, competence, status, method } = input
    const dueDate = new Date(competence.getFullYear(), competence.getMonth(), membership.billingDay)
    const reference = `${membership.id}:${competence.getFullYear()}-${String(competence.getMonth() + 1).padStart(2, '0')}`

    const paidAt =
      status === 'PAID'
        ? new Date(dueDate.getTime() - intBetween(0, 6) * 86_400_000).toISOString()
        : null

    const charge: Charge = {
      id: id('chg', chargeSeq),
      organizationId: DEMO_ORG_ID,
      studentId: student.id,
      membershipId: membership.id,
      providerChargeId: `mockchg_${chargeSeq}`,
      description: `Mensalidade ${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(competence)}`,
      amount: membership.price,
      dueDate: isoDate(dueDate),
      paymentMethod: method,
      status,
      paidAt,
      billingReference: reference,
      createdAt: new Date(dueDate.getTime() - 10 * 86_400_000).toISOString(),
      updatedAt: (paidAt ?? new Date(dueDate).toISOString()) as string,
    }
    demoCharges.push(charge)

    if (status === 'PAID') {
      const providerFee = roundMoney(charge.amount * 0.0099 + 0.49)
      const split = calculateSplit(charge.amount, demoBillingSettings, providerFee)
      demoSplits.push({
        id: id('split', chargeSeq),
        chargeId: charge.id,
        organizationAmount: split.organizationAmount,
        platformAmount: split.platformAmount,
        platformPercentage: split.platformPercentage,
        providerFee: split.providerFee,
        status: 'SETTLED',
      })
    }
    return charge
  }

  const METHODS: Charge['paymentMethod'][] = [
    'PIX',
    'CREDIT_CARD_RECURRING',
    'BOLETO',
    'CREDIT_CARD',
  ]

  /** Referência de competência: `offset` 0 = mês corrente. */
  function competenceMonth(offset: number) {
    return new Date(YEAR, MONTH + offset, 1)
  }

  // 12 meses de histórico + o mês corrente.
  for (const student of demoStudents) {
    const membership = membershipByStudent.get(student.id)
    if (!membership) continue

    const enrolled = new Date(student.enrolledAt)
    const method = pick(METHODS)

    for (let offset = -11; offset <= 0; offset += 1) {
      const competence = competenceMonth(offset)
      if (competence < new Date(enrolled.getFullYear(), enrolled.getMonth(), 1)) continue

      if (offset === 0) {
        // Mês corrente define os KPIs do dashboard.
        pushCharge({
          student,
          membership,
          competence,
          status: student.status === 'OVERDUE' ? 'OVERDUE' : 'PAID',
          method,
        })
      } else if (offset >= -2) {
        // Só quem está inadimplente hoje pode arrastar meses anteriores. Se um
        // aluno em dia carregasse cobrança vencida, a contagem por status e a
        // contagem por cobrança divergiriam — e as duas telas mostrariam
        // números diferentes para a mesma pergunta.
        const dragsDebt = student.status === 'OVERDUE' && rand() < (offset === -1 ? 0.35 : 0.15)
        pushCharge({
          student,
          membership,
          competence,
          status: dragsDebt ? 'OVERDUE' : 'PAID',
          method,
        })
      } else {
        // Além de 90 dias a academia regulariza ou baixa a cobrança: não faz
        // sentido manter dívida de um ano marcada como "em atraso".
        pushCharge({
          student,
          membership,
          competence,
          status: rand() < 0.015 ? 'CANCELLED' : 'PAID',
          method,
        })
      }
    }

    // Próximo vencimento em aberto.
    pushCharge({
      student,
      membership,
      competence: competenceMonth(1),
      status: 'PENDING',
      method,
    })
  }

  // ── Check-ins ────────────────────────────────────────────────────────────────
  const demoCheckIns: CheckIn[] = []
  const activeStudents = demoStudents.filter((s) => s.status === 'ACTIVE' || s.status === 'OVERDUE')

  /** Academia aberta das 5h às 23h. */
  const OPENING_HOUR = 5
  const CLOSING_HOUR = 23
  const FULL_DAY_CHECKINS = 139

  /**
   * Quanto do dia de funcionamento já passou (0 a 1).
   * O dia corrente recebe apenas a fatia proporcional de check-ins — nenhum
   * registro é criado no futuro. Fora do horário de funcionamento o piso mantém
   * o painel com dados, em vez de parecer quebrado de madrugada.
   */
  function elapsedDayFraction(now: Date) {
    const minutes = now.getHours() * 60 + now.getMinutes()
    const opening = OPENING_HOUR * 60
    const closing = CLOSING_HOUR * 60
    if (minutes <= opening) return 0.08
    if (minutes >= closing) return 1
    return Math.max(0.08, (minutes - opening) / (closing - opening))
  }

  let checkInSeq = 0
  for (let dayOffset = 34; dayOffset >= 0; dayOffset -= 1) {
    const day = dayStart(addDays(DEMO_NOW, -dayOffset))
    const weekday = day.getDay()
    // Domingo movimenta menos; segunda e quarta são os picos.
    const factor =
      weekday === 0 ? 0.35 : weekday === 6 ? 0.6 : weekday === 1 || weekday === 3 ? 1.1 : 1
    const isToday = dayOffset === 0

    const count = isToday
      ? Math.round(FULL_DAY_CHECKINS * elapsedDayFraction(DEMO_NOW))
      : Math.round(126 * factor * between(0.9, 1.1))

    // No dia corrente nada pode cair no futuro.
    const nowMinute = DEMO_NOW.getHours() * 60 + DEMO_NOW.getMinutes()
    const latestMinute = isToday ? nowMinute : CLOSING_HOUR * 60

    for (let i = 0; i < count; i += 1) {
      checkInSeq += 1
      const student = pick(activeStudents)

      // Três picos: manhã, almoço e fim de tarde.
      const preferred =
        rand() < 0.45 ? intBetween(6, 9) : rand() < 0.7 ? intBetween(12, 14) : intBetween(17, 21)
      const preferredMinute = preferred * 60 + intBetween(0, 59)

      // Se o pico ainda não chegou hoje, o registro vai para as horas já vividas.
      const minute =
        preferredMinute <= latestMinute
          ? preferredMinute
          : intBetween(Math.max(0, latestMinute - 180), Math.max(0, latestMinute - 1))

      const at = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(minute / 60),
        minute % 60,
      )
      if (at > DEMO_NOW) continue

      demoCheckIns.push({
        id: id('chk', checkInSeq),
        organizationId: DEMO_ORG_ID,
        studentId: student.id,
        checkedInAt: at.toISOString(),
        method: rand() < 0.8 ? 'QR_CODE' : 'MANUAL',
        deviceId: null,
      })
    }
  }
  demoCheckIns.sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))

  // ── Biblioteca de exercícios ─────────────────────────────────────────────────
  const EXERCISE_SEEDS: ExerciseSeed[] = [
    ['Supino reto com barra', 'CHEST', 'Barra', ['supino reto', 'bench press']],
    ['Supino inclinado com halteres', 'CHEST', 'Halteres', ['inclinado', 'incline press']],
    ['Crucifixo na máquina', 'CHEST', 'Máquina', ['voador', 'peck deck']],
    ['Crossover', 'CHEST', 'Polia', ['cross over', 'polia alta']],
    ['Puxada frente', 'BACK', 'Polia', ['pulley frente', 'puxada frontal', 'lat pulldown']],
    ['Remada curvada', 'BACK', 'Barra', ['remada livre', 'barbell row']],
    ['Remada unilateral', 'BACK', 'Halteres', ['serrote']],
    ['Pulldown', 'BACK', 'Polia', ['pull down', 'puxada']],
    ['Agachamento livre', 'LEGS', 'Barra', ['squat', 'agacho']],
    ['Leg press 45°', 'LEGS', 'Máquina', ['leg press', 'leg 45']],
    ['Cadeira extensora', 'LEGS', 'Máquina', ['extensora', 'leg extension']],
    ['Mesa flexora', 'LEGS', 'Máquina', ['flexora', 'leg curl']],
    ['Panturrilha em pé', 'LEGS', 'Máquina', ['gêmeos', 'calf raise']],
    ['Desenvolvimento militar', 'SHOULDERS', 'Barra', ['desenvolvimento', 'military press']],
    ['Elevação lateral', 'SHOULDERS', 'Halteres', ['lateral', 'lateral raise']],
    ['Elevação frontal', 'SHOULDERS', 'Halteres', ['frontal', 'front raise']],
    ['Rosca direta', 'ARMS', 'Barra', ['bíceps', 'curl']],
    ['Rosca alternada', 'ARMS', 'Halteres', ['alternada', 'rosca martelo']],
    ['Tríceps corda', 'ARMS', 'Polia', ['corda', 'tríceps pulley']],
    ['Tríceps testa', 'ARMS', 'Barra', ['testa', 'skull crusher']],
    ['Prancha isométrica', 'CORE', 'Peso corporal', ['prancha', 'plank']],
    ['Abdominal supra', 'CORE', 'Peso corporal', ['abdominal', 'crunch']],
    ['Elevação de pernas', 'CORE', 'Peso corporal', ['abdominal infra']],
    ['Hip thrust', 'GLUTES', 'Barra', ['elevação de quadril', 'glúteo']],
    ['Cadeira abdutora', 'GLUTES', 'Máquina', ['abdutora', 'abdução']],
    ['Esteira — corrida contínua', 'CARDIO', 'Esteira', ['esteira', 'corrida']],
    ['Bike ergométrica', 'CARDIO', 'Bicicleta', ['bicicleta', 'bike']],
    ['Remo ergômetro', 'CARDIO', 'Remo', ['remo', 'rowing']],
    ['Burpee', 'FULL_BODY', 'Peso corporal', ['burpees']],
    ['Levantamento terra', 'FULL_BODY', 'Barra', ['terra', 'deadlift']],
  ]

  const demoExercises: Exercise[] = EXERCISE_SEEDS.map(
    ([name, muscleGroup, equipment, aliases], index) => ({
      id: id('exr', index + 1),
      organizationId: null,
      name,
      muscleGroup,
      equipment,
      description: null,
      videoUrl: null,
      imageUrl: null,
      /*
       * A demonstração fica sem a classificação fina de propósito — músculo
       * alvo, padrão de movimento, mecânica —, que vive no banco a partir da
       * 0021. Os **apelidos** são a exceção: sem eles a busca por "extensora"
       * volta vazia na demonstração, e quem está avaliando o produto conclui
       * que a busca não funciona. Foi medido, aconteceu.
       */
      slug: null,
      primaryMuscle: null,
      secondaryMuscles: [],
      region: null,
      pattern: null,
      mechanics: null,
      utility: null,
      equipmentType: null,
      unilateral: false,
      level: null,
      aliases: aliases ?? [],
    }),
  )

  const byGroup = (group: Exercise['muscleGroup']) =>
    demoExercises.filter((e) => e.muscleGroup === group)

  // ── Treinos ──────────────────────────────────────────────────────────────────
  const demoWorkoutPlans: WorkoutPlan[] = []
  const demoWorkoutExercises: WorkoutExercise[] = []
  const demoWorkoutAssignments: WorkoutAssignment[] = []
  const demoWorkoutLogs: WorkoutLog[] = []

  const WORKOUT_TEMPLATES: Array<{
    split: string
    name: string
    goal: string
    groups: Exercise['muscleGroup'][]
  }> = [
    {
      split: 'A',
      name: 'Treino A — Peito e Tríceps',
      goal: 'Hipertrofia',
      groups: ['CHEST', 'CHEST', 'CHEST', 'ARMS', 'ARMS'],
    },
    {
      split: 'B',
      name: 'Treino B — Costas e Bíceps',
      goal: 'Hipertrofia',
      groups: ['BACK', 'BACK', 'BACK', 'ARMS', 'ARMS'],
    },
    {
      split: 'C',
      name: 'Treino C — Pernas e Glúteos',
      goal: 'Hipertrofia',
      groups: ['LEGS', 'LEGS', 'LEGS', 'GLUTES', 'CORE'],
    },
    {
      split: 'D',
      name: 'Treino D — Ombros e Core',
      goal: 'Condicionamento',
      groups: ['SHOULDERS', 'SHOULDERS', 'CORE', 'CORE', 'CARDIO'],
    },
    {
      split: 'FB',
      name: 'Full Body — Iniciante',
      goal: 'Condicionamento',
      groups: ['FULL_BODY', 'LEGS', 'CHEST', 'BACK', 'CARDIO'],
    },
  ]

  let workoutExerciseSeq = 0
  WORKOUT_TEMPLATES.forEach((template, index) => {
    const planId = id('wkp', index + 1)
    demoWorkoutPlans.push({
      id: planId,
      organizationId: DEMO_ORG_ID,
      name: template.name,
      goal: template.goal,
      splitLabel: template.split,
      createdByStaffId: pick(TRAINER_IDS),
      status: 'PUBLISHED',
      createdAt: new Date(YEAR, MONTH - 3, 4).toISOString(),
    })

    template.groups.forEach((group, position) => {
      const options = byGroup(group)
      if (options.length === 0) return
      workoutExerciseSeq += 1
      demoWorkoutExercises.push({
        id: id('wke', workoutExerciseSeq),
        workoutPlanId: planId,
        exerciseId: options[position % options.length].id,
        order: position + 1,
        sets: intBetween(3, 4),
        reps: pick(['8-10', '10-12', '12-15', '15']),
        restSeconds: pick([45, 60, 90]),
        suggestedLoad:
          group === 'CARDIO' || group === 'CORE' ? null : roundMoney(intBetween(10, 60)),
        notes: null,
      })
    })
  })

  // Os 20 alunos detalhados recebem treino, histórico de carga e avaliações.
  const detailedStudents = demoStudents.slice(0, DETAILED_STUDENT_COUNT)

  let assignmentSeq = 0
  let logSeq = 0
  const demoAssessments: Assessment[] = []
  let assessmentSeq = 0

  detailedStudents.forEach((student, studentIndex) => {
    const plans = demoWorkoutPlans.slice(0, 3)
    plans.forEach((plan) => {
      assignmentSeq += 1
      demoWorkoutAssignments.push({
        id: id('wka', assignmentSeq),
        organizationId: DEMO_ORG_ID,
        workoutPlanId: plan.id,
        studentId: student.id,
        assignedAt: new Date(YEAR, MONTH - 2, 10).toISOString(),
        validUntil: isoDate(new Date(YEAR, MONTH + 2, 10)),
      })
    })

    // 12 semanas de progressão de carga no supino reto.
    const bench = demoWorkoutExercises.find((we) => we.workoutPlanId === plans[0].id)
    let load = 30 + studentIndex * 1.5
    for (let week = 11; week >= 0; week -= 1) {
      load = roundMoney(load + between(0.5, 2.5))
      logSeq += 1
      demoWorkoutLogs.push({
        id: id('wkl', logSeq),
        organizationId: DEMO_ORG_ID,
        studentId: student.id,
        workoutPlanId: plans[0].id,
        workoutExerciseId: bench?.id ?? null,
        performedAt: addDays(DEMO_NOW, -week * 7).toISOString(),
        load,
        reps: intBetween(8, 12),
        sets: 4,
        rpe: intBetween(6, 9),
        notes: null,
      })
    }

    // Avaliações trimestrais.
    let weight = between(58, 96)
    /*
     * Altura em centímetros, como no banco de verdade. A demonstração usava
     * metros e calculava o IMC com outra fórmula: dois lugares dizendo alturas
     * diferentes para a mesma pessoa, dependendo de onde se olhasse.
     */
    const height = roundMoney(between(158, 192))
    for (let quarter = 3; quarter >= 0; quarter -= 1) {
      weight = roundMoney(weight - between(-0.4, 1.4))
      assessmentSeq += 1
      demoAssessments.push({
        id: id('asm', assessmentSeq),
        organizationId: DEMO_ORG_ID,
        studentId: student.id,
        assessedByStaffId: student.trainerId,
        assessedAt: isoDate(new Date(YEAR, MONTH - quarter * 3, 12)),
        weight,
        height,
        bmi: roundMoney(weight / (height / 100) ** 2),
        bodyFatPercentage: roundMoney(between(12, 32)),
        chest: roundMoney(between(86, 112)),
        arm: roundMoney(between(28, 42)),
        waist: roundMoney(between(66, 98)),
        abdomen: roundMoney(between(70, 104)),
        hip: roundMoney(between(88, 112)),
        thigh: roundMoney(between(48, 66)),
        calf: roundMoney(between(32, 42)),
        notes: null,
        /*
         * A demonstração não simula dobras cutâneas: o percentual vem
         * sorteado, e inventar sete medidas que "explicassem" esse número
         * daria a impressão de uma avaliação que nunca foi feita.
         */
        protocol: 'MANUAL',
        protocolSex: null,
        ageYears: null,
        bodyDensity: null,
        skinfoldChest: null,
        skinfoldAxilla: null,
        skinfoldTriceps: null,
        skinfoldSubscapular: null,
        skinfoldAbdominal: null,
        skinfoldSuprailiac: null,
        skinfoldThigh: null,
      })
    }
  })

  // ── CRM ──────────────────────────────────────────────────────────────────────
  const LEAD_SOURCES: Lead['source'][] = [
    'INSTAGRAM',
    'GOOGLE',
    'REFERRAL',
    'WEBSITE',
    'WHATSAPP',
    'OTHER',
  ]
  const LEAD_STAGES: Lead['stage'][] = [
    'NEW',
    'CONTACTED',
    'TRIAL_CLASS',
    'PROPOSAL',
    'ENROLLED',
    'LOST',
  ]

  const demoLeads: Lead[] = Array.from({ length: 28 }, (_, index) => {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
    return {
      id: id('lead', index + 1),
      organizationId: DEMO_ORG_ID,
      name,
      phone: phone(),
      email: emailFor(name, 900 + index),
      stage: pick(LEAD_STAGES),
      source: pick(LEAD_SOURCES),
      ownerStaffId: null,
      ownerName: null,
      notes: null,
      /*
       * Dois em cada três têm retorno marcado, alguns já vencidos. É o que faz
       * a coluna "atrasados" da demonstração ter o que mostrar — funil sem
       * contato vencido não parece um funil de verdade.
       */
      nextFollowUpAt: index % 3 === 0 ? null : addDays(DEMO_NOW, intBetween(-6, 10)).toISOString(),
      convertedStudentId: null,
      lostReason: null,
      createdAt: addDays(DEMO_NOW, -intBetween(0, 45)).toISOString(),
      updatedAt: addDays(DEMO_NOW, -intBetween(0, 10)).toISOString(),
    }
  })

  // ── Régua de cobrança ────────────────────────────────────────────────────────
  const demoCollectionRules: CollectionRule[] = [
    {
      id: 'rule_1',
      organizationId: DEMO_ORG_ID,
      offsetDays: -3,
      channels: ['PUSH', 'EMAIL'],
      template: 'Sua mensalidade vence em 3 dias.',
      enabled: true,
    },
    {
      id: 'rule_2',
      organizationId: DEMO_ORG_ID,
      offsetDays: 0,
      channels: ['PUSH'],
      template: 'Sua mensalidade vence hoje.',
      enabled: true,
    },
    {
      id: 'rule_3',
      organizationId: DEMO_ORG_ID,
      offsetDays: 3,
      channels: ['PUSH', 'EMAIL'],
      template: 'Identificamos um pagamento em aberto.',
      enabled: true,
    },
    {
      id: 'rule_4',
      organizationId: DEMO_ORG_ID,
      offsetDays: 7,
      channels: ['EMAIL'],
      template: 'Sua mensalidade está atrasada há uma semana.',
      enabled: true,
    },
    {
      id: 'rule_5',
      organizationId: DEMO_ORG_ID,
      offsetDays: 15,
      channels: ['EMAIL'],
      template: 'Vamos regularizar? Fale com a recepção.',
      enabled: false,
    },
    {
      id: 'rule_6',
      organizationId: DEMO_ORG_ID,
      offsetDays: 30,
      channels: ['EMAIL'],
      template: 'Sua matrícula pode ser suspensa.',
      enabled: false,
    },
  ]

  // ── SynseRun ────────────────────────────────────────────────────────────────
  /*
   * O histórico de corrida da demonstração.
   *
   * Sem isto a aba SynseRun abria vazia para quem está avaliando o produto: o
   * recurso existe, e a vitrine mostrava uma tela em branco. É a mesma família
   * do defeito dos apelidos de exercício — o dado nunca chegou à demonstração.
   *
   * O ritmo melhora ao longo das semanas, e não é constante nem aleatório: uma
   * linha reta parece dado falso, e ruído puro não conta história nenhuma. A
   * meta da semana sai da média das quatro semanas fechadas (`metaDaSemana`),
   * então o histórico precisa ter pelo menos essas quatro para a barra da tela
   * inicial mostrar um alvo em vez de nada.
   */
  /*
   * As duas personas de aluno correm. A de teste grátis e a sem assinatura
   * caem na mesma tela de SynseRun, e deixar uma delas sem histórico repetiria
   * o defeito que a semente de corrida existe para consertar — só que agora em
   * metade da demonstração.
   */
  const CORREDORES = ['prof_0001', 'prof_0002'] as const
  /*
   * Vinte semanas, e não doze.
   *
   * Doze semanas dão 84 dias, que cabem inteiras dentro dos 3 meses do plano
   * gratuito — o limite de histórico existia e **nunca mordia na
   * demonstração**. Quem avalia o produto veria a mesma lista nos dois planos e
   * concluiria que a diferença é só um rótulo.
   *
   * Vinte semanas passam dos 140 dias, então o recorte do gratuito corta de
   * verdade e a diferença entre os planos fica visível na tela.
   */
  const SEMANAS_DE_CORRIDA = 20
  /** Ritmo em segundos por quilômetro, do começo ao fim do histórico. */
  const RITMO_INICIAL = 400
  const RITMO_FINAL = 352
  /** Aproximação boa o bastante: ~70 kcal por quilômetro corrido. */
  const KCAL_POR_KM = 70

  const demoActivities: Activity[] = []
  const demoActivitySplits = new Map<string, ActivitySplit[]>()
  const demoActivityRoutes = new Map<string, ActivityRoutePoint[]>()

  const segundaDesta = (() => {
    const hoje = dayStart(DEMO_NOW)
    const diaDaSemana = hoje.getDay()
    return addDays(hoje, diaDaSemana === 0 ? -6 : 1 - diaDaSemana)
  })()

  let numeroDaCorrida = 0

  for (const CORREDOR of CORREDORES) {
    for (let semana = SEMANAS_DE_CORRIDA - 1; semana >= 0; semana -= 1) {
      const inicioDaSemana = addDays(segundaDesta, -semana * 7)
      const progresso = (SEMANAS_DE_CORRIDA - 1 - semana) / (SEMANAS_DE_CORRIDA - 1)
      const ritmoBase = RITMO_INICIAL + (RITMO_FINAL - RITMO_INICIAL) * progresso

      /*
       * A semana corrente entra pela metade: a barra de meta da tela inicial
       * precisa mostrar progresso, não uma semana já fechada. Semana cheia ali
       * esconderia justamente o que o widget existe para mostrar.
       */
      const corrida = semana === 0 ? 1 : intBetween(2, 3)
      const caminhada = semana === 0 ? 0 : 1
      const pedalada = semana > 0 && semana % 4 === 0 ? 1 : 0

      const dias = [1, 3, 5, 6]
      let proximoDia = 0

      const registrar = (sport: SportType, metros: number, ritmoPorKm: number) => {
        numeroDaCorrida += 1
        const activityId = id('act', numeroDaCorrida)
        const diaDoTreino = dias[proximoDia % dias.length]
        proximoDia += 1

        const comeco = new Date(addDays(inicioDaSemana, diaDoTreino))
        comeco.setHours(intBetween(6, 8), intBetween(0, 59), 0, 0)

        const km = metros / 1000
        const movingSeconds = Math.round(km * ritmoPorKm)
        // Parado no semáforo, gole de água: o relógio corrido é sempre maior.
        const elapsedSeconds = Math.round(movingSeconds * between(1.03, 1.1))
        const fim = new Date(comeco.getTime() + elapsedSeconds * 1000)
        const ganho = Math.round(between(8, 70))

        demoActivities.push({
          id: activityId,
          userProfileId: CORREDOR,
          organizationId: DEMO_ORG_ID,
          sport,
          status: 'COMPLETED',
          title: null,
          startedAt: comeco.toISOString(),
          endedAt: fim.toISOString(),
          elapsedSeconds,
          movingSeconds,
          distanceMeters: metros,
          averagePace: ritmoPorKm,
          bestPace: Math.round(ritmoPorKm * between(0.9, 0.95)),
          averageSpeed: metros / movingSeconds,
          maxSpeed: (metros / movingSeconds) * between(1.15, 1.3),
          elevationGain: ganho,
          elevationLoss: ganho + Math.round(between(-6, 6)),
          minAltitude: 720,
          maxAltitude: 720 + ganho,
          calories: Math.round(km * KCAL_POR_KM * (sport === 'RIDE' ? 0.5 : 1)),
          startLatitude: -23.5613 + between(-0.01, 0.01),
          startLongitude: -46.6565 + between(-0.01, 0.01),
          /*
           * Privado por padrão, como a tela oferece. Duas ficam visíveis para a
           * academia, para a demonstração mostrar que a escolha existe.
           */
          privacy: numeroDaCorrida % 7 === 0 ? 'GYM' : 'PRIVATE',
          privacyZoneMeters: 200,
          createdAt: fim.toISOString(),
        })

        // Parciais por quilômetro. O último trecho é parcial e fica de fora.
        const parciais: ActivitySplit[] = []
        for (let k = 1; k <= Math.floor(km); k += 1) {
          const segundos = Math.round(ritmoPorKm * between(0.94, 1.07))
          parciais.push({
            kilometer: k,
            splitSeconds: segundos,
            paceSeconds: segundos,
            elevationGain: Math.round(between(0, 12)),
          })
        }
        demoActivitySplits.set(activityId, parciais)

        return { activityId, comeco, metros, movingSeconds }
      }

      for (let i = 0; i < corrida; i += 1) {
        registrar('RUN', intBetween(4, 11) * 1000, Math.round(ritmoBase * between(0.96, 1.05)))
      }
      for (let i = 0; i < caminhada; i += 1) {
        registrar('WALK', intBetween(2, 5) * 1000, Math.round(between(660, 780)))
      }
      for (let i = 0; i < pedalada; i += 1) {
        registrar('RIDE', intBetween(15, 30) * 1000, Math.round(between(150, 190)))
      }
    }
  }

  demoActivities.sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  /*
   * Rota só das mais recentes. O traçado serve para a tela de detalhe não
   * abrir sem mapa; gerar ponto a ponto para as trinta e poucas atividades
   * encheria o dataset de memória sem ninguém abrir.
   */
  const PASSO_DA_ROTA = 100
  for (const atividade of demoActivities.slice(0, 5)) {
    const pontos: ActivityRoutePoint[] = []
    const passos = Math.floor(atividade.distanceMeters / PASSO_DA_ROTA)
    const comeco = Date.parse(atividade.startedAt)

    for (let i = 0; i <= passos; i += 1) {
      const fracao = passos === 0 ? 0 : i / passos
      // Uma volta fechada: quem corre no parque volta ao ponto de partida.
      const angulo = fracao * Math.PI * 2
      pontos.push({
        latitude: (atividade.startLatitude ?? 0) + Math.sin(angulo) * 0.012,
        longitude: (atividade.startLongitude ?? 0) + (Math.cos(angulo) - 1) * 0.012,
        altitude: 720 + Math.sin(angulo * 3) * atividade.elevationGain * 0.5,
        speed: atividade.averageSpeed,
        recordedAt: new Date(comeco + fracao * atividade.movingSeconds * 1000).toISOString(),
        totalDistance: i * PASSO_DA_ROTA,
      })
    }
    demoActivityRoutes.set(atividade.id, pontos)
  }

  /*
   * Recordes, derivados do próprio histórico.
   *
   * São as mesmas marcas da 0016. No banco o tempo sai interpolado entre dois
   * pontos da rota; aqui sai da atividade inteira, o que evita exigir rota
   * para toda corrida.
   *
   * ── Por que Riegel, e não regra de três ─────────────────────────────────────
   *
   * Dividir o tempo proporcionalmente daria o mesmo ritmo para 400 m e para
   * 10 km — e foi o que apareceu na tela: cinco recordes, todos a 05:42/km.
   * Quem corre percebe na hora que é dado inventado, porque ninguém sustenta
   * no dez mil o ritmo que faz no quilômetro.
   *
   * A fórmula de Riegel (`T₂ = T₁ × (D₂/D₁)^1.06`) é a aproximação clássica
   * entre distâncias, e o expoente acima de 1 é exatamente o que faz a marca
   * curta sair mais rápida que a longa.
   */
  const EXPOENTE_DE_RIEGEL = 1.06
  const MARCAS_DE_RECORDE = [400, 1000, 1609, 5000, 10000, 15000, 21097] as const

  /*
   * Um conjunto por corredor. Uma tabela só misturaria os dois e mostraria a
   * uma pessoa o recorde da outra — que no banco é impossível, porque a RLS
   * filtra por perfil, e aqui seria um vazamento inventado pela semente.
   */
  const demoPersonalRecords = new Map<string, PersonalRecord[]>()

  for (const corredor of CORREDORES) {
    const melhorPorMarca = new Map<number, PersonalRecord>()

    for (const atividade of demoActivities) {
      if (atividade.sport !== 'RUN' || atividade.userProfileId !== corredor) continue
      for (const marca of MARCAS_DE_RECORDE) {
        if (atividade.distanceMeters < marca) continue
        const segundos = Math.round(
          atividade.movingSeconds * (marca / atividade.distanceMeters) ** EXPOENTE_DE_RIEGEL,
        )
        const atual = melhorPorMarca.get(marca)
        // Só substitui quando é melhor — a regra que a 0016 escreve em SQL.
        if (atual && atual.seconds <= segundos) continue

        melhorPorMarca.set(marca, {
          id: `prec_${corredor}_${marca}`,
          sport: 'RUN',
          distanceMeters: marca,
          seconds: segundos,
          paceSeconds: Math.round(segundos / (marca / 1000)),
          activityId: atividade.id,
          achievedAt: atividade.startedAt,
        })
      }
    }

    demoPersonalRecords.set(
      corredor,
      [...melhorPorMarca.values()].sort((a, b) => a.distanceMeters - b.distanceMeters),
    )
  }

  return {
    now: DEMO_NOW,
    organization: demoOrganization,
    secondOrganization: demoSecondOrganization,
    billingSettings: demoBillingSettings,
    paymentAccount: demoPaymentAccount,
    userProfiles: demoUserProfiles,
    organizationMembers: demoOrganizationMembers,
    staff: demoStaff,
    plans: demoPlans,
    students: demoStudents,
    memberships: demoMemberships,
    charges: demoCharges,
    splits: demoSplits,
    checkIns: demoCheckIns,
    exercises: demoExercises,
    workoutPlans: demoWorkoutPlans,
    workoutExercises: demoWorkoutExercises,
    workoutAssignments: demoWorkoutAssignments,
    workoutLogs: demoWorkoutLogs,
    assessments: demoAssessments,
    leads: demoLeads,
    collectionRules: demoCollectionRules,
    activities: demoActivities,
    activitySplits: demoActivitySplits,
    activityRoutes: demoActivityRoutes,
    personalRecords: demoPersonalRecords,
    /** Quem corre na demonstração — as duas personas de aluno. */
    runnerProfileIds: CORREDORES as readonly string[],
    /** Aluno usado como sessão padrão do Synse App em modo demo. */
    studentIdForApp: demoStudents[0].id,
  }
}

/**
 * Uma única instância por processo.
 *
 * O bundler do Next pode avaliar este módulo mais de uma vez — uma cópia para
 * o bundle da página, outra para o da server action. Com os dados em variáveis
 * de módulo, um cadastro feito pela action ia parar numa cópia que a página
 * nunca lia: a escrita "funcionava" e sumia. `Symbol.for` resolve porque o
 * registro global de símbolos é compartilhado por todo o realm.
 */
const DATASET_KEY = Symbol.for('synse.demo.dataset')

type GlobalWithDataset = typeof globalThis & { [DATASET_KEY]?: DemoDataset }

export function getDemoDataset(): DemoDataset {
  const scope = globalThis as GlobalWithDataset
  if (!scope[DATASET_KEY]) scope[DATASET_KEY] = buildDemoDataset()
  return scope[DATASET_KEY]
}
