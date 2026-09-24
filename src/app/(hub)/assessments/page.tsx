import type { Metadata } from 'next'
import { Activity, CalendarClock, Plus, Users } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { StudentAvatar } from '@/components/synse/student-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { formatDate, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Avaliações' }

/**
 * Quando uma avaliação passa a estar vencida.
 *
 * Noventa dias é o intervalo que a maioria das academias usa para reavaliar —
 * tempo suficiente para a composição corporal mudar de forma mensurável, e
 * curto o bastante para o aluno ver progresso antes de desistir.
 */
const DIAS_ATE_REAVALIAR = 90

export default async function AssessmentsPage() {
  const session = await requireHubSession('assessments:read')
  const dataSource = await getDataSource()

  const [students, ultimas] = await Promise.all([
    dataSource.listStudents(session.organizationId, { status: 'ACTIVE', page: 1, pageSize: 200 }),
    dataSource.listLatestAssessments(session.organizationId),
  ])

  const canWrite = can(session.role, 'assessments:write')
  const porAluno = new Map(ultimas.map((avaliacao) => [avaliacao.studentId, avaliacao]))
  const hoje = Date.now()

  const linhas = students.rows
    .map((student) => {
      const ultima = porAluno.get(student.id) ?? null
      const dias = ultima
        ? Math.floor((hoje - new Date(`${ultima.assessedAt}T00:00:00`).getTime()) / 86_400_000)
        : null
      return { student, ultima, dias }
    })
    /*
     * Quem nunca foi avaliado vem primeiro, depois a avaliação mais antiga: a
     * ordem é a fila de trabalho do professor, não o histórico.
     */
    .sort((a, b) => (b.dias ?? Number.MAX_SAFE_INTEGER) - (a.dias ?? Number.MAX_SAFE_INTEGER))

  const semAvaliacao = linhas.filter((linha) => !linha.ultima).length
  const vencidas = linhas.filter(
    (linha) => linha.dias != null && linha.dias > DIAS_ATE_REAVALIAR,
  ).length

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Avaliações físicas"
        description="Uma linha por aluno ativo, da avaliação mais antiga para a mais recente. Medidas, dobras cutâneas e composição corporal por Pollock."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Alunos ativos"
          value={formatNumber(students.rows.length)}
          icon={Users}
          accent="default"
        />
        <MetricCard
          label="Nunca avaliados"
          value={formatNumber(semAvaliacao)}
          icon={Activity}
          accent={semAvaliacao > 0 ? 'warning' : 'success'}
          hint="Sem nenhuma medida registrada"
        />
        <MetricCard
          label="Reavaliação vencida"
          value={formatNumber(vencidas)}
          icon={CalendarClock}
          accent={vencidas > 0 ? 'warning' : 'success'}
          hint={`Mais de ${DIAS_ATE_REAVALIAR} dias`}
        />
      </section>

      {linhas.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhum aluno ativo para avaliar"
          description="As avaliações aparecem aqui assim que houver alunos ativos na academia."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Fila de avaliação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="synse-scroll overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Alunos ativos e a última avaliação física de cada um
                </caption>
                <thead>
                  <tr className="border-b border-synse-border text-left text-xs uppercase tracking-wide text-synse-muted">
                    <th scope="col" className="py-2 pr-4 font-semibold">Aluno</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Última</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Peso</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">IMC</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Gordura</th>
                    <th scope="col" className="py-2 font-semibold">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-synse-border">
                  {linhas.map(({ student, ultima, dias }) => (
                    <tr key={student.id}>
                      <td className="py-2.5 pr-4">
                        <ListLink
                          href={`/students/${student.id}`}
                          className="flex items-center gap-2.5 hover:underline"
                        >
                          <StudentAvatar name={student.name} avatarUrl={student.avatarUrl} size="sm" />
                          <span className="font-medium text-synse-text">{student.name}</span>
                        </ListLink>
                      </td>
                      <td className="py-2.5 pr-4">
                        {ultima ? (
                          <span className="tabular-nums">
                            {formatDate(ultima.assessedAt)}
                            {dias != null && dias > DIAS_ATE_REAVALIAR && (
                              <Badge variant="warning" className="ml-2">
                                {dias} dias
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <Badge variant="warning">Nunca avaliado</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {ultima?.weight != null ? `${ultima.weight} kg` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{ultima?.bmi ?? '—'}</td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {ultima?.bodyFatPercentage != null ? `${ultima.bodyFatPercentage}%` : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {canWrite && (
                          <Button variant="outline" size="sm" asChild>
                            <ListLink href={`/students/${student.id}/assessments/new`}>
                              <Plus className="size-4" aria-hidden />
                              Avaliar
                            </ListLink>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-synse-muted">
              Os valores são registrados pelo profissional responsável. O sistema calcula
              composição corporal pelas equações de Jackson &amp; Pollock e não emite conclusão
              clínica.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
