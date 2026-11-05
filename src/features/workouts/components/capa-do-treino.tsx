import Link from 'next/link'
import { Play } from 'lucide-react'

import { SilhuetaMuscular } from '@/features/workouts/components/silhueta-muscular'
import { legendaDosGrupos } from '@/features/workouts/grupos-do-treino'
import { MUSCLE_GROUP_LABELS } from '@/features/workouts/labels'
import type { MuscleGroup } from '@/types/domain'

/**
 * ── A capa de um treino ─────────────────────────────────────────────────────
 *
 * Mesma ideia da capa do SynseRun: a arte é o botão. Um banner bonito com um
 * botão pequeno embaixo desperdiça a parte que mais chama atenção, e a decisão
 * que a pessoa vem tomar aqui é uma só — começar este treino.
 *
 * O que muda em relação ao vale é a **função da arte**. Lá ela é paisagem, e
 * carrega humor: noite, distância, sair cedo. Aqui ela carrega informação:
 * quais músculos este treino trabalha. Quem abre a tela com treino A e B
 * precisa saber qual é o de braço antes de ler nome de exercício — e a figura
 * responde isso antes do texto.
 *
 * ── A interação ─────────────────────────────────────────────────────────────
 *
 * No toque e no hover, a respiração dos músculos acelera (`--pulso`) e a
 * figura cresce de leve, como o vale cresce 4% e as folhas apressam. É o
 * mesmo vocabulário: a arte reage, em vez de ficar parada esperando o clique.
 *
 * `motion-reduce` desliga o pulso; quem pediu menos movimento vê as regiões
 * acesas e paradas, que continuam dizendo a mesma coisa.
 */

type Props = {
  planoId: string
  nome: string
  divisao: string
  objetivo: string | null
  exercicios: number
  grupos: MuscleGroup[]
}

export function CapaDoTreino({ planoId, nome, divisao, objetivo, exercicios, grupos }: Props) {
  const destaques = legendaDosGrupos(grupos)
  const descricao =
    grupos.length > 0
      ? `Músculos trabalhados: ${grupos.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ')}.`
      : undefined

  return (
    /*
     * `.dark` forçado, como no vale: a arte é noite em qualquer tema, e o
     * texto branco em cima dela precisa das cores do tema escuro para o
     * contraste fechar também de dia.
     */
    <Link
      href={`/app/workout/active?plano=${planoId}`}
      /*
       * Sem borda e sem arredondamento: a capa é o **topo do cartão** do
       * plano, e quem arredonda e recorta é o `<section>` em volta. Duas
       * bordas aninhadas desenham um fio duplo na junta com a lista.
       */
      className="dark group relative block overflow-hidden bg-synse-dark focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-synse-primary-light motion-safe:hover:[--pulso:1.3s] motion-safe:active:[--pulso:1.3s]"
    >
      {/*
       * O fundo: luz que vem de dentro, no canto onde a figura está. É o
       * mesmo gesto do `.vidro-led` dos cartões, só que aqui a fonte de luz
       * tem um lugar — atrás do corpo.
       */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_82%_40%,color-mix(in_srgb,var(--synse-primary)_26%,transparent)_0%,transparent_62%)]"
      />

      <SilhuetaMuscular
        grupos={grupos}
        descricao={descricao}
        className="absolute -right-1 top-1/2 h-[140px] w-auto -translate-y-1/2 text-synse-mint transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
      />

      {/*
       * O véu desce da esquerda, porque é à esquerda que o texto mora — e é
       * do lado direito que a figura precisa ficar limpa. No vale ele sobe de
       * baixo pelo mesmo motivo: ele cobre onde há texto, não a arte toda.
       */}
      <div
        aria-hidden
        /*
         * O véu precisa cobrir o texto e **soltar** a figura. Em meia tela ele
         * apagava o boneco da frente: o treino de costas mostrava só a figura
         * de trás acesa e a da frente virava vulto. Agora ele fecha em 46% e
         * já é transparente em 72%, que é onde os dois corpos começam.
         */
        className="absolute inset-0 bg-gradient-to-r from-synse-dark from-[6%] via-synse-dark/70 via-[46%] to-transparent to-[72%]"
      />

      <div className="relative flex min-h-[148px] flex-col justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-white/15 text-[11px] font-bold text-white">
              {divisao}
            </span>
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              {exercicios} {exercicios === 1 ? 'exercício' : 'exercícios'}
              {objetivo && ` · ${objetivo}`}
            </p>
          </div>

          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-white">
            {nome}
          </h2>

          {destaques.length > 0 && (
            <p className="mt-1.5 truncate text-sm text-white/70">
              {destaques.map((g) => MUSCLE_GROUP_LABELS[g]).join(' · ')}
              {grupos.length > destaques.length && ' …'}
            </p>
          )}
        </div>

        {/*
         * A pílula não é um botão de verdade — o cartão inteiro é o elo, e
         * botão dentro de elo não é marcação válida. Ela é a affordance: diz
         * onde o toque leva, e o `group-hover` a acende junto com a arte.
         */}
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-white/25">
          <Play className="size-4 fill-current" aria-hidden />
          Iniciar treino
        </span>
      </div>
    </Link>
  )
}
