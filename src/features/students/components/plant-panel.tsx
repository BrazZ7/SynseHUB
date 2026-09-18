'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Planta } from '@/features/students/plant'

/**
 * A muda do perfil.
 *
 * ── O que ela faz ───────────────────────────────────────────────────────────
 *
 * Ela cresce. O tamanho sai do nível, que sai do histórico, e anda um pouco a
 * cada treino — não só na virada de nível. No nível 1 é uma plantinha no canto
 * do quadro; na árvore, ocupa o quadro inteiro. É a mesma informação do cartão
 * ao lado, dita de um jeito que se entende sem ler número nenhum.
 *
 * ── Como a arte fica sem fundo ──────────────────────────────────────────────
 *
 * O arquivo é uma planta acesa sobre preto, e não um PNG recortado. Encolher
 * um arquivo assim mostraria o retângulo escuro dele por cima do painel.
 *
 * A saída não é recortar — foi a extração por luminância que deixou o halo
 * pálido em volta da primeira chama. É `mix-blend-mode: screen`, que é a
 * operação certa para arte luminosa sobre preto: o preto some contra o fundo
 * escuro do painel e só a luz atravessa. Nada é adivinhado, é a conta do
 * próprio modo de mesclagem. A máscara radial por cima apaga a aresta do
 * retângulo, que o `screen` sozinho ainda deixaria de leve.
 *
 * A tentativa anterior escondia o topo da planta com uma máscara que subia com
 * o nível. Crescia, mas crescia apagando — e o que a planta precisa é
 * aparecer.
 *
 * ── A interação ─────────────────────────────────────────────────────────────
 *
 * Parada, ela balança devagar. Com o ponteiro em cima, balança mais forte e
 * mais rápido, acende e solta mais fagulhas. E ela se inclina para onde está o
 * dedo ou o cursor.
 *
 * A inclinação não passa por estado do React: seria um `setState` a cada
 * `pointermove`, e isso rerenderiza a árvore inteira dezenas de vezes por
 * segundo. Ela escreve uma variável CSS no próprio nó, dentro de um
 * `requestAnimationFrame`, que é o que o navegador faz de graça.
 *
 * ── Por que este arquivo é cliente e o resto do perfil não ──────────────────
 *
 * Só este pedaço tem estado. Se o `'use client'` subisse para
 * `profile-pieces.tsx`, os gráficos e os cartões — que são HTML parado —
 * iriam junto para o pacote do navegador sem precisar.
 */

/**
 * As fagulhas.
 *
 * Posições fixas, não sorteadas: sorteio daria HTML diferente no servidor e no
 * navegador, e o React reclamaria de hidratação a cada carregamento. Elas
 * parecem aleatórias porque os números foram escolhidos assim.
 */
const FAGULHAS = [
  { esquerda: '18%', base: '22%', atraso: '0s', duracao: '5.2s' },
  { esquerda: '64%', base: '14%', atraso: '1.4s', duracao: '4.4s' },
  { esquerda: '38%', base: '46%', atraso: '2.6s', duracao: '6.1s' },
  { esquerda: '78%', base: '38%', atraso: '0.7s', duracao: '5.7s' },
  { esquerda: '8%', base: '52%', atraso: '3.3s', duracao: '4.9s' },
  { esquerda: '52%', base: '64%', atraso: '1.9s', duracao: '6.6s' },
  { esquerda: '28%', base: '70%', atraso: '4.1s', duracao: '5.4s' },
  { esquerda: '70%', base: '58%', atraso: '2.2s', duracao: '6.3s' },
] as const

/** O quanto ela se inclina na direção do dedo, no máximo. */
const INCLINACAO_MAXIMA = 7

export function PainelPlanta({ planta }: { planta: Planta }) {
  const [aberto, setAberto] = useState(false)
  const { crescimento, vigor, estagio, proximo, niveisParaOProximo, progresso } = planta

  const caule = useRef<HTMLImageElement>(null)
  const quadro = useRef<number | null>(null)

  /*
   * Pequena no começo e ocupando o quadro na árvore. O `44%` não é zero: uma
   * planta que some no nível 1 é um painel vazio para quem acabou de chegar.
   */
  const escala = 0.44 + 0.56 * crescimento
  const fagulhas = FAGULHAS.slice(0, Math.round(3 + vigor * 5))

  const inclinar = useCallback((valor: number) => {
    if (quadro.current !== null) return
    quadro.current = requestAnimationFrame(() => {
      quadro.current = null
      caule.current?.style.setProperty('--inclinacao', `${valor.toFixed(2)}deg`)
    })
  }, [])

  // Um `rAF` pendente depois de a tela sair escreveria num nó que já foi.
  useEffect(
    () => () => {
      if (quadro.current !== null) cancelAnimationFrame(quadro.current)
    },
    [],
  )

  return (
    <button
      type="button"
      onClick={() => setAberto((estava) => !estava)}
      onPointerMove={(evento) => {
        const caixa = evento.currentTarget.getBoundingClientRect()
        const meio = caixa.left + caixa.width / 2
        const desvio = (evento.clientX - meio) / (caixa.width / 2)
        inclinar(Math.max(-1, Math.min(1, desvio)) * INCLINACAO_MAXIMA)
      }}
      onPointerLeave={() => inclinar(0)}
      onPointerCancel={() => inclinar(0)}
      aria-expanded={aberto}
      aria-controls="detalhe-da-planta"
      /*
       * O fundo é fixo, e não `bg-synse-dark`: o `screen` precisa de um fundo
       * escuro para o preto da arte desaparecer, e este painel é uma foto
       * escura nos dois temas. O tom veio da própria arte.
       *
       * `isolate` prende a mesclagem aqui dentro: sem ele, o `screen` da
       * planta procuraria o fundo da página.
       */
      className="group relative isolate w-full overflow-hidden rounded-2xl border border-synse-border bg-[#04100e] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-synse-primary/60 active:scale-[0.99]"
    >
      {/* No celular a planta ocupa metade do painel; do tablet para cima, tudo. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 sm:w-full">
        {/* O halo. Fica atrás da planta e acende junto com ela. */}
        <div
          aria-hidden
          className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            opacity: (vigor * (aberto ? 0.55 : 0.34)).toFixed(3),
            background:
              'radial-gradient(52% 46% at 50% 68%, var(--synse-primary) 0%, transparent 72%)',
          }}
        />

        {/*
         * ── Um elemento só, e não uma pilha de divs ───────────────────────
         *
         * A primeira versão tinha a brisa num `div` e a inclinação em outro,
         * com a imagem dentro. Parecia organizado e quebrava o efeito: um
         * `transform` num elemento acima cria contexto de empilhamento, e aí
         * o `mix-blend-screen` da imagem passa a mesclar com aquele grupo
         * vazio em vez de mesclar com o fundo do painel. O preto da arte
         * voltava a aparecer — e voltava inclinado junto com ela, o que
         * denunciava a causa.
         *
         * Aqui a brisa anima a propriedade `rotate` e a inclinação vive no
         * `transform`. São propriedades separadas no mesmo elemento: o
         * navegador compõe as duas, e a imagem continua vizinha direta do
         * fundo que ela precisa mesclar.
         */}
        <Image
          ref={caule}
          src="/synse-planta.webp"
          alt=""
          aria-hidden
          width={237}
          height={211}
          sizes="(max-width: 640px) 50vw, 200px"
          /*
           * Sem `duration-300` aqui: o plugin `tailwindcss-animate` faz as
           * classes `duration-*` valerem também para `animation-duration`, e
           * ela atropelava os 7s da brisa — conferido no navegador, a
           * animação estava rodando em 0,3s. A transição da inclinação vai no
           * `style`, onde não encosta na animação.
           */
          className="absolute inset-0 size-full origin-bottom animate-brisa object-contain object-bottom mix-blend-screen group-hover:[--brisa:2.6] group-hover:[animation-duration:3s] motion-reduce:animate-none"
          style={{
            // `--inclinacao` é escrita direto no nó a cada movimento do dedo.
            ['--inclinacao' as string]: '0deg',
            transform: `rotate(var(--inclinacao)) scale(${escala.toFixed(3)})`,
            transitionProperty: 'transform',
            transitionDuration: '300ms',
            transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
            /*
             * O contraste é o que apaga o retângulo.
             *
             * Sozinho, o `screen` ainda deixava o fundo da arte visível: ele
             * não é preto puro, é um quase-preto esverdeado, e quase-preto
             * sobre escuro ainda clareia. `contrast(1.55)` empurra tudo
             * abaixo de ~16% para o preto de verdade — e preto no `screen` é
             * transparente. A planta, que é clara, só ganha com isso. O valor
             * saiu de comparar 1.15, 1.25, 1.35, 1.5 e 1.6 lado a lado: até
             * 1.25 a moldura ainda aparecia.
             *
             * O brilho nunca desce de 1. A planta pequena precisa ser pequena
             * e acesa — quem mostra o nível é o tamanho, não a penumbra.
             */
            filter: `contrast(1.55) brightness(${(0.98 + 0.14 * vigor).toFixed(3)})`,
          }}
        />

        {fagulhas.map((fagulha) => (
          <span
            key={fagulha.esquerda + fagulha.base}
            aria-hidden
            /*
             * A duração sai de `--dur`, e não de um `style` direto: estilo em
             * linha ganha da folha de estilos, então o `group-hover` não
             * conseguia acelerar nada — conferido, as fagulhas continuavam nos
             * mesmos 5,2s com o ponteiro em cima. Com a variável, o hover só
             * multiplica, e cada fagulha mantém o ritmo próprio em vez de
             * todas passarem a subir juntas.
             */
            className="pointer-events-none absolute size-1 animate-faisca rounded-full bg-synse-primary-light/80 [animation-duration:calc(var(--dur)*var(--pressa,1))] group-hover:[--pressa:0.45] motion-reduce:animate-none"
            style={{
              left: fagulha.esquerda,
              bottom: fagulha.base,
              animationDelay: fagulha.atraso,
              ['--dur' as string]: fagulha.duracao,
            }}
          />
        ))}
      </div>

      {/*
       * O véu fica fora do bloco da planta: dentro dele seria inclinado e
       * mesclado junto, e a palavra voltaria a cair em cima da folha acesa.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[#04100e]/20 to-[#04100e] sm:w-full"
      />

      {/*
       * A altura vem da proporção da arte: num painel baixo a árvore completa
       * não caberia, e o crescimento pararia antes da hora.
       */}
      <div className="relative flex min-h-44 flex-col items-end justify-center gap-1 p-4 text-right">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Seu jardim</p>
        <p className="text-base font-semibold text-synse-primary-light">{estagio.nome}</p>

        <div id="detalhe-da-planta" className="w-full max-w-40">
          {aberto ? (
            <>
              <p className="text-[11px] leading-snug text-white/75">{estagio.legenda}</p>

              {proximo ? (
                <>
                  <div
                    className="ml-auto mt-2 h-1 w-20 overflow-hidden rounded-full bg-white/15"
                    role="progressbar"
                    aria-valuenow={Math.round(progresso * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Caminho até ${proximo.nome}`}
                  >
                    <div
                      className="h-full rounded-full bg-synse-primary-light transition-[width] duration-500"
                      style={{ width: `${Math.round(progresso * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-white/60">
                    {niveisParaOProximo <= 1
                      ? `Falta um nível para virar ${proximo.nome}.`
                      : `Faltam ${niveisParaOProximo} níveis para virar ${proximo.nome}.`}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[11px] leading-snug text-white/60">
                  Ela cresceu tudo o que tinha para crescer.
                </p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-white/45">Toque para ver</p>
          )}
        </div>
      </div>
    </button>
  )
}
