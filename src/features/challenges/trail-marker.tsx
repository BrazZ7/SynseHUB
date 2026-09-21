import { ARTE, caminhoSvg, pontoNaRota } from '@/features/challenges/trail-route'

/**
 * ── O marcador que anda pela trilha ──────────────────────────────────────────
 *
 * A arte tem um caminho luminoso subindo a serra. Este componente desenha, por
 * cima dela, a mesma rota em traço, o trecho já percorrido aceso, e o alfinete
 * no ponto exato do progresso — no pé da trilha para quem está começando, no
 * alto para quem fechou a meta.
 *
 * ── O alinhamento com a imagem ──────────────────────────────────────────────
 *
 * Esta é a parte que erra fácil. A imagem é desenhada com `object-cover`, que
 * amplia até cobrir a caixa e corta o excedente pelo centro. O SVG usa
 * `preserveAspectRatio="xMidYMid slice"`, que é **a mesma regra**: `slice`
 * cobre em vez de caber, e `xMidYMid` centraliza. Com o `viewBox` na medida da
 * arte, os dois recortam igual e o alfinete cai onde a trilha está, em
 * qualquer largura de tela.
 *
 * Qualquer outro valor ali — `meet`, ou um alinhamento diferente — e o
 * marcador flutua fora do caminho assim que a proporção do cartão muda.
 *
 * ── Por que a rota inteira é desenhada ──────────────────────────────────────
 *
 * Tirar o alfinete que vinha pintado na arte abriu uma falha no rastro. O
 * traço apagado da rota cobre essa falha e, de quebra, mostra o que ainda
 * falta andar — que é informação, não enfeite.
 */
export function MarcadorNaTrilha({ fracao }: { fracao: number }) {
  const ponto = pontoNaRota(fracao)
  const percorrido = Math.min(1, Math.max(0, Number.isFinite(fracao) ? fracao : 0))
  const chegou = percorrido >= 1

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${ARTE.largura} ${ARTE.altura}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <defs>
        <filter id="trilha-brilho" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      {/* O que falta: fio apagado, só para o caminho continuar visível. */}
      <path
        d={caminhoSvg()}
        fill="none"
        stroke="rgb(255 255 255 / 0.18)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/*
       * O que já foi andado. `pathLength="1"` normaliza o comprimento, então o
       * traço vira a própria fração — sem precisar medir o caminho no
       * navegador, que exigiria JavaScript e um efeito depois da montagem.
       */}
      <g filter="url(#trilha-brilho)" opacity="0.85">
        <path
          d={caminhoSvg()}
          fill="none"
          stroke="var(--synse-primary-light)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - percorrido}
        />
      </g>
      <path
        d={caminhoSvg()}
        fill="none"
        stroke="rgb(255 255 255 / 0.85)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={1 - percorrido}
      />

      {/*
       * O alfinete, com a ponta na origem: assim `translate` leva a ponta ao
       * ponto da rota, e não o centro do bojo — um alfinete ancorado pelo meio
       * aponta para um lugar que não é o que ele marca.
       */}
      <g transform={`translate(${ponto.x} ${ponto.y})`}>
        <ellipse cx="0" cy="0" rx="13" ry="4" fill="var(--synse-primary)" opacity="0.5" />
        <g filter="url(#trilha-brilho)" opacity={chegou ? 0.95 : 0.7}>
          <circle cx="0" cy="-38" r="17" fill="var(--synse-primary-light)" />
        </g>
        <path
          d="M 0 0 C -7 -13 -20 -24 -20 -37 C -20 -48 -11 -57 0 -57 C 11 -57 20 -48 20 -37 C 20 -24 7 -13 0 0 Z"
          fill="#ffffff"
        />
        <circle cx="0" cy="-38" r="7.5" fill="var(--synse-dark)" />
      </g>
    </svg>
  )
}
