import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Library, Pin, Plus } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Pagination } from '@/components/synse/pagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CONTEUDOS_POR_PAGINA,
  SITUACOES,
  type ContagemDeConteudo,
  type FiltroDeSituacao,
  filtroDeSituacao,
} from '@/features/content/situacao'
import { requireHubSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { can } from '@/lib/permissions/permissions'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { cn, formatDate } from '@/lib/utils'
import type { ContentItem } from '@/types/domain'

export const metadata: Metadata = { title: 'Conteúdos' }

type Search = Promise<{ situacao?: string; page?: string }>

/**
 * ── Por que a tela mudou de forma ───────────────────────────────────────────
 *
 * Ela lia o acervo inteiro e repartia em três seções na aplicação —
 * publicados, agendados, rascunhos — contando o tamanho de cada uma. A leitura
 * não tinha teto, e o PostgREST corta sem avisar: numa academia que publica há
 * anos, as três contagens ficariam menores que a verdade e um rascunho
 * esquecido sumiria sem deixar rastro.
 *
 * As três seções viraram **filtro**, com a contagem vinda do banco e a lista
 * por página. O filtro é elo e não botão: o estado mora na URL, então
 * recarregar e compartilhar o endereço continuam funcionando.
 */
export default async function ContentPage({ searchParams }: { searchParams: Search }) {
  const session = await requireHubSession('content:read')
  const dataSource = await getDataSource()

  const { situacao: situacaoBruta, page } = await searchParams
  const situacao = filtroDeSituacao(situacaoBruta)
  const pagina = Math.max(1, Number.parseInt(page ?? '1', 10) || 1)

  const [lista, contagem] = await Promise.all([
    dataSource.listContent(session.organizationId, {
      situacao,
      page: pagina,
      pageSize: CONTEUDOS_POR_PAGINA,
    }),
    dataSource.contarConteudos(session.organizationId),
  ])

  const canWrite = can(session.role, 'content:write')

  return (
    <div className="animate-fade-in-up space-y-5">
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

      {contagem.total === 0 ? (
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
          <FiltroDeSituacaoBarra atual={situacao} contagem={contagem} />

          {lista.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-synse-border p-8 text-center text-sm text-synse-muted">
              Nenhum conteúdo nesta situação.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lista.rows.map((item) => (
                <CartaoDeConteudo key={item.id} item={item} />
              ))}
            </div>
          )}

          <Pagination page={pagina} pageSize={CONTEUDOS_POR_PAGINA} total={lista.total} />
        </>
      )}
    </div>
  )
}

/**
 * As quatro situações, com o número de cada uma ao lado.
 *
 * O número vem da contagem sobre a academia inteira, nunca do tamanho da
 * página — é essa diferença que a 0049 ensinou a respeitar.
 */
function FiltroDeSituacaoBarra({
  atual,
  contagem,
}: {
  atual: FiltroDeSituacao
  contagem: ContagemDeConteudo
}) {
  const quantos: Record<FiltroDeSituacao, number> = {
    TODOS: contagem.total,
    PUBLICADO: contagem.publicados,
    AGENDADO: contagem.agendados,
    RASCUNHO: contagem.rascunhos,
  }

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filtrar por situação">
      {SITUACOES.map(({ valor, rotulo }) => {
        const ativo = valor === atual
        return (
          <Link
            key={valor}
            /* Sem `page`: trocar de filtro volta para a primeira página. */
            href={valor === 'TODOS' ? '/content' : `/content?situacao=${valor.toLowerCase()}`}
            aria-current={ativo ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              ativo
                ? 'border-synse-primary bg-synse-primary text-white'
                : 'border-synse-border text-synse-muted hover:border-synse-primary',
            )}
          >
            {rotulo}
            <span className="ml-1.5 tabular-nums opacity-70">{quantos[valor]}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function CartaoDeConteudo({ item }: { item: ContentItem }) {
  return (
    <Card className="transition-shadow hover:shadow-synse">
      <CardContent className="space-y-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="primary">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
          {item.pinned && (
            <Pin className="size-4 shrink-0 text-synse-primary" aria-label="Fixado" />
          )}
        </div>

        <h3 className="font-semibold text-synse-text">{item.title}</h3>
        {item.summary && <p className="line-clamp-2 text-sm text-synse-muted">{item.summary}</p>}

        <p className="flex items-center gap-1.5 text-xs text-synse-muted">
          <Clock className="size-3.5" aria-hidden />
          {item.publishedAt ? formatDate(item.publishedAt) : 'Rascunho'}
          {item.authorName && ` · ${item.authorName}`}
        </p>

        <Button variant="outline" size="sm" asChild className="w-full">
          <ListLink href={`/content/${item.id}`}>Abrir</ListLink>
        </Button>
      </CardContent>
    </Card>
  )
}
