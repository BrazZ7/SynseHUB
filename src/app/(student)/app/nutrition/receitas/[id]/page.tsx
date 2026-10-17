import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Clock, Lock, UsersRound } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { Badge } from '@/components/ui/badge'
import { ChamadaDoPlus } from '@/features/content/vitrine'
import { FotoDoPrato, TabelaDeMacros, rotuloDaCategoria } from '@/features/recipes/recipe-pieces'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'

export const metadata: Metadata = { title: 'Receita' }

/** Tempo e porções, grandes, logo abaixo do título. */
function Cabecalho({ minutos, porcoes }: { minutos: number | null; porcoes: number | null }) {
  if (minutos == null && porcoes == null) return null

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-synse-muted">
      {minutos != null && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" aria-hidden />
          {minutos} min
        </span>
      )}
      {porcoes != null && (
        <span className="inline-flex items-center gap-1.5">
          <UsersRound className="size-4" aria-hidden />
          {porcoes === 1 ? '1 porção' : `${porcoes} porções`}
        </span>
      )}
    </div>
  )
}

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudentSession()
  const { id } = await params

  const dataSource = await getDataSource()
  const receita = await dataSource.getRecipe(id)

  /*
   * ── O que fazer com o vazio ───────────────────────────────────────────────
   *
   * Vazio chega por dois motivos: a receita não existe, ou é do Synse+ e esta
   * conta não assina. O segundo vira vitrine; o primeiro continua 404, para
   * não confirmar a existência de um id chutado.
   *
   * Mesma decisão da tela de leitura do acervo, e pela mesma razão: o catálogo
   * da plataforma se anuncia. `receitas_trancadas` (0044) devolve título,
   * foto, categoria e tempo — nunca os ingredientes, nunca o preparo, nunca os
   * macros.
   */
  if (!receita) {
    const trancada = await dataSource.getLockedRecipe(id)
    if (!trancada) notFound()

    return (
      <ColunaDeLeitura como="article" className="animate-fade-in-up space-y-5">
        <BackLink href="/app/nutrition/receitas" label="Receitas" />

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{rotuloDaCategoria(trancada.category)}</Badge>
            <Badge variant="primary">Synse+</Badge>
          </div>

          <h1 className="text-xl font-semibold leading-tight text-synse-text">{trancada.title}</h1>

          {trancada.description && (
            <p className="text-sm text-synse-muted">{trancada.description}</p>
          )}

          <Cabecalho minutos={trancada.prepMinutes} porcoes={trancada.servings} />
        </header>

        {trancada.imageUrl && <FotoDoPrato src={trancada.imageUrl} />}

        {/*
         * Onde a receita começaria. A faixa ocupa o lugar do conteúdo em vez
         * de a página simplesmente acabar — é a diferença entre "está
         * trancado" e "não tem nada aqui", e a segunda leitura é a que faz
         * desistir.
         */}
        <div className="rounded-2xl border border-dashed border-synse-border bg-synse-surface/60 p-5 text-center">
          <Lock className="mx-auto size-5 text-synse-muted" aria-hidden />
          <p className="mt-2 text-sm text-synse-muted">
            Os ingredientes e o modo de preparo fazem parte do Synse+.
          </p>
        </div>

        <ChamadaDoPlus />
      </ColunaDeLeitura>
    )
  }

  /*
   * O preparo é texto puro, digitado numa `<textarea>` — nunca HTML, nunca
   * `dangerouslySetInnerHTML`. Linha em branco separa passo; a quebra simples
   * dentro de um passo fica por conta do `whitespace-pre-line`.
   */
  const passos = (receita.instructions ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <ColunaDeLeitura como="article" className="animate-fade-in-up space-y-5">
      <BackLink href="/app/nutrition/receitas" label="Receitas" />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{rotuloDaCategoria(receita.category)}</Badge>
          {receita.visibility === 'SYNSE_PLUS' && <Badge variant="primary">Synse+</Badge>}
        </div>

        <h1 className="text-xl font-semibold leading-tight text-synse-text">{receita.title}</h1>

        {receita.description && <p className="text-sm text-synse-muted">{receita.description}</p>}

        <Cabecalho minutos={receita.prepMinutes} porcoes={receita.servings} />
      </header>

      {receita.imageUrl && <FotoDoPrato src={receita.imageUrl} />}

      {receita.nutritionFacts && <TabelaDeMacros macros={receita.nutritionFacts} />}

      {receita.ingredients.length > 0 && (
        <section className="rounded-2xl border border-synse-border bg-synse-surface p-5 shadow-synse-sm">
          <h2 className="text-sm font-medium text-synse-text">Ingredientes</h2>
          <ul className="mt-2.5 space-y-1.5">
            {receita.ingredients.map((ingrediente, i) => (
              <li key={i} className="text-sm text-synse-text">
                · {ingrediente}
              </li>
            ))}
          </ul>
        </section>
      )}

      {passos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-synse-text">Modo de preparo</h2>
          <ol className="space-y-3">
            {passos.map((passo, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-synse-surface-2 text-xs font-semibold text-synse-text"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-synse-text">
                  {passo}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {receita.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {receita.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {receita.ingredients.length === 0 && passos.length === 0 && (
        /*
         * Publicada só com título e descrição. Não é erro — dá para publicar
         * assim — mas a tela precisa dizer que acabou, senão parece que faltou
         * carregar.
         */
        <p className="text-sm text-synse-muted">
          Esta receita ainda não tem ingredientes nem modo de preparo.
        </p>
      )}
    </ColunaDeLeitura>
  )
}
