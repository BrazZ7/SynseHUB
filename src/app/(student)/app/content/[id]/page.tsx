import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { Badge } from '@/components/ui/badge'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Conteúdo' }

/**
 * ── A tela de leitura ────────────────────────────────────────────────────────
 *
 * O formulário de publicação sempre teve um campo de corpo com até 20 mil
 * caracteres, e o app não tinha onde mostrá-lo: a lista trazia `body: null` e
 * não havia rota de item. Um e-book ou artigo escrito dentro do Synse não
 * chegava a lugar nenhum — só funcionava quem hospedasse o PDF fora e colasse
 * o link. Esta tela é o outro lado daquele campo.
 */
export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStudentSession()
  const { id } = await params

  const dataSource = await getDataSource()
  const item = await dataSource.getPublishedContent(session.organizationId, id)

  /*
   * Vazio aqui é 404, e não "sem permissão".
   *
   * São três coisas que chegam vazias: o item não existe, é rascunho, ou é do
   * Synse+ e quem abriu não assina — a RLS devolve nenhuma linha nos três.
   * Distinguir seria informar que aquele id existe, que é o que um endereço
   * chutado quer descobrir.
   */
  if (!item) notFound()

  /*
   * De quem é o conteúdo. O acervo da plataforma não tem staff autor, então
   * `authorName` vem nulo dele em produção — a origem se lê pelo dono, que é
   * nulo justamente por ser da plataforma.
   */
  const daPlataforma = item.organizationId === null
  const assinatura = daPlataforma ? 'Synse' : item.authorName

  /*
   * O corpo é texto puro, digitado numa `<textarea>` — nunca HTML, nunca
   * `dangerouslySetInnerHTML`. Linha em branco separa parágrafo; a quebra
   * simples dentro de um parágrafo fica por conta do `whitespace-pre-line`.
   */
  const paragrafos = (item.body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <article className="animate-fade-in-up space-y-5">
      <BackLink href="/app/content" label="Conteúdos" />

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
          {daPlataforma && <Badge variant="outline">Acervo Synse</Badge>}
        </div>

        <h1 className="text-xl font-semibold leading-tight text-synse-text">{item.title}</h1>

        {item.summary && <p className="text-sm text-synse-muted">{item.summary}</p>}

        <p className="text-xs text-synse-muted">
          {item.publishedAt && formatDate(item.publishedAt)}
          {assinatura && ` · ${assinatura}`}
        </p>
      </header>

      {item.coverUrl && (
        /*
         * `<img>` e não `next/image`: o otimizador só aceita as origens de
         * `remotePatterns`, hoje só o Supabase, e uma capa pode apontar para
         * qualquer lugar — com `next/image` ela quebraria a tela inteira em
         * tempo de execução. Abrir o otimizador para qualquer host resolveria
         * a capa e criaria um proxy de imagem aberto no nosso domínio.
         *
         * A proporção fixa reserva o espaço antes de a imagem chegar, que é o
         * que o `next/image` daria de graça aqui.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverUrl}
          alt=""
          loading="lazy"
          className="aspect-[16/9] w-full rounded-2xl border border-synse-border bg-synse-surface-2 object-cover"
        />
      )}

      {paragrafos.length > 0 && (
        <div className="space-y-3">
          {paragrafos.map((paragrafo, i) => (
            <p key={i} className="whitespace-pre-line text-[15px] leading-relaxed text-synse-text">
              {paragrafo}
            </p>
          ))}
        </div>
      )}

      {item.mediaUrl && (
        <a
          href={item.mediaUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-xl border border-synse-border bg-synse-surface px-4 py-2.5 text-sm font-medium text-synse-primary"
        >
          <ExternalLink className="size-4" aria-hidden />
          Abrir o material
        </a>
      )}

      {paragrafos.length === 0 && !item.mediaUrl && (
        /*
         * Publicado só com título e resumo. Não é erro — dá para publicar um
         * aviso curto assim — mas a tela precisa dizer que acabou, senão
         * parece que faltou carregar.
         */
        <p className="text-sm text-synse-muted">Este item não tem texto nem material anexado.</p>
      )}
    </article>
  )
}
