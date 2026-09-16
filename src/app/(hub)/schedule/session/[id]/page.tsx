import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarX, MapPin, UserRound } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { SessionConsole } from '@/features/schedule/session-console'
import { chaveDoDia, horaLocal, ocupacao } from '@/features/schedule/week'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Aula' }

type Params = Promise<{ id: string }>

export default async function SessionPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('schedule:read')
  const dataSource = await getDataSource()

  const sessao = await dataSource.getClassSession(session.organizationId, id)
  if (!sessao) notFound()

  const [reservas, alunos] = await Promise.all([
    dataSource.listClassBookings(session.organizationId, sessao.id),
    dataSource.listStudents(session.organizationId, { status: 'ACTIVE', page: 1, pageSize: 300 }),
  ])

  const lotacao = ocupacao(sessao)
  const presentes = reservas.filter((r) => r.status === 'ATTENDED').length
  const dia = new Date(sessao.startsAt)

  return (
    <div className="mx-auto max-w-4xl space-y-5 animate-fade-in-up">
      <BackLink href={`/schedule?semana=${chaveDoDia(dia)}`} label="Agenda" />

      <PageHeader
        title={sessao.name}
        description={`${dia.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} · ${horaLocal(sessao.startsAt)} às ${horaLocal(sessao.endsAt)}`}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-synse-muted">
        {sessao.staffName && (
          <span className="flex items-center gap-1.5">
            <UserRound className="size-4" aria-hidden />
            {sessao.staffName}
          </span>
        )}
        {sessao.room && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {sessao.room}
          </span>
        )}
        {sessao.status === 'CANCELLED' && (
          <Badge variant="danger">
            Cancelada{sessao.cancellationReason ? ` — ${sessao.cancellationReason}` : ''}
          </Badge>
        )}
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Confirmados"
          value={formatNumber(lotacao.ocupadas)}
          icon={UserRound}
          accent="primary"
        />
        <MetricCard
          label="Vagas"
          value={lotacao.lotada ? 'Cheia' : formatNumber(lotacao.vagas)}
          icon={UserRound}
          accent={lotacao.lotada ? 'warning' : 'default'}
        />
        <MetricCard
          label="Espera"
          value={formatNumber(reservas.filter((r) => r.status === 'WAITLIST').length)}
          icon={UserRound}
          accent="default"
        />
        <MetricCard
          label="Presenças"
          value={formatNumber(presentes)}
          icon={CalendarX}
          accent="success"
          hint="Marcadas na chamada"
        />
      </section>

      <SessionConsole
        sessao={sessao}
        reservas={reservas}
        alunos={alunos.rows.map((aluno) => ({ id: aluno.id, name: aluno.name }))}
        podeEscrever={can(session.role, 'schedule:write')}
      />
    </div>
  )
}
