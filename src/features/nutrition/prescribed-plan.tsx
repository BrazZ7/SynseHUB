import { Apple, Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { formatDate, formatNumber } from '@/lib/utils'
import type { NutritionPlanWithMeals } from '@/types/domain'

/**
 * O plano prescrito, no app do aluno.
 *
 * Substitui o plano base quando existe — é o que o comentário da página previa
 * desde que o base foi escrito. A diferença que a tela precisa deixar clara: o
 * base é sugestão geral, este tem nome de responsável técnico em cima.
 */
export function PrescribedPlan({ plano }: { plano: NutritionPlanWithMeals }) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-synse-text">{plano.title}</h1>
          <Badge variant="success">Seu plano</Badge>
        </div>
        <p className="text-sm text-synse-muted">
          {plano.authorName ? `Prescrito por ${plano.authorName}` : 'Prescrito pela sua academia'}
          {plano.publishedAt && ` · ${formatDate(plano.publishedAt)}`}
        </p>
      </header>

      {plano.targetCalories != null && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="text-sm font-semibold text-synse-text">Sua meta do dia</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Meta rotulo="Calorias" alvo={plano.targetCalories} entrega={plano.totals.calories} unidade="kcal" />
            <Meta rotulo="Proteína" alvo={plano.targetProteinG} entrega={plano.totals.proteinG} unidade="g" />
            <Meta rotulo="Carboidrato" alvo={plano.targetCarbsG} entrega={plano.totals.carbsG} unidade="g" />
            <Meta rotulo="Gordura" alvo={plano.targetFatG} entrega={plano.totals.fatG} unidade="g" />
          </dl>
        </section>
      )}

      <section className="space-y-3">
        {plano.meals.map((refeicao) => (
          <article
            key={refeicao.id}
            className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-synse-text">{refeicao.name}</h2>
              {refeicao.timeOfDay && (
                <span className="text-xs tabular-nums text-synse-muted">{refeicao.timeOfDay}</span>
              )}
            </div>

            <ul className="mt-2 space-y-1.5">
              {refeicao.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-synse-text">
                    {item.description}
                    {item.quantity && <span className="text-synse-muted"> · {item.quantity}</span>}
                  </span>
                  {item.calories != null && (
                    <span className="shrink-0 text-xs tabular-nums text-synse-muted">
                      {item.calories} kcal
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {plano.notes && (
        <section className="bg-synse-primary/5 border-synse-primary/20 rounded-2xl border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-synse-text">
            <Apple className="size-4 text-synse-primary" aria-hidden />
            Orientações
          </h2>
          <p className="mt-1 text-sm text-synse-muted">{plano.notes}</p>
        </section>
      )}

      {/*
        O mesmo aviso do plano base, e pela mesma razão: o app organiza o que o
        profissional prescreveu, não substitui a consulta.
      */}
      <p className="flex items-start gap-2 rounded-xl bg-synse-surface-2 p-3.5 text-xs text-synse-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Plano individual com responsável técnico. Alterações devem ser combinadas com quem o
        prescreveu — o Synse organiza o plano, não o substitui.
      </p>
    </div>
  )
}

function Meta({
  rotulo,
  alvo,
  entrega,
  unidade,
}: {
  rotulo: string
  alvo: number | null
  entrega: number
  unidade: string
}) {
  return (
    <div>
      <dt className="text-xs text-synse-muted">{rotulo}</dt>
      <dd className="text-lg font-semibold tabular-nums text-synse-text">
        {alvo == null ? '—' : formatNumber(alvo)}
        <span className="ml-1 text-xs font-normal text-synse-muted">{unidade}</span>
      </dd>
      {/* O que o plano de fato entrega, quando difere da meta: é a conferência
          que o aluno faz sozinho. */}
      {alvo != null && Math.abs(entrega - alvo) > 1 && (
        <p className="text-xs text-synse-muted">plano soma {formatNumber(Math.round(entrega))}</p>
      )}
    </div>
  )
}
