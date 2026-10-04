import { describe, expect, it } from 'vitest'

import { clienteFalso } from '../postgrest-falso'

/**
 * ── A rota lida por páginas, e os números somados pelo banco ───────────────
 *
 * `saveActivity` grava os pontos de uma corrida em lotes de 500, e o
 * comentário dele diz por quê: "uma corrida de uma hora tem milhares de
 * pontos". A escrita sabia disso. A leitura pedia tudo numa requisição só — e
 * o PostgREST corta a resposta no teto configurado no servidor **sem dar
 * erro**, então o mapa desenhava a linha até onde o corte alcançasse e parava
 * no meio, parecendo uma corrida mais curta.
 *
 * Aqui um teto não serviria: a rota inteira *é* o conteúdo da tela. O que
 * entra é paginação — e o detalhe que a faz valer é avançar pelo que **veio**
 * e não pelo que foi pedido, porque ninguém confirmou o valor do teto deste
 * servidor. Se ele for menor que a página pedida, parar na primeira resposta
 * curta seria repetir o defeito com mais passos.
 */

const ponto = (i: number) => ({
  id: i,
  latitude: '-23.5500000',
  longitude: '-46.6300000',
  altitude: '750.00',
  speed: '3.100',
  recorded_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  total_distance: String(i * 3),
})

const pagina = (de: number, quantos: number) => ({
  data: Array.from({ length: quantos }, (_, i) => ponto(de + i)),
  error: null,
})

describe('a rota de uma atividade', () => {
  it('junta as páginas até uma vir vazia', async () => {
    const t = clienteFalso({
      tabelas: {
        activity_points: [
          pagina(0, 1000),
          pagina(1000, 1000),
          pagina(2000, 350),
          { data: [], error: null },
        ],
      },
    })

    const rota = await t.dataSource.getActivityRoute('corrida-1')

    // Duas horas e meia de corrida a um ponto por segundo não cabem numa
    // resposta só, e a tela precisa de todos para desenhar a linha inteira.
    expect(rota).toHaveLength(2350)
    expect(rota[0].totalDistance).toBe(0)
    expect(rota[2349].totalDistance).toBe(2349 * 3)
  })

  it('a última página cheia ainda pede a seguinte', async () => {
    /*
     * O caso em que parar cedo é tentador: a terceira página veio cheia, e a
     * rota acabou ali. Sem a requisição que volta vazia, não há como saber a
     * diferença entre "acabou" e "o servidor cortou".
     */
    const t = clienteFalso({
      tabelas: { activity_points: [pagina(0, 1000), { data: [], error: null }] },
    })

    const rota = await t.dataSource.getActivityRoute('corrida-2')

    expect(rota).toHaveLength(1000)
    expect(t.todasParaTabela('activity_points')).toHaveLength(2)
  })

  it('avança pelo que veio, e não pelo que pediu', async () => {
    /*
     * A asserção central. Se o teto do servidor for menor que a página pedida
     * — e ninguém confirmou qual é —, a primeira resposta vem curta sem erro.
     * Avançar 1000 aqui pularia os pontos entre 400 e 1000: a linha do mapa
     * daria um salto em linha reta por onde a pessoa não passou.
     */
    const t = clienteFalso({
      tabelas: {
        activity_points: [
          pagina(0, 400),
          pagina(400, 400),
          pagina(800, 120),
          { data: [], error: null },
        ],
      },
    })

    const rota = await t.dataSource.getActivityRoute('corrida-3')

    expect(rota).toHaveLength(920)
    const faixas = t
      .todasParaTabela('activity_points')
      .map((c) => c.passos.find((p) => p.metodo === 'range')!.args)

    expect(faixas).toEqual([
      [0, 999],
      [400, 1399],
      [800, 1799],
      [920, 1919],
    ])
  })

  it('ordena por instante com desempate estável', async () => {
    /*
     * Dois pontos com o mesmo instante poderiam trocar de lugar entre duas
     * páginas sem um segundo critério — e aí um ponto apareceria duas vezes e
     * outro nenhuma. `id` é identidade, então serve.
     */
    const t = clienteFalso({ tabelas: { activity_points: [{ data: [], error: null }] } })

    await t.dataSource.getActivityRoute('corrida-4')

    const ordens = t
      .paraTabela('activity_points')!
      .passos.filter((p) => p.metodo === 'order')
      .map((p) => p.args[0])

    expect(ordens).toEqual(['recorded_at', 'id'])
  })

  it('rota sem ponto nenhum não quebra', async () => {
    const t = clienteFalso({ tabelas: { activity_points: [{ data: [], error: null }] } })
    expect(await t.dataSource.getActivityRoute('corrida-5')).toEqual([])
  })
})

describe('os números derivados', () => {
  it('o resumo de corridas vem somado do banco', async () => {
    const t = clienteFalso({
      rpcs: {
        resumo_de_corridas: {
          data: [
            {
              atividades: '41',
              metros: '417500.50',
              segundos: '150300',
              calorias: '31050',
              ganho: '4170.25',
            },
          ],
          error: null,
        },
      },
    })

    const r = await t.dataSource.summarizeActivities('perfil-1', '1970-01-01T00:00:00.000Z')

    expect(t.argsDaRpc('resumo_de_corridas')).toEqual({
      p_user_profile_id: 'perfil-1',
      p_desde: '1970-01-01T00:00:00.000Z',
    })
    // `numeric` chega como string: somar sem converter concatena.
    expect(r).toEqual({
      activities: 41,
      distanceMeters: 417500.5,
      movingSeconds: 150300,
      calories: 31050,
      elevationGain: 4170.25,
    })
    // E nenhuma linha de `activities` viajou para a aplicação somar.
    expect(t.chamadas).toEqual([])
  })

  it('resposta sem linha devolve zero, e não quebra a tela', async () => {
    const t = clienteFalso({ rpcs: { resumo_de_corridas: { data: [], error: null } } })

    const r = await t.dataSource.summarizeActivities('perfil-1', '1970-01-01T00:00:00.000Z')

    expect(r.activities).toBe(0)
    expect(r.distanceMeters).toBe(0)
  })

  it('alunos por plano vêm contados do banco', async () => {
    const t = clienteFalso({
      rpcs: {
        alunos_por_plano: {
          data: [
            { plan_id: 'mensal', total: '120' },
            { plan_id: 'anual', total: '34' },
          ],
          error: null,
        },
      },
    })

    const r = await t.dataSource.countStudentsByPlan('org-1')

    expect(r).toEqual({ mensal: 120, anual: 34 })
    expect(t.chamadas).toEqual([])
  })

  it('fichas atribuídas vêm contadas do banco', async () => {
    const t = clienteFalso({
      rpcs: {
        treinos_por_plano: { data: [{ workout_plan_id: 'ficha-a', total: '9' }], error: null },
      },
    })

    expect(await t.dataSource.countAssignments('org-1')).toEqual({ 'ficha-a': 9 })
  })
})

describe('a janela entre publicar e migrar', () => {
  const SEM_MIGRATION = {
    code: 'PGRST202',
    message: 'Could not find the function in the schema cache',
  }

  it('sem a 0050, a contagem volta a ser feita na aplicação', async () => {
    /*
     * Errado como sempre foi — pode vir cortada —, mas de pé: a tela de planos
     * sem número nenhum seria pior na janela entre publicar e colar o SQL.
     */
    const t = clienteFalso({
      rpcs: { alunos_por_plano: { data: null, error: SEM_MIGRATION } },
      tabelas: {
        memberships: [
          {
            data: [{ plan_id: 'mensal' }, { plan_id: 'mensal' }, { plan_id: 'anual' }],
            error: null,
          },
        ],
      },
    })

    expect(await t.dataSource.countStudentsByPlan('org-1')).toEqual({ mensal: 2, anual: 1 })
    expect(t.paraTabela('memberships')).toBeDefined()
  })

  it('sem a 0050, o resumo volta a ser somado na aplicação', async () => {
    const t = clienteFalso({
      rpcs: { resumo_de_corridas: { data: null, error: SEM_MIGRATION } },
      tabelas: {
        activities: [
          {
            data: [
              {
                distance_meters: '5000',
                moving_seconds: '1800',
                calories: '300',
                elevation_gain: '40',
              },
              {
                distance_meters: '2500',
                moving_seconds: '900',
                calories: '150',
                elevation_gain: '10',
              },
            ],
            error: null,
          },
        ],
      },
    })

    const r = await t.dataSource.summarizeActivities('perfil-1', '1970-01-01T00:00:00.000Z')

    expect(r.activities).toBe(2)
    expect(r.distanceMeters).toBe(7500)
  })

  it('erro que não é migration sobe, e não vira número errado', async () => {
    /*
     * A distinção que o `isPendingMigration` existe para fazer. Engolir
     * "permission denied" aqui devolveria zero alunos em todos os planos — um
     * número com cara de certo, que é exatamente o defeito desta migration
     * reaparecendo por outra porta.
     */
    const t = clienteFalso({
      rpcs: {
        alunos_por_plano: { data: null, error: { code: '42501', message: 'permission denied' } },
      },
    })

    const erro = await t.dataSource.countStudentsByPlan('org-1').then(
      () => null,
      (e: Error) => e,
    )

    expect(erro).toBeInstanceOf(Error)
    expect(erro!.cause).toMatchObject({ code: '42501' })
    expect(t.chamadas).toEqual([])
  })
})
