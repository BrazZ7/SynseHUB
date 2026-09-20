import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * ── O vale ──────────────────────────────────────────────────────────────────
 *
 * A capa da aba de corrida. A arte é a mesma linguagem do resto do Synse —
 * verde-azulado, noite, luz que vem de dentro — e o rio aceso atravessando o
 * vale é, sem precisar explicar, um traçado: é o mesmo desenho que o cartão de
 * compartilhar faz com o GPS de quem correu. As montanhas ao fundo carregam a
 * ideia de distância; o sol nascendo entre elas, a de começar cedo.
 *
 * O cartão inteiro é o botão. Um banner bonito com um botão pequeno embaixo
 * desperdiça a área que mais chama atenção na tela, e a decisão que a pessoa
 * vem tomar aqui é uma só: sair para correr. Caminhada e pedalada ficam logo
 * abaixo, menores, porque são o caso menos frequente — não porque valham menos.
 */

/*
 * As folhas são as mesmas do painel da planta, e é de propósito: a árvore do
 * perfil e o vale da corrida passam a ser o mesmo mundo. Todas sobem e vão
 * para a direita — vento que sopra para todo lado ao mesmo tempo não lê como
 * vento. As posições são fixas, e não sorteadas, porque `Math.random` no
 * servidor e no navegador dão valores diferentes e o React reclamaria da
 * hidratação a cada carregamento.
 */
const FOLHAS = [
  {
    src: '/synse-folha-2.webp',
    w: 62,
    h: 92,
    alt: 17,
    x: '12%',
    y: '22%',
    dx: '150px',
    dy: '-70px',
    giro: '170deg',
    atraso: '0s',
    dur: '13s',
  },
  {
    src: '/synse-folha-4.webp',
    w: 44,
    h: 56,
    alt: 12,
    x: '34%',
    y: '12%',
    dx: '190px',
    dy: '-104px',
    giro: '-150deg',
    atraso: '4.5s',
    dur: '15s',
  },
  {
    src: '/synse-folha-3.webp',
    w: 68,
    h: 88,
    alt: 14,
    x: '58%',
    y: '30%',
    dx: '120px',
    dy: '-86px',
    giro: '210deg',
    atraso: '8s',
    dur: '12s',
  },
] as const

export function RunHero({ chamada }: { chamada: string }) {
  return (
    /*
     * `.dark` no cartão, e não na página: a arte é noturna nos dois temas, e
     * sem isso o texto sairia escuro sobre escuro para quem usa o tema claro.
     * É o mesmo recurso da capa do perfil.
     */
    <Link
      href="/app/run/start?esporte=RUN"
      className="dark group relative block overflow-hidden rounded-3xl shadow-[0_18px_44px_-30px_rgb(0_0_0/0.95)] transition-transform duration-300 active:scale-[0.99]"
    >
      <Image
        src="/synse-run-vale.webp"
        alt=""
        aria-hidden
        width={1000}
        height={645}
        /* Primeira coisa acima da dobra desta aba: sem `priority` ela chega
           depois e o cartão pisca de escuro para ilustrado. */
        priority
        sizes="(max-width: 512px) 100vw, 512px"
        className="absolute inset-0 size-full object-cover transition-transform ease-out [transition-duration:1200ms] group-hover:scale-[1.04]"
      />

      {FOLHAS.map((folha) => (
        <Image
          key={folha.src}
          src={folha.src}
          alt=""
          aria-hidden
          width={folha.w}
          height={folha.h}
          /*
           * A duração vem de `--dur` em vez de `style`: estilo em linha ganha
           * da folha de estilos, e aí o hover não conseguiria apressar nada.
           *
           * `fill-mode: backwards` não é detalhe. Sem ele, a folha com atraso
           * fica **parada e opaca** na posição inicial até o atraso vencer, e
           * só então some para começar a voar — oito segundos de adesivo
           * colado na arte. Com ele, ela já entra no quadro de 0%, que é
           * invisível, e aparece quando de fato levanta.
           */
          className="pointer-events-none absolute w-auto animate-voar [animation-duration:calc(var(--dur)*var(--pressa,1))] [animation-fill-mode:backwards] group-hover:[--pressa:0.55] motion-reduce:hidden"
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

      {/*
       * Dois véus. O da esquerda protege a leitura sem apagar a arte — o texto
       * fica desse lado justamente porque é onde a paisagem já é escura, e o
       * rio e o sol ficam livres à direita. O de baixo assenta a faixa da
       * chamada.
       */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-[#02100f]/85 via-[#02100f]/35 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-[#02100f]/80 via-transparent to-transparent"
      />

      <div className="relative flex min-h-[15rem] flex-col justify-between p-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">SynseRun</h1>
          <p className="mt-0.5 text-sm text-white/70">{chamada}</p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.22em] text-white/75">
            Você
            <br />
            mais longe
          </p>

          <span className="bg-white/12 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-white/20">
            Iniciar corrida
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>
      </div>

      {/*
       * O fio de luz na borda, por último no HTML de propósito: entre irmãos
       * posicionados sem `z-index`, quem vem depois pinta por cima. Se ele
       * viesse antes, a imagem o cobriria e não sobraria contorno nenhum.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-synse-mint/25"
      />
    </Link>
  )
}
