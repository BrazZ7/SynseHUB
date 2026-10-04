import type { Metadata } from 'next'
import { ChevronRight, CookingPot, Info, Salad } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ListLink } from '@/components/synse/list-link'
import { Badge } from '@/components/ui/badge'
import { QuadroDasRefeicoes } from '@/features/nutrition/components/quadro-das-refeicoes'
import { PrescribedPlan } from '@/features/nutrition/prescribed-plan'
import { BASELINE_MEAL_PLAN } from '@/lib/baseline/meal-plan'
import { getDataSource } from '@/lib/database'
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
  const session = await requireStudentSession()
  const dataSource = await getDataSource()

  /*
   * O plano prescrito vence o base. É o que o comentário acima sempre previu, e
   * agora existe: quando a academia publica um plano individual, ele aparece
   * aqui no lugar da sugestão geral.
   */
  const prescrito = await dataSource.getPublishedNutritionPlan(
    session.organizationId,
    session.studentId,
  )

  if (prescrito) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <BackLink href="/app" label="Hoje" />
        <PrescribedPlan plano={prescrito} />
      </div>
    )
  }

  const plano = BASELINE_MEAL_PLAN

  return (
    <div className="animate-fade-in-up space-y-5">
      <header className="space-y-1">
        <BackLink href="/app" label="Hoje" />
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-synse-text">{plano.name}</h1>
          <Badge variant="outline">Grátis</Badge>
        </div>
        <p className="text-sm text-synse-muted">{plano.summary}</p>
      </header>

      <QuadroDasRefeicoes
        refeicoes={plano.meals.map((meal) => ({
          chave: meal.name,
          nome: meal.name,
          horario: meal.time,
          corpo: (
            <>
              <p className="mt-1 text-sm leading-relaxed text-white/75">{meal.suggestion}</p>
              {/*
                As trocas viraram fichas em vez de linhas de "Troca: …". No
                cartão antigo o prefixo se repetia em cada linha e empurrava a
                informação para a direita; a ficha já diz, pela forma, que
                aquilo é uma alternativa e não um segundo prato.
              */}
              <ul
                aria-label={`Trocas para ${meal.name.toLowerCase()}`}
                className="mt-2 flex flex-wrap gap-1.5"
              >
                {meal.swaps.map((swap) => (
                  <li
                    key={swap}
                    className="rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/70"
                  >
                    {swap}
                  </li>
                ))}
              </ul>
            </>
          ),
        }))}
      />

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

      {/*
        A porta da biblioteca de receitas (0044).
        
        Fica acima do aviso legal e abaixo dos hábitos, e não no fim: o plano
        base diz o que comer, e a pergunta seguinte é como fazer. Enterrar a
        biblioteca depois do texto de isenção seria construí-la e escondê-la.
      */}
      <ListLink
        href="/app/nutrition/receitas"
        className="flex items-center justify-between gap-3 rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm transition-colors hover:border-synse-primary/40"
      >
        <span className="flex items-center gap-2.5">
          <CookingPot className="size-4 shrink-0 text-synse-primary" aria-hidden />
          <span>
            <span className="block text-sm font-medium text-synse-text">Receitas</span>
            <span className="block text-xs text-synse-muted">
              O que cozinhar, com a lista de compras já pronta.
            </span>
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-synse-muted" aria-hidden />
      </ListLink>

      <p className="flex items-start gap-2.5 rounded-xl bg-synse-surface-2 p-4 text-xs text-synse-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        {plano.disclaimer}
      </p>
    </div>
  )
}
