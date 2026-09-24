import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  agruparPorDia,
  chaveDoDia,
  diasDaSemana,
  ehHoje,
  horaLocal,
  inicioDaSemana,
  janelaDaSemana,
  ocupacao,
  rotuloDoDia,
  somarSemanas,
} from '@/features/schedule/week'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { cn, formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Agenda' }

type Search = Promise<{ semana?: string }>

export default async function SchedulePage({ searchParams }: { searchParams: Search }) {
  const { semana } = await searchParams
  const session = await requireHubSession('schedule:read')
  const dataSource = await getDataSource()

  /*
   * A semana vem da URL, não do estado do cliente: assim o link é
   * compartilhável, o botão de voltar do navegador funciona e a página continua
   * inteira no servidor.
   */
  const referencia = semana ? new Date(`${semana}T12:00:00`) : new Date()
  const inicio = inicioDaSemana(Number.isNaN(referencia.getTime()) ? new Date() : referencia)
  const dias = diasDaSemana(inicio)

  /*
   * Repõe a grade antes de ler. Sai barato quando o horizonte está cheio, e é o
   * que dispensa o agendamento externo: quem abre a agenda a mantém viva.
   */
  await dataSource.ensureClassSessions(session.organizationId, 21)

  const [sessoes, regras] = await Promise.all([
    dataSource.listClassSessions(session.organizationId, janelaDaSemana(inicio)),
    dataSource.listClassSchedules(session.organizationId),
  ])

  const canWrite = can(session.role, 'schedule:write')
  const porDia = agruparPorDia(sessoes)
  const ativas = regras.filter((regra) => regra.status === 'ACTIVE')

  const confirmados = sessoes
    .filter((aula) => aula.status === 'SCHEDULED')
    .reduce((soma, aula) => soma + aula.bookedCount, 0)

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Agenda"
        description={`${ativas.length} aulas na grade semanal · ${formatNumber(confirmados)} presenças confirmadas nesta semana.`}
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/schedule/new">
                <Plus className="size-4" />
                Nova aula
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/schedule?semana=${chaveDoDia(somarSemanas(inicio, -1))}`}>
              <ChevronLeft className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Semana anterior</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/schedule">Hoje</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/schedule?semana=${chaveDoDia(somarSemanas(inicio, 1))}`}>
              <span className="sr-only sm:not-sr-only">Próxima semana</span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="text-sm text-synse-muted">
          {dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} a{' '}
          {dias[6].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
        </p>
      </div>

      {ativas.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma aula na grade"
          description="Cadastre a primeira aula recorrente. As ocorrências das próximas três semanas são criadas na hora."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/schedule/new">
                  <Plus className="size-4" />
                  Cadastrar a primeira aula
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="synse-scroll overflow-x-auto pb-2">
          <div className="grid min-w-[840px] grid-cols-7 gap-3">
            {dias.map((dia) => {
              const aulas = porDia.get(chaveDoDia(dia)) ?? []
              const hoje = ehHoje(dia)

              return (
                <section key={chaveDoDia(dia)} className="space-y-2">
                  <h2
                    className={cn(
                      'sticky top-0 rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide',
                      hoje
                        ? 'bg-synse-primary/15 text-synse-primary'
                        : 'text-synse-muted',
                    )}
                  >
                    {rotuloDoDia(dia)}
                  </h2>

                  {aulas.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-synse-border px-2 py-4 text-center text-xs text-synse-muted">
                      Sem aulas
                    </p>
                  ) : (
                    aulas.map((aula) => {
                      const lotacao = ocupacao(aula)
                      const cancelada = aula.status === 'CANCELLED'

                      return (
                        <ListLink
                          key={aula.id}
                          href={`/schedule/session/${aula.id}`}
                          className={cn(
                            'block rounded-xl border p-2.5 transition-shadow hover:shadow-synse',
                            cancelada
                              ? 'border-synse-border bg-synse-surface-2 opacity-60'
                              : 'border-synse-border bg-synse-surface',
                          )}
                        >
                          <p className="text-xs font-semibold tabular-nums text-synse-primary">
                            {horaLocal(aula.startsAt)}
                          </p>
                          <p
                            className={cn(
                              'mt-0.5 text-sm font-medium text-synse-text',
                              cancelada && 'line-through',
                            )}
                          >
                            {aula.name}
                          </p>
                          {aula.staffName && (
                            <p className="truncate text-xs text-synse-muted">{aula.staffName}</p>
                          )}

                          {cancelada ? (
                            <Badge variant="danger" className="mt-1.5">
                              Cancelada
                            </Badge>
                          ) : (
                            <div className="mt-1.5 space-y-1">
                              <div
                                className="h-1 overflow-hidden rounded-full bg-synse-border"
                                role="img"
                                aria-label={`${lotacao.ocupadas} de ${aula.capacity} vagas ocupadas`}
                              >
                                <div
                                  className={cn(
                                    'h-full rounded-full',
                                    lotacao.lotada ? 'bg-synse-warning' : 'bg-synse-primary',
                                  )}
                                  style={{ width: `${Math.min(lotacao.proporcao, 1) * 100}%` }}
                                />
                              </div>
                              <p className="flex items-center gap-1 text-xs text-synse-muted">
                                <Users className="size-3" aria-hidden />
                                {lotacao.lotada
                                  ? 'Turma cheia'
                                  : `${lotacao.vagas} ${lotacao.vagas === 1 ? 'vaga' : 'vagas'}`}
                              </p>
                            </div>
                          )}
                        </ListLink>
                      )
                    })
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}

      {ativas.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 text-sm font-semibold text-synse-text">Grade semanal</h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ativas.map((regra) => (
                <li key={regra.id}>
                  <ListLink
                    href={`/schedule/${regra.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-synse-border p-2.5 text-sm transition-colors hover:border-synse-primary"
                  >
                    <span>
                      <span className="font-medium text-synse-text">{regra.name}</span>
                      <span className="block text-xs text-synse-muted">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][regra.weekday]} ·{' '}
                        {regra.startTime} · {regra.capacity} vagas
                      </span>
                    </span>
                    <span className="text-xs text-synse-muted">{regra.room ?? '—'}</span>
                  </ListLink>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
