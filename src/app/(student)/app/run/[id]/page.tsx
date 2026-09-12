import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Info, Mountain, Timer, Zap } from 'lucide-react'

import { AppBackLink } from '@/components/synse/app-back-link'
import { Badge } from '@/components/ui/badge'
import { Metric } from '@/features/synse-run/components/metric'
import { PaceChart } from '@/features/synse-run/components/pace-chart'
import { RouteMap } from '@/features/synse-run/components/route-map'
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPaceDelta,
  formatSpeed,
  SPORT_LABELS,
} from '@/features/synse-run/format'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Atividade' }

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudentSession()
  const { id } = await params

  const dataSource = await getDataSource()
  const atividade = await dataSource.getActivity(id)

  // A RLS já garante que só o dono lê: id de outra pessoa volta vazio, e vazio
  // aqui é 404 — não "sem permissão", que confirmaria que a atividade existe.
  if (!atividade) notFound()

  const [rota, parciais] = await Promise.all([
    dataSource.getActivityRoute(id),
    dataSource.getActivitySplits(id),
  ])

  const quando = new Date(atividade.startedAt)

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <AppBackLink href="/app/run" label="SynseRun" />
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-synse-text">
            {atividade.title ?? tituloPorHorario(quando, atividade.sport)}
          </h1>
        </div>
        <p className="text-sm text-synse-muted">
          {quando.toLocaleString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </header>

      <section className="rounded-2xl bg-synse-gradient-deep p-6 text-center text-white shadow-synse-lg">
        <p className="text-6xl font-semibold tabular-nums leading-none">
          {formatDistance(atividade.distanceMeters)}
        </p>
        <p className="mt-1 text-sm font-medium uppercase tracking-[0.2em] text-white/60">km</p>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Tempo</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatDuration(atividade.movingSeconds)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/50">Pace médio</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatPace(atividade.averagePace)}
            </p>
          </div>
        </div>
      </section>

      {rota.length > 1 && <RouteMap points={rota} className="h-64" />}

      <section className="grid grid-cols-2 gap-3">
        {[
          { label: 'Velocidade média', value: formatSpeed(atividade.averageSpeed), unit: 'km/h' },
          { label: 'Velocidade máxima', value: formatSpeed(atividade.maxSpeed), unit: 'km/h' },
          {
            label: 'Ganho de elevação',
            value: `+${Math.round(atividade.elevationGain)}`,
            unit: 'm',
          },
          { label: 'Calorias', value: String(atividade.calories), unit: 'kcal' },
        ].map((metrica) => (
          <div
            key={metrica.label}
            className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
          >
            <Metric {...metrica} />
          </div>
        ))}
      </section>

      {parciais.length > 0 && (
        <>
          <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
              <Timer className="size-4 text-synse-muted" aria-hidden />
              Parciais
            </h2>

            <ul className="mt-3 space-y-2">
              {parciais.map((parcial) => {
                const diferenca = atividade.averagePace
                  ? formatPaceDelta(parcial.paceSeconds, atividade.averagePace)
                  : null

                return (
                  <li key={parcial.kilometer} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-synse-muted">KM {parcial.kilometer}</span>
                    <span className="flex items-center gap-2">
                      {diferenca && (
                        <span className="text-[11px] text-synse-muted">{diferenca}</span>
                      )}
                      <span className="text-sm tabular-nums text-synse-text">
                        {formatPace(parcial.paceSeconds)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <PaceChart splits={parciais} averagePace={atividade.averagePace} />
        </>
      )}

      {atividade.maxAltitude !== null && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
            <Mountain className="size-4 text-synse-muted" aria-hidden />
            Altitude
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Metric
              label="Mínima"
              value={String(Math.round(atividade.minAltitude ?? 0))}
              unit="m"
              size="sm"
            />
            <Metric
              label="Máxima"
              value={String(Math.round(atividade.maxAltitude))}
              unit="m"
              size="sm"
            />
            <Metric
              label="Perda"
              value={`-${Math.round(atividade.elevationLoss)}`}
              unit="m"
              size="sm"
            />
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          <Zap className="mr-1 size-3" aria-hidden />
          {SPORT_LABELS[atividade.sport]}
        </Badge>
        <Badge variant="outline">
          {atividade.privacy === 'PUBLIC'
            ? 'Público'
            : atividade.privacy === 'GYM'
              ? 'Visível para a academia'
              : 'Somente eu'}
        </Badge>
      </section>

      <p className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-4 text-xs text-synse-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Distância, pace e elevação são recalculados no servidor a partir do percurso. Calorias são
        estimativa por esforço, não medição.
      </p>
    </div>
  )
}

/** "Corrida matinal", "Corrida noturna" — o nome que a pessoa daria. */
function tituloPorHorario(quando: Date, sport: 'RUN' | 'WALK' | 'RIDE'): string {
  const hora = quando.getHours()
  const periodo =
    hora < 6 ? 'de madrugada' : hora < 12 ? 'matinal' : hora < 18 ? 'da tarde' : 'noturna'

  return `${SPORT_LABELS[sport]} ${periodo}`
}
