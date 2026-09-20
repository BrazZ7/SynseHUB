import Link from 'next/link'
import { Target } from 'lucide-react'

import { progressoDaMeta } from '@/features/synse-run/goal'
import { formatDistance } from '@/features/synse-run/format'
import { cn } from '@/lib/utils'

/**
 * ── A semana ────────────────────────────────────────────────────────────────
 *
 * Sete colunas sempre, inclusive as vazias. Um gráfico que só desenha os dias
 * treinados esconde exatamente o que a pessoa vem procurar: onde ela parou.
 *
 * O rótulo do dia vai **em cima** e o número embaixo. Invertido — como estava —
 * o olho bate primeiro no número e precisa descer para saber de que dia ele é;
 * na ordem natural de leitura o dia vem primeiro e o número responde.
 *
 * O dia mais longo acende. Não é enfeite: numa barra normalizada pelo maior
 * valor, a coluna cheia é a referência de tudo o que está do lado, e marcá-la
 * poupa a conta de descobrir qual é.
 */
export function WeekChart({
  byDay,
  distanceMeters,
  goalMeters,
}: {
  byDay: Array<{ label: string; distanceMeters: number }>
  distanceMeters: number
  goalMeters: number | null
}) {
  /* O `1` evita divisão por zero na semana em que ninguém correu. */
  const maior = Math.max(1, ...byDay.map((dia) => dia.distanceMeters))
  const meta = goalMeters === null ? null : progressoDaMeta(distanceMeters, goalMeters)

  return (
    <section className="vidro-led rounded-2xl border border-synse-border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-muted">
          Sua semana
        </h2>
        <Link href="/app/run/history" className="shrink-0 text-xs text-synse-primary">
          Ver todas
        </Link>
      </div>

      <ul
        className="mt-4 flex items-stretch justify-between gap-1.5"
        aria-label="Distância por dia"
      >
        {byDay.map((dia) => {
          const descanso = dia.distanceMeters === 0
          const destaque = !descanso && dia.distanceMeters === maior
          const altura = Math.round((dia.distanceMeters / maior) * 100)

          return (
            <li key={dia.label} className="flex flex-1 flex-col items-center gap-2">
              <span
                className={cn(
                  'text-[10px] font-medium uppercase tracking-wider',
                  destaque ? 'text-synse-text' : 'text-synse-muted',
                )}
              >
                {dia.label}
              </span>

              <span
                className="flex h-24 w-full items-end overflow-hidden rounded-lg border border-synse-border/70 bg-synse-primary/5"
                aria-hidden
              >
                {/*
                 * Só o topo é arredondado. Com os quatro cantos, uma coluna
                 * curta vira uma pastilha solta no fundo da pista em vez de
                 * uma barra que sobe dela — a base é aparada pelo
                 * `overflow-hidden` da pista de qualquer jeito.
                 */}
                <span
                  className={cn(
                    'w-full rounded-t-lg transition-all',
                    descanso
                      ? 'bg-synse-muted/25'
                      : destaque
                        ? 'bg-gradient-to-t from-synse-primary to-synse-primary-light shadow-[0_0_14px_-2px_var(--synse-primary-light)]'
                        : 'bg-synse-primary/45',
                  )}
                  /* Um fio de 3% nos dias de descanso: a coluna vazia some, e
                     uma lacuna no meio do gráfico parece defeito. */
                  style={{ height: `${descanso ? 3 : Math.max(altura, 8)}%` }}
                />
              </span>

              <span className="flex flex-col items-center leading-none">
                <span
                  className={cn(
                    'text-xs font-semibold tabular-nums',
                    descanso ? 'text-synse-muted' : 'text-synse-text',
                  )}
                >
                  {descanso ? '–' : formatDistance(dia.distanceMeters, 1)}
                </span>
                {!descanso && (
                  <span className="mt-0.5 text-[9px] text-synse-muted" aria-hidden>
                    km
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {meta && goalMeters !== null && (
        /*
         * A meta divide o mesmo cartão que o gráfico, separada só por um fio.
         * São a mesma pergunta — como foi a semana — e dois cartões seguidos
         * com sete colunas e uma barra dizem isso duas vezes.
         */
        <div className="mt-5 border-t border-synse-border pt-4">
          <div className="flex items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-synse-primary/10 text-synse-primary"
              aria-hidden
            >
              <Target className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-xs text-synse-muted">Meta da semana</p>
              <p className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums leading-none text-synse-text">
                  {formatDistance(distanceMeters, 0)}
                </span>
                <span className="text-sm text-synse-muted">
                  / {formatDistance(goalMeters, 0)} km
                </span>
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span
              className="h-2 flex-1 overflow-hidden rounded-full bg-synse-surface-2"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-synse-gradient transition-all"
                style={{ width: `${meta.fracao * 100}%` }}
              />
            </span>
            {/*
             * O número não é limitado a 100, e a barra é. Quem passou da meta
             * lê que passou — foi o defeito do cartão de medalha, onde 17 numa
             * meta de 12 aparecia como "100%".
             */}
            <span className="shrink-0 text-sm font-semibold tabular-nums text-synse-text">
              {meta.percentual}%
            </span>
          </div>

          <p className="sr-only">
            {formatDistance(distanceMeters, 1)} km de uma meta de {formatDistance(goalMeters, 0)}{' '}
            km, {meta.percentual} por cento.
          </p>
        </div>
      )}
    </section>
  )
}
