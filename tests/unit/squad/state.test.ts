import { describe, expect, it } from 'vitest'

import {
  PRESENCAS,
  contarNaAcademia,
  foraDoRanking,
  iniciais,
  ordenarLobby,
  proximoTreino,
  quando,
  rankingDaSemana,
  rotuloDaPresenca,
} from '@/features/squad/state'
import type { PresenceState, SquadMember, SquadSession } from '@/types/domain'

/**
 * A lógica do lobby (0068).
 *
 * Aqui mora a chance de errar de um jeito que ninguém vê na tela: quem sobe
 * para o topo, quem entra no ranking, e o que acontece com quem não autorizou
 * aparecer.
 */

const membro = (parcial: Partial<SquadMember> & { nome: string }): SquadMember => ({
  profileId: parcial.nome,
  synseId: 'SYN-00000000',
  avatarUrl: null,
  papel: 'MEMBER',
  souEu: false,
  entrouEm: '2026-11-01T10:00:00Z',
  presenca: null,
  presencaEm: null,
  diasNaSemana: null,
  noRanking: false,
  ...parcial,
})

const sessao = (parcial: Partial<SquadSession> & { id: string }): SquadSession => ({
  startsAt: '2026-11-05T22:00:00Z',
  title: null,
  workoutPlanId: null,
  planoNome: null,
  criadoPor: 'alguem',
  criadoPorNome: 'Alguém',
  cancelado: false,
  vou: 1,
  talvez: 0,
  naoVou: 0,
  minhaResposta: null,
  ...parcial,
})

describe('o vocabulário da presença', () => {
  it('são quatro, e nenhum é texto livre', () => {
    /*
     * A decisão da 0068: o lobby fala por estado, não por mensagem. Se um
     * quinto valor aparecer aqui, é porque alguém abriu a porta do texto — e
     * esse teste é onde a conversa acontece antes do código.
     */
    expect(PRESENCAS.map((p) => p.valor)).toEqual([
      'A_CAMINHO',
      'CHEGUEI',
      'TREINANDO',
      'TERMINEI',
    ])
  })

  it('o rótulo curto sai do vocabulário, e a ausência é nula', () => {
    expect(rotuloDaPresenca('CHEGUEI')).toBe('Chegou')
    expect(rotuloDaPresenca(null)).toBeNull()
    expect(rotuloDaPresenca(undefined)).toBeNull()
  })
})

describe('quem está na academia agora', () => {
  it('conta quem chegou e quem está treinando', () => {
    const membros = [
      membro({ nome: 'ana', presenca: 'CHEGUEI' }),
      membro({ nome: 'bia', presenca: 'TREINANDO' }),
    ]
    expect(contarNaAcademia(membros)).toBe(2)
  })

  it('não conta quem está a caminho nem quem terminou', () => {
    /*
     * Contar os quatro faria o cartão dizer "4 na academia" com o grupo
     * inteiro em casa — um a caminho ainda não chegou, e quem terminou já foi.
     */
    const membros = [
      membro({ nome: 'ana', presenca: 'A_CAMINHO' }),
      membro({ nome: 'bia', presenca: 'TERMINEI' }),
      membro({ nome: 'caio' }),
    ]
    expect(contarNaAcademia(membros)).toBe(0)
  })
})

describe('a ordem do lobby', () => {
  it('quem está mais perto do treino vem primeiro', () => {
    const membros = [
      membro({ nome: 'zeca' }),
      membro({ nome: 'ana', presenca: 'A_CAMINHO' }),
      membro({ nome: 'bia', presenca: 'TREINANDO' }),
      membro({ nome: 'caio', presenca: 'TERMINEI' }),
      membro({ nome: 'duda', presenca: 'CHEGUEI' }),
    ]
    expect(ordenarLobby(membros).map((m) => m.nome)).toEqual([
      'bia',
      'duda',
      'ana',
      'caio',
      'zeca',
    ])
  })

  it('empate volta para o nome, que é estável', () => {
    const membros = [
      membro({ nome: 'Zeca', presenca: 'CHEGUEI' }),
      membro({ nome: 'Ana', presenca: 'CHEGUEI' }),
    ]
    expect(ordenarLobby(membros).map((m) => m.nome)).toEqual(['Ana', 'Zeca'])
  })

  it('você não vem primeiro só por ser você', () => {
    // O cartão de quem está olhando é o botão grande acima; repetir-se no topo
    // ocuparia a linha de quem a pessoa abriu o app para ver.
    const membros = [
      membro({ nome: 'eu', souEu: true }),
      membro({ nome: 'bia', presenca: 'CHEGUEI' }),
    ]
    expect(ordenarLobby(membros)[0].nome).toBe('bia')
  })

  it('não mexe no arranjo de quem chamou', () => {
    const membros = [membro({ nome: 'zeca' }), membro({ nome: 'ana', presenca: 'CHEGUEI' })]
    ordenarLobby(membros)
    expect(membros.map((m) => m.nome)).toEqual(['zeca', 'ana'])
  })
})

describe('o ranking da semana', () => {
  it('só entra quem tem número, e em ordem decrescente', () => {
    const membros = [
      membro({ nome: 'ana', diasNaSemana: 2, noRanking: true }),
      membro({ nome: 'bia', diasNaSemana: 4, noRanking: true }),
      membro({ nome: 'caio' }),
    ]
    expect(rankingDaSemana(membros).map((m) => m.nome)).toEqual(['bia', 'ana'])
  })

  it('zero dias entra; sem consentimento, não', () => {
    /*
     * A distinção que a 0068 carrega até aqui: zero é uma semana parada e
     * merece a linha; nulo é alguém que não autorizou, e a linha seria
     * cobrança pública por uma escolha privada.
     */
    const membros = [
      membro({ nome: 'parado', diasNaSemana: 0, noRanking: true }),
      membro({ nome: 'calado', diasNaSemana: null }),
    ]
    const lista = rankingDaSemana(membros)
    expect(lista.map((m) => m.nome)).toEqual(['parado'])
    expect(foraDoRanking(membros)).toBe(1)
  })

  it('empate de dias volta para o nome', () => {
    const membros = [
      membro({ nome: 'Zeca', diasNaSemana: 3, noRanking: true }),
      membro({ nome: 'Ana', diasNaSemana: 3, noRanking: true }),
    ]
    expect(rankingDaSemana(membros).map((m) => m.nome)).toEqual(['Ana', 'Zeca'])
  })
})

describe('o próximo treino', () => {
  const agora = new Date('2026-11-04T12:00:00Z')

  it('é o mais próximo que ainda não aconteceu', () => {
    const lista = [
      sessao({ id: 'depois', startsAt: '2026-11-06T22:00:00Z' }),
      sessao({ id: 'antes', startsAt: '2026-11-05T22:00:00Z' }),
    ]
    expect(proximoTreino(lista, agora)?.id).toBe('antes')
  })

  it('cancelado não conta', () => {
    const lista = [
      sessao({ id: 'cancelado', startsAt: '2026-11-05T22:00:00Z', cancelado: true }),
      sessao({ id: 'vale', startsAt: '2026-11-06T22:00:00Z' }),
    ]
    expect(proximoTreino(lista, agora)?.id).toBe('vale')
  })

  it('o de ontem não é o próximo', () => {
    // A lista mostra o de ontem de propósito; o cartão de "próximo" não.
    const lista = [sessao({ id: 'ontem', startsAt: '2026-11-03T22:00:00Z' })]
    expect(proximoTreino(lista, agora)).toBeNull()
  })

  it('lista vazia devolve nulo', () => {
    expect(proximoTreino([], agora)).toBeNull()
  })
})

describe('quando o treino é', () => {
  /*
   * As datas são montadas no fuso do processo de propósito: o rótulo é sobre
   * o relógio de quem está olhando, e um instante fixo em UTC diria "amanhã"
   * ou "hoje" conforme a máquina que roda o teste.
   */
  const emHoras = (base: Date, horas: number) => new Date(base.getTime() + horas * 3_600_000)

  it('hoje e amanhã por extenso', () => {
    const agora = new Date(2026, 10, 4, 12, 0, 0)
    const hojeMaisTarde = new Date(2026, 10, 4, 19, 0, 0)
    const amanha = new Date(2026, 10, 5, 7, 0, 0)

    expect(quando(hojeMaisTarde.toISOString(), agora)).toBe('Hoje às 19h')
    expect(quando(amanha.toISOString(), agora)).toBe('Amanhã às 7h')
  })

  it('daí em diante entra a data, senão "sexta" fica ambíguo', () => {
    const agora = new Date(2026, 10, 4, 12, 0, 0)
    const daquiATresDias = new Date(2026, 10, 7, 19, 0, 0)
    expect(quando(daquiATresDias.toISOString(), agora)).toMatch(/sábado, 07\/11 às 19h/)
  })

  it('hora quebrada aparece inteira', () => {
    const agora = new Date(2026, 10, 4, 12, 0, 0)
    expect(quando(emHoras(agora, 7.5).toISOString(), agora)).toBe('Hoje às 19:30')
  })
})

describe('as iniciais do avatar', () => {
  it('primeira e última palavra', () => {
    expect(iniciais('Emerson Braz')).toBe('EB')
    expect(iniciais('Maria da Silva Souza')).toBe('MS')
  })

  it('um nome só vira duas letras dele', () => {
    expect(iniciais('Ana')).toBe('AN')
  })

  it('espaço a mais não quebra, e vazio não estoura', () => {
    expect(iniciais('  João   Pedro  ')).toBe('JP')
    expect(iniciais('   ')).toBe('?')
  })
})
