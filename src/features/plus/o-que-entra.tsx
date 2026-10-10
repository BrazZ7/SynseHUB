import { CalendarRange, CookingPot, Library, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * ── O que a assinatura entrega, em quatro cartões ───────────────────────────
 *
 * A tabela comparativa continua logo abaixo e continua sendo a fonte
 * completa. Isto aqui é o recorte que se lê de relance — quem abre a página
 * decide nos primeiros segundos, e oito linhas de tabela não cabem nesses
 * segundos.
 *
 * ── Só o que existe ─────────────────────────────────────────────────────────
 *
 * Os quatro foram escolhidos por um critério e um só: **estar construído
 * hoje**. A biblioteca tem conteúdo publicado, os desafios funcionam, os
 * programas guiados entraram na 0043 — e as receitas, na 0044.
 *
 * ── Por que quatro, e quem saiu ─────────────────────────────────────────────
 *
 * São quatro porque a grade tem duas colunas: cinco deixa um cartão sozinho
 * na última linha, e seis já é tabela — e a tabela completa está logo abaixo,
 * onde ela cabe.
 *
 * Com as receitas construídas, passou a haver cinco candidatos. Saiu o
 * ranking entre amigos, e não por ser pior: ele é o único dos cinco que **não
 * entrega nada sozinho**. É opcional, depende de a pessoa autorizar, e depois
 * disso ainda depende de ela ter amigos no aplicativo. Como razão de compra,
 * no segundo em que alguém decide, chega atrás de uma receita que já está lá.
 * Ele continua inteiro na tabela comparativa, que é a fonte completa.
 *
 * Nada de fora por não existir — pela primeira vez desde que este arquivo foi
 * escrito, a lista de "o que o produto promete e não faz" está vazia.
 */
type Entrega = { icone: LucideIcon; titulo: string; descricao: string }

const ENTREGAS: readonly Entrega[] = [
  {
    icone: Library,
    titulo: 'Biblioteca Synse',
    descricao: 'E-books e guias escritos pela plataforma, novos a cada mês.',
  },
  {
    icone: Trophy,
    titulo: 'Seis desafios por mês',
    descricao: 'Em vez de um, e com os desafios que só o Synse+ abre.',
  },
  {
    icone: CalendarRange,
    titulo: 'Programas guiados',
    descricao: 'Sequências de dias com o treino de cada um já montado.',
  },
  {
    icone: CookingPot,
    titulo: 'Receitas Synse',
    descricao: 'Ingredientes, preparo e macros — com a lista de compras pronta.',
  },
]

export function OQueEntra() {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-synse-text">O que entra com o Synse+</h2>

      <ul className="grid grid-cols-2 gap-3">
        {ENTREGAS.map(({ icone: Icone, titulo, descricao }) => (
          <li
            key={titulo}
            className="vidro-led flex flex-col rounded-2xl border border-synse-border bg-synse-surface p-4"
          >
            {/*
             * Pastilha redonda com o ícone, como nas peças de divulgação: ela
             * dá um ponto de entrada para o olho antes do texto.
             */}
            <span className="grid size-9 place-items-center rounded-full bg-synse-primary/10 text-synse-primary">
              <Icone className="size-4" aria-hidden />
            </span>

            <p className="mt-3 text-sm font-semibold leading-tight text-synse-text">{titulo}</p>
            <p className="mt-1 text-xs leading-relaxed text-synse-muted">{descricao}</p>

            {/*
             * O risco verde curto embaixo. É o detalhe que mais faz o cartão
             * parecer da marca, e custa uma linha.
             */}
            <span
              aria-hidden
              className="mt-3 h-0.5 w-8 rounded-full bg-gradient-to-r from-synse-primary to-synse-primary-light"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
