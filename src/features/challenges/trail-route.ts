/**
 * ── A rota desenhada na própria arte ─────────────────────────────────────────
 *
 * Os pontos abaixo são o caminho luminoso de `public/synse-run-trilha.webp`,
 * medido nos pixels da imagem: o rastro foi isolado por brilho, saturação e
 * matiz, rastreado de baixo para cima com continuidade e reamostrado por
 * comprimento de arco. Coordenadas na base da arte, 960 por 369.
 *
 * Duas decisões que os números escondem:
 *
 * **A rota começa em y=243, não no pé da imagem.** O rodapé do cartão é
 * ocupado pelo botão. A primeira tentativa cortou em y=292, por estimativa, e
 * no navegador o marcador em 0% apareceu atrás do botão assim mesmo — o
 * cartão é mais baixo do que eu supus quando não há desafio escolhido. O
 * corte em 243 foi medido, não chutado. O caminho vai de onde a arte de fato
 * aparece até onde o rastro se perde na montanha.
 *
 * **O alfinete saiu da arte.** Ele era pintado num ponto fixo, e um marcador
 * que anda não convive com outro parado. Tirá-lo abriu uma falha no rastro,
 * que o traço desenhado por cima cobre — por isso a rota inteira é desenhada,
 * e não só o trecho já percorrido.
 *
 * Se a arte mudar, estes números mudam junto. O roteiro que os produziu está
 * descrito acima e é reprodutível a partir da imagem.
 */
export const ROTA: ReadonlyArray<readonly [number, number]> = [
  [718.6, 243.2],
  [705.9, 227.0],
  [694.0, 210.2],
  [683.3, 193.0],
  [665.6, 182.3],
  [646.0, 175.8],
  [626.0, 170.8],
  [605.7, 166.7],
  [585.4, 162.8],
  [565.3, 158.5],
  [545.5, 152.6],
  [544.2, 139.3],
  [563.3, 131.7],
  [582.8, 124.9],
  [598.5, 113.7],
  [579.5, 106.5],
  [559.4, 101.7],
  [540.0, 94.8],
  [538.5, 83.7],
  [556.9, 74.6],
  [573.4, 62.4],
] as const

/** A caixa da arte. O `viewBox` do SVG usa exatamente esta medida. */
export const ARTE = { largura: 960, altura: 369 } as const

/** Comprimentos acumulados, um por ponto. Calculado uma vez. */
const ACUMULADO = ROTA.reduce<number[]>((acc, ponto, i) => {
  if (i === 0) return [0]
  const [x0, y0] = ROTA[i - 1]
  const [x1, y1] = ponto
  acc.push(acc[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  return acc
}, [])

export const COMPRIMENTO = ACUMULADO[ACUMULADO.length - 1]

/**
 * O ponto da rota a uma fração do caminho.
 *
 * A fração é presa entre 0 e 1: quem passou da meta fica na chegada, porque a
 * rota não tem para onde continuar. O número em porcentagem, esse sim, passa
 * de 100 — é a mesma separação do cartão de medalha, onde reaproveitar um
 * valor para a barra e para o texto escondia o feito de quem superou a meta.
 *
 * Interpola por **comprimento de arco**, e não por índice. Os pontos não estão
 * igualmente espaçados; andar de ponto em ponto faria o marcador acelerar nas
 * curvas fechadas e arrastar nas retas.
 */
export function pontoNaRota(fracao: number): { x: number; y: number } {
  if (!Number.isFinite(fracao)) return { x: ROTA[0][0], y: ROTA[0][1] }

  const presa = Math.min(1, Math.max(0, fracao))
  const alvo = presa * COMPRIMENTO

  if (alvo <= 0) return { x: ROTA[0][0], y: ROTA[0][1] }
  if (alvo >= COMPRIMENTO) {
    const ultimo = ROTA[ROTA.length - 1]
    return { x: ultimo[0], y: ultimo[1] }
  }

  let i = 0
  while (i < ACUMULADO.length - 2 && ACUMULADO[i + 1] < alvo) i += 1

  const trecho = ACUMULADO[i + 1] - ACUMULADO[i]
  const t = trecho > 0 ? (alvo - ACUMULADO[i]) / trecho : 0
  const [x0, y0] = ROTA[i]
  const [x1, y1] = ROTA[i + 1]

  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }
}

/** O caminho em `d` de SVG, para o traço da rota. */
export function caminhoSvg(): string {
  return ROTA.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
}
