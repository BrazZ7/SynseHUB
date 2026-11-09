import type { Metadata } from 'next'
import { CalendarRange, Globe, Sparkles } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { ListLink } from '@/components/synse/list-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgramForm } from '@/features/programs/program-form'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'

export const metadata: Metadata = { title: 'Programas Synse' }

/**
 * ── A autoria dos programas guiados ─────────────────────────────────────────
 *
 * A mesma porta que o acervo ganhou na 0039, para a outra coisa que a
 * plataforma publica. Fica no `/synse-admin` e não no painel da academia
 * porque o alcance é o mesmo: o que sai daqui chega a toda a base.
 */
export default async function ProgramasAdminPage() {
  await requirePlatformSession()

  const dataSource = await getDataSource()
  const programas = await dataSource.listPrograms()
  const doPlus = programas.filter((p) => p.visibility === 'SYNSE_PLUS')

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <BackLink href="/synse-admin" label="Plataforma" />
        <PageHeader
          eyebrow="Plataforma"
          title="Programas guiados"
          description="Sequências de dias da plataforma. Chegam a toda a base, em qualquer academia."
        />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { rotulo: 'Publicados', valor: programas.length },
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
            <CalendarRange className="size-4 text-synse-primary" aria-hidden />O que já está no ar
          </CardTitle>
        </CardHeader>
        <CardContent>
          {programas.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Nenhum programa ainda"
              description="Crie o primeiro no formulário abaixo, e depois monte os dias dele."
            />
          ) : (
            <ul className="space-y-2">
              {programas.map((p) => (
                <li key={p.id}>
                  <ListLink
                    href={`/synse-admin/programas/${p.id}`}
                    className="flex items-center gap-3 rounded-xl border border-synse-border bg-synse-surface px-3 py-2.5 transition-colors hover:border-synse-primary/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-synse-text">{p.title}</span>
                        {p.visibility === 'SYNSE_PLUS' ? (
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
                      </span>
                      <span className="mt-0.5 block text-xs text-synse-muted">
                        {p.code} · {p.durationDays} dias
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
          <CardTitle>Criar programa</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgramForm />
        </CardContent>
      </Card>
    </div>
  )
}
