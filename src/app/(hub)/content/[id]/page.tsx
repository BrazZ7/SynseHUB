import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ContentForm } from '@/features/content/content-form'
import { ContentItemActions } from '@/features/content/content-item-actions'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Conteúdo' }

type Params = Promise<{ id: string }>

export default async function ContentDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await requireHubSession('content:write')
  const dataSource = await getDataSource()

  const item = await dataSource.getContent(session.organizationId, id)
  if (!item) notFound()

  const agora = new Date()
  const publicado = Boolean(item.publishedAt && new Date(item.publishedAt) <= agora)
  const agendado = Boolean(item.publishedAt && new Date(item.publishedAt) > agora)

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/content" label="Conteúdos" />
      <PageHeader
        title={item.title}
        description={item.authorName ? `Por ${item.authorName}` : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={publicado ? 'success' : agendado ? 'primary' : 'warning'}>
          {publicado ? 'Publicado' : agendado ? 'Agendado' : 'Rascunho'}
        </Badge>
        {item.publishedAt && (
          <span className="text-xs text-synse-muted">
            {publicado ? 'Desde' : 'Sai em'} {formatDate(item.publishedAt)}
          </span>
        )}
        {item.pinned && <Badge variant="primary">Fixado</Badge>}
      </div>

      <ContentItemActions contentId={item.id} publicado={publicado} />

      <Card>
        <CardContent className="pt-5">
          <ContentForm item={item} />
        </CardContent>
      </Card>
    </div>
  )
}
