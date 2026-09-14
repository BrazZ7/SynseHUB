import type { Metadata } from 'next'
import { CalendarDays, Clock, Hourglass, Users } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { MetricCard } from '@/components/synse/metric-card'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { createSupabaseServerClient } from '@/lib/database/supabase-server'
import { cn, formatDate, formatNumber, formatTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Agenda' }

type ScheduleSession = {
  id: string
  name: string
  startsAt: string
  endsAt: string
  capacity: number
  bookedCount: number
  waitlistCount: number
  room: string | null
  staffName: string | null
  status: 'SCHEDULED' | 'CANCELLED'
}

type ScheduleResult = {
  sessions: ScheduleSession[]
  unavailable: boolean
}

type SessionRow = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  capacity: number
  booked_count: number | null
  room: string | null
  status: 'SCHEDULED' | 'CANCELLED'
  staff?: { user_profiles?: { name?: string | null } | null } | null
}

type BookingRow = {
  session_id: string
  status: 'BOOKED' | 'WAITLIST' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW'
}

const JANELA_DIAS = 14
const DIA_LOCAL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' })

export default async function SchedulePage() {
  const session = await requireHubSession('schedule:read')
  const { sessions, unavailable } = await listSchedule(session.organizationId)

  const hoje = new Date()
  const hojeKey = dateKey(hoje)
  const aulasHoje = sessions.filter((item) => dateKey(item.startsAt) === hojeKey)
  const waitlist = sessions.reduce((total, item) => total + item.waitlistCount, 0)
  const vagasLivres = sessions.reduce(
    (total, item) => total + Math.max(0, item.capacity - item.bookedCount),
    0,
  )

  const grupos = groupByDay(sessions)

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Agenda"
        description="Aulas dos proximos 14 dias, com lotacao, lista de espera e cancelamentos."
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Aulas na janela"
          value={formatNumber(sessions.length)}
          icon={CalendarDays}
          accent="primary"
        />
        <MetricCard
          label="Hoje"
          value={formatNumber(aulasHoje.length)}
          icon={Clock}
          accent={aulasHoje.length > 0 ? 'success' : 'default'}
        />
        <MetricCard
          label="Vagas livres"
          value={formatNumber(vagasLivres)}
          icon={Users}
          accent="success"
        />
        <MetricCard
          label="Na espera"
          value={formatNumber(waitlist)}
          icon={Hourglass}
          accent={waitlist > 0 ? 'warning' : 'default'}
        />
      </section>

      {unavailable && (
        <Card className="border-synse-warning/30 bg-synse-warning/8">
          <CardContent className="py-4 text-sm text-synse-text">
            A agenda ja esta publicada no codigo, mas o banco desta instalacao ainda nao
            respondeu com as tabelas da migration 0024. Depois que o SQL estiver aplicado,
            esta tela passa a listar as aulas reais automaticamente.
          </CardContent>
        </Card>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nenhuma aula na agenda"
          description="Quando houver aulas materializadas para os proximos dias, elas aparecem aqui."
        />
      ) : (
        <div className="space-y-4">
          {grupos.map(([dia, aulas]) => (
            <Card key={dia}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{formatDate(`${dia}T12:00:00`, 'long')}</CardTitle>
                  <Badge variant="outline">{formatNumber(aulas.length)} aulas</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {aulas.map((aula) => {
                  const ocupacao = aula.capacity > 0 ? aula.bookedCount / aula.capacity : 0
                  const cheia = aula.bookedCount >= aula.capacity
                  return (
                    <article
                      key={aula.id}
                      className={cn(
                        'rounded-xl border border-synse-border bg-synse-surface-2/60 p-4',
                        aula.status === 'CANCELLED' && 'opacity-70',
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-synse-text">{aula.name}</h2>
                            {aula.status === 'CANCELLED' ? (
                              <Badge variant="danger">Cancelada</Badge>
                            ) : cheia ? (
                              <Badge variant="warning">Lotada</Badge>
                            ) : (
                              <Badge variant="success">Aberta</Badge>
                            )}
                          </div>
                          <p className="text-sm text-synse-muted">
                            {formatTime(aula.startsAt)} - {formatTime(aula.endsAt)}
                            {aula.room ? ` · ${aula.room}` : ''}
                            {aula.staffName ? ` · ${aula.staffName}` : ''}
                          </p>
                        </div>

                        <div className="grid min-w-[220px] grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-synse-muted">
                              Reservas
                            </p>
                            <p className="mt-1 font-semibold tabular-nums text-synse-text">
                              {aula.bookedCount}/{aula.capacity}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-synse-muted">
                              Espera
                            </p>
                            <p className="mt-1 font-semibold tabular-nums text-synse-text">
                              {aula.waitlistCount}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-synse-surface">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            cheia ? 'bg-synse-warning' : 'bg-synse-primary',
                          )}
                          style={{ width: `${Math.min(100, Math.round(ocupacao * 100))}%` }}
                        />
                      </div>
                    </article>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

async function listSchedule(organizationId: string): Promise<ScheduleResult> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { sessions: demoSchedule(), unavailable: false }

  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + JANELA_DIAS)

  const { data, error } = await supabase
    .from('class_sessions')
    .select('id,name,starts_at,ends_at,capacity,booked_count,room,status,staff:staff_id(user_profiles(name))')
    .eq('organization_id', organizationId)
    .gte('starts_at', inicio.toISOString())
    .lt('starts_at', fim.toISOString())
    .order('starts_at', { ascending: true })

  if (error) return { sessions: [], unavailable: true }

  const rows = (data ?? []) as SessionRow[]
  const ids = rows.map((row) => row.id)
  const waitlistBySession = new Map<string, number>()

  if (ids.length > 0) {
    const { data: bookings } = await supabase
      .from('class_bookings')
      .select('session_id,status')
      .eq('organization_id', organizationId)
      .in('session_id', ids)
      .eq('status', 'WAITLIST')

    for (const booking of (bookings ?? []) as BookingRow[]) {
      waitlistBySession.set(booking.session_id, (waitlistBySession.get(booking.session_id) ?? 0) + 1)
    }
  }

  return {
    unavailable: false,
    sessions: rows.map((row) => ({
      id: row.id,
      name: row.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: Number(row.capacity),
      bookedCount: Number(row.booked_count ?? 0),
      waitlistCount: waitlistBySession.get(row.id) ?? 0,
      room: row.room,
      staffName: row.staff?.user_profiles?.name ?? null,
      status: row.status,
    })),
  }
}

function groupByDay(sessions: ScheduleSession[]) {
  const groups = new Map<string, ScheduleSession[]>()
  for (const session of sessions) {
    const key = dateKey(session.startsAt)
    groups.set(key, [...(groups.get(key) ?? []), session])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function dateKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return DIA_LOCAL.format(date)
}

function demoSchedule(): ScheduleSession[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const modelos = [
    ['Funcional', 7, 0, 45, 18, 14, 2, 'Sala 1', 'Camila Rocha'],
    ['Musculacao guiada', 9, 0, 60, 12, 9, 0, 'Area livre', 'Rafael Dias'],
    ['Spinning', 18, 30, 50, 20, 20, 3, 'Bike studio', 'Mariana Alves'],
    ['Pilates solo', 8, 0, 50, 10, 7, 0, 'Sala 2', 'Leticia Gomes'],
    ['HIIT', 19, 0, 40, 16, 13, 1, 'Sala 1', 'Bruno Lima'],
    ['Alongamento', 20, 0, 35, 15, 6, 0, 'Sala 2', 'Camila Rocha'],
  ] as const

  return modelos.map((modelo, index) => {
    const [name, hour, minute, duration, capacity, booked, waitlist, room, staffName] = modelo
    const starts = new Date(today)
    starts.setDate(starts.getDate() + Math.floor(index / 3))
    starts.setHours(hour, minute, 0, 0)
    const ends = new Date(starts)
    ends.setMinutes(ends.getMinutes() + duration)

    return {
      id: `demo_schedule_${index}`,
      name,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      capacity,
      bookedCount: booked,
      waitlistCount: waitlist,
      room,
      staffName,
      status: 'SCHEDULED',
    }
  })
}
