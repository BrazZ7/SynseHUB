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

  it('o desfazer que não subiu é notícia oposta à da perda', () => {
    /*
     * Aqui nada se perdeu: ficou a mais. A série que a pessoa desfez continua
     * no servidor, e dizer "não pôde ser enviada" a mandaria procurar um
     * registro que está lá — escondendo o que de fato aconteceu.
     */
    const resumo = resumoDoTreino({
      pendentes: 0,
      treinosPerdidos: 0,
      seriesPerdidas: 0,
      desfazerPerdidos: 1,
    })
    expect(resumo?.tom).toBe('alerta')
    expect(resumo?.texto).toMatch(/desfez/i)
    expect(resumo?.texto).not.toMatch(/não pôde ser enviada/i)
  })

  it('e no plural conta quantas', () => {
    expect(
      resumoDoTreino({
        pendentes: 0,
        treinosPerdidos: 0,
        seriesPerdidas: 0,
        desfazerPerdidos: 2,
      })?.texto,
    ).toMatch(/^2 séries que você desfez/)
  })

  it('a perda de verdade tem precedência sobre o desfazer que ficou', () => {
    // Quem perdeu o treino inteiro não precisa ouvir, no mesmo instante, que
    // uma série desfeita ficou registrada.
    expect(
      resumoDoTreino({
        pendentes: 0,
        treinosPerdidos: 1,
        seriesPerdidas: 0,
        desfazerPerdidos: 3,
      })?.texto,
    ).toMatch(/^Um treino/)
  })

  it('fala no singular quando é um só', () => {
    expect(resumoDoTreino({ pendentes: 1, treinosPerdidos: 0, seriesPerdidas: 0 })?.texto).toMatch(
      /^Um registro/,
    )
  })

  it('avisa quando o relato não chegou ao professor', () => {
    /*
     * Terceira notícia, e a mais fácil de calar por engano: o treino está no
     * histórico e as séries também, então nada parece errado. Calar faria a
     * pessoa sair achando que o professor foi avisado — e esperar um ajuste
     * que ninguém pediu.
     */
    const resumo = resumoDoTreino({
      pendentes: 0,
      treinosPerdidos: 0,
      seriesPerdidas: 0,
      relatosPerdidos: 1,
    })
    expect(resumo?.tom).toBe('alerta')
    expect(resumo?.texto).toMatch(/relato/i)
    expect(resumo?.texto).toMatch(/professor/i)
    // Não pode sugerir que faltou treino: o histórico está certo.
    expect(resumo?.texto).not.toMatch(/histórico/i)
  })

  it('no plural conta quantos relatos', () => {
    expect(
      resumoDoTreino({
        pendentes: 0,
        treinosPerdidos: 0,
        seriesPerdidas: 0,
        relatosPerdidos: 2,
      })?.texto,
    ).toMatch(/^2 relatos/)
  })

  it('a série perdida tem precedência sobre o relato perdido', () => {
    expect(
      resumoDoTreino({
        pendentes: 0,
        treinosPerdidos: 0,
        seriesPerdidas: 1,
        relatosPerdidos: 1,
      })?.texto,
    ).toMatch(/^Uma série/)
  })
})
