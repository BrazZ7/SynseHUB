import { describe, expect, it } from 'vitest'

import {
  deslocamentoEmMinutos,
  diasComRegistro,
  inicioDaJanelaDeDias,
  inicioDoDiaLocal,
  inicioDoMesLocal,
} from '@/features/students/janelas'

/**
 * As janelas de tempo da tela — aceite 23: "o resumo respeita datas, fuso e
 * correções".
 *
 * ── O defeito ───────────────────────────────────────────────────────────────
 *
 * A home montava hoje, a semana e o mês com `new Date(ano, mes, dia)`, que é
 * meia-noite no fuso de **quem executa o código**. No servidor isso é UTC, e no
 * horário de Brasília o dia virava às 21h.
 *
 * Dava para ver na mesma tela: a sequência de dias usa `diaLocal` com o fuso do
 * produto e dizia "treinou hoje"; o cartão ao lado dizia que não. E o guarda do
 * check-in diário deixava passar um segundo check-in entre as 21h e a
 * meia-noite — dois check-ins num dia inflando a meta da semana.
 */

const BRASILIA = 'America/Sao_Paulo'
const LISBOA = 'Europe/Lisbon'

describe('o deslocamento do fuso', () => {
  it('Brasília está três horas atrás de UTC', () => {
    expect(deslocamentoEmMinutos(new Date('2026-10-13T12:00:00Z'), BRASILIA)).toBe(-180)
  })

  it('e o deslocamento é lido no instante, não numa tabela nossa', () => {
    // Lisboa muda com o horário de verão; a conta tem de acompanhar.
    const verao = deslocamentoEmMinutos(new Date('2026-07-01T12:00:00Z'), LISBOA)
    const inverno = deslocamentoEmMinutos(new Date('2026-01-01T12:00:00Z'), LISBOA)
    expect(verao).toBe(60)
    expect(inverno).toBe(0)
  })

  it('UTC não tem deslocamento', () => {
    expect(deslocamentoEmMinutos(new Date('2026-10-13T12:00:00Z'), 'UTC')).toBe(0)
  })
})

describe('o começo do dia', () => {
  it('é meia-noite no fuso, que em UTC são três da manhã', () => {
    const inicio = inicioDoDiaLocal(new Date('2026-10-13T15:00:00Z'), BRASILIA)
    expect(inicio).toBe('2026-10-13T03:00:00.000Z')
  })

  it('às 22h de Brasília, o dia ainda é hoje', () => {
    /*
     * O caso exato do defeito. 23h30 UTC do dia 13 são 20h30 do dia 13 em
     * Brasília — e a conta antiga já estava no dia 14, deixando passar o
     * segundo check-in e zerando a meta da semana no meio da noite.
     */
    const noite = new Date('2026-10-14T01:30:00Z') // 22h30 do dia 13 em Brasília
    expect(inicioDoDiaLocal(noite, BRASILIA)).toBe('2026-10-13T03:00:00.000Z')
  })

  it('e em UTC o mesmo instante já é o dia seguinte — o controle', () => {
    // Prova que o teste acima mede o fuso, e não uma coincidência de datas.
    const noite = new Date('2026-10-14T01:30:00Z')
    expect(inicioDoDiaLocal(noite, 'UTC')).toBe('2026-10-14T00:00:00.000Z')
  })
})

describe('o começo do mês', () => {
  it('é o dia primeiro no fuso', () => {
    expect(inicioDoMesLocal(new Date('2026-10-13T15:00:00Z'), BRASILIA)).toBe(
      '2026-10-01T03:00:00.000Z',
    )
  })

  it('na virada do mês, a noite do dia 31 ainda é do mês que termina', () => {
    const virada = new Date('2026-11-01T01:00:00Z') // 22h do dia 31 em Brasília
    expect(inicioDoMesLocal(virada, BRASILIA)).toBe('2026-10-01T03:00:00.000Z')
  })
})

describe('a janela de dias', () => {
  it('sete dias são hoje e os seis anteriores', () => {
    /*
     * E não "168 horas atrás". A janela por horas faz o número cair no meio do
     * dia conforme o relógio anda: quem abre o app à noite vê menos do que viu
     * de manhã sem ter feito nada.
     */
    const inicio = inicioDaJanelaDeDias(new Date('2026-10-13T15:00:00Z'), BRASILIA, 7)
    expect(inicio).toBe('2026-10-07T03:00:00.000Z')
  })

  it('um dia é só hoje', () => {
    expect(inicioDaJanelaDeDias(new Date('2026-10-13T15:00:00Z'), BRASILIA, 1)).toBe(
      inicioDoDiaLocal(new Date('2026-10-13T15:00:00Z'), BRASILIA),
    )
  })

  it('a janela não encolhe ao longo do dia', () => {
    // O mesmo dia, de manhã e à noite, começa no mesmo lugar.
    const manha = inicioDaJanelaDeDias(new Date('2026-10-13T11:00:00Z'), BRASILIA, 7)
    const noite = new Date('2026-10-14T01:00:00Z') // 22h do dia 13
    expect(inicioDaJanelaDeDias(noite, BRASILIA, 7)).toBe(manha)
  })

  it('atravessa o horário de verão contando dias, não milissegundos', () => {
    /*
     * Lisboa sai do horário de verão em 25/10/2026, então aquele dia tem 25
     * horas. Olhando de 28/10 (já em UTC+0), sete dias antes é a meia-noite de
     * 22/10 — que ainda estava em UTC+1, e portanto é `21T23:00Z`.
     *
     * Subtrair `7 × 86.400.000` de meia-noite do dia 28 daria `21T00:00Z`: uma
     * hora a mais de janela e o dia 21 inteiro entrando na conta. Voltar dia a
     * dia pelo calendário acerta, e foi o próprio teste que me corrigiu — eu
     * esperei `22T00:00Z` e o certo é `21T23:00Z`.
     */
    const depois = new Date('2026-10-28T12:00:00Z')
    expect(inicioDaJanelaDeDias(depois, LISBOA, 7)).toBe('2026-10-21T23:00:00.000Z')

    // E é mesmo meia-noite local do dia 22.
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: LISBOA, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(
        new Date('2026-10-21T23:00:00.000Z'),
      ),
    ).toMatch(/2026-10-22, 00:00/)
  })
})

describe('dias com registro', () => {
  const fuso = BRASILIA
  const desde = inicioDaJanelaDeDias(new Date('2026-10-13T15:00:00Z'), fuso, 7)

  it('dois registros no mesmo dia são um dia', () => {
    /*
     * A contagem duplicada que o pedido manda evitar. Acontece de verdade: a
     * pessoa faz check-in na recepção e abre o Treino Ativo em seguida — é um
     * dia, visto por dois caminhos.
     */
    const registros = ['2026-10-13T12:00:00Z', '2026-10-13T23:00:00Z']
    expect(diasComRegistro(registros, fuso, desde)).toBe(1)
  })

  it('dias diferentes somam', () => {
    const registros = ['2026-10-11T12:00:00Z', '2026-10-12T12:00:00Z', '2026-10-13T12:00:00Z']
    expect(diasComRegistro(registros, fuso, desde)).toBe(3)
  })

  it('o que está fora da janela não conta', () => {
    expect(diasComRegistro(['2026-09-01T12:00:00Z'], fuso, desde)).toBe(0)
  })

  it('o dia é o do fuso, não o de UTC', () => {
    /*
     * 02h de UTC do dia 14 são 23h do dia 13 em Brasília. Contado em UTC, este
     * registro cairia no dia 14 — e quem treinou na noite de terça veria o
     * esforço contado na quarta.
     */
    const registros = ['2026-10-13T12:00:00Z', '2026-10-14T02:00:00Z']
    expect(diasComRegistro(registros, fuso, desde)).toBe(1)
    expect(diasComRegistro(registros, 'UTC', desde)).toBe(2)
  })

  it('sem registro, zero', () => {
    expect(diasComRegistro([], fuso, desde)).toBe(0)
  })
})
