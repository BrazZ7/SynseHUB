'use client'

import Image from 'next/image'
import { useState } from 'react'

import type { Planta } from '@/features/students/plant'

/**
 * A muda do perfil.
 *
 * ── O que ela faz ───────────────────────────────────────────────────────────
 *
 * Ela cresce. O tamanho, o brilho e as fagulhas saem do `vigor`, que sai do
 * nível — então a planta anda um pouco a cada treino, e não só na virada de
 * nível. É a mesma informação do cartão ao lado, dita de um jeito que se
 * entende sem ler número nenhum.
 *
 * Tocar abre o detalhe: o estágio, quanto falta para o próximo e a barra do
 * caminho andado. Fechado, o painel continua sendo um enfeite que informa;
 * aberto, ele responde "por que ela está desse tamanho?".
 *
 * ── Por que este arquivo é cliente e o resto do perfil não ──────────────────
 *
 * Só este pedaço tem estado. Se o `'use client'` subisse para
 * `profile-pieces.tsx`, os gráficos, os cartões e os hexágonos — que são HTML
 * parado — iriam junto para o pacote do navegador sem precisar.
 *
 * ── As fagulhas são fixas de propósito ──────────────────────────────────────
 *
 * Posições sorteadas dariam HTML diferente no servidor e no navegador, e o
 * React reclamaria de hidratação a cada carregamento. Elas parecem aleatórias
 * porque os números foram escolhidos assim, não porque são sorteados.
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

export function PainelPlanta({ planta }: { planta: Planta }) {
  const [aberto, setAberto] = useState(false)
  const { vigor, estagio, proximo, niveisParaOProximo, progresso } = planta

  /*
   * ── Por que a planta não cresce de tamanho ────────────────────────────────
   *
   * Foi a primeira tentativa, e ela não funciona com esta arte: a planta
   * ocupa o quadro quase inteiro — sobram 6,6% de folga no topo e 1,7% na
   * direita. Qualquer aproximação além disso corta a folha de cima, e uma
   * planta que cresce perdendo a ponta da folha não parece que cresceu,
   * parece que a imagem quebrou. Vi isso na captura antes de fechar.
   *
   * Então ela cresce como uma planta cresce de verdade: subindo. A máscara
   * esconde a parte de cima e vai levantando com o nível — primeiro o solo e
   * a base do caule, depois a primeira folha, depois a planta inteira. Como
   * o corte é um degradê, o que está escondido lê como escuridão, não como
   * uma faixa cortada.
   *
   * A escala fica só no toque, para o painel responder ao dedo.
   */
  const escala = 1 + (aberto ? 0.03 : 0)
  const revelado = 48 + 82 * vigor
  const mascara = `linear-gradient(to top, #000 0%, #000 ${(revelado - 25).toFixed(1)}%, transparent ${revelado.toFixed(1)}%)`
  const fagulhas = FAGULHAS.slice(0, Math.round(2 + vigor * 6))

  return (
    <button
      type="button"
      onClick={() => setAberto((estava) => !estava)}
      aria-expanded={aberto}
      aria-controls="detalhe-da-planta"
      /*
       * O fundo é fixo, e não `bg-synse-dark`: este painel é uma foto escura
       * nos dois temas, e a máscara precisa desaparecer contra ele. O tom veio
       * da própria arte, da faixa de cima.
       */
      className="relative w-full overflow-hidden rounded-2xl border border-synse-border bg-[#04100e] text-left outline-none transition focus-visible:ring-2 focus-visible:ring-synse-primary/60"
    >
      {/* No celular a foto ocupa metade do painel; do tablet para cima, tudo. */}
      <div
        className="absolute inset-y-0 left-0 w-1/2 overflow-hidden transition-[mask-image] duration-700 sm:w-full"
        style={{ maskImage: mascara, WebkitMaskImage: mascara }}
      >
        <Image
          src="/synse-planta.webp"
          alt=""
          aria-hidden
          width={237}
          height={211}
          sizes="(max-width: 640px) 50vw, 200px"
          className="size-full origin-bottom object-cover object-bottom transition-[transform,filter] duration-700 ease-out"
          style={{
            transform: `scale(${escala})`,
            filter: `brightness(${(0.45 + 0.55 * vigor).toFixed(3)}) saturate(${(0.35 + 0.65 * vigor).toFixed(3)})`,
          }}
        />

        {/* O brilho de fundo: é ele que faz a planta parecer acesa, e não a foto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            opacity: (vigor * (aberto ? 0.7 : 0.45)).toFixed(3),
            background:
              'radial-gradient(60% 55% at 50% 62%, var(--synse-primary) 0%, transparent 70%)',
          }}
        />

        {fagulhas.map((fagulha) => (
          <span
            key={fagulha.esquerda + fagulha.base}
            aria-hidden
            className="pointer-events-none absolute size-1 animate-faisca rounded-full bg-synse-primary-light/80 motion-reduce:animate-none"
            style={{
              left: fagulha.esquerda,
              bottom: fagulha.base,
              animationDelay: fagulha.atraso,
              animationDuration: fagulha.duracao,
            }}
          />
        ))}
      </div>

      {/*
       * O véu fica fora da máscara: dentro dela ele seria mascarado junto, e a
       * palavra voltaria a cair em cima da folha acesa na parte revelada.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[#04100e]/30 to-[#04100e] sm:w-full"
      />

      {/*
       * A altura vem da proporção da arte. Num painel baixo o `object-cover`
       * cortaria o topo antes de a máscara ter chance de revelar nada, e a
       * planta nunca mostraria as folhas.
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
                      className="h-full rounded-full bg-synse-primary-light"
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
                  Ela não cresce mais — daqui em diante só fica mais acesa.
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
