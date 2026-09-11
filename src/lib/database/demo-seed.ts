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
  OrganizationMember,
  PaymentAccount,
  PaymentSplit,
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

type ExerciseSeed = [string, Exercise['muscleGroup'], string]

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
    ['Supino reto com barra', 'CHEST', 'Barra'],
    ['Supino inclinado com halteres', 'CHEST', 'Halteres'],
    ['Crucifixo na máquina', 'CHEST', 'Máquina'],
    ['Crossover', 'CHEST', 'Polia'],
    ['Puxada frente', 'BACK', 'Polia'],
    ['Remada curvada', 'BACK', 'Barra'],
    ['Remada unilateral', 'BACK', 'Halteres'],
    ['Pulldown', 'BACK', 'Polia'],
    ['Agachamento livre', 'LEGS', 'Barra'],
    ['Leg press 45°', 'LEGS', 'Máquina'],
    ['Cadeira extensora', 'LEGS', 'Máquina'],
    ['Mesa flexora', 'LEGS', 'Máquina'],
    ['Panturrilha em pé', 'LEGS', 'Máquina'],
    ['Desenvolvimento militar', 'SHOULDERS', 'Barra'],
    ['Elevação lateral', 'SHOULDERS', 'Halteres'],
    ['Elevação frontal', 'SHOULDERS', 'Halteres'],
    ['Rosca direta', 'ARMS', 'Barra'],
    ['Rosca alternada', 'ARMS', 'Halteres'],
    ['Tríceps corda', 'ARMS', 'Polia'],
    ['Tríceps testa', 'ARMS', 'Barra'],
    ['Prancha isométrica', 'CORE', 'Peso corporal'],
    ['Abdominal supra', 'CORE', 'Peso corporal'],
    ['Elevação de pernas', 'CORE', 'Peso corporal'],
    ['Hip thrust', 'GLUTES', 'Barra'],
    ['Cadeira abdutora', 'GLUTES', 'Máquina'],
    ['Esteira — corrida contínua', 'CARDIO', 'Esteira'],
    ['Bike ergométrica', 'CARDIO', 'Bicicleta'],
    ['Remo ergômetro', 'CARDIO', 'Remo'],
    ['Burpee', 'FULL_BODY', 'Peso corporal'],
    ['Levantamento terra', 'FULL_BODY', 'Barra'],
  ]

  const demoExercises: Exercise[] = EXERCISE_SEEDS.map(([name, muscleGroup, equipment], index) => ({
    id: id('exr', index + 1),
    organizationId: null,
    name,
    muscleGroup,
    equipment,
    description: null,
    videoUrl: null,
    imageUrl: null,
  }))

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
    const height = roundMoney(between(1.58, 1.92))
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
        bmi: roundMoney(weight / (height * height)),
        bodyFatPercentage: roundMoney(between(12, 32)),
        chest: roundMoney(between(86, 112)),
        arm: roundMoney(between(28, 42)),
        waist: roundMoney(between(66, 98)),
        abdomen: roundMoney(between(70, 104)),
        hip: roundMoney(between(88, 112)),
        thigh: roundMoney(between(48, 66)),
        calf: roundMoney(between(32, 42)),
        notes: null,
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
      createdAt: addDays(DEMO_NOW, -intBetween(0, 45)).toISOString(),
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
