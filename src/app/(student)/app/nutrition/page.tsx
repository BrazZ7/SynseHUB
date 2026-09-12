import type { Metadata } from 'next'
import { Info, Salad } from 'lucide-react'

import { AppBackLink } from '@/components/synse/app-back-link'
import { Badge } from '@/components/ui/badge'
import { BASELINE_MEAL_PLAN } from '@/lib/baseline/meal-plan'
import { requireStudentSession } from '@/lib/auth/require-session'

export const metadata: Metadata = { title: 'Alimentação' }

/**
 * Plano alimentar base.
 *
 * Vale para todo mundo desde o primeiro minuto, com ou sem academia. Quando a
 * academia tiver nutricionista e publicar um plano individual, ele passa a
 * aparecer aqui no lugar deste — e aí sim é prescrição, com autor responsável.
 */
export default async function StudentNutritionPage() {
  await requireStudentSession()
  const plano = BASELINE_MEAL_PLAN

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="space-y-1">
        <AppBackLink href="/app" label="Hoje" />
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-synse-text">{plano.name}</h1>
          <Badge variant="outline">Grátis</Badge>
        </div>
        <p className="text-sm text-synse-muted">{plano.summary}</p>
      </header>

      <section className="space-y-3">
        {plano.meals.map((meal) => (
          <article
            key={meal.name}
            className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-synse-text">{meal.name}</h2>
              <span className="text-xs text-synse-muted">{meal.time}</span>
            </div>
            <p className="mt-1.5 text-sm text-synse-text">{meal.suggestion}</p>
            <ul className="mt-2 space-y-1">
              {meal.swaps.map((swap) => (
                <li key={swap} className="text-xs text-synse-muted">
                  Troca: {swap}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
        <div className="flex items-center gap-2">
          <Salad className="size-4 text-synse-primary" aria-hidden />
          <h2 className="text-sm font-medium text-synse-text">Hábitos que sustentam o plano</h2>
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {plano.habits.map((habit) => (
            <li key={habit} className="text-sm text-synse-muted">
              · {habit}
            </li>
          ))}
        </ul>
      </section>

      <p className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-4 text-xs text-synse-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {plano.disclaimer}
      </p>
    </div>
  )
}
