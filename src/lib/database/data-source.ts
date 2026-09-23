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
  WorkoutPreferences,
  WorkoutAdherenceRow,
  WorkoutSessionSummary,
  WorkoutTotals,
  CollectionRule,
  ConsentState,
  Friend,
  FriendRankRow,
  ContentItem,
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
  listWorkoutLogs(organizationId: string, studentId: string): Promise<WorkoutLog[]>

  // Avaliações
  listAssessments(organizationId: string, studentId: string): Promise<Assessment[]>
  getAssessment(organizationId: string, assessmentId: string): Promise<Assessment | null>
  /** A última avaliação de cada aluno, para a tela de acompanhamento. */
  listLatestAssessments(organizationId: string): Promise<Assessment[]>
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
  getWorkoutAdherence(
    studentId: string,
    from: string,
    to: string,
  ): Promise<WorkoutAdherenceRow[]>
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
  /** O histórico da própria pessoa, do mais recente para trás. */
  listBodyMeasurements(period: BodyPeriod): Promise<BodyMeasurement[]>
  /**
   * O histórico de outra pessoa — que só volta com linha se ela autorizou.
   * A tranca é a RLS, não esta consulta.
   */
  listSharedBodyMeasurements(userProfileId: string, period: BodyPeriod): Promise<BodyMeasurement[]>
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

  // CRM
  listLeads(organizationId: string): Promise<Lead[]>
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
