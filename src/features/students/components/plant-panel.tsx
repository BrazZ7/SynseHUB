'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { NivelSynse } from '@/features/students/level'
import { type Planta, plantaDoNivel } from '@/features/students/plant'
import { SeletorDeEstagio, nivelDePrevia } from '@/features/students/components/plant-preview'

/**
 * A muda do perfil.
 *
 * ── O que ela faz ───────────────────────────────────────────────────────────
 *
 * Ela cresce. O tamanho sai do nível, que sai do histórico, e anda um pouco a
 * cada treino — não só na virada de nível. Cada estágio tem a arte dele,
 * declarada em `plant.ts`.
 *
 * ── A composição ────────────────────────────────────────────────────────────
 *
 * A arte é ancorada no canto de baixo à esquerda e sangra para fora: a terra
 * corre pela base do painel e o brilho vaza pela borda. A versão anterior
 * deixava a planta centralizada dentro de um bloco, e o resultado parecia uma
 * figura colada num quadro em vez de uma cena.
 *
 * Nada fica escondido atrás de um toque. Antes o estágio, a barra e o que
 * falta só apareciam depois de tocar; o painel agora diz tudo de uma vez, que
 * é o que a referência do dono do produto pedia. Como não há mais nada para
 * revelar, ele deixou de ser `button` — teclado não precisa ativar o que já
 * está na tela.
 *
 * ── O vento ─────────────────────────────────────────────────────────────────
 *
 * O corpo balança em rajada, não em metrônomo: empurra, recua pouco, empurra
 * de novo. As folhas soltas atravessam o painel girando e somem no escuro da
 * direita. Com o ponteiro em cima o vento aperta, e a planta se inclina para
 * onde está o dedo ou o cursor.
 *
 * A inclinação não passa por estado do React — seria um `setState` a cada
 * `pointermove`, rerenderizando dezenas de vezes por segundo. Ela escreve uma
 * variável CSS no próprio nó, dentro de um `requestAnimationFrame`.
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
    alt: 24,
    x: '8%',
    y: '38%',
    dx: '210px',
    dy: '-92px',
    giro: '190deg',
    atraso: '0s',
    dur: '11s',
  },
  {
    src: '/synse-folha-2.webp',
    w: 62,
    h: 92,
    alt: 18,
    x: '22%',
    y: '20%',
    dx: '240px',
    dy: '-112px',
    giro: '-260deg',
    atraso: '2.4s',
    dur: '13s',
  },
  {
    src: '/synse-folha-3.webp',
    w: 68,
    h: 88,
    alt: 20,
    x: '2%',
    y: '58%',
    dx: '265px',
    dy: '-66px',
    giro: '300deg',
    atraso: '5.1s',
    dur: '12s',
  },
  {
    src: '/synse-folha-4.webp',
    w: 44,
    h: 56,
    alt: 14,
    x: '30%',
    y: '46%',
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
    alt: 15,
    x: '14%',
    y: '68%',
    dx: '280px',
    dy: '-126px',
    giro: '240deg',
    atraso: '3.6s',
    dur: '15s',
  },
] as const

/**
 * O quanto ela verga na direção do dedo, no máximo.
 *
 * Também em `skewX`, pelo mesmo motivo da rajada: girar em direção ao dedo
 * arrastaria a base junto, e a base está enterrada. O valor é maior que o da
 * rajada porque aqui é a pessoa empurrando, não o vento.
 */
const INCLINACAO_MAXIMA = 9

/**
 * O tamanho da planta no primeiro nível.
 *
 * Não é zero e não é um: no nível 1 ela precisa caber no canto, com espaço
 * visível para crescer, e ainda assim compor a cena. Abaixo disso o painel
 * fica vazio para quem acabou de chegar — que é justamente quem não pode
 * abrir o perfil e ver um enfeite apagado.
 */
const ESCALA_MINIMA = 0.58

export function PainelPlanta({
  planta,
  nivel,
  previa = false,
}: {
  planta: Planta
  /** Só para a prévia: o nível de verdade, para poder voltar a ele. */
  nivel?: NivelSynse
  /** ⚠️ Temporário. Ver `plant-preview.tsx`. */
  previa?: boolean
}) {
  /*
   * ⚠️ Temporário: o estágio escolhido na prévia. `null` é o nível de verdade.
   * Nada disso é gravado — a prévia só troca o que a tela desenha.
   */
  const [espiado, setEspiado] = useState<number | null>(null)
  const mostrada =
    previa && espiado !== null && nivel ? plantaDoNivel(nivelDePrevia(nivel, espiado)) : planta

  const { crescimento, vigor, estagio, proximo, niveisParaOProximo, progresso } = mostrada
  const arte = estagio.arte

  const caule = useRef<HTMLImageElement>(null)
  const quadro = useRef<number | null>(null)

  const escala = ESCALA_MINIMA + (1 - ESCALA_MINIMA) * crescimento
  const folhas = FOLHAS_AO_VENTO.slice(0, Math.round(2 + vigor * 3))

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
    <section
      onPointerMove={(evento) => {
        const caixa = evento.currentTarget.getBoundingClientRect()
        const meio = caixa.left + caixa.width / 2
        const desvio = (evento.clientX - meio) / (caixa.width / 2)
        /*
         * Invertido: empurrar o dedo para a direita verga a planta para a
         * direita, e `skewX` positivo joga o topo para a esquerda.
         */
        inclinar(-Math.max(-1, Math.min(1, desvio)) * INCLINACAO_MAXIMA)
      }}
      onPointerLeave={() => inclinar(0)}
      onPointerCancel={() => inclinar(0)}
      aria-label={`Seu jardim: ${estagio.nome}`}
      /*
       * O fundo é fixo, e não `bg-synse-surface`: a planta é desenhada como
       * luz, e luz sobre branco desaparece. Este painel é uma vitrine escura
       * nos dois temas, do mesmo jeito que a capa lá em cima.
       */
      className="vidro-led group relative w-full overflow-hidden rounded-2xl border border-synse-border bg-[#04100e]"
    >
      {/*
       * O brilho da terra. Sai do pé da planta, não do centro do painel: é ele
       * que tira o fundo do preto chapado e dá profundidade à cena.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          opacity: (0.35 + 0.45 * vigor).toFixed(3),
          background:
            'radial-gradient(78% 105% at 26% 104%, var(--synse-primary) 0%, transparent 70%)',
        }}
      />

      {/*
       * ── A arte, em três camadas ───────────────────────────────────────────
       *
       * O contêiner carrega o tamanho e a sangria; dentro dele cada camada tem
       * o seu próprio movimento. Antes era um `img` só, e o balanço girava a
       * cena inteira — a terra inclinava junto com a planta, e as folhas
       * suspensas giravam como adesivo.
       *
       * A ordem importa: a terra vem por último, por cima, e é ela que esconde
       * a emenda onde o caule gira.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 h-full origin-bottom-left"
        style={{
          left: arte.sangra,
          aspectRatio: `${arte.largura} / ${arte.altura}`,
          transform: `scale(${escala.toFixed(3)})`,
          transitionProperty: 'transform',
          transitionDuration: '300ms',
          transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
          // O brilho nunca desce de 1: pequena, sim; apagada, não.
          filter: `brightness(${(0.96 + 0.14 * vigor).toFixed(3)})`,
        }}
      >
        {arte.flutuantes && (
          /*
           * Folhas e gotas paradas no ar. Ritmo próprio e mais lento que o do
           * caule: em fase, elas voltariam a parecer presas na planta.
           */
          <Image
            src={arte.flutuantes}
            alt=""
            width={arte.largura}
            height={arte.altura}
            sizes="(max-width: 640px) 100vw, 512px"
            className="absolute inset-0 size-full animate-boiar group-hover:[--boia:2.4] group-hover:[animation-duration:4.5s] motion-reduce:animate-none"
          />
        )}

        {/*
         * ── O caule, em duas voltas ───────────────────────────────────────
         *
         * A nutação por fora, a deriva por dentro, a mão da pessoa na imagem.
         * Três transformações que se compõem, e é a composição que faz o
         * movimento não parecer um laço.
         *
         * Dois ciclos que não dividem um ao outro: 11s e 7,5s só voltam a
         * coincidir depois de mais de um minuto. Uma animação só, por melhor
         * desenhada que fosse, entrega o período em poucos segundos — foi
         * exatamente o que o dono do produto chamou de genérico.
         *
         * O eixo das três é o mesmo `pivo`: o ponto onde a planta encontra o
         * chão. Sem isso cada camada vergaria em torno de um lugar diferente e
         * a planta se desmontaria.
         */}
        <div
          className="absolute inset-0 animate-nutacao group-hover:[--vida:1.8] group-hover:[animation-duration:6s] motion-reduce:animate-none"
          style={{ transformOrigin: arte.pivo }}
        >
          <div
            className="absolute inset-0 animate-deriva group-hover:[animation-duration:4s] motion-reduce:animate-none"
            style={{ transformOrigin: arte.pivo }}
          >
            <Image
              ref={caule}
              src={arte.caule}
              alt=""
              width={arte.largura}
              height={arte.altura}
              sizes="(max-width: 640px) 100vw, 512px"
              className="absolute inset-0 size-full"
              style={{
                transformOrigin: arte.pivo,
                // `--inclinacao` é escrita direto no nó a cada movimento do dedo.
                ['--inclinacao' as string]: '0deg',
                transform: 'skewX(var(--inclinacao))',
                transitionProperty: 'transform',
                transitionDuration: '420ms',
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
        </div>

        {/* A terra não balança. Fica por cima, parada. */}
        <Image
          src={arte.terra}
          alt=""
          width={arte.largura}
          height={arte.altura}
          sizes="(max-width: 640px) 100vw, 512px"
          className="absolute inset-0 size-full"
        />
      </div>

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
           * linha ganha da folha de estilos, e o `group-hover` não conseguiria
           * acelerar nada. Com a variável, o hover só multiplica, e cada folha
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

      {/* Sem o véu, as palavras caem em cima das folhas acesas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[#04100e]/35 to-[#04100e]"
      />

      {/*
       * O texto manda na altura do painel, e a arte acompanha. Assim uma
       * legenda mais longa nunca corta a planta pela metade.
       */}
      <div className="relative ml-auto flex min-h-44 w-[54%] flex-col justify-center gap-1 py-4 pr-4 text-right">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Seu jardim</p>
        <p className="text-lg font-semibold leading-tight text-synse-primary-light">
          {estagio.nome}
        </p>
        <p className="text-[11px] leading-snug text-white/75">{estagio.legenda}</p>

        {proximo ? (
          <>
            <div
              className="ml-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20"
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
            <p className="mt-1.5 text-[11px] leading-snug text-white/55">
              {niveisParaOProximo <= 1
                ? `Falta um nível para virar ${proximo.nome}.`
                : `Faltam ${niveisParaOProximo} níveis para virar ${proximo.nome}.`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-white/55">
            Ela cresceu tudo o que tinha para crescer.
          </p>
        )}

        {previa && nivel && (
          <SeletorDeEstagio
            nivelEscolhido={espiado}
            aoEscolher={setEspiado}
            nivelReal={nivel.nivel}
          />
        )}
      </div>
    </section>
  )
}
