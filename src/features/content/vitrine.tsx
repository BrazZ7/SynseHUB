import { Lock, Sparkles } from 'lucide-react'
import Link from 'next/link'

import { ListLink } from '@/components/synse/list-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TIPOS, type TipoConteudo } from '@/lib/validations/content'
import { formatDate } from '@/lib/utils'
import type { ItemTrancado } from '@/types/domain'

/**
 * ── A vitrine do cadeado ─────────────────────────────────────────────────────
 *
 * O cadeado da 0038 funciona: quem não assina não lê o conteúdo do Synse+. O
 * efeito colateral era que ele também não **ficava sabendo** — a RLS não
 * devolve a linha, e prateleira vazia convence o aluno do plano grátis de que
 * o Synse+ não tem acervo.
 *
 * É o contrário do que um paywall faz. Jornal mostra a manchete e corta no
 * terceiro parágrafo; streaming mostra a capa com o cadeado. O que falta é a
 * manchete.
 *
 * O que chega aqui é `ItemTrancado`, e não `ContentItem`: ele não tem onde
 * guardar o corpo nem o link do arquivo, então esta tela não tem como vazar o
 * que anuncia. A mesma regra está em SQL, na projeção de `acervo_trancado`.
 */

/** O cartão da prateleira trancada. Leva ao anúncio, não ao conteúdo. */
export function CartaoTrancado({ item }: { item: ItemTrancado }) {
  return (
    <ListLink
      href={`/app/content/${item.id}`}
      /*
       * Mais apagado que um cartão lido, e de propósito: a prateleira
       * trancada não pode competir com o que a pessoa já pode abrir. O que
       * chama atenção é o cadeado, não o cartão.
       */
      className="block rounded-2xl border border-dashed border-synse-border bg-synse-surface/60 p-4 transition-colors hover:border-synse-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{TIPOS[item.type as TipoConteudo] ?? item.type}</Badge>
          <Badge variant="primary">Synse+</Badge>
        </div>
        <Lock className="size-4 shrink-0 text-synse-muted" aria-label="Conteúdo do Synse+" />
      </div>

      <h3 className="mt-2 font-semibold text-synse-text">{item.title}</h3>
      {item.summary && <p className="mt-1 text-sm text-synse-muted">{item.summary}</p>}

      <p className="mt-2 text-xs text-synse-muted">{formatDate(item.publishedAt)} · Synse</p>
    </ListLink>
  )
}

/**
 * A chamada do plano, no fim da prateleira e na tela do item trancado.
 *
 * A primeira versão contava os itens — "Mais 1 conteúdo no Synse+" — logo
 * abaixo do único cartão que os mostrava. "Mais" promete algo além do que
 * está na tela, e ali não havia nada além. Contar de novo o que a pessoa
 * acabou de ver não acrescenta e, no número pequeno, desmente.
 *
 * O título diz o que fazer, não quanto tem: na prateleira, abrir o acervo;
 * no item trancado, ler aquele item. Também não repete a faixa de cadeado
 * que vem logo acima dele na tela do item — duas frases dizendo "isto é do
 * Synse+", uma embaixo da outra, soam como um aviso repetido a quem não
 * entendeu da primeira vez.
 */
export function ChamadaDoPlus({ titulo }: { titulo?: string }) {
  return (
    <div className="rounded-2xl border border-synse-border bg-synse-surface p-5 text-center shadow-synse-sm">
      <Sparkles className="mx-auto size-5 text-synse-primary" aria-hidden />
      <p className="mt-2 text-sm font-semibold text-synse-text">{titulo ?? 'Leia com o Synse+'}</p>
      <p className="mt-1 text-sm text-synse-muted">
        O primeiro mês é grátis, e dá para cancelar antes da primeira cobrança.
      </p>
      <Button asChild className="mt-4">
        <Link href="/app/synse">Conhecer o Synse+</Link>
      </Button>
    </div>
  )
}
