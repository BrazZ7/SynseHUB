import type { Metadata } from 'next'
import { Activity, CalendarClock, Plus, Users } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { Pagination } from '@/components/synse/pagination'
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

/** Linhas por página. Uma tela de trabalho, não um relatório para rolar. */
const POR_PAGINA = 25

type Search = Promise<{ page?: string }>

export default async function AssessmentsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireHubSession('assessments:read')
  const dataSource = await getDataSource()

  const { page } = await searchParams
  const pagina = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)

  /*
   * ── A fila vem ordenada do banco ─────────────────────────────────────────
   *
   * Era montada aqui, de duas leituras que cortavam em silêncio:
   * `listStudents`, que para em 100, e `listLatestAssessments`, que lia 500
   * avaliações e deduplicava na aplicação. Numa academia com 478 ativos, a
   * tela ordenava os 100 primeiros do alfabeto e chamava aquilo de fila —
   * quem ficasse de fora não aparecia **nem nunca tendo sido avaliado**, que
   * é exatamente quem a fila existe para achar.
   *
   * `listLatestAssessments` era chamada só daqui e foi apagada junto: o
   * guarda `metodo-sem-chamador` a apontou assim que esta linha saiu.
   *
   * Paginar a lista alfabética não resolveria: a ordem por tempo sem avaliar
   * só existe sobre o conjunto inteiro. Ordenar depois de cortar é ordenar
   * outra coisa. Quem ordena agora é `fila_de_avaliacao` (0048), e os
   * cartões vêm de `resumo_das_avaliacoes`, contados sobre a academia.
   */
  const [fila, resumo] = await Promise.all([
    dataSource.listAssessmentQueue(
      session.organizationId,
      POR_PAGINA,
      (pagina - 1) * POR_PAGINA,
    ),
    dataSource.getAssessmentQueueSummary(session.organizationId, DIAS_ATE_REAVALIAR),
  ])

  const canWrite = can(session.role, 'assessments:write')
  const linhas = fila.linhas

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Avaliações físicas"
        description="Uma linha por aluno ativo, da avaliação mais antiga para a mais recente. Medidas, dobras cutâneas e composição corporal por Pollock."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/*
          Os três vêm de `resumo_das_avaliacoes`, contados no banco sobre
          todos os ativos. Contados aqui, eram os números da página: este
          cartão dizia "100 alunos ativos" numa academia com 478.
        */}
        <MetricCard
          label="Alunos ativos"
          value={formatNumber(resumo.ativos)}
          icon={Users}
          accent="default"
        />
        <MetricCard
          label="Nunca avaliados"
          value={formatNumber(resumo.nuncaAvaliados)}
          icon={Activity}
          accent={resumo.nuncaAvaliados > 0 ? 'warning' : 'success'}
          hint="Encabeçam a fila"
        />
        <MetricCard
          label="Reavaliação vencida"
          value={formatNumber(resumo.vencidas)}
          icon={CalendarClock}
          accent={resumo.vencidas > 0 ? 'warning' : 'success'}
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
                  {linhas.map((linha) => (
                    <tr key={linha.studentId}>
                      <td className="py-2.5 pr-4">
                        <ListLink
                          href={`/students/${linha.studentId}`}
                          className="flex items-center gap-2.5 hover:underline"
                        >
                          <StudentAvatar
                            name={linha.studentName}
                            avatarUrl={linha.avatarUrl}
                            size="sm"
                          />
                          <span className="font-medium text-synse-text">{linha.studentName}</span>
                        </ListLink>
                      </td>
                      <td className="py-2.5 pr-4">
                        {linha.assessedAt ? (
                          <span className="tabular-nums">
                            {formatDate(linha.assessedAt)}
                            {linha.diasSemAvaliar != null &&
                              linha.diasSemAvaliar > DIAS_ATE_REAVALIAR && (
                                <Badge variant="warning" className="ml-2">
                                  {linha.diasSemAvaliar} dias
                                </Badge>
                              )}
                          </span>
                        ) : (
                          <Badge variant="warning">Nunca avaliado</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {linha.weight != null ? `${linha.weight} kg` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{linha.bmi ?? '—'}</td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {linha.bodyFatPercentage != null ? `${linha.bodyFatPercentage}%` : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {canWrite && (
                          <Button variant="outline" size="sm" asChild>
                            <ListLink href={`/students/${linha.studentId}/assessments/new`}>
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
            <Pagination page={pagina} pageSize={POR_PAGINA} total={fila.total} />

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
