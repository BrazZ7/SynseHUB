import { Info, Timer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { BASELINE_WORKOUT } from '@/lib/baseline/workout'

/**
 * O treino que existe antes de a academia atribuir qualquer coisa.
 *
 * Aparece para quem ainda não recebeu plano e para quem treina sem academia.
 * Some no instante em que a academia atribui um — a tela não mistura os dois,
 * para não haver dúvida sobre qual seguir hoje.
 */
export function BaselineWorkout() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-synse-text">{BASELINE_WORKOUT.name}</h2>
        <Badge variant="outline">{BASELINE_WORKOUT.frequency}</Badge>
      </div>
      <p className="text-sm text-synse-muted">{BASELINE_WORKOUT.summary}</p>

      {BASELINE_WORKOUT.sessions.map((session) => (
        <section
          key={session.label}
          className="overflow-hidden rounded-2xl border border-synse-border bg-synse-surface shadow-synse-sm"
        >
          <header className="bg-synse-surface-2/60 border-b border-synse-border px-5 py-4">
            <h3 className="text-sm font-semibold text-synse-text">
              Treino {session.label} — {session.focus}
            </h3>
          </header>

          <ul className="divide-y divide-synse-border">
            {session.exercises.map((exercise) => (
              <li key={exercise.name} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-synse-text">{exercise.name}</p>
                    {exercise.note && (
                      <p className="mt-0.5 text-xs text-synse-muted">{exercise.note}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-synse-muted">
                    {exercise.sets}× {exercise.reps}
                  </p>
                </div>
                {exercise.restSeconds > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-synse-muted">
                    <Timer className="size-3" aria-hidden />
                    {exercise.restSeconds}s de descanso
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-4 text-xs text-synse-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {BASELINE_WORKOUT.disclaimer}
      </p>
    </div>
  )
}
