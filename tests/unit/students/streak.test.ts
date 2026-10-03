import { describe, expect, it } from 'vitest'

import { calcularSequencia, diaLocal, ehFimDeSemana } from '@/features/students/streak'

/**
 * A sequência de dias de treino.
 *
 * A regra que mais importa é a ponte do fim de semana: quem treina de segunda
 * a sexta não pode perder a sequência por não aparecer no sábado. E a segunda
 * mais importante é a do dia em curso — abrir o app de manhã não pode zerar a
 * sequência de quem treina à noite.
 *
 * Os dias são fixos e conhecidos. Setembro de 2026: dia 14 é segunda, 19 é
 * sábado, 20 é domingo, 21 é segunda.
 */

const FUSO = 'America/Sao_Paulo'

/** Check-in às 19h daquele dia, horário de Brasília. */
const em = (dia: string) => ({ checkedInAt: `${dia}T22:00:00.000Z` })

/** "Agora" às 10h daquele dia, horário de Brasília. */
const manhaDe = (dia: string) => new Date(`${dia}T13:00:00.000Z`)

const sequencia = (dias: string[], hoje: string) =>
  calcularSequencia(dias.map(em), { fuso: FUSO, agora: manhaDe(hoje) })

describe('a ponte do fim de semana', () => {
  it('sexta conta para a segunda: não aparecer no sábado não quebra', () => {
    const s = sequencia(['2026-09-17', '2026-09-18', '2026-09-21'], '2026-09-21')
    expect(s.dias).toBe(3)
  })

  it('treinou na sexta e é segunda de manhã: a sequência está viva', () => {
    const s = sequencia(['2026-09-18'], '2026-09-21')
    expect(s.dias).toBe(1)
    expect(s.hoje).toBe(false)
    expect(s.emRisco).toBe(true)
  })

  it('fim de semana com treino conta como dia', () => {
    // Sexta, sábado, domingo e segunda: quatro dias, o fim de semana incluído.
    const s = sequencia(['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'], '2026-09-21')
    expect(s.dias).toBe(4)
  })

  it('só o fim de semana, e hoje é segunda: os dois contam', () => {
    const s = sequencia(['2026-09-19', '2026-09-20'], '2026-09-21')
    expect(s.dias).toBe(2)
  })
})

describe('o que quebra', () => {
  it('faltar numa quarta quebra', () => {
    // Segunda e terça, nada na quarta, quinta de novo.
    const s = sequencia(['2026-09-14', '2026-09-15', '2026-09-17'], '2026-09-17')
    expect(s.dias).toBe(1)
  })

  it('pular a segunda quebra, mesmo tendo treinado na sexta', () => {
    /*
     * A ponte atravessa sábado e domingo, não a segunda. Quem treinou sexta e
     * sumiu na segunda chega na terça com a sequência zerada.
     */
    const s = sequencia(['2026-09-18'], '2026-09-22')
    expect(s.dias).toBe(0)
  })

  it('sem nenhum check-in a sequência é zero', () => {
    expect(calcularSequencia([], { fuso: FUSO })).toEqual({ dias: 0, hoje: false, emRisco: false })
  })

  it('check-in antigo e isolado não vale sequência hoje', () => {
    const s = sequencia(['2026-08-10'], '2026-09-21')
    expect(s.dias).toBe(0)
  })
})

describe('o dia de hoje', () => {
  it('ainda não treinou hoje: a sequência de ontem continua de pé', () => {
    const s = sequencia(['2026-09-16', '2026-09-17'], '2026-09-18')
    expect(s.dias).toBe(2)
    expect(s.hoje).toBe(false)
    // É este estado que a tela usa para dizer "não perca a sequência".
    expect(s.emRisco).toBe(true)
  })

  it('treinou hoje: a chama está acesa e nada está em risco', () => {
    const s = sequencia(['2026-09-17', '2026-09-18'], '2026-09-18')
    expect(s.dias).toBe(2)
    expect(s.hoje).toBe(true)
    expect(s.emRisco).toBe(false)
  })

  it('primeiro treino da vida, hoje: um dia', () => {
    const s = sequencia(['2026-09-18'], '2026-09-18')
    expect(s.dias).toBe(1)
    expect(s.hoje).toBe(true)
  })
})

describe('o fuso e a virada do dia', () => {
  it('check-in às 23h de Brasília conta no dia certo, não no seguinte', () => {
    /*
     * 23h em Brasília é 02h UTC do dia seguinte. Agrupar por dia UTC jogaria o
     * treino da segunda para a terça e partiria a sequência de quem treina
     * tarde.
     */
    expect(diaLocal(new Date('2026-09-22T02:00:00.000Z'), FUSO)).toBe('2026-09-21')
  })

  it('dois check-ins no mesmo dia contam como um', () => {
    const s = calcularSequencia(
      [
        { checkedInAt: '2026-09-18T12:00:00.000Z' },
        { checkedInAt: '2026-09-18T23:00:00.000Z' },
      ],
      { fuso: FUSO, agora: manhaDe('2026-09-18') },
    )
    expect(s.dias).toBe(1)
  })

  it('reconhece sábado e domingo', () => {
    expect(ehFimDeSemana('2026-09-19')).toBe(true)
    expect(ehFimDeSemana('2026-09-20')).toBe(true)
    expect(ehFimDeSemana('2026-09-21')).toBe(false)
  })

  it('data inválida é ignorada em vez de derrubar a conta', () => {
    const s = calcularSequencia(
      [{ checkedInAt: 'não é data' }, em('2026-09-18')],
      { fuso: FUSO, agora: manhaDe('2026-09-18') },
    )
    expect(s.dias).toBe(1)
  })
})
