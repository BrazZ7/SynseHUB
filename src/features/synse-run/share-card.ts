/**
 * A geometria do cartão de compartilhar.
 *
 * Separada do desenho de propósito: projetar coordenadas é conta, e conta se
 * testa. O componente que pinta no `canvas` não tem como ser testado aqui — o
 * ambiente de teste é Node, sem `canvas` — mas a parte que erra com silêncio é
 * esta, e ela fica coberta.
 */

export type PontoGeografico = { latitude: number; longitude: number }
export type PontoNaTela = { x: number; y: number }

export type Moldura = {
  largura: number
  altura: number
  /** Respiro em volta do traçado, em pixels. */
  margem: number
}

/**
 * Projeta a rota dentro da moldura, mantendo a proporção.
 *
 * ── Por que Mercator e não latitude crua ────────────────────────────────────
 *
 * Um grau de longitude encolhe conforme se afasta do equador — no Brasil, um
 * grau leste-oeste é mais curto que um grau norte-sul. Desenhar latitude e
 * longitude direto como y e x achata o traçado na horizontal, e a distorção
 * cresce com a latitude: em Porto Alegre o percurso sairia visivelmente mais
 * "esticado" que em Belém. A projeção de Mercator corrige isso, e é a mesma
 * que o mapa da tela usa.
 *
 * ── A escala é a mesma nos dois eixos ───────────────────────────────────────
 *
 * Se cada eixo fosse normalizado por conta própria, toda corrida viraria um
 * retângulo cheio: uma ida e volta em linha reta ficaria com a mesma cara de
 * uma volta no quarteirão. O formato do percurso é o que a pessoa reconhece,
 * então a menor escala manda nos dois e o resto vira respiro centralizado.
 */
export function projetarRota(pontos: readonly PontoGeografico[], moldura: Moldura): PontoNaTela[] {
  if (pontos.length === 0) return []

  const rad = Math.PI / 180
  // Mercator: x é a própria longitude; y é o logaritmo da tangente da latitude.
  const bruto = pontos.map((p) => ({
    x: p.longitude,
    y: Math.log(Math.tan(Math.PI / 4 + (p.latitude * rad) / 2)) / rad,
  }))

  const xs = bruto.map((p) => p.x)
  const ys = bruto.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const larguraUtil = moldura.largura - moldura.margem * 2
  const alturaUtil = moldura.altura - moldura.margem * 2
  const extensaoX = maxX - minX
  const extensaoY = maxY - minY

  /*
   * Rota parada — um ponto só, ou GPS travado no mesmo lugar — não tem extensão
   * para dividir. Sem esta guarda o resultado seria `NaN` e o traçado sumiria
   * sem erro nenhum no console.
   */
  if (extensaoX === 0 && extensaoY === 0) {
    return bruto.map(() => ({ x: moldura.largura / 2, y: moldura.altura / 2 }))
  }

  const escala = Math.min(
    extensaoX === 0 ? Infinity : larguraUtil / extensaoX,
    extensaoY === 0 ? Infinity : alturaUtil / extensaoY,
  )

  const sobraX = (larguraUtil - extensaoX * escala) / 2
  const sobraY = (alturaUtil - extensaoY * escala) / 2

  return bruto.map((p) => ({
    x: moldura.margem + sobraX + (p.x - minX) * escala,
    // O eixo do canvas cresce para baixo; a latitude cresce para cima.
    y: moldura.margem + sobraY + (maxY - p.y) * escala,
  }))
}

/**
 * Reduz a rota a um número razoável de pontos.
 *
 * Uma corrida de uma hora traz milhares de amostras. Traçar todas custa caro e
 * não muda um pixel do resultado numa imagem de mil pixels de largura. A
 * amostragem mantém sempre o primeiro e o último ponto: perder o fim faria o
 * percurso parecer interrompido.
 */
export function afinarRota<T>(pontos: readonly T[], maximo = 400): T[] {
  if (pontos.length <= maximo) return [...pontos]

  const passo = (pontos.length - 1) / (maximo - 1)
  const saida: T[] = []
  for (let i = 0; i < maximo; i += 1) saida.push(pontos[Math.round(i * passo)]!)
  return saida
}
