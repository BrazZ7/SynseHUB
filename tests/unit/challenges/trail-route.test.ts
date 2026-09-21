import { describe, expect, it } from 'vitest'

import { ARTE, COMPRIMENTO, ROTA, caminhoSvg, pontoNaRota } from '@/features/challenges/trail-route'

const perto = (a: number, b: number, folga = 0.001) => Math.abs(a - b) <= folga

describe('a rota da trilha', () => {
  it('fica dentro da arte', () => {
    for (const [x, y] of ROTA) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(ARTE.largura)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(ARTE.altura)
    }
  })

  it('começa acima do rodapé, onde o botão não esconde', () => {
    expect(ROTA[0][1]).toBeLessThanOrEqual(250)
  })

  it('sobe: o fim está mais alto que o começo', () => {
    expect(ROTA[ROTA.length - 1][1]).toBeLessThan(ROTA[0][1])
  })

  it('não tem salto brusco entre pontos vizinhos', () => {
    // Um salto grande seria o rastreador tendo pulado para outra parte da arte.
    for (let i = 1; i < ROTA.length; i += 1) {
      const d = Math.hypot(ROTA[i][0] - ROTA[i - 1][0], ROTA[i][1] - ROTA[i - 1][1])
      expect(d).toBeLessThan(40)
    }
  })
})

describe('pontoNaRota', () => {
  it('em 0 está no início e em 1 na chegada', () => {
    expect(pontoNaRota(0)).toEqual({ x: ROTA[0][0], y: ROTA[0][1] })
    const fim = ROTA[ROTA.length - 1]
    expect(pontoNaRota(1)).toEqual({ x: fim[0], y: fim[1] })
  })

  it('prende quem passou da meta na chegada', () => {
    // 142% de uma meta não leva ninguém para fora da montanha.
    const fim = ROTA[ROTA.length - 1]
    expect(pontoNaRota(1.42)).toEqual({ x: fim[0], y: fim[1] })
  })

  it('prende quem está abaixo de zero no início', () => {
    expect(pontoNaRota(-0.5)).toEqual({ x: ROTA[0][0], y: ROTA[0][1] })
  })

  it('não quebra com valor inválido', () => {
    expect(pontoNaRota(Number.NaN)).toEqual({ x: ROTA[0][0], y: ROTA[0][1] })
  })

  it('anda por comprimento de arco, não por índice', () => {
    /*
     * Na metade do caminho, a distância percorrida tem de ser metade do
     * comprimento. Se a interpolação fosse por índice, o marcador correria nas
     * curvas fechadas e arrastaria nas retas, porque os pontos não estão
     * igualmente espaçados.
     */
    const meio = pontoNaRota(0.5)
    let andado = 0
    let anterior = { x: ROTA[0][0], y: ROTA[0][1] }
    for (let i = 1; i < ROTA.length; i += 1) {
      const atual = { x: ROTA[i][0], y: ROTA[i][1] }
      const d = Math.hypot(atual.x - anterior.x, atual.y - anterior.y)
      const ateOMeio = Math.hypot(meio.x - anterior.x, meio.y - anterior.y)
      if (ateOMeio <= d + 0.001) {
        andado += ateOMeio
        break
      }
      andado += d
      anterior = atual
    }
    expect(perto(andado, COMPRIMENTO / 2, 0.5)).toBe(true)
  })

  it('avança sempre para a frente, sem voltar', () => {
    /*
     * Somar as cordas entre amostras dá **um pouco menos** que o comprimento
     * real, porque corda corta curva. O que importa aqui não é o valor exato e
     * sim que cada passo ande para a frente e que o total chegue perto do
     * caminho inteiro — um marcador que volta seria erro de interpolação.
     */
    let anterior = pontoNaRota(0)
    let total = 0
    for (let f = 0.02; f <= 1.0001; f += 0.02) {
      const p = pontoNaRota(f)
      const passo = Math.hypot(p.x - anterior.x, p.y - anterior.y)
      expect(passo).toBeGreaterThanOrEqual(0)
      total += passo
      anterior = p
    }
    expect(total).toBeLessThanOrEqual(COMPRIMENTO + 0.001)
    // 95%, e não 98%: a rota tem curvas fechadas, e ali a corda corta bastante.
    expect(total).toBeGreaterThan(COMPRIMENTO * 0.95)
  })
})

describe('caminhoSvg', () => {
  it('começa com M e tem um comando por ponto', () => {
    const d = caminhoSvg()
    expect(d.startsWith('M ')).toBe(true)
    expect(d.split(/[ML]/).length - 1).toBe(ROTA.length)
  })
})
