import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, CookingPot, Heart } from 'lucide-react'

import { BackLink } from '@/components/synse/back-link'
import { ColunaDeLeitura } from '@/components/synse/duas-colunas'
import { EmptyState } from '@/components/synse/empty-state'
import { PageHeader } from '@/components/synse/page-header'
import { Badge } from '@/components/ui/badge'
import { BotaoFavorito } from '@/features/content/botao-favorito'
import { rotuloDaCategoria } from '@/features/recipes/recipe-pieces'
import { requireStudentSession } from '@/lib/auth/require-session'
import { getDataSource } from '@/lib/database'
import { seAindaNaoMigrou } from '@/lib/database/pending-migration'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import type { FavoriteEntry } from '@/types/domain'

export const metadata: Metadata = { title: 'Guardados' }

/**
 * O que a pessoa guardou.
 *
 * Conteúdo e receita na mesma lista, e não em duas abas: a pergunta é "o que
 * eu guardei", e separar obrigaria a lembrar em qual aba estava.
 */
export default async function FavoritosPage() {
  await requireStudentSession()
  const dataSource = await getDataSource()

  const favoritos = await dataSource.listFavorites(60).catch(seAindaNaoMigrou<FavoriteEntry[]>([]))

  return (
    <ColunaDeLeitura className="animate-fade-in-up space-y-4">
      <BackLink href="/app/content" label="Para ler" />
      <PageHeader
        title="Guardados"
        description="O que você marcou para voltar — conteúdos e receitas."
      />

      {favoritos.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nada guardado ainda"
          description="Toque no coração de um conteúdo ou de uma receita para encontrá-lo aqui depois."
        />
      ) : (
        <div className="space-y-3">
          {favoritos.map((item) => (
            <Cartao key={`${item.kind}:${item.refId}`} item={item} />
          ))}
        </div>
      )}

      {/*
       * Some quando a lista já tem o que ver. O convite para voltar ao acervo
       * é para quem chegou aqui sem nada guardado — para quem tem, ele é só
       * ruído embaixo do que a pessoa veio ler.
       */}
      {favoritos.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Porta href="/app/content" icone={BookOpen} rotulo="Ver o acervo" />
          <Porta href="/app/nutrition/receitas" icone={CookingPot} rotulo="Ver as receitas" />
        </div>
      )}
    </ColunaDeLeitura>
  )
}

/**
 * ── Por que o cartão some sozinho da lista ──────────────────────────────────
 *
 * Nada aqui filtra nada: a lista vem de uma função `security invoker`, então
 * o que a pessoa deixou de poder ver já não chega — conteúdo despublicado,
 * item do Synse+ de quem deixou de assinar. A linha continua guardada e
 * reaparece quando o acesso volta.
 */
function Cartao({ item }: { item: FavoriteEntry }) {
  const conteudo = item.kind === 'CONTEUDO'
  const href = conteudo ? `/app/content/${item.refId}` : `/app/nutrition/receitas/${item.refId}`
  const rotulo = conteudo
    ? (TIPOS[item.badge as TipoConteudo] ?? item.badge)
    : rotuloDaCategoria(item.badge)

  return (
    <div className="relative">
      <Link
        href={href}
        className="block rounded-2xl border border-synse-border bg-synse-surface p-4 pr-14 shadow-synse-sm transition-colors hover:border-synse-primary/40"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={conteudo ? 'primary' : 'outline'}>{rotulo}</Badge>
          {/*
           * Qual lista é esta linha. Com conteúdo e receita misturados, o
           * rótulo da categoria sozinho não diz se "Lanche" é artigo ou prato.
           */}
          <span className="text-xs text-synse-muted">{conteudo ? 'Conteúdo' : 'Receita'}</span>
        </div>

        <h2 className="mt-2 font-semibold text-synse-text">{item.title}</h2>
        {item.subtitle && <p className="mt-1 text-sm text-synse-muted">{item.subtitle}</p>}
      </Link>

      <BotaoFavorito
        {...(conteudo ? { contentId: item.refId } : { recipeId: item.refId })}
        inicial
        titulo={item.title}
        className="absolute right-2 top-2"
      />
    </div>
  )
}

function Porta({
  href,
  icone: Icone,
  rotulo,
}: {
  href: string
  icone: typeof BookOpen
  rotulo: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-synse-border bg-synse-surface p-4 text-sm font-medium text-synse-text shadow-synse-sm transition-colors hover:bg-synse-surface-2"
    >
      <Icone className="size-5 shrink-0 text-synse-primary" aria-hidden />
      {rotulo}
    </Link>
  )
}
