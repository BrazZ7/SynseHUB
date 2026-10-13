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

/**
 * Tira o começo e o fim do traçado.
 *
 * ── Por que ──────────────────────────────────────────────────────────────────
 *
 * A corrida começa e termina onde a pessoa mora. O cartão não leva mapa por
 * baixo, nem coordenada escrita, e já era essa a decisão do produto — a nota
 * embaixo do botão diz "o percurso aparece, o endereço não".
 *
 * Mas a imagem carrega a **forma** do percurso com a proporção certa, e carrega
 * o número da distância, que dá a escala. Com os dois, a forma pode ser casada
 * com uma malha de ruas conhecida. E os dois pontos marcados — a bolinha clara
 * do início e a verde do fim — apontam exatamente para a porta de casa.
 *
 * Cortar um raio em volta da primeira e da última posição resolve o caso que
 * importa e mantém o traçado reconhecível: é a mesma ideia da zona de
 * privacidade que os aplicativos de corrida usam. Vem ligada, porque "não
 * incluir dado privado por padrão" é por padrão.
 *
 * ── A conta ──────────────────────────────────────────────────────────────────
 *
 * Distância aproximada em metros, suficiente para um raio de 150 m: um grau de
 * latitude são ~111 km em qualquer lugar, e um grau de longitude são ~111 km
 * vezes o cosseno da latitude. Fórmula de Haversine aqui seria precisão onde
 * não faz diferença — e 150 m de raio não muda com o erro de alguns metros.
 */
const METROS_POR_GRAU = 111_320

function distanciaAproximada(a: PontoGeografico, b: PontoGeografico): number {
  const latMedia = ((a.latitude + b.latitude) / 2) * (Math.PI / 180)
  const dx = (a.longitude - b.longitude) * Math.cos(latMedia) * METROS_POR_GRAU
  const dy = (a.latitude - b.latitude) * METROS_POR_GRAU
  return Math.sqrt(dx * dx + dy * dy)
}

export const RAIO_DA_ZONA_DE_CASA = 150

export function semZonaDeCasa(
  pontos: readonly PontoGeografico[],
  raioMetros = RAIO_DA_ZONA_DE_CASA,
): PontoGeografico[] {
  if (pontos.length < 2) return []

  const inicio = pontos[0]!
  const fim = pontos[pontos.length - 1]!

  const dentro = pontos.filter(
    (ponto) =>
      distanciaAproximada(ponto, inicio) > raioMetros &&
      distanciaAproximada(ponto, fim) > raioMetros,
  )

  /*
   * Corrida curta inteira dentro do raio sai sem traçado, e isso é a resposta
   * certa: uma volta de 200 m em torno de casa **é** o endereço. O cartão então
   * mostra a distância e o tempo, que é o que a pessoa quis compartilhar.
   *
   * Dois pontos é o mínimo para existir linha; um ponto solto não é percurso.
   */
  return dentro.length >= 2 ? dentro : []
}
