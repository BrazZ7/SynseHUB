import { Clock, Lock, UsersRound } from 'lucide-react'

import { ListLink } from '@/components/synse/list-link'
import { Badge } from '@/components/ui/badge'
import { CATEGORIAS, MACROS, type Categoria } from '@/lib/validations/recipe'
import type { Recipe, ReceitaTrancada } from '@/types/domain'

/**
 * ── As peças da biblioteca de receitas ──────────────────────────────────────
 *
 * Duas formas de cartão, e a diferença entre elas é o que a tela **tem** para
 * mostrar, não o que ela escolhe esconder: `Recipe` traz ingredientes e
 * preparo, `ReceitaTrancada` não tem onde guardá-los. A mesma regra está em
 * SQL, na projeção de `receitas_trancadas` (0044).
 */

export function rotuloDaCategoria(categoria: string): string {
  return CATEGORIAS[categoria as Categoria] ?? categoria
}

/** Tempo e porções, a linha que decide se dá para fazer hoje. */
function Ficha({ minutos, porcoes }: { minutos: number | null; porcoes: number | null }) {
  if (minutos == null && porcoes == null) return null

  return (
    <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-synse-muted">
      {minutos != null && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {minutos} min
        </span>
      )}
      {porcoes != null && (
        <span className="inline-flex items-center gap-1">
          <UsersRound className="size-3.5" aria-hidden />
          {porcoes === 1 ? '1 porção' : `${porcoes} porções`}
        </span>
      )}
    </p>
  )
}

/**
 * A foto do prato.
 *
 * `<img>` e não `next/image`, pelo mesmo motivo da capa do acervo: o
 * otimizador só aceita as origens de `remotePatterns`, e uma foto de receita
 * pode apontar para qualquer lugar — com `next/image` ela quebraria a tela
 * inteira em tempo de execução. A proporção fixa reserva o espaço antes de a
 * imagem chegar, que é o que o `next/image` daria de graça aqui.
 */
export function FotoDoPrato({ src, className }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={
        className ??
        'aspect-[16/9] w-full rounded-xl border border-synse-border bg-synse-surface-2 object-cover'
      }
    />
  )
}

/**
 * O cartão da lista.
 *
 * Sem o selo da categoria, e isto foi encontrado na tela: o cartão fica
 * **dentro** da seção "Almoço", e repetir "Almoço" logo abaixo do título da
 * seção é ruído. O selo continua na tela da receita, onde não há seção que o
 * diga. O do Synse+ fica — aquele não se deduz de onde o cartão está.
 */
export function CartaoDeReceita({ receita }: { receita: Recipe }) {
  return (
    <ListLink
      href={`/app/nutrition/receitas/${receita.id}`}
      className="block rounded-2xl border border-synse-border bg-synse-surface p-4 shadow-synse-sm transition-colors hover:border-synse-primary/40"
    >
      {receita.visibility === 'SYNSE_PLUS' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="primary">Synse+</Badge>
        </div>
      )}

      <h3 className="mt-2 font-semibold text-synse-text">{receita.title}</h3>
      {receita.description && (
        <p className="mt-1 text-sm text-synse-muted">{receita.description}</p>
      )}

      <Ficha minutos={receita.prepMinutes} porcoes={receita.servings} />
    </ListLink>
  )
}

/**
 * O cartão da prateleira trancada.
 *
 * Mais apagado que um cartão aberto, como no acervo: a prateleira trancada não
 * pode competir com o que a pessoa já pode abrir. A foto fica — aqui o prato é
 * o anúncio, e é a diferença em relação ao acervo, onde a capa é ilustração.
 */
export function CartaoDeReceitaTrancada({ receita }: { receita: ReceitaTrancada }) {
  return (
    <ListLink
      href={`/app/nutrition/receitas/${receita.id}`}
      className="block rounded-2xl border border-dashed border-synse-border bg-synse-surface/60 p-4 transition-colors hover:border-synse-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{rotuloDaCategoria(receita.category)}</Badge>
          <Badge variant="primary">Synse+</Badge>
        </div>
        <Lock className="size-4 shrink-0 text-synse-muted" aria-label="Receita do Synse+" />
      </div>

      <h3 className="mt-2 font-semibold text-synse-text">{receita.title}</h3>
      {receita.description && (
        <p className="mt-1 text-sm text-synse-muted">{receita.description}</p>
      )}

      <Ficha minutos={receita.prepMinutes} porcoes={receita.servings} />
    </ListLink>
  )
}

/**
 * A tabela de macros.
 *
 * Só mostra o que veio. `nutrition_facts` é `jsonb` livre (0003) e nem toda
 * receita traz os quatro — exigir o conjunto completo faria a primeira receita
 * só com calorias não mostrar nada.
 */
export function TabelaDeMacros({ macros }: { macros: Record<string, number> }) {
  const presentes = MACROS.filter((m) => macros[m.chave] != null)
  if (presentes.length === 0) return null

  return (
    <section className="rounded-2xl border border-synse-border bg-synse-surface p-4">
      <h2 className="text-sm font-medium text-synse-text">Por porção</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {presentes.map((macro) => (
          <div key={macro.chave}>
            <dt className="text-xs text-synse-muted">{macro.rotulo}</dt>
            <dd className="text-lg font-semibold text-synse-text">
              {macros[macro.chave]}
              <span className="ml-0.5 text-xs font-normal text-synse-muted">{macro.unidade}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
