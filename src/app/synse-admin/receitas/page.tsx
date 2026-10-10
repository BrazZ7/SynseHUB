import type { Metadata } from 'next'
import { CookingPot, Globe, Sparkles } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RecipeForm } from '@/features/recipes/recipe-form'
import { rotuloDaCategoria } from '@/features/recipes/recipe-pieces'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Receitas Synse' }

/**
 * ── A autoria das receitas ──────────────────────────────────────────────────
 *
 * A mesma porta que o acervo ganhou na 0039 e os programas na 0043, para a
 * terceira coisa que a plataforma publica. Fica no `/synse-admin` e não no
 * painel da academia porque o alcance é o mesmo: o que sai daqui chega a toda
 * a base.
 */
export default async function ReceitasAdminPage() {
  await requirePlatformSession()

  const dataSource = await getDataSource()
  const receitas = await dataSource.listRecipes()
  const doPlus = receitas.filter((r) => r.visibility === 'SYNSE_PLUS')

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <BackLink href="/synse-admin" label="Plataforma" />
        <PageHeader
          eyebrow="Plataforma"
          title="Receitas"
          description="A biblioteca da plataforma. Chega a toda a base, em qualquer academia."
        />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { rotulo: 'Publicadas', valor: receitas.length },
          { rotulo: 'Só assinantes', valor: doPlus.length },
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
            <CookingPot className="size-4 text-synse-primary" aria-hidden />O que já está no ar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receitas.length === 0 ? (
            <EmptyState
              icon={CookingPot}
              title="Nenhuma receita ainda"
              description="Crie a primeira no formulário abaixo."
            />
          ) : (
            <ul className="space-y-2">
              {receitas.map((r) => (
                <li key={r.id}>
                  <ListLink
                    href={`/synse-admin/receitas/${r.id}`}
                    className="flex items-center gap-3 rounded-xl border border-synse-border bg-synse-surface px-3 py-2.5 transition-colors hover:border-synse-primary/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-synse-text">{r.title}</span>
                        {r.visibility === 'SYNSE_PLUS' ? (
                          <Badge variant="primary">
                            <Sparkles className="size-3" aria-hidden />
                            Synse+
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Globe className="size-3" aria-hidden />
                            Aberta
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-synse-muted">
                        {rotuloDaCategoria(r.category)}
                        {r.prepMinutes != null && ` · ${r.prepMinutes} min`}
                      </span>
                    </span>
                  </ListLink>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Criar receita</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeForm />
        </CardContent>
      </Card>
    </div>
  )
}
