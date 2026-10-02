import type { Metadata } from 'next'
import { CookingPot } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { ChamadaDoPlus } from '@/features/content/vitrine'
import {
  CartaoDeReceita,
  CartaoDeReceitaTrancada,
  rotuloDaCategoria,
} from '@/features/recipes/recipe-pieces'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { ordemDaCategoria } from '@/lib/validations/recipe'
import type { Recipe } from '@/types/domain'

export const metadata: Metadata = { title: 'Receitas' }

/**
 * ── A biblioteca de receitas ────────────────────────────────────────────────
 *
 * `recipes` existia desde a 0003 e não tinha uma leitura sequer. Esta é a
 * primeira.
 *
 * A tela repete o desenho do acervo de propósito: o que dá para abrir primeiro,
 * a prateleira trancada depois. Quem chegou veio buscar o que comer hoje, e
 * topar primeiro com o que não pode abrir é o que faz paywall irritar.
 */
export default async function RecipesPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  const [receitas, trancadas] = await Promise.all([
    dataSource.listRecipes(),
    /*
     * Vem vazia para quem assina — essas receitas já estão na lista acima,
     * com o preparo. Quem decide é `receitas_trancadas` (0044), não esta tela.
     */
    dataSource.listLockedRecipes(),
  ])

  /*
   * Agrupadas por refeição, e não numa lista corrida.
   *
   * Vinte receitas em ordem alfabética não respondem a pergunta com que a
   * pessoa chega, que é "o que eu faço no almoço".
   *
   * ── E os grupos na ordem do dia ───────────────────────────────────────────
   *
   * O banco ordena por `category`, que é o **código**: `ALMOCO` vem antes de
   * `CAFE` no alfabeto, e a tela abria com o almoço acima do café da manhã.
   * Encontrado olhando a tela. A ordem de dentro de cada grupo continua a do
   * banco — aqui só os grupos são reordenados, por `ordemDaCategoria`.
   */
  const porCategoria = receitas.reduce<Map<string, Recipe[]>>((mapa, receita) => {
    const atual = mapa.get(receita.category)
    if (atual) atual.push(receita)
    else mapa.set(receita.category, [receita])
    return mapa
  }, new Map())

  const grupos = [...porCategoria.entries()].sort(
    ([a], [b]) => ordemDaCategoria(a) - ordemDaCategoria(b),
  )

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app/nutrition" label="Alimentação" />
      <PageHeader
        title="Receitas"
        description="O que cozinhar, com a lista de compras já pronta."
      />

      {receitas.length === 0 && trancadas.length === 0 ? (
        <EmptyState
          icon={CookingPot}
          title="Nenhuma receita ainda"
          description="Quando o Synse publicar receitas, elas aparecem aqui."
        />
      ) : (
        grupos.map(([categoria, itens]) => (
          <section key={categoria} className="space-y-3">
            <h2 className="text-sm font-semibold text-synse-text">
              {rotuloDaCategoria(categoria)}
            </h2>
            {itens.map((receita) => (
              <CartaoDeReceita key={receita.id} receita={receita} />
            ))}
          </section>
        ))
      )}

      {trancadas.length > 0 && (
        /* Depois do que dá para cozinhar, nunca antes. Como no acervo. */
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-sm font-semibold text-synse-text">No Synse+</h2>
            <p className="text-xs text-synse-muted">
              Você vê o prato e o tempo de preparo; os ingredientes e o modo de fazer abrem com o
              Synse+.
            </p>
          </div>

          {trancadas.map((receita) => (
            <CartaoDeReceitaTrancada key={receita.id} receita={receita} />
          ))}

          <ChamadaDoPlus titulo="Abra as receitas com o Synse+" />
        </section>
      )}
    </div>
  )
}
