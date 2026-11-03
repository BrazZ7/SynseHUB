import type { Metadata } from 'next'
import Link from 'next/link'
import { Heart, Library, Pin } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { SearchInput } from '@/components/synse/search-input'
import { BotaoFavorito } from '@/features/content/botao-favorito'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { CartaoTrancado, ChamadaDoPlus } from '@/features/content/vitrine'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { GRADE_DE_ITENS } from '@/components/synse/duas-colunas'

export const metadata: Metadata = { title: 'Conteúdos' }

const POR_PAGINA = 50

export default async function StudentContentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()
  const termo = ((await searchParams).q ?? '').trim()

  const [achados, trancados, favoritos] = await Promise.all([
    /*
     * A busca, com queda para a lista de sempre.
     *
     * `searchPublishedContent` é da 0067 e pode não ter sido colada: nesse
     * intervalo `null` leva à `listPublishedContent`, que existe desde a 0031.
     * A tela continua de pé e só a busca não filtra — bem melhor que uma
     * página de erro por causa de uma função que ainda não existe.
     */
    dataSource
      .searchPublishedContent(session.organizationId, termo, POR_PAGINA)
      .catch(seAindaNaoMigrou(null)),
    /*
     * A vitrine vem vazia para quem assina — esses itens já estão na lista
     * acima, com o corpo. Quem decide é `acervo_trancado` (0041), não esta
     * tela.
     */
    dataSource.listLockedShowcase(),
    dataSource.listFavoriteIds().catch(seAindaNaoMigrou({ content: [], recipes: [] })),
  ])

  const itens =
    achados ?? (await dataSource.listPublishedContent(session.organizationId, POR_PAGINA))
  const guardados = new Set(favoritos.content)
  const buscando = termo !== ''

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app" label="Hoje" />
      {/*
       * O título dizia "Da sua academia" e a lista nunca foi só isso: a
       * `published_content` traz junto o acervo da plataforma (`organization_id
       * is null`, 0031). Quem abria via um e-book do Synse assinado como se
       * fosse da academia dele.
       */}
      <PageHeader
        title="Para ler"
        description="O que a sua academia publicou e o acervo do Synse."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput placeholder="Buscar no acervo…" />
        <Link
          href="/app/favoritos"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-synse-primary"
        >
          <Heart className="size-4" aria-hidden />
          Guardados
        </Link>
      </div>

      {buscando && itens.length === 0 ? (
        /*
         * "Nada encontrado" e "nada publicado" são respostas diferentes, e
         * trocá-las faz a pessoa achar que a academia nunca publicou nada —
         * quando ela só escreveu uma palavra que não casa.
         */
        <EmptyState
          icon={Library}
          title="Nada com esse termo"
          description={`Nenhum conteúdo casa com "${termo}". Tente outra palavra.`}
        />
      ) : itens.length === 0 && trancados.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nada publicado ainda"
          description="Quando a academia publicar um aviso ou conteúdo, ele aparece aqui."
        />
      ) : (
        <div className={cn('space-y-3', GRADE_DE_ITENS)}>
          {itens.map((item) => {
            // O acervo da plataforma não tem staff autor: a origem se lê pelo
            // dono nulo, e não por um `authorName` que vem vazio dele.
            const assinatura = item.organizationId === null ? 'Synse' : item.authorName

            return (
              /*
               * O cartão inteiro virou elo, e o "Abrir" do material saiu daqui.
               *
               * Os dois não cabiam juntos: elo dentro de elo é HTML inválido e
               * o leitor de tela anuncia um alvo dentro do outro. O material
               * agora abre na tela de leitura, que é onde ele tem companhia —
               * o texto do item.
               */
              /*
               * O coração fica **fora** do elo, e não dentro.
               *
               * Botão dentro de `<a>` é HTML inválido e o leitor de tela
               * anuncia um alvo dentro do outro — o mesmo motivo que tirou o
               * "Abrir" daqui. A solução é o cartão inteiro continuar sendo o
               * elo e o coração morar na camada de cima, posicionado no canto.
               */
              <div key={item.id} className="relative">
                <ListLink
                  href={`/app/content/${item.id}`}
                  className="block rounded-2xl border border-synse-border bg-synse-surface p-4 pr-14 shadow-synse-sm transition-colors hover:border-synse-primary/40"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="primary">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
                    {/*
                     * O selo, e não só a assinatura embaixo: "Synse" ao lado de
                     * uma data lê-se como o nome de quem escreveu, igualzinho a
                     * "Emerson Braz" na linha de cima. O selo diz de onde vem.
                     */}
                    {item.organizationId === null && <Badge variant="outline">Acervo Synse</Badge>}
                    {item.pinned && (
                      <Pin className="size-4 text-synse-primary" aria-label="Fixado" />
                    )}
                  </div>

                  <h2 className="mt-2 font-semibold text-synse-text">{item.title}</h2>
                  {item.summary && <p className="mt-1 text-sm text-synse-muted">{item.summary}</p>}

                  <p className="mt-2 text-xs text-synse-muted">
                    {item.publishedAt && formatDate(item.publishedAt)}
                    {assinatura && ` · ${assinatura}`}
                  </p>
                </ListLink>

                <BotaoFavorito
                  contentId={item.id}
                  inicial={guardados.has(item.id)}
                  titulo={item.title}
                  className="absolute right-2 top-2"
                />
              </div>
            )
          })}
        </div>
      )}

      {trancados.length > 0 && (
        /*
         * Depois do que dá para ler, nunca antes.
         *
         * A ordem é a diferença entre uma prateleira e um anúncio atravessado:
         * quem abriu a tela veio buscar conteúdo, e topar primeiro com o que
         * não pode abrir é o que faz paywall irritar. Aqui a oferta só aparece
         * depois que a pessoa passou pelo que já é dela.
         */
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-sm font-semibold text-synse-text">No Synse+</h2>
            <p className="text-xs text-synse-muted">
              O acervo da assinatura. Você vê do que se trata; o conteúdo abre com o Synse+.
            </p>
          </div>

          <div className={cn('space-y-3', GRADE_DE_ITENS)}>
            {trancados.map((item) => (
              <CartaoTrancado key={item.id} item={item} />
            ))}
          </div>

          <ChamadaDoPlus titulo="Abra o acervo com o Synse+" />
        </section>
      )}
    </div>
  )
}
