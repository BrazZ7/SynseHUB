import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Bike, Footprints } from 'lucide-react'

import { SPORT_LABELS } from '@/features/synse-run/format'

/**
 * ── O vale ──────────────────────────────────────────────────────────────────
 *
 * A capa da aba de corrida. A arte é a mesma linguagem do resto do Synse —
 * verde-azulado, noite, luz que vem de dentro — e o rio aceso atravessando o
 * vale é, sem precisar explicar, um traçado: é o mesmo desenho que o cartão de
 * compartilhar faz com o GPS de quem correu. As montanhas ao fundo carregam a
 * ideia de distância; o sol nascendo entre elas, a de começar cedo.
 *
 * A área da corrida é toda ela um botão. Um banner bonito com um botão pequeno
 * embaixo desperdiça a parte que mais chama atenção na tela, e a decisão que a
 * pessoa vem tomar aqui é uma só: sair para correr.
 *
 * Caminhada e pedalada ficam **dentro** da arte, em vidro fosco, logo abaixo —
 * menores, porque são o caso menos frequente, mas ainda sobre a paisagem em
 * vez de numa faixa branca que cortaria a imagem ao meio. Por causa delas a
 * capa não pode ser um `<Link>` envolvendo tudo: elo dentro de elo não é HTML
 * válido, e o navegador desmonta a marcação. Então a arte é o palco e os três
 * elos vivem em cima dela.
 *
 * Tocar em qualquer ponto abre a tela de preparo, que procura o GPS e espera o
 * toque em começar. Nada é gravado por engano — o que é o que permite a área
 * inteira ser tocável sem virar armadilha.
 *
 * ── Sem moldura ─────────────────────────────────────────────────────────────
 *
 * As margens negativas desfazem o `px-5` e o `pt-6` da casca do app: a arte
 * encosta nas bordas da tela e começa no topo da rolagem, e um degradê costura
 * o fim dela ao fundo da página. É o mesmo tratamento da capa do perfil.
 *
 * Por causa disso, este componente **precisa ser o primeiro filho** do
 * contêiner da página. O `space-y-5` de lá aplica `margin-top` a todo irmão a
 * partir do segundo, com especificidade maior que a de `-mt-6`, e a capa
 * desceria 44px deixando uma faixa da cor da página acima dela.
 *
 * E o texto se apoia embaixo, não em cima: o alto da tela é onde mora o
 * recorte da câmera nos telefones com entalhe, e a saudação sumiria atrás
 * dele. Em cima fica só céu.
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

/** Os dois esportes secundários, em vidro fosco sobre a paisagem. */
const OUTROS_ESPORTES = [
  { esporte: 'WALK', icone: Footprints },
  { esporte: 'RIDE', icone: Bike },
] as const

export function RunHero({ saudacao, chamada }: { saudacao: string; chamada: string }) {
  return (
    /*
     * `group` aqui fora, e não no elo da corrida: assim passar o mouse em
     * qualquer ponto da capa — inclusive nos botões de vidro — acelera as
     * folhas e aproxima a paisagem, em vez de só a metade de cima reagir.
     */
    <div className="group relative -mx-5 -mt-6">
      {/*
       * `.dark` na arte, e não na página: a paisagem é noturna nos dois temas,
       * e sem isto o texto sairia escuro sobre escuro para quem usa o claro.
       */}
      <section className="dark relative overflow-hidden">
        <Image
          src="/synse-run-vale.webp"
          alt=""
          aria-hidden
          width={1000}
          height={645}
          /* Primeira coisa acima da dobra desta aba: sem `priority` ela chega
             depois e a tela pisca de escuro para ilustrada. */
          priority
          sizes="100vw"
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
         * O véu sobe de baixo, porque é embaixo que o texto e os botões se
         * apoiam — e é também onde a paisagem já é folhagem escura. O céu, o
         * sol e o rio ficam limpos na metade de cima.
         */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[#02100f] via-[#02100f]/45 to-transparent"
        />

        <div className="relative flex min-h-[22rem] flex-col justify-end">
          {/*
           * Tocar em qualquer ponto daqui abre a tela de preparo, que procura o
           * GPS e espera o toque em começar. Nada é gravado por engano — o que
           * é o que permite a área inteira ser tocável sem virar armadilha.
           */}
          <Link href="/app/run/start?esporte=RUN" className="block px-5 pt-12">
            <p className="text-sm text-white/65">{saudacao}</p>
            <h1 className="mt-0.5 text-4xl font-semibold tracking-tight text-white">SynseRun</h1>
            <p className="mt-1 text-sm text-white/70">{chamada}</p>

            <div className="mt-5 flex items-end justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.22em] text-white/70">
                Você
                <br />
                mais longe
              </p>

              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors group-hover:bg-white/20">
                Iniciar corrida
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </div>
          </Link>

          {/*
           * ── O vidro fosco ───────────────────────────────────────────────
           *
           * `backdrop-blur` desfoca o que está atrás, então a paisagem
           * continua aparecendo pelos botões, borrada — que é o que separa
           * vidro de um retângulo translúcido. O `.vidro-led` dos cartões da
           * página evita `backdrop-filter` de propósito, porque dezoito
           * cartões sobre um fundo que rola obrigam o compositor a refazer o
           * desfoque a cada quadro. Aqui são dois elementos sobre uma imagem
           * parada, e o custo não se repete.
           *
           * O `pb-24` casa exatamente com a altura da costura logo abaixo: os
           * botões param onde a arte começa a derreter no fundo da página. Sem
           * essa folga eles cairiam dentro do degradê e, no tema claro, o
           * texto branco deles sumiria no clareado.
           */}
          <div className="mt-6 grid grid-cols-2 gap-3 px-5 pb-24">
            {OUTROS_ESPORTES.map(({ esporte, icone: Icone }) => (
              <Link
                key={esporte}
                href={`/app/run/start?esporte=${esporte}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/15 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
              >
                <Icone className="size-4" aria-hidden />
                {SPORT_LABELS[esporte]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/*
       * A costura com o fundo da página fica **fora** do `.dark`. Dentro dele
       * `synse-bg` seria sempre o escuro do tema escuro, e no tema claro a arte
       * terminaria numa faixa preta em vez de derreter no branco da página.
       */}
      <div
        aria-hidden
        className="costura-com-a-pagina pointer-events-none absolute inset-x-0 bottom-0 h-24"
      />
    </div>
  )
}
