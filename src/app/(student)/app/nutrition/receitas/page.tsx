import type { Metadata } from 'next'
import Link from 'next/link'
import { CookingPot } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Pagination } from '@/components/synse/pagination'
import { RECEITAS_POR_PAGINA } from '@/features/nutrition/receitas-por-pagina'
import { ChamadaDoPlus } from '@/features/content/vitrine'
import {
  CartaoDeReceita,
  CartaoDeReceitaTrancada,
  rotuloDaCategoria,
} from '@/features/recipes/recipe-pieces'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { CATEGORIAS_LISTA, ordemDaCategoria } from '@/lib/validations/recipe'
import type { Recipe } from '@/types/domain'
import { cn } from '@/lib/utils'
import { GRADE_DE_ITENS } from '@/components/synse/duas-colunas'

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
type Search = Promise<{ categoria?: string; page?: string }>

/**
 * ── Por que a categoria virou filtro ────────────────────────────────────────
 *
 * A tela lia o catálogo inteiro para agrupar por refeição. A biblioteca cresce
 * a cada publicação da Synse, e a leitura não tinha teto: um dia ela encostaria
 * no corte silencioso do PostgREST e um grupo inteiro sumiria da tela — sem
 * erro, sem aviso, só uma refeição a menos para quem procura o que cozinhar.
 *
 * Com filtro, a leitura é sempre de uma página. "Todas" continua existindo e
 * continua agrupando por refeição na ordem do dia, mas aí os grupos da página
 * são os que couberem nela: o banco ordena por **código** da categoria, e a
 * tela reordena para a ordem do dia. Enquanto o catálogo cabe numa página isso
 * não se nota; quando não couber, é para isso que as fichas existem.
 */
export default async function RecipesPage({ searchParams }: { searchParams: Search }) {
  await requireStudentSession()
  const dataSource = await getDataSource()

  const { categoria: categoriaBruta, page } = await searchParams
  const categoria = CATEGORIAS_LISTA.find((c) => c === categoriaBruta?.toUpperCase()) ?? null
  const pagina = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)

  const [lista, trancadas] = await Promise.all([
    dataSource.listRecipes({
      ...(categoria ? { categoria } : {}),
      page: pagina,
      pageSize: RECEITAS_POR_PAGINA,
    }),
    /*
     * Vem vazia para quem assina — essas receitas já estão na lista acima,
     * com o preparo. Quem decide é `receitas_trancadas` (0044), não esta tela.
     */
    dataSource.listLockedRecipes(),
  ])
  const receitas = lista.rows

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

      <FichasDeCategoria atual={categoria} />

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
            <div className={cn('space-y-3', GRADE_DE_ITENS)}>
              {itens.map((receita) => (
                <CartaoDeReceita key={receita.id} receita={receita} />
              ))}
            </div>
          </section>
        ))
      )}

      <Pagination page={pagina} pageSize={RECEITAS_POR_PAGINA} total={lista.total} />

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

          <div className={cn('space-y-3', GRADE_DE_ITENS)}>
            {trancadas.map((receita) => (
              <CartaoDeReceitaTrancada key={receita.id} receita={receita} />
            ))}
          </div>

          <ChamadaDoPlus titulo="Abra as receitas com o Synse+" />
        </section>
      )}
    </div>
  )
}

/**
 * As refeições do dia como fichas.
 *
 * Elo e não botão: o estado mora na URL, então recarregar e mandar o endereço
 * para alguém continuam funcionando — o mesmo motivo do filtro do histórico de
 * corridas e do de conteúdos.
 *
 * Sem `page` no endereço: trocar de refeição volta para a primeira página.
 */
function FichasDeCategoria({ atual }: { atual: string | null }) {
  const fichas = [
    { valor: null, rotulo: 'Todas' },
    ...CATEGORIAS_LISTA.map((c) => ({ valor: c as string | null, rotulo: rotuloDaCategoria(c) })),
  ]

  return (
    <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Filtrar por refeição">
      {fichas.map(({ valor, rotulo }) => {
        const ativo = valor === atual
        return (
          <Link
            key={valor ?? 'todas'}
            href={
              valor
                ? `/app/nutrition/receitas?categoria=${valor.toLowerCase()}`
                : '/app/nutrition/receitas'
            }
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              ativo
                ? 'border-synse-primary bg-synse-primary text-white'
                : 'border-synse-border text-synse-muted hover:border-synse-primary',
            )}
          >
            {rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
