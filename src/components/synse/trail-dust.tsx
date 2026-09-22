/**
 * ── A poeira da trilha ───────────────────────────────────────────────────────
 *
 * Pedrinhas soltando do chão e se desfazendo no ar, sobre a arte da trilha.
 * Dão vida à imagem sem desenhar nada por cima dela — a tentativa anterior,
 * um traço marcando a rota, foi reprovada justamente por isso: cobria a arte
 * em vez de animá-la.
 *
 * ── Onde elas nascem ────────────────────────────────────────────────────────
 *
 * Só no terço direito. A metade esquerda do cartão fica sob o véu quase opaco
 * que protege a leitura do texto, e partícula ali não aparece — seria custo
 * sem efeito. E é à direita que está o chão iluminado da trilha, que é de onde
 * poeira levantando faz sentido.
 *
 * As posições são fixas, e não sorteadas: `Math.random` no servidor e no
 * navegador dá valores diferentes, e o React reclamaria da hidratação a cada
 * carregamento. É a mesma razão das folhas do painel da planta.
 */

/*
 * `pico` é a opacidade máxima de cada pedrinha, e varia de propósito: um
 * punhado de partículas com o mesmo brilho lê como enfeite, com brilhos
 * diferentes lê como profundidade.
 *
 * Elas nascem entre 30% e 60% da altura, e não rente ao pé do cartão. Medido
 * na tela: o botão ocupa o terço de baixo, e as pedrinhas que começavam ali
 * subiam atrás dele — a primeira versão tinha dez partículas e dava para ver
 * uma.
 */
const PEDRAS = [
  {
    x: '66%',
    y: '34%',
    t: 4,
    dx: '7px',
    dy: '-34px',
    giro: '160deg',
    dur: '7.5s',
    atraso: '0s',
    pico: 0.9,
  },
  {
    x: '74%',
    y: '30%',
    t: 3,
    dx: '-5px',
    dy: '-28px',
    giro: '-120deg',
    dur: '6.2s',
    atraso: '1.4s',
    pico: 0.7,
  },
  {
    x: '81%',
    y: '40%',
    t: 5,
    dx: '9px',
    dy: '-44px',
    giro: '200deg',
    dur: '8.4s',
    atraso: '2.9s',
    pico: 1,
  },
  {
    x: '88%',
    y: '32%',
    t: 3,
    dx: '-4px',
    dy: '-26px',
    giro: '-90deg',
    dur: '5.6s',
    atraso: '0.7s',
    pico: 0.65,
  },
  {
    x: '70%',
    y: '48%',
    t: 4,
    dx: '11px',
    dy: '-40px',
    giro: '130deg',
    dur: '9.1s',
    atraso: '3.8s',
    pico: 0.85,
  },
  {
    x: '93%',
    y: '44%',
    t: 4,
    dx: '-8px',
    dy: '-36px',
    giro: '-170deg',
    dur: '7.8s',
    atraso: '2.1s',
    pico: 0.8,
  },
  {
    x: '77%',
    y: '56%',
    t: 3,
    dx: '6px',
    dy: '-30px',
    giro: '110deg',
    dur: '6.8s',
    atraso: '4.6s',
    pico: 0.7,
  },
  {
    x: '85%',
    y: '52%',
    t: 5,
    dx: '-10px',
    dy: '-48px',
    giro: '-210deg',
    dur: '9.6s',
    atraso: '1.9s',
    pico: 0.95,
  },
  {
    x: '62%',
    y: '42%',
    t: 3,
    dx: '8px',
    dy: '-32px',
    giro: '150deg',
    dur: '8.9s',
    atraso: '5.4s',
    pico: 0.6,
  },
  {
    x: '90%',
    y: '60%',
    t: 3,
    dx: '-6px',
    dy: '-34px',
    giro: '-140deg',
    dur: '7.1s',
    atraso: '3.2s',
    pico: 0.75,
  },
] as const

export function PoeiraDaTrilha() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PEDRAS.map((pedra) => (
        <span
          key={`${pedra.x}-${pedra.y}`}
          /*
           * `animate-evaporar`, e não o nome da animação no `style`: o Tailwind
           * só emite o `@keyframes` quando enxerga a utilitária no código.
           * Posto apenas em linha, o quadro é podado na compilação e as
           * partículas ficam paradas — foi o que aconteceu com as gotas do
           * disco da barra, que existiam no HTML e não se mexiam.
           *
           * `fill-mode: backwards` evita que a pedrinha fique parada e opaca
           * na posição inicial até o atraso vencer. Sem ele, metade delas
           * seria um pontinho grudado na arte nos primeiros segundos.
           */
          className="absolute animate-evaporar rounded-[1px] bg-[#e2f3ec] shadow-[0_0_5px_-1px_#9fe9d5] [animation-duration:var(--dur)] [animation-fill-mode:backwards] motion-reduce:hidden"
          style={{
            left: pedra.x,
            bottom: pedra.y,
            width: `${pedra.t}px`,
            height: `${Math.max(1, pedra.t - 1)}px`,
            animationDelay: pedra.atraso,
            ['--dur' as string]: pedra.dur,
            ['--dx' as string]: pedra.dx,
            ['--dy' as string]: pedra.dy,
            ['--giro' as string]: pedra.giro,
            ['--pico' as string]: String(pedra.pico),
          }}
        />
      ))}
    </div>
  )
}
