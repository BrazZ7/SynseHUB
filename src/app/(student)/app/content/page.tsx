import type { Metadata } from 'next'
import { ChevronRight, Library, Pin } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { CartaoTrancado, ChamadaDoPlus } from '@/features/content/vitrine'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { GRADE_DE_ITENS } from '@/components/synse/duas-colunas'

export const metadata: Metadata = { title: 'Conteúdos' }

export default async function StudentContentPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()
  const [itens, trancados] = await Promise.all([
    dataSource.listPublishedContent(session.organizationId, 50),
    /*
     * A vitrine vem vazia para quem assina — esses itens já estão na lista
     * acima, com o corpo. Quem decide é `acervo_trancado` (0041), não esta
     * tela.
     */
    dataSource.listLockedShowcase(),
  ])

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

      {itens.length === 0 && trancados.length === 0 ? (
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
              <ListLink
                key={item.id}
                href={`/app/content/${item.id}`}
                className="block rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm transition-colors hover:border-synse-primary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="primary">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
                    {/*
                     * O selo, e não só a assinatura embaixo: "Synse" ao lado de
                     * uma data lê-se como o nome de quem escreveu, igualzinho a
                     * "Emerson Braz" na linha de cima. O selo diz de onde vem.
                     */}
                    {item.organizationId === null && <Badge variant="outline">Acervo Synse</Badge>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.pinned && (
                      <Pin className="size-4 text-synse-primary" aria-label="Fixado" />
                    )}
                    <ChevronRight className="size-4 text-synse-muted" aria-hidden />
                  </div>
                </div>

                <h2 className="mt-2 font-semibold text-synse-text">{item.title}</h2>
                {item.summary && <p className="mt-1 text-sm text-synse-muted">{item.summary}</p>}

                <p className="mt-2 text-xs text-synse-muted">
                  {item.publishedAt && formatDate(item.publishedAt)}
                  {assinatura && ` · ${assinatura}`}
                </p>
              </ListLink>
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
