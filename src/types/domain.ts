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

export type OrganizationType = 'GYM' | 'NETWORK' | 'BRANCH' | 'CLINIC' | 'STUDIO' | 'BOX' | 'COMPANY'

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

export type PaymentMethod = 'PIX' | 'PIX_AUTOMATIC' | 'CREDIT_CARD' | 'CREDIT_CARD_RECURRING' | 'BOLETO' | 'CASH'

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
  | 'CHEST'
  | 'BACK'
  | 'LEGS'
  | 'SHOULDERS'
  | 'ARMS'
  | 'CORE'
  | 'GLUTES'
  | 'CARDIO'
  | 'FULL_BODY'

export type Exercise = {
  id: string
  organizationId: string | null
  name: string
  muscleGroup: MuscleGroup
  equipment: string | null
  description: string | null
  videoUrl: string | null
  imageUrl: string | null
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
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type LeadStage = 'NEW' | 'CONTACTED' | 'TRIAL_CLASS' | 'PROPOSAL' | 'ENROLLED' | 'LOST'

export type Lead = {
  id: string
  organizationId: string
  name: string
  phone: string | null
  email: string | null
  stage: LeadStage
  source: 'INSTAGRAM' | 'GOOGLE' | 'REFERRAL' | 'WEBSITE' | 'WHATSAPP' | 'OTHER'
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

export type ConsentType =
  | 'TERMS_OF_USE'
  | 'PRIVACY_POLICY'
  | 'HEALTH_DATA_PROCESSING'
  | 'MARKETING_COMMUNICATION'
  | 'PROGRESS_PHOTOS'
  | 'RANKING_VISIBILITY'

export type Consent = {
  id: string
  userProfileId: string
  consentType: ConsentType
  accepted: boolean
  version: string
  acceptedAt: string | null
  revokedAt: string | null
}
