import type { Metadata } from 'next'
import { Globe, Sparkles } from 'lucide-react'
import { notFound } from 'next/navigation'

import { BackLink } from '@/components/synse/back-link'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { SynseContentForm } from '@/features/content/synse-content-form'
import { AcervoRow } from '@/features/content/acervo-row'
import { requirePlatformSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { TIPOS } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Editar no acervo' }

type Params = Promise<{ id: string }>

/**
 * Editar um item do acervo.
 *
 * A função `save_synse_content` aceita edição desde a 0039 — `p_id` preenchido
 * atualiza, e só alcança linha sem dono. O que faltava era a tela: o formulário
 * sempre criava item novo, então corrigir um título errado exigia apagar e
 * publicar de novo, o que troca o id e quebra qualquer link já compartilhado.
 */
export default async function EditarAcervoPage({ params }: { params: Params }) {
  const { id } = await params
  await requirePlatformSession()

  const dataSource = await getDataSource()
  const item = await dataSource.getSynseContent(id)
  if (!item) notFound()

  const agora = new Date()
  const publicado = Boolean(item.publishedAt && new Date(item.publishedAt) <= agora)
  const agendado = Boolean(item.publishedAt && new Date(item.publishedAt) > agora)

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <BackLink href="/synse-admin/acervo" label="Acervo Synse" />
      <PageHeader title={item.title} description={TIPOS[item.type as keyof typeof TIPOS] ?? item.type} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={publicado ? 'success' : agendado ? 'primary' : 'warning'}>
          {publicado ? 'No ar' : agendado ? 'Agendado' : 'Rascunho'}
        </Badge>
        {item.visibility === 'SYNSE_PLUS' ? (
          <Badge variant="primary">
            <Sparkles className="size-3" aria-hidden />
            Só assinantes
          </Badge>
        ) : (
          <Badge variant="outline">
            <Globe className="size-3" aria-hidden />
            Aberto a todos
          </Badge>
        )}
        {item.publishedAt && (
          <span className="text-xs text-synse-muted">
            {publicado ? 'no ar desde' : 'sai em'} {formatDate(item.publishedAt)}
          </span>
        )}
      </div>

      {/*
        O aviso mais útil da tela. Trocar de "Só assinantes" para "Aberto a
        todos" num item que já está no ar é irreversível na prática: quem
        baixar nesse intervalo fica com o arquivo. O caminho inverso se desfaz
        num clique.
      */}
      {publicado && item.visibility === 'SYNSE_PLUS' && (
        <p className="rounded-xl border border-synse-border bg-synse-surface-2 p-4 text-xs text-synse-muted">
          Este item já está no ar para os assinantes. Abri-lo a todos não se desfaz: quem baixar
          enquanto estiver aberto continua com o arquivo.
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          <SynseContentForm item={item} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <AcervoRow contentId={item.id} titulo={item.title} aposRemover="/synse-admin/acervo" />
      </div>
    </div>
  )
}
