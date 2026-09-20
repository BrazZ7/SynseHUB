import { describe, expect, it } from 'vitest'

import { percentualDaMeta } from '@/features/share/cards'
import { afinarRota, projetarRota } from '@/features/synse-run/share-card'

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
