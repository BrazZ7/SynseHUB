import type { OverdueBucket } from '@/features/payments/faixas-de-atraso'
import type { BodySeriesPoint } from '@/features/synse-body/baldes-da-serie'
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
  AssessmentQueueRow,
  AssessmentQueueSummary,
  AssessmentProtocol,
  AssessmentSex,
  BaselineChallenge,
  ChallengeEntry,
  ChallengeMedal,
  Charge,
  CheckIn,
  ClassBooking,
  ClassBookingStatus,
  ClassSchedule,
  ClassSession,
  ClassSessionForStudent,
  ClassOccupancyRow,
  ExerciseProgressPoint,
  GymChallenge,
  GymChallengeForStudent,
  GymChallengeMetric,
  GymChallengeRankRow,
  GymTrainingReport,
  NutritionPlan,
  NutritionPlanWithMeals,
  ExercisePersonalRecord,
  StudentAtRisk,
  OngoingWorkout,
  WorkoutPreferences,
  WorkoutAdherenceRow,
  WorkoutSessionSummary,
  WorkoutTotals,
  CollectionRule,
  ConsentState,
  Friend,
  FriendRankRow,
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
  ContentType,
  StaffInvite,
  UserRole,
  ConsentType,
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
  PersonalRecord,
  SportType,
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

/**
 * O recorte do CRM.
 *
 * `decided` separa as duas listas da tela: o funil mostra quem está em
 * negociação, e "Já decididos" mostra matriculado e perdido. São conjuntos
 * com crescimento diferente — o funil é trabalho em aberto, o outro é
 * histórico que nunca encolhe —, e por isso cada um pagina por conta.
 */
/** O recorte do histórico de cobranças de um aluno. */
export type ChargeHistoryFilters = {
  /** `'ALL'` ou ausente traz todas; a tela do aluno pede só `PAID`. */
  status?: Charge['status'] | 'ALL'
  page?: number
  pageSize?: number
}

/** O recorte do histórico de treino. */
export type WorkoutLogFilters = {
  /** ISO. Sem data, o gráfico pediria a vida inteira — e plotaria milhares de pontos. */
  since?: string
  limit?: number
}

/**
 * A carga do primeiro e do último registro com peso.
 *
 * Duas linhas, decididas pelo banco. A home do aluno lia **todo** o histórico
 * de treino para usar exatamente estas duas — e a leitura vem em ordem
 * crescente, então o corte do PostgREST levava o registro mais **recente**: o
 * "ganho de carga" congelava num valor antigo.
 *
 * As duas podem ser de exercícios **diferentes**: é como o número sempre foi
 * calculado, e a diferença entre uma rosca de 20 kg e um agachamento de 100
 * não é ganho de força. Isto aqui conserta o corte e nada mais — mudar o que o
 * número significa é decisão de produto, e está anotada em
 * `docs/pre-producao.md` em vez de resolvida escondida numa correção.
 */
export type LoadProgress = {
  primeira: number | null
  ultima: number | null
}

export type LeadFilters = {
  /** `true` traz matriculado e perdido; `false` ou ausente, quem está em negociação. */
  decided?: boolean
  page?: number
  pageSize?: number
}

/**
 * Os quatro números dos cartões do CRM.
 *
 * Contados no banco sobre o funil inteiro. Antes a tela lia todos os leads e
 * contava na aplicação — e uma leitura sem teto que alimenta um número
 * devolve número errado com cara de certo quando o PostgREST corta a
 * resposta.
 */
export type CrmSummary = {
  emNegociacao: number
  retornoAtrasado: number
  matriculados: number
  perdidos: number
}

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

/**
 * O que a tela manda ao gravar uma avaliação.
 *
 * Repare no que não está aqui: IMC, densidade corporal e o percentual dos
 * protocolos. Esses saem de conta, e a conta é do banco — o gatilho da 0023
 * recalcula na escrita. Aceitar o número pronto daria ao cliente a chance de
 * contar outra história sobre o mesmo corpo.
 */
export type SaveAssessmentInput = {
  /** Ausente cria; presente corrige a avaliação existente. */
  id?: string
  organizationId: string
  studentId: string
  assessedByStaffId: string | null
  assessedAt: string
  weight: number | null
  height: number | null
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
  ageYears: number | null
  /** Só é gravado quando o protocolo é MANUAL — bioimpedância, por exemplo. */
  bodyFatPercentage: number | null
  skinfoldChest: number | null
  skinfoldAxilla: number | null
  skinfoldTriceps: number | null
  skinfoldSubscapular: number | null
  skinfoldAbdominal: number | null
  skinfoldSuprailiac: number | null
  skinfoldThigh: number | null
}

/**
 * A regra semanal de uma aula.
 *
 * Sem `id` cria; com `id` corrige. Não carrega as aulas já materializadas: a
 * correção da regra vale para as próximas, e reescrever o passado apagaria a
 * presença de quem já foi.
 */
export type SaveClassScheduleInput = {
  id?: string
  organizationId: string
  name: string
  description: string | null
  staffId: string | null
  weekday: number
  startTime: string
  durationMinutes: number
  capacity: number
  room: string | null
  startsOn: string
  endsOn: string | null
  status: 'ACTIVE' | 'ARCHIVED'
}

export type ScheduleWindow = {
  /** Início da janela, inclusivo, em ISO. */
  from: string
  /** Fim da janela, exclusivo. */
  to: string
}

/**
 * Uma série concluída, a caminho do banco.
 *
 * `clientId` é gerado no aparelho antes de existir rede: é ele que faz o toque
 * duplo e o reenvio da fila offline caírem na mesma linha.
 */
export type LogWorkoutSetInput = {
  sessionId: string
  exerciseId: string
  setNumber: number
  repsCompleted: number
  clientId: string
  weight: number | null
  repsPlanned: number | null
  restSeconds: number | null
  startedAt: string | null
  completedAt: string
}

export type SaveLeadInput = {
  id?: string
  organizationId: string
  name: string
  phone: string | null
  email: string | null
  source: Lead['source']
  ownerStaffId: string | null
  notes: string | null
  nextFollowUpAt: string | null
}

export type SaveGymChallengeInput = {
  id?: string
  organizationId: string
  title: string
  description: string | null
  metric: GymChallengeMetric
  targetValue: number
  unit: string
  startsAt: string
  endsAt: string
  rankingEnabled: boolean
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED'
  reward: string | null
  createdByStaffId: string | null
}

/**
 * O plano inteiro, numa escrita só.
 *
 * Refeições e itens vão juntos porque um plano é editado como documento, não
 * campo a campo: salvar a refeição sem os itens deixaria o aluno com "Café da
 * manhã" e nada dentro se a segunda escrita falhasse.
 */
export type PairUserDeviceInput = {
  /**
   * O identificador que a plataforma dá ao aparelho. No iOS é um UUID do
   * CoreBluetooth, estável para aquele aparelho naquele iPhone; no Android é o
   * endereço que o rádio anunciou. Ver `docs/SYNSE_SCALE_COMPATIBILITY.md`.
   */
  platformDeviceId: string
  displayName: string
  provider?: string
  manufacturer?: string | null
  model?: string | null
  protocol?: string | null
  /** O que o aparelho comprovadamente entrega, lido dele no pareamento. */
  capabilities?: Record<string, boolean>
  firmwareVersion?: string | null
}

export type SaveNutritionPlanInput = {
  id?: string
  organizationId: string
  studentId: string
  authorStaffId: string
  title: string
  notes: string | null
  targetCalories: number | null
  targetProteinG: number | null
  targetCarbsG: number | null
  targetFatG: number | null
  meals: Array<{
    name: string
    timeOfDay: string | null
    items: Array<{
      description: string
      quantity: string | null
      calories: number | null
      proteinG: number | null
      carbsG: number | null
      fatG: number | null
    }>
  }>
}

export type SaveContentInput = {
  id?: string
  organizationId: string
  type: ContentType
  title: string
  summary: string | null
  body: string | null
  coverUrl: string | null
  mediaUrl: string | null
  pinned: boolean
  /** Nulo mantém como rascunho. Data no futuro agenda. */
  publishedAt: string | null
  authorStaffId: string | null
}

/**
 * Um item do acervo Synse — conteúdo **sem dono**, da plataforma.
 *
 * Não reaproveita `SaveContentInput` porque as duas coisas divergem onde mais
 * importa: lá `organizationId` é obrigatório e a visibilidade é sempre
 * `ORGANIZATION`; aqui não há academia e a visibilidade é a decisão central —
 * é ela que separa o acervo aberto do que só o assinante vê. Um tipo só com
 * campos opcionais escondendo essa diferença convidaria ao engano caro:
 * publicar como aberto o que era para ser do Synse+.
 */
export type SaveSynseContentInput = {
  id?: string
  type: ContentType
  title: string
  summary: string | null
  body: string | null
  coverUrl: string | null
  mediaUrl: string | null
  visibility: 'FREE' | 'SYNSE_PLUS'
  pinned: boolean
  /** Nulo mantém como rascunho. Data no futuro agenda. */
  publishedAt: string | null
}

/** O recorte do histórico de pesagens. */
export type BodyHistoryFilters = {
  page?: number
  pageSize?: number
}

/** O recorte da tela de inadimplentes. */
export type OverdueFilters = {
  /** A faixa de atraso, ou `'ALL'`. Vira janela de vencimento na consulta. */
  faixa?: OverdueBucket | 'ALL'
  /** O dia de referência do atraso. A tela e o banco precisam usar o mesmo. */
  hoje?: Date
  page?: number
  pageSize?: number
}

/**
 * O consolidado das cobranças vencidas.
 *
 * `cobrancas` e `alunos` são grandezas diferentes de propósito: um aluno pode
 * dever dois meses, e a tela mostra as duas lado a lado justamente para não
 * deixar confundir uma com a outra.
 */
export type OverdueSummary = {
  cobrancas: number
  alunos: number
  valor: number
  /** A soma dos dias de atraso. A média é `dias / cobrancas`, na tela. */
  dias: number
  porFaixa: Record<OverdueBucket, number>
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
    /** GYM para academia, STUDIO para profissional independente. */
    type?: 'GYM' | 'STUDIO'
  }): Promise<string>

  /**
   * Vincula a pessoa autenticada a uma academia existente pelo código de
   * convite. A matrícula nasce pendente de confirmação — só a academia decide
   * quem de fato é aluno dela.
   */
  joinOrganizationAsStudent(input: { inviteCode: string; studentName: string }): Promise<string>

  /**
   * Entrada de quem não tem academia vinculada — ou treina numa que não usa o
   * Synse. A matrícula nasce ativa: não há quem confirme.
   */
  joinSynseAsSoloStudent(input: { studentName: string }): Promise<string>

  /**
   * Abre o espaço de quem assinou o plano profissional. O banco recusa sem
   * assinatura ativa — a tela não é a guardiã disso.
   */
  openProfessionalSpace(input: { name: string; slug: string; ownerName: string }): Promise<string>

  /**
   * Corrige os dados de um aluno já matriculado.
   *
   * O e-mail fica de fora de propósito: ele é a identidade da conta, que é da
   * pessoa e vale em todas as academias. Trocá-lo daqui renomearia o login de
   * alguém a partir do painel de terceiros.
   */
  updateStudent(input: {
    organizationId: string
    studentId: string
    name: string
    phone: string | null
    taxId: string | null
    goal: string | null
    trainerId: string | null
    planId: string | null
    billingDay: number
  }): Promise<void>

  /** Muda a situação da matrícula. Usada para confirmar quem entrou por código. */
  updateStudentStatus(input: {
    organizationId: string
    studentId: string
    status: StudentStatus
  }): Promise<void>

  // Planos e matrículas
  listPlans(organizationId: string): Promise<MembershipPlan[]>
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
  /**
   * As cobranças vencidas de uma academia, por página e por faixa de atraso.
   *
   * Cobrança vencida acumula mês a mês e ninguém apaga, então era a leitura
   * sem teto mais perto de encostar no corte silencioso do PostgREST — e a
   * que erra na direção mais cara: a tela somava cinco números em cima dela,
   * e todos os cinco vinham **menores** que a realidade.
   *
   * A faixa é recortada no servidor, por janela de vencimento, e não sobre a
   * página já lida: filtrar depois de paginar devolveria uma página quase
   * vazia dizendo que há sessenta.
   */
  listOverdueCharges(
    organizationId: string,
    filters?: OverdueFilters,
  ): Promise<Paginated<ChargeWithStudent>>
  /**
   * Os números da tela de inadimplentes, contados no banco (0051).
   *
   * `porFaixa` traz a contagem de cada faixa para o filtro, e `dias` é a
   * **soma** dos dias de atraso, não a média: quem divide é a tela, com o
   * mesmo arredondamento de sempre.
   */
  getOverdueSummary(organizationId: string, hoje?: Date): Promise<OverdueSummary>
  /**
   * O histórico de cobranças de um aluno, por página.
   *
   * Paginado porque cobrança não se apaga: um aluno de três anos tem três
   * dezenas, e um de dez tem mais de cem. A leitura sem teto que havia aqui
   * alimentava três decisões diferentes, e todas as três erravam quando o
   * PostgREST cortava a resposta.
   */
  getChargesForStudent(
    organizationId: string,
    studentId: string,
    filters?: ChargeHistoryFilters,
  ): Promise<Paginated<Charge>>
  /**
   * A cobrança em aberto mais próxima de vencer: a que a pessoa paga agora.
   *
   * Existe como consulta própria porque era decidida de dois jeitos
   * diferentes sobre a mesma lista — o painel pegava a **primeira** de uma
   * ordem decrescente (a mais nova) e o app ordenava de novo para pegar a
   * mais antiga. Aluno com dois meses atrasados ouvia um valor na recepção e
   * via outro no celular.
   */
  getNextOpenCharge(organizationId: string, studentId: string): Promise<Charge | null>
  /**
   * Uma cobrança do aluno, por id.
   *
   * O `studentId` na assinatura **é** a conferência de dono, feita pela
   * consulta e não por varredura de lista. Antes a action do PIX lia o
   * histórico inteiro e procurava o id dentro dele: com a resposta cortada, a
   * cobrança antiga que o aluno estava tentando quitar simplesmente não era
   * encontrada.
   */
  getStudentCharge(
    organizationId: string,
    studentId: string,
    chargeId: string,
  ): Promise<Charge | null>
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
  /**
   * Cria o plano e os exercícios dele numa operação só.
   *
   * Plano sem exercício é um título sem treino: aparece na lista da academia,
   * pode ser atribuído a um aluno, e o aluno abre para encontrar nada. Por isso
   * os dois nascem juntos, e um plano que ficou sem exercícios é desfeito.
   */
  createWorkoutPlan(input: {
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
  }): Promise<WorkoutPlan>

  /**
   * Edição de treino.
   *
   * Regrava a lista de exercícios inteira em vez de casar linha a linha: a
   * tela manda o treino completo, e reconciliar por id exigiria carregar o que
   * está lá, comparar e decidir o que é inserção, alteração e remoção — mais
   * código e mais jeitos de errar a ordem do que apagar e reinserir.
   *
   * O `organizationId` não é enfeite: ele é o que impede um id de treino de
   * outra academia, colado no formulário, de ser regravado. A RLS barraria de
   * qualquer jeito, mas o erro chegaria como falha genérica em vez de "esse
   * treino não é seu".
   */
  updateWorkoutPlan(input: {
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
  }): Promise<WorkoutPlan>

  /**
   * Atribui um treino a um aluno. É esta escrita que dispara o aviso de "novo
   * treino disponível" no sino — o gatilho está na 0012, e até agora nada no
   * produto chegava a acioná-lo.
   */
  assignWorkoutPlan(input: {
    organizationId: string
    workoutPlanId: string
    studentId: string
    validUntil: string | null
  }): Promise<WorkoutAssignment>

  listAssignmentsForStudent(organizationId: string, studentId: string): Promise<WorkoutAssignment[]>
  /** Quem já recebeu um treino. Uma consulta, em vez de uma por aluno. */
  listAssignmentsForPlan(
    organizationId: string,
    workoutPlanId: string,
  ): Promise<WorkoutAssignment[]>
  countAssignments(organizationId: string): Promise<Record<string, number>>
  /**
   * O histórico de treino de um aluno, recortado.
   *
   * O recorte é obrigatório na prática: a tabela cresce desde o primeiro dia
   * do aluno, e os dois gráficos que a leem plotam um ponto por linha.
   */
  listWorkoutLogs(
    organizationId: string,
    studentId: string,
    filters?: WorkoutLogFilters,
  ): Promise<WorkoutLog[]>
  /** Quantos registros o aluno tem, contados no banco. */
  countWorkoutLogs(organizationId: string, studentId: string): Promise<number>
  /** A primeira e a última carga registradas — duas linhas, não o histórico. */
  getLoadProgress(organizationId: string, studentId: string): Promise<LoadProgress>

  // Avaliações
  listAssessments(organizationId: string, studentId: string): Promise<Assessment[]>
  getAssessment(organizationId: string, assessmentId: string): Promise<Assessment | null>
  /** A última avaliação de cada aluno, para a tela de acompanhamento. */
  /**
   * A fila de avaliação, ordenada no banco e devolvida por página.
   *
   * Separada de `listStudents` + `listLatestAssessments` porque aquelas duas
   * cortam em silêncio — 100 alunos e 500 avaliações — e a tela ordenava o
   * pedaço, chamando de fila. A ordem por tempo sem avaliar só existe sobre
   * o conjunto inteiro.
   */
  listAssessmentQueue(
    organizationId: string,
    limite: number,
    deslocamento: number,
  ): Promise<{ linhas: AssessmentQueueRow[]; total: number }>
  getAssessmentQueueSummary(
    organizationId: string,
    diasAteReavaliar: number,
  ): Promise<AssessmentQueueSummary>
  saveAssessment(input: SaveAssessmentInput): Promise<Assessment>

  // Agenda
  listClassSchedules(organizationId: string): Promise<ClassSchedule[]>
  getClassSchedule(organizationId: string, scheduleId: string): Promise<ClassSchedule | null>
  saveClassSchedule(input: SaveClassScheduleInput): Promise<ClassSchedule>
  /** As aulas de uma janela de datas, em ordem cronológica. */
  listClassSessions(organizationId: string, window: ScheduleWindow): Promise<ClassSession[]>
  getClassSession(organizationId: string, sessionId: string): Promise<ClassSession | null>
  /** Quem está na aula, incluindo a fila de espera na ordem em que pediu. */
  listClassBookings(organizationId: string, sessionId: string): Promise<ClassBooking[]>
  cancelClassSession(
    organizationId: string,
    sessionId: string,
    reason: string | null,
  ): Promise<void>
  /**
   * Materializa as aulas de uma academia. Idempotente — quem garante isso é o
   * `unique (schedule_id, starts_at)` no banco.
   *
   * Exige `organizationId` de propósito: a varredura global é do agendamento
   * diário, que roda como service_role. Expor a global à sessão da academia
   * deixaria qualquer conta autenticada gerar aula de toda a plataforma.
   */
  generateClassSessions(organizationId: string, daysAhead: number): Promise<number>
  /** A varredura de todas as academias. Só o agendamento diário chama. */
  generateAllClassSessions(daysAhead: number): Promise<number>
  /**
   * Garante que existe grade à frente, chamada na leitura das telas de agenda.
   *
   * Sai barato quando o horizonte está cheio. É o que faz a agenda se manter
   * sozinha, sem depender de um agendamento externo que pode não existir no
   * plano contratado nem avisar quando falha.
   */
  ensureClassSessions(organizationId: string, daysAhead: number): Promise<number>
  /** Presença. Só a equipe marca, e só depois que a aula começou. */
  markAttendance(
    organizationId: string,
    bookingId: string,
    status: Extract<ClassBookingStatus, 'ATTENDED' | 'NO_SHOW' | 'BOOKED'>,
  ): Promise<void>
  /**
   * Reserva. Devolve o que aconteceu: entrou na aula ou na fila.
   * A decisão é do banco, sob trava — nunca contada aqui.
   */
  bookClass(sessionId: string, studentId?: string): Promise<ClassBookingStatus>
  cancelClassBooking(bookingId: string): Promise<void>
  /** A grade que o aluno vê, com a própria reserva e a posição na fila. */
  listClassSessionsForStudent(
    organizationId: string,
    studentId: string,
    window: ScheduleWindow,
  ): Promise<ClassSessionForStudent[]>

  // Treino Ativo
  /**
   * Abre o treino, ou devolve o que já estava aberto.
   *
   * O aluno sai do usuário autenticado, no banco — nunca do que o cliente
   * mandou. Idempotente por `clientId`.
   */
  startWorkoutSession(clientId: string, workoutPlanId: string | null): Promise<string>
  logWorkoutSet(input: LogWorkoutSetInput): Promise<string>
  finishWorkoutSession(
    sessionId: string,
    durationSeconds: number,
    status: 'COMPLETED' | 'ABANDONED',
  ): Promise<void>
  /** O treino em andamento no servidor, para recuperar em outro aparelho. */
  getActiveWorkoutSession(studentId: string): Promise<WorkoutSessionSummary | null>
  /**
   * Quem está treinando agora, na academia inteira.
   *
   * Separado do `getActiveWorkoutSession` porque a pergunta é outra: aquele
   * responde por um aluno, e o painel da recepção perguntaria uma vez por
   * matrícula — quatrocentas consultas para montar uma lista de seis.
   */
  listActiveWorkoutSessions(organizationId: string): Promise<OngoingWorkout[]>
  listWorkoutSessions(studentId: string, limite: number): Promise<WorkoutSessionSummary[]>
  getWorkoutPreferences(userProfileId: string): Promise<WorkoutPreferences>
  saveWorkoutPreferences(
    userProfileId: string,
    preferencias: WorkoutPreferences,
  ): Promise<WorkoutPreferences>

  // Relatórios
  /*
   * A agregação é do banco. Uma academia com duzentos alunos produz cerca de
   * 20 mil séries por mês, e trazer isso pela rede para somar aqui seria pagar
   * transferência e memória para descartar quase tudo.
   */
  getExerciseProgress(
    studentId: string,
    exerciseId: string,
    weeks: number,
  ): Promise<ExerciseProgressPoint[]>
  getPersonalRecords(studentId: string): Promise<ExercisePersonalRecord[]>
  getWorkoutTotals(studentId: string, from: string, to: string): Promise<WorkoutTotals>
  /**
   * Aderência ao planejado, uma linha por sessão (0035).
   *
   * Uma linha por sessão, e não um número só: a pergunta útil não é "quantos
   * por cento no mês", é a comparação entre as últimas sessões e a média — e
   * a mesma porcentagem serviria para as duas.
   */
  getWorkoutAdherence(studentId: string, from: string, to: string): Promise<WorkoutAdherenceRow[]>
  getGymTrainingReport(organizationId: string, from: string, to: string): Promise<GymTrainingReport>
  listStudentsAtRisk(organizationId: string, dias: number): Promise<StudentAtRisk[]>
  getClassOccupancyReport(
    organizationId: string,
    from: string,
    to: string,
  ): Promise<ClassOccupancyRow[]>

  // Desafios da academia
  listGymChallenges(organizationId: string): Promise<GymChallenge[]>
  getGymChallenge(organizationId: string, challengeId: string): Promise<GymChallenge | null>
  saveGymChallenge(input: SaveGymChallengeInput): Promise<GymChallenge>
  /** Os desafios da academia do aluno, com a participação dele junto. */
  listGymChallengesForStudent(
    organizationId: string,
    userProfileId: string,
  ): Promise<GymChallengeForStudent[]>
  joinGymChallenge(challengeId: string, rankingOptIn: boolean): Promise<void>
  /** Só quem consentiu aparece — a tranca é da consulta, não da permissão. */
  getGymChallengeRanking(challengeId: string): Promise<GymChallengeRankRow[]>

  // ── Foto de perfil ─────────────────────────────────────────────────────────
  /**
   * Sobe a foto e registra o caminho no perfil. Devolve o caminho gravado.
   *
   * O balde é privado: o que fica guardado é o caminho, não uma URL. Quem
   * exibe pede uma URL assinada, que expira.
   */
  uploadAvatar(file: { bytes: ArrayBuffer; contentType: string }): Promise<string>
  removeAvatar(): Promise<void>
  /** URL temporária para exibir a foto. Nulo quando não há foto ou acesso. */
  getAvatarUrl(path: string | null): Promise<string | null>

  // ── Synse Body ─────────────────────────────────────────────────────────────
  /*
   * Tudo aqui é da pessoa autenticada, e nenhum método recebe
   * `organizationId`. Não é esquecimento: medição de bioimpedância não
   * pertence à academia, e um parâmetro de academia nesta assinatura
   * convidaria alguém a montar uma listagem por academia mais tarde.
   */
  /**
   * O histórico da própria pessoa, do mais recente para trás, por página.
   *
   * Paginado porque pesagem não se apaga e quem pesa todo dia acumula centenas
   * por ano. A ordem é decrescente, então o corte silencioso do PostgREST
   * descartava o **mais antigo**: o peso de hoje continuava certo — a parte
   * que a pessoa confere — enquanto o começo do histórico sumia sem aviso.
   */
  listBodyMeasurements(
    period: BodyPeriod,
    filters?: BodyHistoryFilters,
  ): Promise<Paginated<BodyMeasurement>>
  /**
   * O histórico de outra pessoa — que só volta com linha se ela autorizou.
   * A tranca é a RLS, não esta consulta.
   */
  listSharedBodyMeasurements(
    userProfileId: string,
    period: BodyPeriod,
    filters?: BodyHistoryFilters,
  ): Promise<Paginated<BodyMeasurement>>
  /**
   * A série do gráfico de peso, agrupada pelo banco (0052).
   *
   * Um ponto por dia, semana ou mês conforme a janela — não um por pesagem.
   * Gráfico não tem página: ele mostra a janela inteira, e mandar duas mil
   * linhas para desenhar trezentos pixels é o que deixava o corte perto.
   *
   * `userProfileId` ausente é a própria pessoa. Passar o de outra é o caso do
   * professor autorizado, e quem decide se ele enxerga é a RLS.
   */
  getBodySeries(period: BodyPeriod, userProfileId?: string): Promise<BodySeriesPoint[]>
  /**
   * Grava a pesagem. Devolve o id, o mesmo no reenvio: é o que permite a fila
   * offline parar de tentar sem duplicar linha.
   */
  recordBodyMeasurement(measurement: BodyMeasurement): Promise<string>
  deleteBodyMeasurement(measurementId: string): Promise<void>

  listUserDevices(): Promise<UserDevice[]>
  /** Vincula o aparelho à pessoa autenticada. Idempotente pelo identificador. */
  pairUserDevice(input: PairUserDeviceInput): Promise<string>
  renameUserDevice(deviceId: string, displayName: string): Promise<void>
  /** Desvincula sem apagar o histórico: as pesagens já feitas continuam sendo dela. */
  unpairUserDevice(deviceId: string): Promise<void>

  /** Quem a pessoa autorizou a ver o corpo dela. */
  listBodyShares(): Promise<BodyMeasurementShare[]>
  /**
   * A quem ela pode autorizar: a equipe das academias em que é aluna ativa,
   * menos quem já está autorizado (0045).
   *
   * Existe como função no banco porque `staff_read` (0004) exige
   * `is_org_staff`: o aluno não lê a tabela `staff`, e abrir a política para
   * `is_org_member` daria a todo aluno o CREF e a situação de contrato de
   * toda a equipe.
   */
  listStaffToAuthorize(): Promise<EquipeParaAutorizar[]>
  grantBodyShare(sharedWithProfileId: string, organizationId: string | null): Promise<void>
  revokeBodyShare(shareId: string): Promise<void>

  // Nutrição
  listNutritionPlans(organizationId: string): Promise<NutritionPlan[]>
  listNutritionPlansForStudent(organizationId: string, studentId: string): Promise<NutritionPlan[]>
  getNutritionPlan(organizationId: string, planId: string): Promise<NutritionPlanWithMeals | null>
  /** O que o aluno segue hoje. Nulo enquanto não houver plano publicado. */
  getPublishedNutritionPlan(
    organizationId: string,
    studentId: string,
  ): Promise<NutritionPlanWithMeals | null>
  saveNutritionPlan(input: SaveNutritionPlanInput): Promise<NutritionPlan>
  /** Publica e arquiva o anterior, numa transação só no banco. */
  publishNutritionPlan(planId: string): Promise<void>
  newNutritionPlanVersion(planId: string): Promise<string>

  // Conteúdos
  /** Tudo que a academia escreveu, rascunho incluído. Só a equipe enxerga. */
  listContent(organizationId: string): Promise<ContentItem[]>
  getContent(organizationId: string, contentId: string): Promise<ContentItem | null>
  saveContent(input: SaveContentInput): Promise<ContentItem>
  deleteContent(organizationId: string, contentId: string): Promise<void>
  /** O que está publicado, para o aluno. Fixado primeiro, depois o recente. */
  listPublishedContent(organizationId: string, limite: number): Promise<ContentItem[]>
  /**
   * Um item publicado, com o corpo — o que a lista não traz.
   *
   * A lista devolve `body: null` de propósito: são até 20 mil caracteres por
   * item, e cinquenta itens de texto na resposta de uma tela que só mostra
   * título e resumo. Quem abre um item paga por um.
   *
   * A organização entra pela mesma regra da lista — o que é da academia dela
   * ou o que é da plataforma. Ela não é a autorização: quem autoriza é a RLS,
   * que também é quem tranca o `SYNSE_PLUS` de quem não assina.
   */
  getPublishedContent(organizationId: string, contentId: string): Promise<ContentItem | null>
  /**
   * A prateleira trancada: o que existe no Synse+ e esta conta não assina.
   *
   * Vazia para quem assina — esses itens aparecem na lista normal, com o
   * corpo — e vazia quando não há acervo pago. Quem decide é o banco
   * (`acervo_trancado`, 0041), não a tela.
   */
  listLockedShowcase(): Promise<ItemTrancado[]>
  /** O mesmo, para um id só: "este que me pediram está trancado?" */
  getLockedShowcase(contentId: string): Promise<ItemTrancado | null>

  // Programas guiados — sequências de dias da plataforma (0003, 0043).
  /**
   * Os programas que esta conta pode ver, com a matrícula dela junto.
   *
   * Quem filtra é a RLS: o programa `SYNSE_PLUS` não chega a quem não
   * assina. A lista não precisa saber disso, e é por isso que não recebe o
   * plano como parâmetro.
   */
  listPrograms(): Promise<ProgramaNaLista[]>
  getProgram(programId: string): Promise<{
    programa: Program
    passos: ProgramStep[]
    matricula: ProgramEnrollment | null
  } | null>
  startProgram(programId: string): Promise<void>
  completeProgramDay(programId: string, dia: number): Promise<void>
  undoProgramDay(programId: string, dia: number): Promise<void>
  abandonProgram(programId: string): Promise<void>
  /** Os programas do Synse+ que esta conta não abre. Vazio para quem já lê. */
  listLockedPrograms(): Promise<ProgramaTrancadoTipo[]>

  // Autoria de programa — só conta de plataforma. A checagem é no banco.
  saveProgram(input: {
    id?: string
    code: string
    title: string
    description: string | null
    durationDays: number
    coverUrl: string | null
    visibility: 'FREE' | 'SYNSE_PLUS'
  }): Promise<string>
  saveProgramStep(input: {
    programId: string
    dayNumber: number
    title: string
    tasks: string[]
  }): Promise<void>
  deleteProgram(programId: string): Promise<void>

  // Biblioteca de receitas — catálogo da plataforma, sem dono (0003, 0044).
  /**
   * As receitas que esta conta pode ver.
   *
   * Quem filtra é a RLS: a receita `SYNSE_PLUS` não chega a quem não assina.
   * A lista não precisa saber disso, e é por isso que não recebe o plano como
   * parâmetro — mesmo desenho de `listPrograms`.
   */
  listRecipes(): Promise<Recipe[]>
  getRecipe(recipeId: string): Promise<Recipe | null>
  /** As receitas do Synse+ que esta conta não abre. Vazio para quem já lê. */
  listLockedRecipes(): Promise<ReceitaTrancadaTipo[]>
  /** O mesmo, para um id só: "esta que me pediram está trancada?" */
  getLockedRecipe(recipeId: string): Promise<ReceitaTrancadaTipo | null>

  // Autoria de receita — só conta de plataforma. A checagem é no banco.
  saveRecipe(input: {
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
  }): Promise<string>
  deleteRecipe(recipeId: string): Promise<void>

  // Acervo Synse — conteúdo da plataforma, sem dono. Só conta de plataforma.
  /** Tudo que a plataforma escreveu, rascunho incluído. */
  listSynseContent(): Promise<ContentItem[]>
  getSynseContent(contentId: string): Promise<ContentItem | null>
  saveSynseContent(input: SaveSynseContentInput): Promise<string>
  deleteSynseContent(contentId: string): Promise<void>

  // Push — aviso com o app fechado. A tabela não tem política de leitura:
  // o que ela guarda é capacidade de escrever na tela de alguém.
  registerPushSubscription(input: {
    endpoint: string
    p256dh: string
    auth: string
    userAgent: string | null
  }): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>

  // CRM
  listLeads(organizationId: string, filters: LeadFilters): Promise<Paginated<Lead>>
  /** Os quatro cartões, contados sobre o CRM inteiro e não sobre a página. */
  getCrmSummary(organizationId: string): Promise<CrmSummary>
  getLead(organizationId: string, leadId: string): Promise<Lead | null>
  saveLead(input: SaveLeadInput): Promise<Lead>
  /**
   * Muda a etapa. O histórico é escrito por gatilho, não daqui — a etapa muda
   * pela tela, por importação e por SQL de suporte.
   */
  moveLeadStage(
    organizationId: string,
    leadId: string,
    stage: LeadStage,
    lostReason: string | null,
  ): Promise<void>
  addLeadEvent(
    organizationId: string,
    leadId: string,
    kind: LeadEventKind,
    body: string,
    actorStaffId: string | null,
  ): Promise<void>
  listLeadEvents(organizationId: string, leadId: string): Promise<LeadEvent[]>
  /** Devolve o `students.id`. Idempotente: converter duas vezes não duplica. */
  convertLead(leadId: string, planId: string | null, billingDay: number): Promise<string>

  /*
   * Notificações
   *
   * Únicos métodos sem `organizationId`: o aviso pertence à pessoa, não à
   * academia. Quem é dono de uma e aluno de outra vê os dois no mesmo sino, e
   * é assim que tem de ser — o sino é da conta.
   */
  listNotifications(userProfileId: string, limit?: number): Promise<AppNotification[]>
  countUnreadNotifications(userProfileId: string): Promise<number>
  /** Marca como lidos todos os avisos não lidos da pessoa. Devolve quantos. */
  markNotificationsRead(userProfileId: string): Promise<number>

  /*
   * Convite de equipe
   *
   * O token do link só volta uma vez, na criação, para quem acabou de criá-lo.
   * A listagem vem de uma view sem essa coluna: token legível por qualquer
   * pessoa da equipe é token que circula.
   */
  createStaffInvite(input: {
    organizationId: string
    email: string
    role: UserRole
    jobTitle: string | null
    registrationNumber: string | null
  }): Promise<string>
  listStaffInvites(organizationId: string): Promise<StaffInvite[]>
  /**
   * Aceita o convite e devolve a academia. O banco recusa se a sessão não for
   * do e-mail convidado — o link sozinho não dá acesso a nada.
   */
  acceptStaffInvite(token: string): Promise<string>
  revokeStaffInvite(inviteId: string): Promise<void>

  /*
   * Consentimento
   *
   * Também da pessoa, não da academia: quem troca de academia leva as próprias
   * autorizações junto, e quem não tem nenhuma continua sendo titular dos
   * próprios dados.
   */
  // ── Amigos (0037) ──────────────────────────────────────────────────────────
  /*
   * Amizade atravessa academia: o Synse+ é assinatura de consumidor, e nenhum
   * destes métodos recebe `organizationId`. Não é esquecimento — a tranca aqui
   * é a própria linha de amizade, e um parâmetro de academia nesta assinatura
   * convidaria alguém a montar uma listagem por academia mais tarde.
   */
  listFriends(): Promise<Friend[]>
  /** Pede pelo Synse ID. Devolve o id da amizade; nada do perfil alheio. */
  requestFriendship(synseId: string): Promise<string>
  respondFriendship(friendshipId: string, accept: boolean): Promise<void>
  removeFriendship(friendshipId: string): Promise<void>
  /** Você e os amigos que autorizaram. Sem consentimento, a pessoa não sai. */
  getFriendsRanking(from: string, to: string): Promise<FriendRankRow[]>

  listConsents(userProfileId: string): Promise<ConsentState[]>
  /**
   * Registra aceite ou revogação. A versão do documento é resolvida no banco —
   * se viesse daqui, a prova seria a palavra de quem está sendo provado.
   */
  recordConsent(input: { consentType: ConsentType; accepted: boolean }): Promise<void>

  /**
   * Encerra a conta de quem está autenticado.
   *
   * Apaga o que é só da pessoa, anonimiza o perfil e mantém o que a lei manda
   * guardar — consentimento e registro fiscal. Devolve o que foi apagado, para
   * a tela poder dizer à pessoa o que aconteceu.
   *
   * Não remove o usuário de autenticação: isso exige a chave de serviço e
   * acontece logo depois, na aplicação.
   */
  closeOwnAccount(confirmation: string): Promise<Record<string, number>>

  /*
   * Desafios base
   *
   * Também sem `organizationId`: o desafio é da pessoa e a acompanha quando ela
   * troca de academia — ou quando não tem nenhuma.
   */
  listBaselineChallenges(): Promise<BaselineChallenge[]>
  listChallengeEntries(userProfileId: string): Promise<ChallengeEntry[]>
  listChallengeMedals(userProfileId: string): Promise<ChallengeMedal[]>
  /** Escolhe o desafio do ciclo. O limite do plano é decidido no banco. */
  chooseBaselineChallenge(code: string): Promise<void>
  recordChallengeProgress(code: string, delta: number): Promise<number>
  /** Fecha ciclos passados de quem está autenticado e entrega as medalhas. */
  closeOwnChallengeCycles(): Promise<number>

  /*
   * SynseRun
   *
   * A atividade pertence à pessoa, não à academia: `organizationId` entra só
   * para ranking e para o treinador enxergar. Quem troca de academia leva o
   * histórico junto.
   */
  saveActivity(input: SaveActivityInput): Promise<string>
  listActivities(
    userProfileId: string,
    filters?: { sport?: SportType; since?: string; limit?: number },
  ): Promise<Activity[]>
  getActivity(activityId: string): Promise<Activity | null>
  getActivityRoute(activityId: string): Promise<ActivityRoutePoint[]>
  getActivitySplits(activityId: string): Promise<ActivitySplit[]>
  listPersonalRecords(userProfileId: string): Promise<PersonalRecord[]>
  summarizeActivities(userProfileId: string, since: string): Promise<ActivitySummary>
  updateActivityPrivacy(activityId: string, privacy: ActivityPrivacy): Promise<void>
  deleteActivity(activityId: string): Promise<void>
}

/**
 * Uma atividade chega inteira, com rota e parciais.
 *
 * Enviar em pedaços — criar, depois anexar pontos, depois fechar — deixaria
 * meia corrida gravada quando a rede cai no meio, e não há nada mais irritante
 * que perder a corrida depois de tê-la corrido. O `clientId` é gerado no
 * aparelho e torna o reenvio inofensivo.
 */
export type SaveActivityInput = {
  clientId: string
  userProfileId: string
  organizationId: string | null
  sport: SportType
  title: string | null
  startedAt: string
  endedAt: string
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
  privacy: ActivityPrivacy
  route: Array<{
    latitude: number
    longitude: number
    altitude: number | null
    speed: number | null
    accuracy: number | null
    heading: number | null
    recordedAt: string
    distanceFromPrevious: number
    totalDistance: number
  }>
  splits: ActivitySplit[]
}
