import { describe, expect, it } from 'vitest'

import {
  agruparPorDia,
  elo,
  nomeDoTipo,
  proximoCursor,
  resumoDaEntrada,
} from '@/features/students/historico/linha-do-tempo'
import type { TimelineEntry, TimelineKind } from '@/types/domain'

/**
 * O histórico integrado, do lado da tela.
 *
 * O que estes testes prendem é a conta de fuso. O servidor roda em UTC e a
 * academia não: sem o fuso no agrupamento, **todo** acontecimento depois das
 * 21h aparece no dia seguinte. É o mesmo defeito que a sequência de treinos já
 * teve, e ele não quebra nada — só mostra o treino de ontem como se fosse de
 * hoje.
 */

const SP = 'America/Sao_Paulo'

const entrada = (patch: Partial<TimelineEntry> & { happenedAt: string }): TimelineEntry => ({
  kind: 'CHECKIN',
  refId: 'r1',
  title: null,
  durationSeconds: null,
  distanceMeters: null,
  volumeKg: null,
  setsCount: null,
  weightKg: null,
  effort: null,
  discomfort: null,
  ...patch,
})

describe('agrupar por dia', () => {
  it('usa o fuso da academia, não o do servidor', () => {
    /*
     * 23h de 20/10 em São Paulo é 02h de 21/10 em UTC. Agrupado em UTC, o
     * treino da terça à noite apareceria na quarta.
     */
    const dias = agruparPorDia([entrada({ happenedAt: '2026-10-21T02:00:00Z', refId: 'a' })], SP)
    expect(dias).toHaveLength(1)
    expect(dias[0].dia).toBe('2026-10-20')
  })

  it('junta o que caiu no mesmo dia local', () => {
    const dias = agruparPorDia(
      [
        entrada({ happenedAt: '2026-10-21T02:00:00Z', refId: 'a' }), // 20/10 23h em SP
        entrada({ happenedAt: '2026-10-20T13:00:00Z', refId: 'b' }), // 20/10 10h em SP
      ],
      SP,
    )
    expect(dias).toHaveLength(1)
    expect(dias[0].entradas.map((e) => e.refId)).toEqual(['a', 'b'])
  })

  it('separa dias diferentes, na ordem em que vieram', () => {
    const dias = agruparPorDia(
      [
        entrada({ happenedAt: '2026-10-22T13:00:00Z', refId: 'c' }),
        entrada({ happenedAt: '2026-10-21T13:00:00Z', refId: 'b' }),
        entrada({ happenedAt: '2026-10-20T13:00:00Z', refId: 'a' }),
      ],
      SP,
    )
    expect(dias.map((d) => d.dia)).toEqual(['2026-10-22', '2026-10-21', '2026-10-20'])
  })

  it('não reordena o que recebeu', () => {
    /*
     * A ordem total é do banco (data desc, id desc). Uma segunda definição de
     * ordem aqui é uma segunda definição para divergir da primeira.
     */
    const fora = [
      entrada({ happenedAt: '2026-10-20T13:00:00Z', refId: 'antigo' }),
      entrada({ happenedAt: '2026-10-22T13:00:00Z', refId: 'novo' }),
    ]
    expect(agruparPorDia(fora, SP).map((d) => d.dia)).toEqual(['2026-10-20', '2026-10-22'])
  })

  it('lista vazia não quebra', () => {
    expect(agruparPorDia([], SP)).toEqual([])
  })

  it('fuso diferente agrupa diferente', () => {
    const umInstante = [entrada({ happenedAt: '2026-10-21T02:00:00Z' })]
    expect(agruparPorDia(umInstante, SP)[0].dia).toBe('2026-10-20')
    expect(agruparPorDia(umInstante, 'UTC')[0].dia).toBe('2026-10-21')
  })
})

describe('o cursor da próxima página', () => {
  it('é o último item quando a página veio cheia', () => {
    const pagina = [
      entrada({ happenedAt: '2026-10-22T13:00:00Z', refId: 'a' }),
      entrada({ happenedAt: '2026-10-21T13:00:00Z', refId: 'b' }),
    ]
    expect(proximoCursor(pagina, 2)).toEqual({ at: '2026-10-21T13:00:00Z', id: 'b' })
  })

  it('é nulo quando a página veio menor que o pedido', () => {
    /*
     * Não há próxima. Oferecer "carregar mais" para encontrar nada é pior que
     * não oferecer: a pessoa toca, espera, e a lista não muda.
     */
    expect(proximoCursor([entrada({ happenedAt: '2026-10-22T13:00:00Z' })], 20)).toBeNull()
  })

  it('é nulo na lista vazia', () => {
    expect(proximoCursor([], 20)).toBeNull()
  })
})

describe('o resumo de cada acontecimento', () => {
  it('o treino diz duração, séries, volume e esforço', () => {
    const partes = resumoDaEntrada(
      entrada({
        kind: 'TREINO',
        happenedAt: '2026-10-22T13:00:00Z',
        durationSeconds: 3660,
        setsCount: 17,
        volumeKg: 5592.4,
        effort: 9,
      }),
    )
    expect(partes).toEqual(['1h01', '17 séries', '5592 kg de volume', 'esforço 9/10'])
  })

  it('a corrida diz distância e tempo, com vírgula decimal', () => {
    const partes = resumoDaEntrada(
      entrada({
        kind: 'CORRIDA',
        happenedAt: '2026-10-22T13:00:00Z',
        distanceMeters: 5420,
        durationSeconds: 1800,
      }),
    )
    expect(partes).toEqual(['5,4 km', '30 min'])
  })

  it('distância redonda não mostra o zero à direita', () => {
    const partes = resumoDaEntrada(
      entrada({ kind: 'CORRIDA', happenedAt: '2026-10-22T13:00:00Z', distanceMeters: 5000 }),
    )
    expect(partes).toEqual(['5 km'])
  })

  it('a pesagem diz o peso com uma casa', () => {
    expect(
      resumoDaEntrada(
        entrada({ kind: 'PESAGEM', happenedAt: '2026-10-22T13:00:00Z', weightKg: 81.47 }),
      ),
    ).toEqual(['81,5 kg'])
  })

  it('duração abaixo de um minuto não vira "0 min"', () => {
    /*
     * Visto no navegador: um treino encerrado em vinte segundos mostrava
     * "0 min · 35 séries". Verdadeiro e com cara de defeito. As outras partes
     * já dizem o que aconteceu.
     */
    const partes = resumoDaEntrada(
      entrada({
        kind: 'TREINO',
        happenedAt: '2026-10-22T13:00:00Z',
        durationSeconds: 23,
        setsCount: 4,
      }),
    )
    expect(partes).toEqual(['4 séries'])
  })

  it('um minuto cheio já aparece', () => {
    expect(
      resumoDaEntrada(
        entrada({ kind: 'TREINO', happenedAt: '2026-10-22T13:00:00Z', durationSeconds: 60 }),
      ),
    ).toEqual(['1 min'])
  })

  it('a corrida curta também não mostra zero', () => {
    expect(
      resumoDaEntrada(
        entrada({
          kind: 'CORRIDA',
          happenedAt: '2026-10-22T13:00:00Z',
          distanceMeters: 300,
          durationSeconds: 45,
        }),
      ),
    ).toEqual(['0,3 km'])
  })

  it('o check-in não inventa número', () => {
    // O check-in é o fato. "1 presença" seria encher linha.
    expect(
      resumoDaEntrada(entrada({ kind: 'CHECKIN', happenedAt: '2026-10-22T13:00:00Z' })),
    ).toEqual([])
  })

  it('o que não veio não aparece', () => {
    /*
     * Treino sem relato não mostra "esforço null/10", e treino sem série não
     * mostra "0 séries" — zero ali leria como "você não fez nada".
     */
    expect(
      resumoDaEntrada(
        entrada({ kind: 'TREINO', happenedAt: '2026-10-22T13:00:00Z', durationSeconds: 1800 }),
      ),
    ).toEqual(['30 min'])
  })

  it('o esforço mínimo da escala aparece', () => {
    /*
     * A escala da 0062 vai de 1 a 10, com `check` na coluna.
     *
     * O `!= null` em vez de teste de verdade é defesa, e **não há teste que o
     * cubra**: os dois só divergem em `effort: 0`, que o banco não deixa
     * existir. Trocar um pelo outro é mutante equivalente, e está escrito aqui
     * para ninguém "simplificar" achando que um teste segura — se a escala um
     * dia passar a aceitar zero, é esta linha que impede o relato de sumir.
     */
    expect(
      resumoDaEntrada(entrada({ kind: 'TREINO', happenedAt: '2026-10-22T13:00:00Z', effort: 1 })),
    ).toEqual(['esforço 1/10'])
  })
})

describe('os elos', () => {
  it('a corrida leva para a corrida', () => {
    expect(elo(entrada({ kind: 'CORRIDA', happenedAt: 'x', refId: 'run_1' }))).toBe(
      '/app/run/run_1',
    )
  })

  it('a pesagem leva para o Synse Body', () => {
    expect(elo(entrada({ kind: 'PESAGEM', happenedAt: 'x' }))).toBe('/app/corpo')
  })

  it('o treino e o check-in não levam a lugar nenhum', () => {
    /*
     * `/app/workout` mostra o treino de **hoje**. Mandar para lá a partir de
     * um treino de três semanas atrás abriria outra coisa — elo que mente é
     * pior que ausência de elo.
     */
    expect(elo(entrada({ kind: 'TREINO', happenedAt: 'x' }))).toBeNull()
    expect(elo(entrada({ kind: 'CHECKIN', happenedAt: 'x' }))).toBeNull()
  })
})

describe('os rótulos', () => {
  it('todo tipo tem nome', () => {
    const tipos: TimelineKind[] = ['TREINO', 'CORRIDA', 'CHECKIN', 'PESAGEM']
    for (const tipo of tipos) expect(nomeDoTipo(tipo)).toBeTruthy()
  })
})
