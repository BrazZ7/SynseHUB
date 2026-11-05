import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { percentualDaMeta } from '@/features/share/cards'
import { afinarRota, projetarRota,
  semZonaDeCasa,
} from '@/features/synse-run/share-card'

/**
 * A geometria do cartão de compartilhar.
 *
 * O que estes testes protegem é a honestidade do desenho: o traçado que a
 * pessoa posta precisa ter o formato do percurso que ela correu. Um erro aqui
 * não quebra nada — só desenha uma corrida que não aconteceu.
 */

const MOLDURA = { largura: 1000, altura: 600, margem: 50 }

describe('a projeção da rota', () => {
  it('rota vazia não desenha nada', () => {
    expect(projetarRota([], MOLDURA)).toEqual([])
  })

  it('cabe dentro da moldura, respeitando a margem', () => {
    const pontos = [
      { latitude: -30.03, longitude: -51.23 },
      { latitude: -30.02, longitude: -51.19 },
      { latitude: -30.05, longitude: -51.21 },
    ]
    for (const p of projetarRota(pontos, MOLDURA)) {
      expect(p.x).toBeGreaterThanOrEqual(MOLDURA.margem - 0.001)
      expect(p.x).toBeLessThanOrEqual(MOLDURA.largura - MOLDURA.margem + 0.001)
      expect(p.y).toBeGreaterThanOrEqual(MOLDURA.margem - 0.001)
      expect(p.y).toBeLessThanOrEqual(MOLDURA.altura - MOLDURA.margem + 0.001)
    }
  })

  it('o norte fica em cima', () => {
    const [sul, norte] = projetarRota(
      [
        { latitude: -30.05, longitude: -51.2 },
        { latitude: -30.01, longitude: -51.2 },
      ],
      MOLDURA,
    )
    expect(norte!.y).toBeLessThan(sul!.y)
  })

  /*
   * O caso que motivou a projeção de Mercator: um percurso quadrado em graus
   * não é quadrado no chão. Fora do equador, um grau de longitude é mais curto
   * que um de latitude, então o desenho tem de sair mais alto que largo.
   */
  it('não achata o percurso longe do equador', () => {
    const grau = 0.02
    const quadradoEmGraus = [
      { latitude: -30.0, longitude: -51.0 },
      { latitude: -30.0, longitude: -51.0 + grau },
      { latitude: -30.0 + grau, longitude: -51.0 + grau },
      { latitude: -30.0 + grau, longitude: -51.0 },
    ]
    const tela = projetarRota(quadradoEmGraus, { largura: 1000, altura: 1000, margem: 0 })
    const largura = Math.max(...tela.map((p) => p.x)) - Math.min(...tela.map((p) => p.x))
    const altura = Math.max(...tela.map((p) => p.y)) - Math.min(...tela.map((p) => p.y))
    // Em ~30° de latitude, um grau de longitude vale cerca de 87% de um de latitude.
    expect(largura / altura).toBeGreaterThan(0.82)
    expect(largura / altura).toBeLessThan(0.92)
  })

  it('mantém a mesma escala nos dois eixos: ida e volta não vira quarteirão', () => {
    const reta = [
      { latitude: -30.0, longitude: -51.0 },
      { latitude: -30.0, longitude: -51.04 },
    ]
    const tela = projetarRota(reta, MOLDURA)
    const altura = Math.abs(tela[1]!.y - tela[0]!.y)
    // Uma reta leste-oeste tem de continuar reta: altura zero, não esticada.
    expect(altura).toBeLessThan(0.001)
  })

  it('GPS travado no mesmo ponto não vira NaN', () => {
    const parado = Array.from({ length: 5 }, () => ({ latitude: -23.5, longitude: -46.6 }))
    for (const p of projetarRota(parado, MOLDURA)) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('a amostragem', () => {
  it('rota curta passa inteira', () => {
    const pontos = [1, 2, 3]
    expect(afinarRota(pontos, 400)).toEqual(pontos)
  })

  it('rota longa encolhe até o limite e guarda as pontas', () => {
    const pontos = Array.from({ length: 5000 }, (_, i) => i)
    const afinada = afinarRota(pontos, 400)
    expect(afinada).toHaveLength(400)
    expect(afinada[0]).toBe(0)
    expect(afinada.at(-1)).toBe(4999)
  })

  it('não devolve buracos', () => {
    const afinada = afinarRota(
      Array.from({ length: 3333 }, (_, i) => i),
      250,
    )
    expect(afinada.every((v) => typeof v === 'number')).toBe(true)
  })
})

// ── O cartão da medalha ──────────────────────────────────────────────────────
describe('o percentual da meta', () => {
  it('meta batida na mosca é 100%', () => {
    expect(percentualDaMeta(12, 12)).toBe(100)
  })

  /*
   * O defeito que motivou a extração: o desenho limitava em 100% para o anel
   * caber na volta e usava o mesmo valor no texto. Quem superou a meta via um
   * número menor do que conquistou, num cartão feito para se gabar.
   */
  it('quem passa da meta vê o número de verdade', () => {
    expect(percentualDaMeta(17, 12)).toBe(142)
  })

  it('meta pela metade é 50%', () => {
    expect(percentualDaMeta(6, 12)).toBe(50)
  })

  it('alvo zero ou inválido não vira infinito nem NaN', () => {
    expect(percentualDaMeta(5, 0)).toBe(0)
    expect(percentualDaMeta(5, Number.NaN)).toBe(0)
    expect(percentualDaMeta(Number.POSITIVE_INFINITY, 12)).toBe(0)
  })

  it('valor negativo não desenha percentual negativo', () => {
    expect(percentualDaMeta(-3, 12)).toBe(0)
  })
})

describe('a zona de casa', () => {
  /**
   * A corrida começa e termina onde a pessoa mora — é o aceite 25:
   * "compartilhamento não inclui dados privados por padrão".
   *
   * O cartão nunca levou mapa por baixo nem coordenada escrita, e já era essa a
   * decisão do produto. O que faltava era o raio: a imagem carrega a forma do
   * percurso na proporção certa **e** o número da distância, que dá a escala —
   * e as duas bolinhas marcavam exatamente a porta de casa.
   */
  /** Um grau de latitude ≈ 111,32 km; 0,001° ≈ 111 m. */
  const ponto = (lat: number, lon = 0) => ({ latitude: lat, longitude: lon })

  it('tira os pontos em volta da partida e da chegada', () => {
    const rota = [
      ponto(0), // a porta de casa
      ponto(0.0005), // ~56 m dela: dentro do raio
      ponto(0.004), // ~445 m: fora
      ponto(0.005), // ~557 m: fora
      ponto(0.006), // ~668 m, e ~445 m do fim: fora
      ponto(0.0095), // ~56 m do fim: dentro do raio
      ponto(0.01), // a volta para casa
    ]

    const limpa = semZonaDeCasa(rota, 150)

    expect(limpa.map((p) => p.latitude)).toEqual([0.004, 0.005, 0.006])
  })

  it('tira os pontos em volta da chegada', () => {
    // Ida e volta pelo mesmo caminho: as duas pontas são a mesma casa.
    const rota = [ponto(0), ponto(0.005), ponto(0.01), ponto(0.005), ponto(0.0004)]

    const limpa = semZonaDeCasa(rota, 150)

    expect(limpa.map((p) => p.latitude)).toEqual([0.005, 0.01, 0.005])
  })

  it('vem ligada por padrão, com 150 metros', () => {
    /*
     * "Por padrão" é a parte do requisito que não se cumpre com uma opção
     * desligada escondida nos ajustes. Sem o raio no argumento, o corte
     * acontece do mesmo jeito.
     */
    const rota = [
      ponto(0),
      ponto(0.001), // ~111 m: dentro de 150
      ponto(0.004),
      ponto(0.005),
      ponto(0.006),
      ponto(0.009), // ~111 m do fim
      ponto(0.01),
    ]

    expect(semZonaDeCasa(rota).map((p) => p.latitude)).toEqual([0.004, 0.005, 0.006])
  })

  it('corrida inteira dentro do raio sai sem traçado', () => {
    /*
     * Uma volta de 200 m em torno de casa **é** o endereço. O cartão então
     * mostra distância e tempo, que é o que a pessoa quis compartilhar.
     */
    const rota = [ponto(0), ponto(0.0003), ponto(0.0006), ponto(0.0002)]
    expect(semZonaDeCasa(rota, 150)).toEqual([])
  })

  it('um ponto sozinho não é percurso', () => {
    expect(semZonaDeCasa([ponto(0)], 150)).toEqual([])
    expect(semZonaDeCasa([], 150)).toEqual([])
  })

  it('o cartão de corrida aplica a zona antes de projetar', () => {
    /*
     * Teste de texto, e de propósito: o desenho vive no `canvas`, que não
     * existe no ambiente de teste. O que pode voltar em silêncio é alguém
     * projetar `cartao.rota` direto, e aí a zona continua implementada e
     * desligada.
     *
     * O corte é no dado, não no desenho: pintar o traçado inteiro e cobrir as
     * pontas deixaria a informação na imagem.
     */
    const fonte = readFileSync(join(process.cwd(), 'src/features/share/cards.ts'), 'utf8')
    expect(fonte).toMatch(/projetarRota\(afinarRota\(semZonaDeCasa\(cartao\.rota\)/)
  })

  it('o raio conta em metros nos dois eixos', () => {
    /*
     * Um grau de longitude encolhe com o cosseno da latitude: a -30°, ele vale
     * ~96 km em vez de ~111 km. Medir em graus daria uma zona achatada — e é no
     * sul que o produto está.
     *
     * A corrida vai para o oeste e volta pelo norte, longe das duas pontas.
     */
    const noSul = [
      { latitude: -30, longitude: -51 },
      { latitude: -30, longitude: -51.0005 }, // ~48 m: dentro
      { latitude: -30, longitude: -51.006 }, // ~578 m: fora
      { latitude: -30.004, longitude: -51.006 }, // fora das duas pontas
      { latitude: -30.004, longitude: -51 }, // fora
      { latitude: -30.0005, longitude: -51 }, // ~56 m do fim: dentro
      { latitude: -30, longitude: -51 },
    ]

    const limpa = semZonaDeCasa(noSul, 150)

    expect(limpa).toHaveLength(3)
    // Nenhum dos que ficaram está a menos de 150 m da casa.
    expect(limpa.every((p) => Math.abs(p.longitude + 51) > 0.002 || Math.abs(p.latitude + 30) > 0.002)).toBe(true)
  })

  it('um ponto sobrando não é traçado', () => {
    /*
     * Uma mutação cobrou este teste. Com a rota curta, só o ponto do meio fica
     * fora das duas zonas — e devolver um ponto solto seria devolver uma
     * posição, que é exatamente o que a zona existe para não devolver. Duas
     * posições já são um trecho de percurso.
     */
    const rota = [ponto(0), ponto(0.0005), ponto(0.005), ponto(0.01)]
    expect(semZonaDeCasa(rota, 150)).toEqual([])
  })

  it('150 metros a leste contam como 150 metros', () => {
    /*
     * A outra mutação: tirar o cosseno da latitude da conta. A -30°, um grau de
     * longitude vale ~96 km, não ~111 km — e 0,00155° são ~149 m de verdade
     * contra ~173 m na conta errada. É a diferença entre o ponto cair dentro do
     * raio e ficar na imagem.
     */
    const rota = [
      { latitude: -30, longitude: -51 },
      { latitude: -30, longitude: -51.00155 }, // ~149 m: dentro, e só com o cosseno
      { latitude: -30, longitude: -51.006 },
      { latitude: -30.004, longitude: -51.006 },
      { latitude: -30.004, longitude: -51.002 },
      { latitude: -30.004, longitude: -51 },
    ]

    const limpa = semZonaDeCasa(rota, 150)

    expect(limpa.some((p) => p.longitude === -51.00155)).toBe(false)
  })

  it('não muda a rota que recebeu', () => {
    const rota = [ponto(0), ponto(0.0005), ponto(0.005), ponto(0.01)]
    semZonaDeCasa(rota, 150)
    expect(rota).toHaveLength(4)
  })
})
