import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Activity,
  Apple,
  CalendarCheck,
  ChevronLeft,
  Dumbbell,
  FileText,
  History,
  Target,
  Wallet,
} from 'lucide-react'

import { ProgressLineChart } from '@/components/synse/charts/progress-line-chart'
import { ChartCard } from '@/components/synse/chart-card'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PaymentStatus, StudentStatusBadge } from '@/components/synse/status-badge'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import {
  daysBetween,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPhone,
} from '@/lib/utils'

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const session = await requireHubSession('students:read')
  const dataSource = await getDataSource()
  const student = await dataSource.getStudent(session.organizationId, id)
  return { title: student?.name ?? 'Aluno' }
}

export default async function StudentProfilePage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('students:read')
  const dataSource = await getDataSource()

  const student = await dataSource.getStudent(session.organizationId, id)
  if (!student) notFound()

  const [charges, checkIns, assignments, workoutLogs, assessments, workoutPlans] = await Promise.all([
    dataSource.getChargesForStudent(session.organizationId, student.id),
    dataSource.listCheckInsForStudent(session.organizationId, student.id, 90),
    dataSource.listAssignmentsForStudent(session.organizationId, student.id),
    dataSource.listWorkoutLogs(session.organizationId, student.id),
    dataSource.listAssessments(session.organizationId, student.id),
    dataSource.listWorkoutPlans(session.organizationId),
  ])

  const canSeeFinance = can(session.role, 'finance:read')
  const canSeeHealth = can(session.role, 'assessments:read')
  const canSeeNutrition = can(session.role, 'nutrition:read')

  const planById = new Map(workoutPlans.map((plan) => [plan.id, plan]))
  const latestAssessment = assessments[assessments.length - 1]
  const previousAssessment = assessments[assessments.length - 2]

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const checkInsThisMonth = checkIns.filter((c) => c.checkedInAt >= monthStart).length
  const attendanceGoal = 12
  const attendanceProgress = Math.min(100, (checkInsThisMonth / attendanceGoal) * 100)

  const openCharge = charges.find((c) => c.status === 'OVERDUE' || c.status === 'PENDING')
  const weightDelta =
    latestAssessment?.weight != null && previousAssessment?.weight != null
      ? latestAssessment.weight - previousAssessment.weight
      : null

  const loadSeries = workoutLogs
    .filter((log) => log.load != null)
    .map((log) => ({ label: formatDate(log.performedAt), value: log.load as number }))

  const weightSeries = assessments
    .filter((assessment) => assessment.weight != null)
    .map((assessment) => ({
      label: formatDate(assessment.assessedAt),
      value: assessment.weight as number,
    }))

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/students">
          <ChevronLeft className="size-4" />
          Alunos
        </Link>
      </Button>

      {/* Cabeçalho do perfil */}
      <header className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm sm:p-6">
        <div className="flex flex-wrap items-start gap-5">
          <StudentAvatar name={student.name} avatarUrl={student.avatarUrl} size="xl" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-page-title font-semibold text-synse-text">{student.name}</h1>
              <StudentStatusBadge status={student.status} />
            </div>

            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-synse-muted">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Synse ID</dt>
                <dd className="font-mono text-xs tracking-wide">{student.synseId}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt>Plano:</dt>
                <dd className="text-synse-text">{student.planName ?? 'Sem plano'}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt>Matrícula:</dt>
                <dd className="text-synse-text">{formatDate(student.enrolledAt)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt>Professor:</dt>
                <dd className="text-synse-text">{student.trainerName ?? 'A definir'}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-synse-muted">
              <span className="break-all">{student.email}</span>
              <span className="tabular-nums">{formatPhone(student.phone)}</span>
            </div>
          </div>

          {student.goal && (
            <Badge variant="primary" className="gap-1.5">
              <Target className="size-3" aria-hidden />
              {student.goal}
            </Badge>
          )}
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="workouts">Treinos</TabsTrigger>
          {canSeeHealth && <TabsTrigger value="assessments">Avaliações</TabsTrigger>}
          {canSeeNutrition && <TabsTrigger value="nutrition">Nutrição</TabsTrigger>}
          {canSeeFinance && <TabsTrigger value="finance">Financeiro</TabsTrigger>}
          <TabsTrigger value="attendance">Frequência</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* ── Visão geral ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Peso atual"
              value={latestAssessment?.weight != null ? `${latestAssessment.weight} kg` : '—'}
              icon={Activity}
              accent="primary"
              hint={
                weightDelta != null
                  ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg desde a anterior`
                  : 'Sem avaliação anterior'
              }
            />
            <MetricCard
              label="Frequência no mês"
              value={formatNumber(checkInsThisMonth)}
              icon={CalendarCheck}
              accent="success"
              hint={`Meta de ${attendanceGoal} treinos`}
            />
            <MetricCard
              label="Treinos registrados"
              value={formatNumber(workoutLogs.length)}
              icon={Dumbbell}
              accent="default"
              hint="Séries com carga anotada"
            />
            <MetricCard
              label="Mensalidade"
              value={student.planPrice != null ? formatCurrency(student.planPrice) : '—'}
              icon={Wallet}
              accent={student.status === 'OVERDUE' ? 'danger' : 'primary'}
              hint={
                openCharge
                  ? `Vence ${formatDate(openCharge.dueDate)}`
                  : 'Nenhuma cobrança em aberto'
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Progresso do mês</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-synse-muted">Frequência</span>
                    <span className="font-medium tabular-nums text-synse-text">
                      {checkInsThisMonth} / {attendanceGoal}
                    </span>
                  </div>
                  <Progress value={attendanceProgress} aria-label="Progresso de frequência" />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoRow label="Última presença" value={
                    student.lastCheckInAt ? formatDateTime(student.lastCheckInAt) : 'Sem registro'
                  } />
                  <InfoRow
                    label="Última avaliação"
                    value={latestAssessment ? formatDate(latestAssessment.assessedAt) : 'Nenhuma'}
                  />
                  <InfoRow label="Objetivo" value={student.goal ?? 'Não informado'} />
                  <InfoRow label="Treinos atribuídos" value={String(assignments.length)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Situação financeira</CardTitle>
              </CardHeader>
              <CardContent>
                {!canSeeFinance ? (
                  <RestrictedNotice />
                ) : openCharge ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-2xl font-semibold tabular-nums text-synse-text">
                        {formatCurrency(openCharge.amount)}
                      </p>
                      <p className="text-sm text-synse-muted">{openCharge.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PaymentStatus status={openCharge.status} />
                      <span className="text-xs text-synse-muted">
                        vence {formatDate(openCharge.dueDate)}
                      </span>
                    </div>
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <Link href="/finance">Abrir no Synse Pay</Link>
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    tone="positive"
                    title="Tudo em dia"
                    description="Nenhuma cobrança em aberto para este aluno."
                    className="py-6"
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Treinos ── */}
        <TabsContent value="workouts" className="space-y-4">
          {assignments.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="Nenhum treino atribuído"
              description="Monte um plano em Treinos e associe a este aluno."
              action={
                <Button asChild>
                  <Link href="/workouts">Ir para treinos</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {assignments.map((assignment) => {
                const plan = planById.get(assignment.workoutPlanId)
                if (!plan) return null
                return (
                  <Card key={assignment.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle>{plan.name}</CardTitle>
                        <Badge variant="primary">{plan.splitLabel}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm text-synse-muted">
                      <p>{plan.goal ?? 'Sem objetivo definido'}</p>
                      <p className="text-xs">
                        Atribuído em {formatDate(assignment.assignedAt)}
                        {assignment.validUntil && ` · válido até ${formatDate(assignment.validUntil)}`}
                      </p>
                      <Button variant="link" size="sm" asChild className="h-auto p-0">
                        <Link href={`/workouts/${plan.id}`}>Ver exercícios</Link>
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {loadSeries.length > 1 && (
            <ChartCard
              title="Evolução de carga"
              description="Supino reto — carga registrada a cada semana."
            >
              <ProgressLineChart data={loadSeries} unit=" kg" />
            </ChartCard>
          )}
        </TabsContent>

        {/* ── Avaliações ── */}
        {canSeeHealth && (
          <TabsContent value="assessments" className="space-y-4">
            {assessments.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Nenhuma avaliação registrada"
                description="As avaliações físicas aparecem aqui em ordem cronológica."
              />
            ) : (
              <>
                {weightSeries.length > 1 && (
                  <ChartCard title="Evolução do peso" description="Comparativo entre avaliações.">
                    <ProgressLineChart data={weightSeries} unit=" kg" />
                  </ChartCard>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Medidas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="synse-scroll overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">Histórico de medidas do aluno</caption>
                        <thead>
                          <tr className="border-b border-synse-border text-left text-xs uppercase tracking-wide text-synse-muted">
                            <th scope="col" className="py-2 pr-4 font-semibold">Data</th>
                            <th scope="col" className="py-2 pr-4 font-semibold">Peso</th>
                            <th scope="col" className="py-2 pr-4 font-semibold">IMC</th>
                            <th scope="col" className="py-2 pr-4 font-semibold">Cintura</th>
                            <th scope="col" className="py-2 pr-4 font-semibold">Braço</th>
                            <th scope="col" className="py-2 font-semibold">Coxa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-synse-border">
                          {[...assessments].reverse().map((assessment) => (
                            <tr key={assessment.id}>
                              <td className="py-2.5 pr-4 tabular-nums">
                                {formatDate(assessment.assessedAt)}
                              </td>
                              <td className="py-2.5 pr-4 tabular-nums">{assessment.weight ?? '—'} kg</td>
                              <td className="py-2.5 pr-4 tabular-nums">{assessment.bmi ?? '—'}</td>
                              <td className="py-2.5 pr-4 tabular-nums">{assessment.waist ?? '—'} cm</td>
                              <td className="py-2.5 pr-4 tabular-nums">{assessment.arm ?? '—'} cm</td>
                              <td className="py-2.5 tabular-nums">{assessment.thigh ?? '—'} cm</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-4 text-xs text-synse-muted">
                      Os valores são registrados pelo profissional responsável. O sistema não
                      interpreta nem emite conclusão clínica a partir destes dados.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        )}

        {/* ── Nutrição ── */}
        {canSeeNutrition && (
          <TabsContent value="nutrition">
            <EmptyState
              icon={Apple}
              title="Nenhum plano nutricional publicado"
              description="Planos individuais só podem ser publicados por nutricionista habilitado, com autoria, data e versão registradas."
            />
          </TabsContent>
        )}

        {/* ── Financeiro ── */}
        {canSeeFinance && (
          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de mensalidades</CardTitle>
              </CardHeader>
              <CardContent>
                {charges.length === 0 ? (
                  <EmptyState title="Nenhuma cobrança gerada" className="py-8" />
                ) : (
                  <ul className="divide-y divide-synse-border">
                    {charges.slice(0, 24).map((charge) => (
                      <li key={charge.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium capitalize text-synse-text">
                            {charge.description}
                          </p>
                          <p className="text-xs text-synse-muted">
                            Vencimento {formatDate(charge.dueDate)}
                            {charge.paidAt && ` · pago em ${formatDate(charge.paidAt)}`}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-synse-text">
                          {formatCurrency(charge.amount)}
                        </span>
                        <PaymentStatus status={charge.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* ── Frequência ── */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>Últimos check-ins</CardTitle>
            </CardHeader>
            <CardContent>
              {checkIns.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Nenhuma presença registrada"
                  description="Os check-ins feitos no app ou na recepção aparecem aqui."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-synse-border">
                  {checkIns.slice(0, 30).map((checkIn) => (
                    <li key={checkIn.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm text-synse-text">
                        {formatDateTime(checkIn.checkedInAt)}
                      </span>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">
                          {checkIn.method === 'MANUAL' ? 'Recepção' : 'QR Code'}
                        </Badge>
                        <span className="text-xs text-synse-muted">
                          há {daysBetween(checkIn.checkedInAt)} dias
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <EmptyState
            icon={FileText}
            title="Nenhum documento anexado"
            description="Contratos, atestados e termos de consentimento ficarão disponíveis aqui, com controle de acesso e registro em auditoria."
          />
        </TabsContent>

        <TabsContent value="history">
          <EmptyState
            icon={History}
            title="Histórico de auditoria"
            description="Alterações de plano, mensalidade e permissões deste aluno serão listadas aqui a partir da trilha de auditoria."
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-synse-surface-2/60 px-3 py-2.5">
      <p className="text-xs text-synse-muted">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-synse-text">{value}</p>
    </div>
  )
}

function RestrictedNotice() {
  return (
    <p className="rounded-lg bg-synse-surface-2/60 p-3 text-sm text-synse-muted">
      Seu perfil não tem acesso às informações financeiras deste aluno.
    </p>
  )
}
