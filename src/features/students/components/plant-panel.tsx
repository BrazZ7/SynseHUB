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
 * do quadro; na árvore, ocupa o quadro inteiro. Cada estágio tem a arte dele,
 * declarada em `plant.ts`.
 *
 * ── O vento ─────────────────────────────────────────────────────────────────
 *
 * O corpo balança em rajada, não em metrônomo: o `brisa` empurra para um lado,
 * recua pouco e empurra de novo. As folhas soltas atravessam o painel com o
 * vento, girando, e somem no escuro da direita.
 *
 * Elas são arquivos próprios, recortados do alfa da arte original — no arquivo
 * que o dono do produto enviou, as folhinhas em volta eram ilhas separadas do
 * corpo. Sem isso elas seriam parte do desenho e balançariam junto, que é o
 * oposto de voar.
 *
 * Com o ponteiro em cima o vento aperta: a rajada fica quase três vezes mais
 * forte e as folhas cruzam em menos da metade do tempo. E a planta se inclina
 * para onde está o dedo ou o cursor.
 *
 * A inclinação não passa por estado do React — seria um `setState` a cada
 * `pointermove`, rerenderizando dezenas de vezes por segundo. Ela escreve uma
 * variável CSS no próprio nó, dentro de um `requestAnimationFrame`.
 *
 * ── Por que este arquivo é cliente e o resto do perfil não ──────────────────
 *
 * Só este pedaço tem estado. Se o `'use client'` subisse para
 * `profile-pieces.tsx`, os gráficos e os cartões — que são HTML parado —
 * iriam junto para o pacote do navegador sem precisar.
 */

/**
 * Os caminhos do vento.
 *
 * Fixos, não sorteados: sorteio daria HTML diferente no servidor e no
 * navegador, e o React reclamaria de hidratação a cada carregamento. Todos
 * sobem e vão para a direita, porque vento que sopra para todo lado ao mesmo
 * tempo não lê como vento.
 */
const FOLHAS_AO_VENTO = [
  {
    src: '/synse-folha-1.webp',
    w: 98,
    h: 100,
    alt: 26,
    x: '2%',
    y: '16%',
    dx: '210px',
    dy: '-96px',
    giro: '190deg',
    atraso: '0s',
    dur: '11s',
  },
  {
    src: '/synse-folha-2.webp',
    w: 62,
    h: 92,
    alt: 20,
    x: '10%',
    y: '46%',
    dx: '240px',
    dy: '-120px',
    giro: '-260deg',
    atraso: '2.4s',
    dur: '13s',
  },
  {
    src: '/synse-folha-3.webp',
    w: 68,
    h: 88,
    alt: 22,
    x: '-4%',
    y: '62%',
    dx: '265px',
    dy: '-70px',
    giro: '300deg',
    atraso: '5.1s',
    dur: '12s',
  },
  {
    src: '/synse-folha-4.webp',
    w: 44,
    h: 56,
    alt: 15,
    x: '16%',
    y: '8%',
    dx: '200px',
    dy: '-58px',
    giro: '-210deg',
    atraso: '7.3s',
    dur: '14s',
  },
  {
    src: '/synse-folha-2.webp',
    w: 62,
    h: 92,
    alt: 16,
    x: '6%',
    y: '74%',
    dx: '280px',
    dy: '-130px',
    giro: '240deg',
    atraso: '3.6s',
    dur: '15s',
  },
  {
    src: '/synse-folha-1.webp',
    w: 98,
    h: 100,
    alt: 18,
    x: '20%',
    y: '54%',
    dx: '190px',
    dy: '-104px',
    giro: '-180deg',
    atraso: '9.2s',
    dur: '12.5s',
  },
] as const

/** O quanto ela se inclina na direção do dedo, no máximo. */
const INCLINACAO_MAXIMA = 7

export function PainelPlanta({ planta }: { planta: Planta }) {
  const [aberto, setAberto] = useState(false)
  const { crescimento, vigor, estagio, proximo, niveisParaOProximo, progresso } = planta
  const arte = estagio.arte

  const caule = useRef<HTMLImageElement>(null)
  const quadro = useRef<number | null>(null)

  /*
   * Pequena no começo e ocupando o quadro na árvore. O `44%` não é zero: uma
   * planta que some no nível 1 é um painel vazio para quem acabou de chegar.
   */
  const escala = 0.44 + 0.56 * crescimento
  const folhas = FOLHAS_AO_VENTO.slice(0, Math.round(2 + vigor * 4))

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
       * O fundo é fixo, e não `bg-synse-surface`.
       *
       * Não é mais por causa de mesclagem — nenhuma arte precisa dela agora.
       * É porque a planta é desenhada como luz: no tema claro, luz sobre
       * branco desaparece. Este painel é uma vitrine escura nos dois temas, do
       * mesmo jeito que a capa lá em cima.
       */
      className="group relative w-full overflow-hidden rounded-2xl border border-synse-border bg-[#04100e] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-synse-primary/60 active:scale-[0.99]"
    >
      <div className="pointer-events-none absolute inset-0">
        {/* No celular a planta ocupa metade do painel; do tablet para cima, tudo. */}
        <div className="absolute inset-y-0 left-0 w-1/2 sm:w-full">
          {/* O halo. Fica atrás da planta e acende junto com ela. */}
          <div
            aria-hidden
            className="absolute inset-0 transition-opacity duration-500"
            style={{
              opacity: (vigor * (aberto ? 0.5 : 0.3)).toFixed(3),
              background:
                'radial-gradient(52% 46% at 50% 68%, var(--synse-primary) 0%, transparent 72%)',
            }}
          />

          {/*
           * ── Um elemento só, e não uma pilha de divs ─────────────────────
           *
           * A brisa e a inclinação ficam no mesmo elemento: a rajada anima a
           * propriedade `rotate` e a inclinação vive no `transform`, que são
           * propriedades separadas e o navegador compõe as duas. Separá-las em
           * dois `div` parece mais organizado e custou caro uma vez — cada
           * `transform` intermediário cria contexto de empilhamento, e naquela
           * época a imagem dependia de mesclagem para esconder o fundo.
           *
           * Sem `duration-*` do Tailwind: o plugin `tailwindcss-animate` faz
           * essas classes valerem também para `animation-duration`, e elas
           * atropelavam a rajada — conferido, a animação rodava em 0,3s. A
           * transição vai no `style`, onde não encosta na animação.
           */}
          <Image
            ref={caule}
            src={arte.src}
            alt=""
            aria-hidden
            width={arte.largura}
            height={arte.altura}
            sizes="(max-width: 640px) 50vw, 240px"
            className="absolute inset-0 size-full origin-bottom animate-brisa object-contain object-bottom group-hover:[--brisa:2.6] group-hover:[animation-duration:3s] motion-reduce:animate-none"
            style={{
              // `--inclinacao` é escrita direto no nó a cada movimento do dedo.
              ['--inclinacao' as string]: '0deg',
              transform: `rotate(var(--inclinacao)) scale(${escala.toFixed(3)})`,
              transitionProperty: 'transform',
              transitionDuration: '300ms',
              transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
              /*
               * O brilho nunca desce de 1: a planta pequena precisa ser pequena
               * e acesa. Quem mostra o nível é o tamanho, não a penumbra.
               */
              filter: `brightness(${(0.96 + 0.14 * vigor).toFixed(3)})`,
            }}
          />
        </div>

        {/*
         * As folhas cruzam o painel inteiro, não só a metade da planta. Elas
         * passam por baixo do véu, então somem no escuro da direita em vez de
         * atravessarem o texto.
         */}
        {folhas.map((folha) => (
          <Image
            key={`${folha.src}-${folha.x}-${folha.y}`}
            src={folha.src}
            alt=""
            aria-hidden
            width={folha.w}
            height={folha.h}
            /*
             * A duração sai de `--dur`, e não de um `style` direto: estilo em
             * linha ganha da folha de estilos, e o `group-hover` não
             * conseguiria acelerar nada — foi o que aconteceu com as fagulhas
             * antes. Com a variável, o hover só multiplica, e cada folha
             * mantém o ritmo próprio em vez de todas cruzarem juntas.
             */
            className="pointer-events-none absolute w-auto animate-voar [animation-duration:calc(var(--dur)*var(--pressa,1))] group-hover:[--pressa:0.4] motion-reduce:hidden"
            style={{
              left: folha.x,
              bottom: folha.y,
              height: `${folha.alt}px`,
              ['--dur' as string]: folha.dur,
              ['--vx' as string]: folha.dx,
              ['--vy' as string]: folha.dy,
              ['--vg' as string]: folha.giro,
              animationDelay: folha.atraso,
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
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[#04100e]/55 to-[#04100e]"
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
