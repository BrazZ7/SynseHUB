import { describe, expect, it } from 'vitest'

import { escalaAgradavel } from '@/components/synse/charts/escala'

/**
 * ── A escala de um eixo ─────────────────────────────────────────────────────
 *
 * O eixo saía do dado cru e marcava **53,45 · 48,1 · 42,1 · 36,1 · 30,1**.
 * Número de eixo existe para localizar o valor de relance, e ninguém procura
 * "42,1 kg" num gráfico.
 */

describe('as marcas são redondas', () => {
  it('a carga que marcava 53,45 passa a marcar múltiplos de 5', () => {
    // Os mesmos valores que produziram aquele eixo na tela.
    const { marcas } = escalaAgradavel([30.1, 33, 36.1, 38, 42.1, 44, 48.1, 51.45])

    expect(marcas).toEqual([25, 30, 35, 40, 45, 50, 55])
  })

  it('o passo é sempre 1, 2 ou 5 vezes uma potência de dez', () => {
    /*
     * A asserção que impede o conserto de virar "divide a variação pelo
     * número de marcas": isso dá passo 4,27 e marcas como 30 · 34,27 · 38,54.
     */
    for (const serie of [
      [0, 7],
      [0, 97],
      [1200, 9800],
      [0.2, 0.9],
      [30.1, 51.45],
    ]) {
      const { marcas } = escalaAgradavel(serie)
      const passo = Number((marcas[1] - marcas[0]).toPrecision(12))
      const mantissa = passo / 10 ** Math.floor(Math.log10(passo))

      expect([1, 2, 5, 10]).toContain(Number(mantissa.toPrecision(2)))
    }
  })

  it('a escala cobre todos os valores', () => {
    const serie = [30.1, 51.45, 42]
    const { min, max } = escalaAgradavel(serie)

    expect(min).toBeLessThanOrEqual(Math.min(...serie))
    expect(max).toBeGreaterThanOrEqual(Math.max(...serie))
  })

  it('não devolve marca com cauda de ponto flutuante', () => {
    /*
     * Somar 0,1 dez vezes dá 0.9999999999999999, e a marca sairia com
     * dezesseis casas na tela. É erro que só aparece em escala pequena —
     * medida corporal, percentual de gordura.
     */
    const { marcas } = escalaAgradavel([0.1, 0.9])

    for (const marca of marcas) {
      expect(String(marca).length).toBeLessThan(6)
    }
  })
})

describe('a folga nas pontas', () => {
  it('série quase plana continua achatada — e isso é o certo', () => {
    /*
     * Apertar o eixo até a linha subir de ponta a ponta é a forma clássica de
     * mentir com gráfico: 700 gramas de oscilação virariam uma montanha. A
     * folga tem piso de 2% do valor justamente para a mudança pequena
     * aparecer do tamanho que tem.
     */
    const serie = [93.5, 93.7, 94.2, 93.9]
    const { min, max } = escalaAgradavel(serie)

    expect(max - min).toBeGreaterThan((94.2 - 93.5) * 3)
  })

  it('série que não é negativa não ganha eixo negativo', () => {
    // Volume de treino não desce de zero: "-5.000 kg" é quantidade que não existe.
    const { min } = escalaAgradavel([0, 7000, 12000, 18000])

    expect(min).toBe(0)
  })

  it('valor único não quebra', () => {
    const { min, max, marcas } = escalaAgradavel([72])

    expect(min).toBeLessThan(72)
    expect(max).toBeGreaterThan(72)
    expect(marcas.length).toBeGreaterThan(1)
  })

  it('série vazia devolve uma escala utilizável', () => {
    expect(escalaAgradavel([])).toEqual({ min: 0, max: 1, marcas: [0, 1] })
  })
})
