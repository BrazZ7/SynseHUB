import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Timer, Trophy } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Metric } from '@/features/synse-run/components/metric'
import { PendingSync } from '@/features/synse-run/components/pending-sync'
import { RunHero } from '@/features/synse-run/components/run-hero'
import { WeekChart } from '@/features/synse-run/components/week-chart'
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

  return (
    <div className="animate-fade-in-up space-y-5">
      {/*
       * A capa é o primeiro filho, e tem de ser: ela sangra para fora com
       * `-mt-6`, e o `space-y-5` deste contêiner aplica `margin-top` a partir
       * do segundo filho com especificidade maior — bastaria um cabeçalho
       * acima dela para a arte descer e deixar uma faixa da cor da página no
       * topo.
       *
       * A saudação, o `h1` e os três esportes moram dentro dela. O elo de
       * voltar saiu: a barra de baixo já leva ao Hoje, e uma seta sobre a arte
       * reabriria a moldura que a capa sem borda veio justamente desfazer.
       */}
      <RunHero
        saudacao={`${greeting()}, ${firstName(session.name)}`}
        chamada="Movimento é evolução"
      />

      <WeekChart
        byDay={painel.byDay}
        distanceMeters={painel.week.distanceMeters}
        goalMeters={painel.goalMeters}
      />

      {/* Resumo da semana */}
      <section className="vidro-led rounded-2xl border border-synse-border p-5">
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
              className="vidro-led flex items-center gap-3 rounded-2xl border border-synse-border p-4 transition-colors hover:border-synse-primary"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-synse-primary/10 text-synse-primary">
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
        <section className="vidro-led rounded-2xl border border-synse-border p-5">
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
