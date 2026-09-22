/**
 * ── A poeira da trilha ───────────────────────────────────────────────────────
 *
 * Pedrinhas soltando do chão e se desfazendo no ar, sobre a arte da trilha.
 * Dão vida à imagem sem desenhar nada por cima dela — a tentativa anterior,
 * um traço marcando a rota, foi reprovada justamente por isso: cobria a arte
 * em vez de animá-la.
 *
 * ── Pedra é preta, e por isso ela precisa de luz atrás ──────────────────────
 *
 * A primeira versão pintou as pedrinhas de verde-claro com brilho. Ficava
 * bonito e não era pedra: era vaga-lume. Pedra de verdade é escura, e escura
 * sobre fundo escuro não aparece.
 *
 * Medido no navegador, com as partículas escondidas e a luminância do fundo
 * amostrada ponto a ponto: das dez posições que eu tinha escolhido, **sete
 * tinham contraste de 1,0:1** para uma pedra preta — invisíveis. A arte é
 * quase toda noite; o que ilumina é a trilha, e ela ocupa uma faixa estreita.
 *
 * Então a poeira nasce só onde há luz por trás. Isso também é o certo
 * fisicamente: poeira levanta do caminho iluminado, não do breu.
 *
 * ── Por que cada cartão tem a própria faixa ─────────────────────────────────
 *
 * Os dois cartões que usam esta arte a recortam diferente — o do desafio é
 * mais alto, o da semana é quase a imagem inteira —, então a trilha cai em
 * lugares diferentes da caixa. Uma faixa só em porcentagem não serve aos dois:
 * as posições de cada preset foram medidas no cartão correspondente.
 */

/** Um retângulo, em fração da caixa, onde há luz para a pedra aparecer. */
type Zona = { x0: number; x1: number; y0: number; y1: number }

/**
 * Cartão do desafio do mês: a trilha sobe numa coluna estreita à direita.
 * Amostrado ponto a ponto: o núcleo aceso é x 0,80–0,88 entre y 0,28 e 0,56.
 * Uma faixa um pouco mais larga, 0,78–0,91, já deixava quatro das nove pedras
 * com menos de 1,6:1 de contraste.
 */
export const FAIXA_DESAFIO: Zona[] = [{ x0: 0.8, x1: 0.88, y0: 0.28, y1: 0.46 }]

/**
 * Widget da meta semanal: a arte aparece quase inteira e deitada, então a
 * parte clara é uma faixa atravessada embaixo, mais uma coluna no meio.
 */
export const FAIXA_SEMANA: Zona[] = [
  { x0: 0.58, x1: 0.9, y0: 0.16, y1: 0.3 },
  { x0: 0.71, x1: 0.8, y0: 0.3, y1: 0.52 },
]

/**
 * Sorteio determinístico.
 *
 * `Math.random` daria valores diferentes no servidor e no navegador, e o React
 * reclamaria da hidratação a cada carregamento — é a mesma armadilha das
 * folhas do painel da planta, que por isso têm posições escritas à mão. Aqui,
 * com duas faixas diferentes para servir, um gerador com semente fixa rende
 * mais do que duas listas na unha: mesma semente, mesma saída, nos dois lados.
 */
function sorteioFixo(semente: number) {
  let estado = semente >>> 0
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0
    return estado / 4294967296
  }
}

type Pedra = {
  x: string
  y: string
  largura: number
  altura: number
  dx: string
  dy: string
  giro: string
  dur: string
  atraso: string
  pico: number
}

function semear(zonas: Zona[], quantas: number, semente: number): Pedra[] {
  const proximo = sorteioFixo(semente)

  return Array.from({ length: quantas }, (_, i) => {
    const zona = zonas[i % zonas.length]
    const lado = 3 + Math.round(proximo() * 2)

    return {
      x: `${(zona.x0 + proximo() * (zona.x1 - zona.x0)) * 100}%`,
      y: `${(zona.y0 + proximo() * (zona.y1 - zona.y0)) * 100}%`,
      largura: lado,
      /* Nunca quadrada: seixo é achatado, e um quadradinho perfeito lê como pixel. */
      altura: Math.max(2, lado - 1 - Math.round(proximo())),
      dx: `${(proximo() * 2 - 1) * 9}px`,
      /*
       * Voo curto, de 16 a 32 pixels. Com o dobro disso a pedra saía da faixa
       * iluminada antes de terminar de desaparecer, e o fim do voo acontecia
       * no escuro, onde ninguém via.
       */
      dy: `${-(16 + proximo() * 16)}px`,
      giro: `${(proximo() * 2 - 1) * 220}deg`,
      dur: `${(5.5 + proximo() * 4.5).toFixed(1)}s`,
      atraso: `${(proximo() * 6).toFixed(1)}s`,
      /*
       * A opacidade máxima varia: um punhado de partículas com o mesmo peso lê
       * como enfeite; com pesos diferentes lê como profundidade.
       */
      pico: 0.55 + proximo() * 0.4,
    }
  })
}

export function PoeiraDaTrilha({
  faixa = FAIXA_DESAFIO,
  quantas = 9,
}: {
  faixa?: Zona[]
  quantas?: number
}) {
  const pedras = semear(faixa, quantas, 20260922)

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pedras.map((pedra, i) => (
        <span
          key={i}
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
          className="absolute animate-evaporar rounded-[1px] bg-[#0b0d0c] [animation-duration:var(--dur)] [animation-fill-mode:backwards] motion-reduce:hidden"
          style={{
            left: pedra.x,
            bottom: pedra.y,
            width: `${pedra.largura}px`,
            height: `${pedra.altura}px`,
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
