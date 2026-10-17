import { describe, expect, it } from 'vitest'

import {
  agruparPorDia,
  chaveDoDia,
  diasDaSemana,
  inicioDaSemana,
  janelaDaSemana,
  ocupacao,
  somarSemanas,
} from '@/features/schedule/week'
import type { ClassSession } from '@/types/domain'

/**
 * A semana da agenda.
 *
 * O defeito que estes testes impedem não parece defeito: uma aula na coluna
 * errada passa por detalhe visual, e é o aluno indo à academia no dia errado.
 */

const aula = (startsAt: string, extra: Partial<ClassSession> = {}): ClassSession => ({
  id: startsAt,
  organizationId: 'org',
  scheduleId: null,
  name: 'Spinning',
  staffId: null,
  staffName: null,
  startsAt,
  endsAt: startsAt,
  capacity: 10,
  room: null,
  status: 'SCHEDULED',
  cancellationReason: null,
  bookedCount: 0,
  ...extra,
})

describe('início da semana', () => {
  it('é a segunda-feira, inclusive quando já é segunda', () => {
    // 2026-09-16 é uma quarta-feira.
    expect(chaveDoDia(inicioDaSemana(new Date(2026, 8, 16)))).toBe('2026-09-14')
    expect(chaveDoDia(inicioDaSemana(new Date(2026, 8, 14)))).toBe('2026-09-14')
  })

  it('domingo pertence à semana que começou na segunda anterior', () => {
    /*
     * A armadilha do `getDay()`: domingo é 0, e a conta ingênua
     * `data - getDay()` jogaria o domingo para o início da semana seguinte —
     * a agenda de domingo apareceria numa semana em que a academia não abre.
     */
    expect(chaveDoDia(inicioDaSemana(new Date(2026, 8, 20)))).toBe('2026-09-14')
  })

  it('a semana tem sete dias, de segunda a domingo', () => {
    const dias = diasDaSemana(inicioDaSemana(new Date(2026, 8, 16)))
    expect(dias).toHaveLength(7)
    expect(dias[0].getDay()).toBe(1)
    expect(dias[6].getDay()).toBe(0)
    expect(chaveDoDia(dias[6])).toBe('2026-09-20')
  })

  it('navegar entre semanas anda exatamente sete dias', () => {
    const base = inicioDaSemana(new Date(2026, 8, 16))
    expect(chaveDoDia(somarSemanas(base, 1))).toBe('2026-09-21')
    expect(chaveDoDia(somarSemanas(base, -1))).toBe('2026-09-07')
  })

  it('atravessa o horário de verão sem perder um dia', () => {
    // Semana que cruza a virada de março no hemisfério norte: se a conta fosse
    // feita só em milissegundos sem normalizar a hora, o sétimo dia escorregaria.
    const dias = diasDaSemana(inicioDaSemana(new Date(2026, 2, 12)))
    expect(dias).toHaveLength(7)
    expect(new Set(dias.map(chaveDoDia)).size).toBe(7)
  })

  it('a janela vai do início da segunda ao início da segunda seguinte', () => {
    const base = inicioDaSemana(new Date(2026, 8, 16))
    const { from, to } = janelaDaSemana(base)
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(7 * 86_400_000)
  })
})

describe('agrupamento por dia', () => {
  it('usa o dia local, não o UTC', () => {
    /*
     * Uma aula às 21h em São Paulo é meia-noite do dia seguinte em UTC. Cortar
     * o `toISOString()` colocaria essa aula na coluna errada — e é exatamente
     * a aula noturna, a mais cheia da academia.
     */
    const noite = new Date(2026, 8, 16, 21, 0, 0)
    expect(chaveDoDia(noite)).toBe('2026-09-16')

    const mapa = agruparPorDia([aula(noite.toISOString())])
    expect([...mapa.keys()]).toEqual(['2026-09-16'])
  })

  it('ordena as aulas do dia por horário', () => {
    const manha = new Date(2026, 8, 16, 7, 0, 0).toISOString()
    const noite = new Date(2026, 8, 16, 19, 0, 0).toISOString()
    const mapa = agruparPorDia([aula(noite), aula(manha)])
    expect(mapa.get('2026-09-16')!.map((s) => s.startsAt)).toEqual([manha, noite])
  })
})

describe('ocupação', () => {
  it('conta vagas restantes e marca a turma cheia', () => {
    expect(ocupacao(aula('x', { capacity: 10, bookedCount: 4 }))).toMatchObject({
      ocupadas: 4,
      vagas: 6,
      lotada: false,
    })
    expect(ocupacao(aula('x', { capacity: 10, bookedCount: 10 }))).toMatchObject({
      vagas: 0,
      lotada: true,
    })
  })

  it('turma com fila de espera não mostra vaga negativa', () => {
    // `booked_count` não passa da capacidade, mas a tela não pode depender
    // disso: "−2 vagas" é pior que qualquer arredondamento.
    const cheia = ocupacao(aula('x', { capacity: 10, bookedCount: 12 }))
    expect(cheia.vagas).toBe(0)
    expect(cheia.lotada).toBe(true)
  })
})
