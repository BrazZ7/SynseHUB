/**
 * Modelo de domínio do Synse.
 * Estes tipos são a fonte de verdade compartilhada entre repositories,
 * services, server actions e UI — e espelham as migrations em `src/db`.
 */

// ---------------------------------------------------------------------------
// Identidade e organizações
// ---------------------------------------------------------------------------

export type UserRole =
  | 'SUPER_ADMIN'
  | 'OWNER'
  | 'MANAGER'
  | 'RECEPTIONIST'
  | 'TRAINER'
  | 'NUTRITIONIST'
  | 'STUDENT'
  | 'PROFESSIONAL'

export type OrganizationType =
  'GYM' | 'NETWORK' | 'BRANCH' | 'CLINIC' | 'STUDIO' | 'BOX' | 'COMPANY'

export type UserProfile = {
  id: string
  authUserId: string | null
  /** Identificador público e não enumerável: SYN-XXXXXXXX */
  synseId: string
  name: string
  email: string
  avatarUrl: string | null
  phone: string | null
  birthDate: string | null
  gender: 'FEMALE' | 'MALE' | 'OTHER' | 'UNDISCLOSED' | null
  createdAt: string
}

export type Organization = {
  id: string
  name: string
  slug: string
  type: OrganizationType
  legalName: string | null
  taxId: string | null
  logoUrl: string | null
  city: string | null
  state: string | null
  /*
   * Endereço, contato e natureza jurídica: o provedor de pagamento exige tudo
   * isso para abrir a subconta da academia. Anuláveis porque quem usa o
   * SynseHub só para gestão nunca precisa preencher.
   */
  postalCode: string | null
  address: string | null
  addressNumber: string | null
  district: string | null
  phone: string | null
  /** Natureza jurídica no vocabulário do provedor: MEI, LIMITED, INDIVIDUAL, ASSOCIATION. */
  companyType: string | null
  monthlyRevenue: number | null
  /** Código que o aluno digita para entrar nesta academia. */
  inviteCode: string | null
  timezone: string
  hubPlan: HubPlanTier
  status: 'ACTIVE' | 'TRIALING' | 'SUSPENDED' | 'CANCELLED'
  onboardingCompleted: boolean
  createdAt: string
}

export type OrganizationMember = {
  id: string
  organizationId: string
  userProfileId: string
  role: UserRole
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED'
  jobTitle: string | null
  createdAt: string
}

export type HubPlanTier = 'START' | 'PRO' | 'PREMIUM' | 'NETWORK'

export type OrganizationBillingSettings = {
  organizationId: string
  /** Comissão da Synse. NUNCA hard-coded na aplicação. */
  platformFeePercentage: number
  platformFixedFee: number
  paymentProviderFeeStrategy: 'PLATFORM_ABSORBS' | 'ORGANIZATION_ABSORBS' | 'CUSTOMER_ABSORBS'
}

// ---------------------------------------------------------------------------
// Alunos, planos e matrículas
// ---------------------------------------------------------------------------

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'OVERDUE' | 'PENDING' | 'CANCELLED'

export type Student = {
  id: string
  organizationId: string
  userProfileId: string
  synseId: string
  name: string
  email: string
  phone: string | null
  /**
   * CPF. Exigido pelo provedor de pagamento para emitir cobrança — sem ele a
   * mensalidade não sai. Fica no perfil, não na matrícula: o documento é da
   * pessoa e sobrevive à troca de academia, igual ao Synse ID.
   */
  taxId: string | null
  avatarUrl: string | null
  birthDate: string | null
  status: StudentStatus
  goal: string | null
  enrolledAt: string
  /** Preenchido quando o vínculo com a academia termina. Base do churn. */
  cancelledAt: string | null
  trainerId: string | null
  membershipId: string | null
  notes: string | null
}

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'CUSTOM'

export type MembershipPlan = {
  id: string
  organizationId: string
  name: string
  description: string | null
  price: number
  billingCycle: BillingCycle
  enrollmentFee: number
  weeklyAccessDays: number | null
  benefits: string[]
  autoCharge: boolean
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
}

export type Membership = {
  id: string
  organizationId: string
  studentId: string
  planId: string
  startedAt: string
  endsAt: string | null
  billingDay: number
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  price: number
}

// ---------------------------------------------------------------------------
// Synse Pay
// ---------------------------------------------------------------------------

export type ChargeStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED' | 'FAILED'

export type PaymentMethod =
  'PIX' | 'PIX_AUTOMATIC' | 'CREDIT_CARD' | 'CREDIT_CARD_RECURRING' | 'BOLETO' | 'CASH'

export type Charge = {
  id: string
  organizationId: string
  studentId: string
  membershipId: string | null
  providerChargeId: string | null
  description: string
  amount: number
  dueDate: string
  paymentMethod: PaymentMethod | null
  status: ChargeStatus
  paidAt: string | null
  /** Chave de idempotência da geração de mensalidade: uma cobrança por ciclo. */
  billingReference: string | null
  createdAt: string
  updatedAt: string
}

export type PaymentSplit = {
  id: string
  chargeId: string
  organizationAmount: number
  platformAmount: number
  platformPercentage: number
  providerFee: number
  status: 'PENDING' | 'SETTLED' | 'FAILED'
}

export type PaymentAccount = {
  id: string
  organizationId: string
  provider: string
  providerAccountId: string | null
  status: 'DISCONNECTED' | 'PENDING' | 'ACTIVE' | 'BLOCKED'
  onboardingStatus: 'NOT_STARTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'
  createdAt: string
}

export type CollectionRuleOffset = -3 | 0 | 3 | 7 | 15 | 30

export type CollectionRule = {
  id: string
  organizationId: string
  /** Dias relativos ao vencimento. Negativo = antes. */
  offsetDays: CollectionRuleOffset
  channels: Array<'PUSH' | 'EMAIL' | 'WHATSAPP'>
  template: string
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type CheckIn = {
  id: string
  organizationId: string
  studentId: string
  checkedInAt: string
  method: 'QR_CODE' | 'MANUAL' | 'APP' | 'TURNSTILE'
  deviceId: string | null
}

// ---------------------------------------------------------------------------
// Treinos
// ---------------------------------------------------------------------------

export type MuscleGroup =
  'CHEST' | 'BACK' | 'LEGS' | 'SHOULDERS' | 'ARMS' | 'CORE' | 'GLUTES' | 'CARDIO' | 'FULL_BODY'

/**
 * Músculo alvo, no detalhe que a prescrição usa.
 *
 * `MuscleGroup` continua existindo e serve para colorir e agrupar em telas
 * antigas, mas junta bíceps com tríceps em ARMS e quadríceps com panturrilha
 * em LEGS. Para montar treino isso não basta.
 */
export type MuscleTarget =
  | 'PECTORAL'
  | 'SERRATUS'
  | 'LATS'
  | 'TRAPS'
  | 'RHOMBOIDS'
  | 'LOWER_BACK'
  | 'DELT_ANTERIOR'
  | 'DELT_LATERAL'
  | 'DELT_POSTERIOR'
  | 'ROTATOR_CUFF'
  | 'BICEPS'
  | 'TRICEPS'
  | 'FOREARMS'
  | 'ABS'
  | 'OBLIQUES'
  | 'HIP_FLEXORS'
  | 'QUADS'
  | 'HAMSTRINGS'
  | 'GLUTES'
  | 'ADDUCTORS'
  | 'ABDUCTORS'
  | 'CALVES'

/** O recorte com que se fecha um treino A/B/C. */
export type BodyRegion = 'UPPER_BODY' | 'LOWER_BODY' | 'CORE' | 'FULL_BODY'

/** Como o treinador equilibra um programa: empurrar, puxar, agachar, dobradiça. */
export type MovementPattern =
  | 'PUSH_HORIZONTAL'
  | 'PUSH_VERTICAL'
  | 'PULL_HORIZONTAL'
  | 'PULL_VERTICAL'
  | 'SQUAT'
  | 'HINGE'
  | 'LUNGE'
  | 'CARRY'
  | 'ROTATION'
  | 'GAIT'
  | 'CONDITIONING'
  | 'ISOLATION'

export type ExerciseMechanics = 'COMPOUND' | 'ISOLATION'
/** Básico sustenta o treino; auxiliar complementa. */
export type ExerciseUtility = 'BASIC' | 'AUXILIARY'
export type ExerciseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

export type EquipmentType =
  | 'BARBELL'
  | 'DUMBBELL'
  | 'MACHINE'
  | 'CABLE'
  | 'SMITH'
  | 'BODYWEIGHT'
  | 'KETTLEBELL'
  | 'BAND'
  | 'PLATE'
  | 'MEDICINE_BALL'
  | 'CARDIO'
  | 'OTHER'

export type Exercise = {
  id: string
  organizationId: string | null
  name: string
  muscleGroup: MuscleGroup
  /** O aparelho pelo nome da academia: "cadeira extensora", "graviton". */
  equipment: string | null
  description: string | null
  videoUrl: string | null
  imageUrl: string | null
  /*
   * Tudo abaixo é anulável porque a tabela é anterior à classificação: um
   * exercício que a academia criou antes da 0021 não tem nada disso, e a tela
   * precisa continuar mostrando o nome dele.
   */
  /** Identificador estável do catálogo da plataforma. Nulo no exercício da academia. */
  slug: string | null
  primaryMuscle: MuscleTarget | null
  secondaryMuscles: MuscleTarget[]
  region: BodyRegion | null
  pattern: MovementPattern | null
  mechanics: ExerciseMechanics | null
  utility: ExerciseUtility | null
  equipmentType: EquipmentType | null
  unilateral: boolean
  level: ExerciseLevel | null
  /** Outros nomes do mesmo exercício: "pulley frente", "cavalinho", "serrote". */
  aliases: string[]
}

export type WorkoutPlan = {
  id: string
  organizationId: string
  name: string
  goal: string | null
  /** Divisões: Treino A, B, C… */
  splitLabel: string
  createdByStaffId: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  createdAt: string
}

export type WorkoutExercise = {
  id: string
  workoutPlanId: string
  exerciseId: string
  order: number
  sets: number
  reps: string
  restSeconds: number
  suggestedLoad: number | null
  notes: string | null
}

export type WorkoutAssignment = {
  id: string
  organizationId: string
  workoutPlanId: string
  studentId: string
  assignedAt: string
  validUntil: string | null
}

export type WorkoutLog = {
  id: string
  organizationId: string
  studentId: string
  workoutPlanId: string
  workoutExerciseId: string | null
  performedAt: string
  load: number | null
  reps: number | null
  sets: number | null
  rpe: number | null
  notes: string | null
}

// ---------------------------------------------------------------------------
// Avaliações
// ---------------------------------------------------------------------------

export type AssessmentProtocol = 'MANUAL' | 'POLLOCK_3' | 'POLLOCK_7'

/**
 * As equações de composição corporal são específicas por sexo, e não existe
 * versão validada fora disso. Fica na avaliação, e não é lido do perfil na hora
 * da conta: quem avalia escolhe qual equação aplicar, e o registro guarda a
 * escolha para o número continuar reproduzível.
 */
export type AssessmentSex = 'MALE' | 'FEMALE'

export type Assessment = {
  id: string
  organizationId: string
  studentId: string
  assessedByStaffId: string | null
  assessedAt: string
  weight: number | null
  height: number | null
  bmi: number | null
  bodyFatPercentage: number | null
  chest: number | null
  arm: number | null
  waist: number | null
  abdomen: number | null
  hip: number | null
  thigh: number | null
  calf: number | null
  notes: string | null
  protocol: AssessmentProtocol
  protocolSex: AssessmentSex | null
  /** Idade no dia da avaliação. A equação usa idade, e a data de nascimento pode ser corrigida depois. */
  ageYears: number | null
  bodyDensity: number | null
  /* Dobras cutâneas, em milímetros. */
  skinfoldChest: number | null
  skinfoldAxilla: number | null
  skinfoldTriceps: number | null
  skinfoldSubscapular: number | null
  skinfoldAbdominal: number | null
  skinfoldSuprailiac: number | null
  skinfoldThigh: number | null
}

// ---------------------------------------------------------------------------
// Agenda de aulas
// ---------------------------------------------------------------------------

/**
 * A regra semanal: "spinning, quarta, 19h, 20 vagas".
 *
 * `weekday` usa 0 = domingo, igual ao `getDay()` do JavaScript e ao
 * `extract(dow)` do Postgres. Adotar a convenção do ISO num dos lados é como
 * nasce a aula que aparece um dia deslocada.
 */
export type ClassSchedule = {
  id: string
  organizationId: string
  name: string
  description: string | null
  staffId: string | null
  staffName: string | null
  weekday: number
  /** `HH:MM`, hora local da academia. */
  startTime: string
  durationMinutes: number
  capacity: number
  room: string | null
  startsOn: string
  endsOn: string | null
  status: 'ACTIVE' | 'ARCHIVED'
}

export type ClassSessionStatus = 'SCHEDULED' | 'CANCELLED'

/** A aula de um dia específico, que pode ser cancelada sem derrubar a série. */
export type ClassSession = {
  id: string
  organizationId: string
  scheduleId: string | null
  name: string
  staffId: string | null
  staffName: string | null
  startsAt: string
  endsAt: string
  capacity: number
  room: string | null
  status: ClassSessionStatus
  cancellationReason: string | null
  /** Derivado no banco. Quem manda na lotação é a contagem sob trava. */
  bookedCount: number
}

export type ClassBookingStatus =
  | 'BOOKED'
  | 'WAITLIST'
  | 'CANCELLED'
  | 'ATTENDED'
  | 'NO_SHOW'

export type ClassBooking = {
  id: string
  organizationId: string
  sessionId: string
  studentId: string
  studentName: string | null
  status: ClassBookingStatus
  createdAt: string
  cancelledAt: string | null
  attendedAt: string | null
}

/** A aula como o aluno a enxerga: com a própria reserva junto. */
export type ClassSessionForStudent = ClassSession & {
  myBookingId: string | null
  myBookingStatus: ClassBookingStatus | null
  /** Posição na fila, a partir de 1. Nulo quando não está esperando. */
  waitlistPosition: number | null
}

// ---------------------------------------------------------------------------
// Treino Ativo
// ---------------------------------------------------------------------------

export type WorkoutSessionStatus = 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'ABANDONED'

/** O treino como o histórico o vê. Detalhe de série fica em `workout_set_logs`. */
export type WorkoutSessionSummary = {
  id: string
  organizationId: string
  studentId: string
  workoutPlanId: string | null
  planName: string | null
  clientId: string
  status: WorkoutSessionStatus
  startedAt: string
  completedAt: string | null
  durationSeconds: number | null
  totalSets: number
  totalReps: number
  volumeKg: number
}

export type WorkoutPreferences = {
  autoRest: boolean
  sound: boolean
  vibration: boolean
  autoAdvance: boolean
  keepScreenAwake: boolean
  defaultRestSeconds: number
}

export const DEFAULT_WORKOUT_PREFERENCES: WorkoutPreferences = {
  autoRest: true,
  sound: true,
  vibration: true,
  autoAdvance: false,
  keepScreenAwake: true,
  defaultRestSeconds: 90,
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export type ExerciseProgressPoint = {
  /** Segunda-feira da semana. */
  week: string
  maxWeight: number | null
  volumeKg: number
  sets: number
  reps: number
}

/**
 * Recorde de carga num exercício.
 *
 * `ExercisePersonalRecord` e não `PersonalRecord` porque este último já existe
 * desde a 0016, e é o recorde de corrida — distância e ritmo. Dois tipos com o
 * mesmo nome em domínios vizinhos é confusão garantida na hora de importar.
 */
export type ExercisePersonalRecord = {
  exerciseId: string
  exerciseName: string
  maxWeight: number
  reps: number
  achievedAt: string
}

export type WorkoutTotals = {
  workouts: number
  sets: number
  reps: number
  volumeKg: number
  averageDurationSeconds: number | null
  averageRestSeconds: number | null
  distinctExercises: number
}

export type GymTrainingReport = {
  workouts: number
  studentsTraining: number
  sets: number
  volumeKg: number
  averageDurationSeconds: number | null
}

export type StudentAtRisk = {
  studentId: string
  name: string
  /** Nulo é quem nunca apareceu — não uma data inventada. */
  lastVisitAt: string | null
  daysAbsent: number
}

export type ClassOccupancyRow = {
  className: string
  occurrences: number
  capacityOffered: number
  bookings: number
  attended: number
  noShows: number
}

// ---------------------------------------------------------------------------
// Desafios da academia
// ---------------------------------------------------------------------------

/**
 * O que o sistema mede sozinho.
 *
 * Passos e hidratação, citados no comentário original da 0003, nunca entraram:
 * seriam número digitado pelo próprio aluno, e ranking sobre valor
 * auto-declarado é competição de quem mente melhor.
 */
export type GymChallengeMetric =
  | 'CHECKINS'
  | 'WORKOUTS'
  | 'SETS'
  | 'VOLUME_KG'
  | 'CLASS_ATTENDANCE'

export type GymChallengeStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED'

export type GymChallenge = {
  id: string
  organizationId: string
  title: string
  description: string | null
  metric: GymChallengeMetric
  targetValue: number
  unit: string
  startsAt: string
  endsAt: string
  /** A academia liga; cada aluno ainda decide se aparece. */
  rankingEnabled: boolean
  status: GymChallengeStatus
  reward: string | null
  participants: number
  createdAt: string
}

/** O desafio como o aluno o vê, com a própria participação junto. */
export type GymChallengeForStudent = GymChallenge & {
  joined: boolean
  rankingOptIn: boolean
  progressValue: number
  completedAt: string | null
}

export type GymChallengeRankRow = {
  position: number
  name: string
  progressValue: number
  completedAt: string | null
}

// ---------------------------------------------------------------------------
// Nutrição
// ---------------------------------------------------------------------------

export type NutritionPlanStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type MealItem = {
  id: string
  mealId: string
  description: string
  quantity: string | null
  calories: number | null
  /** Gramas. O nutricionista escreve grama na consulta, não percentual. */
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  position: number
}

export type Meal = {
  id: string
  nutritionPlanId: string
  name: string
  /** `HH:MM`. Nulo quando a refeição não tem hora marcada. */
  timeOfDay: string | null
  position: number
  items: MealItem[]
}

export type NutritionTotals = {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  items: number
}

export type NutritionPlan = {
  id: string
  organizationId: string
  studentId: string
  studentName: string | null
  authorStaffId: string
  authorName: string | null
  title: string
  version: number
  status: NutritionPlanStatus
  publishedAt: string | null
  notes: string | null
  targetCalories: number | null
  targetProteinG: number | null
  targetCarbsG: number | null
  targetFatG: number | null
  createdAt: string
}

export type NutritionPlanWithMeals = NutritionPlan & {
  meals: Meal[]
  totals: NutritionTotals
}

// ---------------------------------------------------------------------------
// Conteúdos
// ---------------------------------------------------------------------------

export type ContentType =
  | 'ARTICLE'
  | 'EBOOK'
  | 'VIDEO'
  | 'RECIPE'
  | 'GUIDE'
  | 'PROGRAM'
  | 'CHALLENGE'

/**
 * `FREE` é conteúdo da plataforma, sem academia dona — e a 0031 recusa a
 * combinação com `organizationId`. Para quem opera a academia, "grátis" lê como
 * "sem custo para os meus alunos", e o efeito real era publicar na internet.
 */
export type ContentVisibility = 'FREE' | 'ORGANIZATION' | 'SYNSE_PLUS'

export type ContentItem = {
  id: string
  organizationId: string | null
  type: ContentType
  title: string
  summary: string | null
  body: string | null
  coverUrl: string | null
  mediaUrl: string | null
  visibility: ContentVisibility
  /** Nulo é rascunho; no futuro é publicação agendada. */
  publishedAt: string | null
  pinned: boolean
  authorStaffId: string | null
  authorName: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type LeadStage = 'NEW' | 'CONTACTED' | 'TRIAL_CLASS' | 'PROPOSAL' | 'ENROLLED' | 'LOST'

export type LeadSource =
  | 'INSTAGRAM'
  | 'GOOGLE'
  | 'REFERRAL'
  | 'WEBSITE'
  | 'WHATSAPP'
  | 'OTHER'

export type Lead = {
  id: string
  organizationId: string
  name: string
  phone: string | null
  email: string | null
  stage: LeadStage
  source: LeadSource
  ownerStaffId: string | null
  ownerName: string | null
  notes: string | null
  /** O campo que faz alguém abrir o CRM de manhã. */
  nextFollowUpAt: string | null
  /** Preenchido pela conversão. Liga o funil ao resto do produto. */
  convertedStudentId: string | null
  lostReason: string | null
  createdAt: string
  updatedAt: string
}

export type LeadEventKind =
  | 'STAGE_CHANGE'
  | 'NOTE'
  | 'CALL'
  | 'MESSAGE'
  | 'VISIT'
  | 'CREATED'

export type LeadEvent = {
  id: string
  leadId: string
  kind: LeadEventKind
  fromStage: LeadStage | null
  toStage: LeadStage | null
  body: string | null
  actorName: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Auditoria e consentimento (LGPD)
// ---------------------------------------------------------------------------

export type AuditLog = {
  id: string
  actorId: string | null
  organizationId: string | null
  action: string
  entity: string
  entityId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

/** Convite de acesso ao painel, sem o token — ele não circula. */
export type StaffInvite = {
  id: string
  organizationId: string
  email: string
  role: UserRole
  jobTitle: string | null
  registrationNumber: string | null
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export type ConsentType =
  | 'TERMS_OF_USE'
  | 'PRIVACY_POLICY'
  | 'HEALTH_DATA_PROCESSING'
  | 'MARKETING_COMMUNICATION'
  | 'PROGRESS_PHOTOS'
  | 'RANKING_VISIBILITY'

/**
 * Um documento de consentimento publicado, na versão em vigor.
 *
 * Vem do banco, e não de uma constante no código, porque a versão é a parte
 * que dá valor ao registro: o que a pessoa aceitou é o texto que estava no ar
 * naquele dia.
 */
export type ConsentDocument = {
  consentType: ConsentType
  version: string
  title: string
  description: string
  url: string | null
  /** Termos e privacidade: sem eles não há conta, então não viram caixinha. */
  required: boolean
}

/** O documento vigente somado ao que esta pessoa respondeu sobre ele. */
export type ConsentState = ConsentDocument & {
  accepted: boolean
  /** Nulo quando a pessoa nunca respondeu — diferente de ter recusado. */
  respondedAt: string | null
  revokedAt: string | null
  /** A resposta registrada é de uma versão anterior à que está no ar. */
  outdated: boolean
}

export type Consent = {
  id: string
  userProfileId: string
  consentType: ConsentType
  accepted: boolean
  version: string
  acceptedAt: string | null
  revokedAt: string | null
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------

export type NotificationCategory = 'PAYMENT' | 'WORKOUT' | 'GYM' | 'CONTENT' | 'PROGRAM' | 'SYSTEM'

/**
 * Aviso destinado a uma pessoa, não a uma organização.
 *
 * Quem escreve é o banco, por gatilho (migration 0012). A aplicação só lê e
 * marca como lido — assim o aviso existe mesmo quando a mudança veio de um
 * script, de um webhook ou do SQL de suporte.
 */
export type AppNotification = {
  id: string
  organizationId: string | null
  userProfileId: string
  category: NotificationCategory
  title: string
  body: string | null
  actionUrl: string | null
  readAt: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Desafios base e medalhas
// ---------------------------------------------------------------------------

export type ChallengeMetric = 'DISTANCE_KM' | 'SESSIONS' | 'LOAD_PERCENT' | 'CHECKINS' | 'MINUTES'

export type MedalLevel = 'PARTICIPACAO' | 'BRONZE' | 'PRATA' | 'OURO'

/** Item do catálogo — igual para todo mundo, sem dono. */
export type BaselineChallenge = {
  code: string
  title: string
  description: string
  metric: ChallengeMetric
  unit: string
  targetValue: number
  minTier: 'FREE' | 'PRO'
  position: number
}

/** A escolha de uma pessoa num ciclo. `cycle` é sempre o primeiro dia do mês. */
export type ChallengeEntry = {
  id: string
  challengeCode: string
  cycle: string
  targetValue: number
  progressValue: number
  chosenAt: string
  closedAt: string | null
}

export type ChallengeMedal = {
  id: string
  challengeCode: string
  cycle: string
  level: MedalLevel
  progressValue: number
  targetValue: number
  awardedAt: string
}

// ---------------------------------------------------------------------------
// SynseRun
// ---------------------------------------------------------------------------

export type SportType = 'RUN' | 'WALK' | 'RIDE'
export type ActivityStatus = 'IN_PROGRESS' | 'COMPLETED' | 'DISCARDED'
export type ActivityPrivacy = 'PUBLIC' | 'GYM' | 'PRIVATE'

/**
 * Uma atividade registrada. Distância em metros, tempo em segundos, pace em
 * segundos por quilômetro, velocidade em m/s — a mesma unidade do motor, e a
 * conversão acontece só na tela.
 */
export type Activity = {
  id: string
  userProfileId: string
  organizationId: string | null
  sport: SportType
  status: ActivityStatus
  title: string | null
  startedAt: string
  endedAt: string | null
  elapsedSeconds: number
  movingSeconds: number
  distanceMeters: number
  averagePace: number | null
  bestPace: number | null
  averageSpeed: number
  maxSpeed: number
  elevationGain: number
  elevationLoss: number
  minAltitude: number | null
  maxAltitude: number | null
  calories: number
  startLatitude: number | null
  startLongitude: number | null
  privacy: ActivityPrivacy
  privacyZoneMeters: number
  createdAt: string
}

export type ActivityRoutePoint = {
  latitude: number
  longitude: number
  altitude: number | null
  speed: number | null
  recordedAt: string
  totalDistance: number
}

export type ActivitySplit = {
  kilometer: number
  splitSeconds: number
  paceSeconds: number
  elevationGain: number
}

export type PersonalRecord = {
  id: string
  sport: SportType
  distanceMeters: number
  seconds: number
  paceSeconds: number
  activityId: string
  achievedAt: string
}

/** Resumo de um período, para a tela inicial e para as estatísticas. */
export type ActivitySummary = {
  activities: number
  distanceMeters: number
  movingSeconds: number
  calories: number
  elevationGain: number
}
