import { describe, expect, it } from 'vitest'

import {
  inicioDoHistorico,
  janelaBloqueada,
  mesesDoHistorico,
  recortarDias,
} from '@/lib/plans/history'
import { HISTORY_MONTHS } from '@/lib/plans/tiers'

/**
 * `HISTORY_MONTHS` existia desde o começo e nenhuma tela o usava: a página do
 * Synse+ prometia "3 meses" contra "3 anos", e os dois planos viam a mesma
 * coisa. Estes testes são o que faz a promessa valer.
 */

const AGORA = new Date('2026-09-23T12:00:00Z')

describe('mesesDoHistorico', () => {
  it('é o que a tabela de planos promete', () => {
    expect(mesesDoHistorico('FREE')).toBe(3)
    expect(mesesDoHistorico('PRO')).toBe(36)
    // Se alguém mudar a promessa, é lá que muda — não aqui.
    expect(mesesDoHistorico('FREE')).toBe(HISTORY_MONTHS.FREE)
    expect(mesesDoHistorico('PRO')).toBe(HISTORY_MONTHS.PRO)
  })
})

describe('inicioDoHistorico', () => {
  it('no gratuito, volta três meses', () => {
    expect(inicioDoHistorico('FREE', AGORA)?.toISOString().slice(0, 10)).toBe('2026-06-23')
  })

  it('no Synse+, não há limite', () => {
    /*
     * Nulo e não uma data muito antiga: "sem limite" é uma condição, e
     * representá-la por um ano arbitrário faria a consulta filtrar por algo que
     * ninguém decidiu.
     */
    expect(inicioDoHistorico('PRO', AGORA)).toBeNull()
  })
})

describe('recortarDias', () => {
  it('deixa passar o que cabe no plano', () => {
    expect(recortarDias('FREE', 7)).toBe(7)
    expect(recortarDias('FREE', 30)).toBe(30)
    expect(recortarDias('FREE', 90)).toBe(90)
  })

  it('corta o que passa do teto', () => {
    expect(recortarDias('FREE', 180)).toBe(90)
    expect(recortarDias('FREE', 365)).toBe(90)
  })

  it('"tudo" vira o teto, e não continua sendo tudo', () => {
    // É o caso que mais importa: "tudo" seria a porta que passa por cima do
    // limite, e `0` significa exatamente isso nas duas telas.
    expect(recortarDias('FREE', 0)).toBe(90)
  })

  it('no Synse+ nada é recortado, inclusive "tudo"', () => {
    /*
     * Cortar o histórico de quem paga seria hostil sem ganhar nada: a promessa
     * é um piso, e esconder a medição de quatro anos atrás de quem continua
     * assinando não protege receita nenhuma.
     */
    expect(recortarDias('PRO', 0)).toBe(0)
    expect(recortarDias('PRO', 3650)).toBe(3650)
  })
})

describe('janelaBloqueada', () => {
  it('concorda com o recorte — os dois não podem divergir', () => {
    // O seletor desenha o cadeado com isto; a leitura corta com `recortarDias`.
    // Se discordassem, a tela ofereceria uma janela que o servidor recusa.
    for (const dias of [0, 7, 30, 90, 180, 365]) {
      const bloqueada = janelaBloqueada('FREE', dias)
      const recortou = recortarDias('FREE', dias) !== dias
      expect(bloqueada, `${dias} dias`).toBe(recortou)
    }
  })

  it('no Synse+ nunca bloqueia', () => {
    for (const dias of [0, 7, 365, 3650]) {
      expect(janelaBloqueada('PRO', dias)).toBe(false)
    }
  })
})
