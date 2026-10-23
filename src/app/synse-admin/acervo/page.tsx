import type { Metadata } from 'next'
import { Globe, Library, Sparkles } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SynseContentForm } from '@/features/content/synse-content-form'
import { AcervoRow } from '@/features/content/acervo-row'
import { Pagination } from '@/components/synse/pagination'
import { CONTEUDOS_POR_PAGINA } from '@/features/content/situacao'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { TIPOS } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Acervo Synse' }

/**
 * ── O acervo Synse ───────────────────────────────────────────────────────────
 *
 * A porta que faltava. A 0038 consertou o cadeado do Synse+ — assinante vê,
 * quem não assina não vê — e a 0039 abriu esta, porque até então **não havia
 * como criar** conteúdo de plataforma: a política de escrita exige dono desde
 * a 0004, e conteúdo de acervo é o que não tem.
 *
 * Fica no `/synse-admin` e não no painel da academia porque o alcance é outro:
 * o que sai daqui chega a toda a base, em qualquer academia e também a quem
 * treina sozinho.
 */
type Search = Promise<{ page?: string }>

/**
 * A lista tem página, e os três números não.
 *
 * Antes o acervo inteiro vinha numa leitura sem teto e os cartões contavam
 * sobre o arranjo. O acervo da plataforma cresce com o catálogo, e é
 * exatamente o tipo de conjunto que um dia encosta no corte silencioso do
 * PostgREST — aí os três números ficariam menores que a verdade sem nada na
 * tela dizendo isso.
 *
 * Sem filtro de situação aqui, ao contrário do painel da academia: esta tela
 * tem o formulário de publicação logo abaixo, e quem publica quer ver o que
 * acabou de sair. A ordem já põe o mais novo primeiro.
 */
export default async function AcervoPage({ searchParams }: { searchParams: Search }) {
  await requirePlatformSession()

  const dataSource = await getDataSource()
  const { page } = await searchParams
  const pagina = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)

  const [lista, contagem] = await Promise.all([
    dataSource.listSynseContent({ page: pagina, pageSize: CONTEUDOS_POR_PAGINA }),
    dataSource.contarAcervoSynse(),
  ])

  const agora = new Date().toISOString()
  const itens = lista.rows

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <BackLink href="/synse-admin" label="Plataforma" />
        <PageHeader
          eyebrow="Plataforma"
          title="Acervo Synse"
          description="E-books, guias e receitas da plataforma. Chega a toda a base, em qualquer academia."
        />
      </div>

      {/*
        Quatro cartões, e não três.

        Antes "Rascunhos" era `total - no ar`, então o que estava **agendado**
        entrava ali — um conteúdo que vai sair sozinho na terça contado como
        rascunho. Dava para viver com isso enquanto os números saíam de uma
        contagem na aplicação; agora que o banco distingue as três situações,
        juntar duas seria escolher mostrar errado.
      */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { rotulo: 'No ar', valor: contagem.publicados },
          { rotulo: 'Agendados', valor: contagem.agendados },
          { rotulo: 'Só assinantes', valor: contagem.doPlus },
          { rotulo: 'Rascunhos', valor: contagem.rascunhos },
        ].map(({ rotulo, valor }) => (
          <div
            key={rotulo}
            className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-synse-muted">
              {rotulo}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-synse-text">{valor}</p>
          </div>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="size-4 text-synse-primary" aria-hidden />O que já está no acervo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contagem.total === 0 ? (
            <EmptyState
              icon={Library}
              title="O acervo está vazio"
              description="Publique o primeiro e-book ou guia no formulário abaixo. Ele chega a toda a base."
            />
          ) : (
            <ul className="divide-y divide-synse-border">
              {itens.map((item) => {
                const publicado = item.publishedAt !== null && item.publishedAt <= agora
                return (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-synse-text">{item.title}</span>
                        {item.visibility === 'SYNSE_PLUS' ? (
                          <Badge variant="primary">
                            <Sparkles className="size-3" aria-hidden />
                            Synse+
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Globe className="size-3" aria-hidden />
                            Aberto
                          </Badge>
                        )}
                        {!publicado && <Badge variant="warning">Rascunho</Badge>}
                        {item.pinned && <Badge variant="outline">Fixado</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-synse-muted">
                        {/*
                          `content_type` tem sete valores no banco e o
                          formulário oferece cinco: `PROGRAM` e `CHALLENGE`
                          pertencem aos programas guiados e aos desafios, que
                          são outras tabelas. Uma linha antiga com um deles não
                          pode virar `undefined` na tela.
                        */}
                        {TIPOS[item.type as keyof typeof TIPOS] ?? item.type}
                        {publicado && item.publishedAt
                          ? ` · no ar desde ${formatDate(item.publishedAt)}`
                          : item.publishedAt
                            ? ` · agendado para ${formatDate(item.publishedAt)}`
                            : ' · ainda não publicado'}
                      </span>
                    </span>
                    <AcervoRow contentId={item.id} titulo={item.title} />
                  </li>
                )
              })}
            </ul>
          )}

          <Pagination page={pagina} pageSize={CONTEUDOS_POR_PAGINA} total={lista.total} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Publicar no acervo</CardTitle>
        </CardHeader>
        <CardContent>
          <SynseContentForm />
        </CardContent>
      </Card>
    </div>
  )
}
