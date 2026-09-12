import type { Metadata } from 'next'
import Link from 'next/link'
import { Bike, ChevronRight, Footprints, Timer, Trophy } from 'lucide-react'

import { AppBackLink } from '@/components/synse/app-back-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Metric } from '@/features/synse-run/components/metric'
import { PendingSync } from '@/features/synse-run/components/pending-sync'
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatRecordDistance,
  SPORT_LABELS,
} from '@/features/synse-run/format'
import { getRunDashboard } from '@/features/synse-run/service'
import { requireStudentSession } from '@/lib/auth/require-session'
import { firstName, greeting } from '@/lib/utils'

export const metadata: Metadata = { title: 'SynseRun' }

export default async function SynseRunPage() {
  const session = await requireStudentSession()
  const painel = await getRunDashboard(session)

  const maiorDoDia = Math.max(1, ...painel.byDay.map((dia) => dia.distanceMeters))

  return (
    <div className="animate-fade-in-up space-y-5">
      <header>
        <AppBackLink href="/app" label="Hoje" />
        <p className="mt-1 text-sm text-synse-muted">
          {greeting()}, {firstName(session.name)}
        </p>
        <h1 className="text-2xl font-semibold text-synse-text">SynseRun</h1>
        <p className="text-sm text-synse-muted">Pronto para se movimentar?</p>
      </header>

      {/* Resumo da semana */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-muted">
          Resumo semanal
        </h2>

        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric
            label="Distância"
            value={formatDistance(painel.week.distanceMeters, 1)}
            unit="km"
          />
          <Metric label="Tempo" value={formatDuration(painel.week.movingSeconds)} />
          <Metric label="Atividades" value={String(painel.week.activities)} />
          <Metric label="Calorias" value={String(painel.week.calories)} unit="kcal" />
        </div>
      </section>

      {/* Gráfico da semana */}
      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-muted">
          Sua semana
        </h2>

        <ul className="mt-4 flex items-end justify-between gap-2" aria-label="Distância por dia">
          {painel.byDay.map((dia) => {
            const altura = Math.round((dia.distanceMeters / maiorDoDia) * 100)
            const descanso = dia.distanceMeters === 0

            return (
              <li key={dia.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] tabular-nums text-synse-muted">
                  {descanso ? '—' : formatDistance(dia.distanceMeters, 1)}
                </span>
                <span
                  className="flex h-24 w-full items-end rounded-lg bg-synse-surface-2"
                  aria-hidden
                >
                  <span
                    className="w-full rounded-lg bg-synse-gradient transition-all"
                    style={{ height: `${descanso ? 4 : Math.max(altura, 8)}%` }}
                  />
                </span>
                <span className="text-[10px] font-medium text-synse-muted">{dia.label}</span>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Começar */}
      <section className="space-y-2">
        <Button asChild size="lg" variant="gradient" className="h-14 w-full text-base">
          <Link href="/app/run/start?esporte=RUN">INICIAR CORRIDA</Link>
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <Link href="/app/run/start?esporte=WALK">
              <Footprints className="size-4" />
              {SPORT_LABELS.WALK}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/run/start?esporte=RIDE">
              <Bike className="size-4" />
              {SPORT_LABELS.RIDE}
            </Link>
          </Button>
        </div>
      </section>

      <PendingSync />

      {!painel.available && (
        <p className="rounded-xl bg-synse-surface-2 p-4 text-sm text-synse-muted">
          O histórico do SynseRun está sendo liberado nesta conta. Você já pode correr — a atividade
          fica guardada no aparelho e sobe assim que o registro abrir.
        </p>
      )}

      {/* Últimas atividades */}
      {painel.recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-synse-text">Últimas atividades</h2>
            <Link href="/app/run/history" className="text-xs text-synse-primary">
              Ver todas
            </Link>
          </div>

          {painel.recent.map((atividade) => (
            <Link
              key={atividade.id}
              href={`/app/run/${atividade.id}`}
              className="flex items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-4 transition-colors hover:border-synse-primary"
            >
              <span className="bg-synse-primary/10 grid size-10 shrink-0 place-items-center rounded-xl text-synse-primary">
                <Timer className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-synse-text">
                  {SPORT_LABELS[atividade.sport]} · {formatDistance(atividade.distanceMeters)} km
                </span>
                <span className="block text-xs text-synse-muted">
                  {new Date(atividade.startedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })}{' '}
                  · {formatDuration(atividade.movingSeconds)} · {formatPace(atividade.averagePace)}
                  /km
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-synse-muted" aria-hidden />
            </Link>
          ))}
        </section>
      )}

      {/* Recordes */}
      {painel.records.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
            <Trophy className="size-4 text-synse-primary" aria-hidden />
            Seus recordes
          </h2>
          <ul className="mt-3 space-y-2">
            {painel.records.map((recorde) => (
              <li key={recorde.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-synse-muted">
                  {formatRecordDistance(recorde.distanceMeters)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-synse-text">
                    {formatDuration(recorde.seconds)}
                  </span>
                  <Badge variant="outline">{formatPace(recorde.paceSeconds)}/km</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
