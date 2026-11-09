import { describe, expect, it } from 'vitest'

import {
  DIAS,
  TIPOS,
  agoraEDepois,
  avisoDoBloco,
  blocosDoDia,
  diaIso,
  nomeDoBloco,
  progressoDoDia,
  quantosLembram,
  rotuloDosDias,
} from '@/features/plano/state'
import type { RoutineBlock } from '@/types/domain'

/**
 * A rotina, do lado de cá (0070).
 *
 * O que estes testes protegem é o erro que não aparece na tela: um bloco no
 * dia errado, um "agora" que aponta para o de ontem, e a lista de dias que
 * vira ruído quando é "todo dia".
 */

const bloco = (parcial: Partial<RoutineBlock> & { atTime: string }): RoutineBlock => ({
  id: parcial.atTime,
  kind: 'AGUA',
  title: null,
  days: [1, 2, 3, 4, 5, 6, 7],
  remind: true,
  ...parcial,
})

/** Uma data local, para o teste não depender do fuso da máquina. */
const em = (ano: number, mes: number, dia: number, hora: number, minuto = 0) =>
  new Date(ano, mes - 1, dia, hora, minuto, 0)

describe('o vocabulário da rotina', () => {
  it('são sete tipos, e nenhum é medicação', () => {
    /*
     * A decisão da 0070: remédio é dado de saúde com regra própria, e não
     * entra por um campo que nasceu para "almoço". Se um oitavo tipo aparecer
     * aqui, é para a conversa acontecer antes do código.
     */
    expect(TIPOS.map((t) => t.valor)).toEqual([
      'AGUA',
      'REFEICAO',
      'TREINO',
      'TRABALHO',
      'SONO',
      'PAUSA',
      'ESTUDO',
    ])
  })

  it('cada tipo tem um nome padrão e uma frase de aviso', () => {
    // A frase chega na tela bloqueada: curta, no imperativo, e nunca vazia.
    for (const tipo of TIPOS) {
      expect(tipo.padrao.length).toBeGreaterThan(2)
      expect(tipo.aviso.length).toBeGreaterThan(5)
      expect(tipo.aviso.length).toBeLessThanOrEqual(30)
    }
  })

  it('o nome do bloco é o que a pessoa escreveu, ou o do tipo', () => {
    expect(nomeDoBloco({ kind: 'REFEICAO', title: 'Almoço' })).toBe('Almoço')
    expect(nomeDoBloco({ kind: 'REFEICAO', title: null })).toBe('Refeição')
    // Espaço em branco não é nome.
    expect(nomeDoBloco({ kind: 'AGUA', title: '   ' })).toBe('Beber água')
  })

  it('o aviso usa o nome quando há um', () => {
    expect(avisoDoBloco({ kind: 'AGUA', title: null })).toBe('Hora de beber água')
    expect(avisoDoBloco({ kind: 'AGUA', title: 'Garrafa cheia' })).toBe('Garrafa cheia')
  })
})

describe('os dias', () => {
  it('domingo é 7, e não 0', () => {
    /*
     * A convenção ISO, a mesma de `date_trunc('week')` e de `isodow`. Com
     * domingo em 0 seriam três convenções de semana no mesmo produto.
     */
    expect(diaIso(em(2026, 11, 2, 12))).toBe(1) // segunda
    expect(diaIso(em(2026, 11, 8, 12))).toBe(7) // domingo
    expect(DIAS.map((d) => d.valor)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('os casos comuns viram frase, não lista', () => {
    // "Seg, Ter, Qua, Qui, Sex" é ruído num cartão que a pessoa lê de relance.
    expect(rotuloDosDias([1, 2, 3, 4, 5, 6, 7])).toBe('Todo dia')
    expect(rotuloDosDias([1, 2, 3, 4, 5])).toBe('Seg a Sex')
    expect(rotuloDosDias([6, 7])).toBe('Fim de semana')
  })

  it('o resto vira lista, com vírgula e "e"', () => {
    expect(rotuloDosDias([1, 3, 5])).toBe('Seg, Qua e Sex')
    expect(rotuloDosDias([3])).toBe('Qua')
  })

  it('a ordem de entrada não muda o rótulo', () => {
    expect(rotuloDosDias([5, 1, 3])).toBe('Seg, Qua e Sex')
    expect(rotuloDosDias([7, 6])).toBe('Fim de semana')
  })

  it('dia repetido não aparece duas vezes', () => {
    expect(rotuloDosDias([1, 1, 3])).toBe('Seg e Qua')
  })
})

describe('os blocos do dia', () => {
  const rotina = [
    bloco({ atTime: '19:00', days: [1, 3, 5], kind: 'TREINO' }),
    bloco({ atTime: '07:00', kind: 'REFEICAO' }),
    bloco({ atTime: '12:30', kind: 'REFEICAO' }),
  ]

  it('só os do dia, em ordem de relógio', () => {
    // Segunda: os três. Terça: os dois de todo dia.
    expect(blocosDoDia(rotina, 1).map((b) => b.atTime)).toEqual(['07:00', '12:30', '19:00'])
    expect(blocosDoDia(rotina, 2).map((b) => b.atTime)).toEqual(['07:00', '12:30'])
  })

  it('não mexe no arranjo de quem chamou', () => {
    blocosDoDia(rotina, 1)
    expect(rotina.map((b) => b.atTime)).toEqual(['19:00', '07:00', '12:30'])
  })
})

describe('o que é agora', () => {
  const rotina = [
    bloco({ atTime: '07:00', kind: 'REFEICAO', title: 'Café' }),
    bloco({ atTime: '12:30', kind: 'REFEICAO', title: 'Almoço' }),
    bloco({ atTime: '19:00', kind: 'TREINO', title: 'Treino' }),
  ]

  it('é o último marco que já passou', () => {
    /*
     * Os blocos são marcos, não intervalos: às 13h, com almoço às 12h30 e
     * treino às 19h, o que está valendo é o almoço.
     */
    const { atual, proximo } = agoraEDepois(rotina, em(2026, 11, 2, 13))
    expect(atual?.title).toBe('Almoço')
    expect(proximo?.title).toBe('Treino')
  })

  it('antes do primeiro, não há "agora"', () => {
    /*
     * Dizer que às 5h da manhã a pessoa está no "jantar de ontem" é pior que
     * não dizer nada.
     */
    const { atual, proximo } = agoraEDepois(rotina, em(2026, 11, 2, 5))
    expect(atual).toBeNull()
    expect(proximo?.title).toBe('Café')
  })

  it('depois do último, o próximo é o de amanhã', () => {
    const { atual, proximo } = agoraEDepois(rotina, em(2026, 11, 2, 23))
    expect(atual?.title).toBe('Treino')
    expect(proximo?.title).toBe('Café')
  })

  it('uma rotina só de sábado não deixa a segunda sem próximo', () => {
    // Procurar só no dia seguinte devolveria nulo de segunda a sexta.
    const soSabado = [bloco({ atTime: '09:00', days: [6], title: 'Corrida longa' })]
    const { proximo } = agoraEDepois(soSabado, em(2026, 11, 2, 10)) // segunda
    expect(proximo?.title).toBe('Corrida longa')
  })

  it('sem rotina, não há nem agora nem depois', () => {
    expect(agoraEDepois([], em(2026, 11, 2, 10))).toEqual({ atual: null, proximo: null })
  })

  it('o marco da hora exata já é o agora', () => {
    // Às 12h30 em ponto, o almoço é agora — e não "daqui a pouco".
    expect(agoraEDepois(rotina, em(2026, 11, 2, 12, 30)).atual?.title).toBe('Almoço')
  })
})

describe('o progresso do dia', () => {
  const rotina = [
    bloco({ atTime: '07:00' }),
    bloco({ atTime: '12:30' }),
    bloco({ atTime: '19:00' }),
    bloco({ atTime: '23:00' }),
  ]

  it('conta os marcos que já passaram', () => {
    expect(progressoDoDia(rotina, em(2026, 11, 2, 5))).toBe(0)
    expect(progressoDoDia(rotina, em(2026, 11, 2, 13))).toBe(50)
    expect(progressoDoDia(rotina, em(2026, 11, 2, 23, 30))).toBe(100)
  })

  it('dia sem bloco é zero, e não um anel quebrado', () => {
    // Divisão por zero daria `NaN`, e o anel desenharia nada sem explicação.
    expect(progressoDoDia([], em(2026, 11, 2, 13))).toBe(0)
    const soSabado = [bloco({ atTime: '09:00', days: [6] })]
    expect(progressoDoDia(soSabado, em(2026, 11, 2, 13))).toBe(0)
  })
})

describe('quantos lembram', () => {
  it('conta só os que a pessoa pediu para avisar', () => {
    const rotina = [
      bloco({ atTime: '07:00', remind: true }),
      bloco({ atTime: '09:00', remind: false }),
      bloco({ atTime: '12:00', remind: true }),
    ]
    expect(quantosLembram(rotina)).toBe(2)
    expect(quantosLembram([])).toBe(0)
  })
})
