import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Library, Pin, Plus } from 'lucide-react'

import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Conteúdos' }

export default async function ContentPage() {
  const session = await requireHubSession('content:read')
  const dataSource = await getDataSource()
  const itens = await dataSource.listContent(session.organizationId)

  const canWrite = can(session.role, 'content:write')
  const agora = new Date().toISOString()

  const publicados = itens.filter((i) => i.publishedAt && i.publishedAt <= agora)
  const agendados = itens.filter((i) => i.publishedAt && i.publishedAt > agora)
  const rascunhos = itens.filter((i) => !i.publishedAt)

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Conteúdos"
        description="O que a academia publica para os alunos: avisos, artigos e vídeos. Rascunho não aparece no app."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/content/new">
                <Plus className="size-4" />
                Novo conteúdo
              </Link>
            </Button>
          )
        }
      />

      {itens.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nada publicado ainda"
          description="Um aviso de mudança de horário já vale. O que a academia escreve aqui aparece no app de todos os alunos."
          action={
            canWrite && (
              <Button asChild>
                <Link href="/content/new">
                  <Plus className="size-4" />
                  Escrever o primeiro
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <Secao titulo="Publicados" itens={publicados} />
          <Secao titulo="Agendados" itens={agendados} />
          <Secao titulo="Rascunhos" itens={rascunhos} />
        </>
      )}
    </div>
  )
}

function Secao({
  titulo,
  itens,
}: {
  titulo: string
  itens: Awaited<ReturnType<Awaited<ReturnType<typeof getDataSource>>['listContent']>>
}) {
  if (itens.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-synse-muted">
        {titulo} ({itens.length})
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {itens.map((item) => (
          <Card key={item.id} className="transition-shadow hover:shadow-synse">
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="primary">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
                {item.pinned && (
                  <Pin className="size-4 shrink-0 text-synse-primary" aria-label="Fixado" />
                )}
              </div>

              <h3 className="font-semibold text-synse-text">{item.title}</h3>
              {item.summary && (
                <p className="line-clamp-2 text-sm text-synse-muted">{item.summary}</p>
              )}

              <p className="flex items-center gap-1.5 text-xs text-synse-muted">
                <Clock className="size-3.5" aria-hidden />
                {item.publishedAt ? formatDate(item.publishedAt) : 'Rascunho'}
                {item.authorName && ` · ${item.authorName}`}
              </p>

              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href={`/content/${item.id}`}>Abrir</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
