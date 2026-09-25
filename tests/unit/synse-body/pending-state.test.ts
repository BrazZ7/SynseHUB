import { describe, expect, it } from 'vitest'

import { resumoDaFila } from '@/features/synse-body/state'

/**
 * O recado da fila de pesagens.
 *
 * O caso que este teste existe para prender é o da medição descartada. Quando
 * a fila desiste de uma pesagem, ela não entrou e não vai entrar — e sumir em
 * silêncio faria a pessoa acreditar num histórico com um buraco que ela não
 * sabe que existe.
 */

describe('o resumo da fila', () => {
  it('sem nada pendente, não diz nada', () => {
    expect(resumoDaFila({ pendentes: 0, enviando: false, descartadas: 0 })).toBeNull()
  })

  it('pendente é informação tranquila, não erro', () => {
    /*
     * "Erro" faria a pessoa subir na balança de novo para gravar a mesma
     * pesagem duas vezes. A medição está guardada; só falta a viagem.
     */
    const resumo = resumoDaFila({ pendentes: 1, enviando: false, descartadas: 0 })
    expect(resumo?.tom).toBe('neutro')
    expect(resumo?.texto).toMatch(/sobe sozinha/i)
    expect(resumo?.texto).not.toMatch(/erro|falha/i)
  })

  it('fala no singular quando é uma só', () => {
    expect(resumoDaFila({ pendentes: 1, enviando: false, descartadas: 0 })?.texto).toMatch(
      /^Uma medição guardada/,
    )
    expect(resumoDaFila({ pendentes: 3, enviando: false, descartadas: 0 })?.texto).toMatch(
      /^3 medições guardadas/,
    )
  })

  it('enviando é outro texto do mesmo estado', () => {
    expect(resumoDaFila({ pendentes: 2, enviando: true, descartadas: 0 })?.texto).toMatch(
      /^Enviando 2 medições/,
    )
  })

  it('descartada é dita, e em tom de alerta', () => {
    const resumo = resumoDaFila({ pendentes: 0, enviando: false, descartadas: 1 })
    expect(resumo?.tom).toBe('alerta')
    expect(resumo?.texto).toMatch(/descartada/i)
    // E diz o que fazer, em vez de só anunciar a perda.
    expect(resumo?.texto).toMatch(/à mão/i)
  })

  it('a perda tem precedência sobre o que ainda está subindo', () => {
    // Saber que algo se perdeu importa mais do que saber que algo está a caminho.
    const resumo = resumoDaFila({ pendentes: 4, enviando: true, descartadas: 2 })
    expect(resumo?.tom).toBe('alerta')
    expect(resumo?.texto).toMatch(/^2 medições não puderam ser salvas/)
  })
})
