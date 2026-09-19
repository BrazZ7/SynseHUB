import type { Metadata } from 'next'
import { Library, Pin, PlayCircle } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Conteúdos' }

export default async function StudentContentPage() {
  const session = await requireStudentSession()
  const dataSource = await getDataSource()
  const itens = await dataSource.listPublishedContent(session.organizationId, 50)

  return (
    <div className="animate-fade-in-up space-y-5">
      <BackLink href="/app" label="Hoje" />
      <PageHeader
        title="Da sua academia"
        description="Avisos, artigos e vídeos publicados pela equipe."
      />

      {itens.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nada publicado ainda"
          description="Quando a academia publicar um aviso ou conteúdo, ele aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant="primary">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
                {item.pinned && (
                  <Pin className="size-4 shrink-0 text-synse-primary" aria-label="Fixado" />
                )}
              </div>

              <h2 className="mt-2 font-semibold text-synse-text">{item.title}</h2>
              {item.summary && <p className="mt-1 text-sm text-synse-muted">{item.summary}</p>}

              {item.mediaUrl && (
                <a
                  href={item.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-synse-primary hover:underline"
                >
                  <PlayCircle className="size-4" aria-hidden />
                  Abrir
                </a>
              )}

              <p className="mt-2 text-xs text-synse-muted">
                {item.publishedAt && formatDate(item.publishedAt)}
                {item.authorName && ` · ${item.authorName}`}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
