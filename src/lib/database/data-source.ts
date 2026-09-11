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
  StudentStatus,
  WorkoutAssignment,
  WorkoutExercise,
  WorkoutLog,
  WorkoutPlan,
} from '@/types/domain'
import type { DemoStaff } from '@/lib/database/demo-seed'

/**
 * Contrato de acesso a dados.
 *
 * Duas implementações: `DemoDataSource` (memória, determinística) e
 * `SupabaseDataSource` (Postgres + RLS). Toda a aplicação depende apenas desta
 * interface — trocar a origem dos dados não toca em nenhuma tela.
 *
 * O `organizationId` é parâmetro obrigatório em cada método por decisão de
 * arquitetura: o isolamento multi-tenant fica explícito na assinatura, além de
 * ser reforçado pela Row Level Security no banco.
 */

export type StudentFilters = {
  search?: string
  status?: StudentStatus | 'ALL'
  planId?: string
  trainerId?: string
  /** Alunos sem check-in nos últimos 21 dias. */
  inactiveAttendance?: boolean
  /** Matriculados nos últimos 30 dias. */
  newcomers?: boolean
  page?: number
  pageSize?: number
}

export type Paginated<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export type StudentListItem = Student & {
  planName: string | null
  planPrice: number | null
  trainerName: string | null
  nextChargeDueDate: string | null
  nextChargeAmount: number | null
  lastCheckInAt: string | null
}

/**
 * O que o provedor de pagamento precisa saber para abrir a subconta da
 * academia: quem é a empresa, onde fica e quanto movimenta.
 */
export type FiscalData = {
  legalName: string | null
  taxId: string | null
  companyType: string | null
  postalCode: string | null
  address: string | null
  addressNumber: string | null
  district: string | null
  city: string | null
  state: string | null
  phone: string | null
  monthlyRevenue: number | null
}

export type ChargeWithStudent = Charge & {
  studentName: string
  studentPhone: string | null
  planName: string | null
}

export type CheckInWithStudent = CheckIn & {
  studentName: string
}

export interface DataSource {
  readonly kind: 'demo' | 'supabase'

  // Organização
  getOrganization(organizationId: string): Promise<Organization | null>
  listOrganizations(): Promise<Organization[]>
  getBillingSettings(organizationId: string): Promise<OrganizationBillingSettings | null>
  getPaymentAccount(organizationId: string): Promise<PaymentAccount | null>
  listStaff(organizationId: string): Promise<DemoStaff[]>

  /**
   * Dados fiscais da academia. É com o que está gravado aqui que a subconta é
   * aberta no provedor — sem isso a academia não cobra.
   */
  updateFiscalData(input: FiscalData & { organizationId: string }): Promise<void>

  /**
   * Cadastro de uma nova academia.
   *
   * Devolve o id da organização criada. A RLS não permite inserir organização
   * diretamente — quem cria é a função `create_organization_with_owner`.
   */
  createOrganization(input: {
    name: string
    slug: string
    ownerName: string
    legalName: string | null
    taxId: string | null
    city: string | null
    state: string | null
  }): Promise<string>

  // Planos e matrículas
  listPlans(organizationId: string): Promise<MembershipPlan[]>
  getPlan(organizationId: string, planId: string): Promise<MembershipPlan | null>
  createPlan(input: Omit<MembershipPlan, 'id' | 'createdAt'>): Promise<MembershipPlan>
  countStudentsByPlan(organizationId: string): Promise<Record<string, number>>
  getActiveMembership(organizationId: string, studentId: string): Promise<Membership | null>

  // Alunos
  listStudents(organizationId: string, filters: StudentFilters): Promise<Paginated<StudentListItem>>
  getStudent(organizationId: string, studentId: string): Promise<StudentListItem | null>
  createStudent(input: {
    organizationId: string
    name: string
    email: string
    phone: string | null
    taxId: string | null
    goal: string | null
    planId: string | null
    trainerId: string | null
    billingDay: number
  }): Promise<Student>

  // Synse Pay
  listCharges(
    organizationId: string,
    filters: { status?: Charge['status'] | 'ALL'; studentId?: string; limit?: number },
  ): Promise<ChargeWithStudent[]>
  listOverdueCharges(organizationId: string): Promise<ChargeWithStudent[]>
  getChargesForStudent(organizationId: string, studentId: string): Promise<Charge[]>
  markChargeAsPaid(
    organizationId: string,
    chargeId: string,
    input: { method: Charge['paymentMethod']; paidAt: string; providerPaymentId?: string },
  ): Promise<Charge | null>
  listCollectionRules(organizationId: string): Promise<CollectionRule[]>

  /*
   * Referências criadas no provedor de pagamento.
   *
   * O provedor identifica pagador e cobrança por ids próprios. Sem guardá-los,
   * a confirmação de pagamento não tem como encontrar a cobrança: o webhook
   * procura por (provider, provider_charge_id) e devolveria "não encontrada"
   * para sempre.
   */
  getProviderCustomerId(
    organizationId: string,
    studentId: string,
    provider: string,
  ): Promise<string | null>
  saveProviderCustomerId(input: {
    organizationId: string
    studentId: string
    provider: string
    providerCustomerId: string
  }): Promise<void>
  attachProviderCharge(input: {
    organizationId: string
    chargeId: string
    provider: string
    providerChargeId: string
  }): Promise<void>

  // Check-in
  listCheckIns(
    organizationId: string,
    options: { since?: Date; limit?: number },
  ): Promise<CheckInWithStudent[]>
  listCheckInsForStudent(
    organizationId: string,
    studentId: string,
    limit?: number,
  ): Promise<CheckIn[]>
  createCheckIn(input: {
    organizationId: string
    studentId: string
    method: CheckIn['method']
  }): Promise<CheckIn>

  // Treinos
  listExercises(organizationId: string): Promise<Exercise[]>
  listWorkoutPlans(organizationId: string): Promise<WorkoutPlan[]>
  getWorkoutPlan(organizationId: string, planId: string): Promise<WorkoutPlan | null>
  listWorkoutExercises(
    workoutPlanId: string,
  ): Promise<Array<WorkoutExercise & { exercise: Exercise }>>
  listAssignmentsForStudent(organizationId: string, studentId: string): Promise<WorkoutAssignment[]>
  countAssignments(organizationId: string): Promise<Record<string, number>>
  listWorkoutLogs(organizationId: string, studentId: string): Promise<WorkoutLog[]>

  // Avaliações
  listAssessments(organizationId: string, studentId: string): Promise<Assessment[]>

  // CRM
  listLeads(organizationId: string): Promise<Lead[]>
}
