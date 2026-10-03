import { describe, expect, it } from 'vitest'

import { resumoDoTreino } from '@/features/active-workout/state'

/**
 * O recado da fila do Treino Ativo.
 *
 * Antes destas regras, a operação que estourava as tentativas ficava na fila
 * para sempre: o contador nunca chegava a zero e a tela dizia "3 a sincronizar"
 * indefinidamente. O pior caso não era a mensagem errada — era quem treinou uma
 * hora, viu tudo sumir, e abriu o histórico concluindo que o app não registra
 * nada.
 */

describe('o resumo da fila de treino', () => {
  it('sem nada pendente, não diz nada', () => {
    expect(resumoDoTreino({ pendentes: 0, treinosPerdidos: 0, seriesPerdidas: 0 })).toBeNull()
  })

  it('pendente é informação tranquila', () => {
    const resumo = resumoDoTreino({ pendentes: 3, treinosPerdidos: 0, seriesPerdidas: 0 })
    expect(resumo?.tom).toBe('neutro')
    expect(resumo?.texto).toMatch(/sobem sozinhos/i)
  })

  it('treino perdido diz que não entrou no histórico', () => {
    /*
     * "Falha ao sincronizar" não serve: a pessoa precisa entender que aquele
     * treino não existe mais, e não que ele está a caminho.
     */
    const resumo = resumoDoTreino({ pendentes: 0, treinosPerdidos: 1, seriesPerdidas: 4 })
    expect(resumo?.tom).toBe('alerta')
    expect(resumo?.texto).toMatch(/não entrou no seu histórico/i)
  })

  it('série perdida é notícia menor, e separada', () => {
    const resumo = resumoDoTreino({ pendentes: 0, treinosPerdidos: 0, seriesPerdidas: 2 })
    expect(resumo?.tom).toBe('alerta')
    expect(resumo?.texto).toMatch(/^2 séries/)
  })

  it('o treino perdido tem precedência sobre a série perdida', () => {
    // Quando o treino inteiro caiu, contar as séries dele é ruído.
    const resumo = resumoDoTreino({ pendentes: 0, treinosPerdidos: 1, seriesPerdidas: 9 })
    expect(resumo?.texto).toMatch(/^Um treino/)
  })

  it('a perda tem precedência sobre o que ainda está subindo', () => {
    const resumo = resumoDoTreino({ pendentes: 5, treinosPerdidos: 1, seriesPerdidas: 0 })
    expect(resumo?.tom).toBe('alerta')
  })

  it('fala no singular quando é um só', () => {
    expect(resumoDoTreino({ pendentes: 1, treinosPerdidos: 0, seriesPerdidas: 0 })?.texto).toMatch(
      /^Um registro/,
    )
  })
})
