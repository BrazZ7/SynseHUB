import type { Metadata } from 'next'
import { Globe, Library, Sparkles } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SynseContentForm } from '@/features/content/synse-content-form'
import { AcervoRow } from '@/features/content/acervo-row'
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
export default async function AcervoPage() {
  await requirePlatformSession()

  const dataSource = await getDataSource()
  const itens = await dataSource.listSynseContent()

  const agora = new Date().toISOString()
  const noAr = itens.filter((i) => i.publishedAt !== null && i.publishedAt <= agora)
  const doPlus = noAr.filter((i) => i.visibility === 'SYNSE_PLUS')

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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { rotulo: 'No ar', valor: noAr.length },
          { rotulo: 'Só assinantes', valor: doPlus.length },
          { rotulo: 'Rascunhos', valor: itens.length - noAr.length },
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
          {itens.length === 0 ? (
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
