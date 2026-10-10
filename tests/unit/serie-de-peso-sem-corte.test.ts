import { describe, expect, it } from 'vitest'

import { clienteFalso } from './postgrest-falso'
import { baldeDoPeriodo } from '@/features/synse-body/baldes-da-serie'

/**
 * ── As pesagens sem corte (0052) ────────────────────────────────────────────
 *
 * Aqui se testa **qual consulta saiu**. A semântica do agrupamento — um ponto
 * por balde, a última do balde, a RLS do compartilhamento — fica em
 * `tests/db/serie-de-peso.test.ts`, contra Postgres de verdade.
 *
 * O que importa provar deste lado:
 *
 *   o histórico vem por página, com o total do conjunto e não da página;
 *   o gráfico **não** sai da mesma consulta do histórico;
 *   a RPC recebe o balde que a régua da aplicação manda;
 *   sem a 0052, a volta ao caminho antigo tem teto **escrito**, e não herdado.
 */

const PERFIL = 'perfil-1'

const linha = (medido: string, peso: number) => ({
  id: `bm-${medido}`,
  client_id: `c-${medido}`,
  measured_at: medido,
  source: 'SCALE',
  weight_kg: peso,
  field_origin: {},
})

const passosDe = (c: { passos: { metodo: string; args: unknown[] }[] } | undefined) =>
  (c?.passos ?? []).map((p) => `${p.metodo}:${String(p.args[0])}`)

describe('listBodyMeasurements', () => {
  it('tira o total da contagem do servidor, não do tamanho da página', async () => {
    const falso = clienteFalso({
      tabelas: {
        body_measurements: [{ data: [linha('2026-10-05T07:00:00Z', 80)], error: null, count: 412 }],
      },
    })

    const pagina = await falso.dataSource.listBodyMeasurements('1a', { page: 3, pageSize: 30 })

    /*
     * Era exatamente este o defeito: a tela dizia "Últimas N medições" com o
     * N do que coubera na resposta, não do que existe.
     */
    expect(pagina.rows).toHaveLength(1)
    expect(pagina.total).toBe(412)
    expect(pagina.page).toBe(3)

    const passos = falso.paraTabela('body_measurements')!.passos
    expect(passos.find((p) => p.metodo === 'select')?.args[1]).toEqual({ count: 'exact' })
    expect(passos.find((p) => p.metodo === 'range')?.args).toEqual([60, 89])
  })

  it('traz a mais recente primeiro, que é o que a tela mostra no topo', async () => {
    const falso = clienteFalso({
      tabelas: { body_measurements: [{ data: [], error: null, count: 0 }] },
    })
    await falso.dataSource.listBodyMeasurements('30d')

    const ordem = falso.paraTabela('body_measurements')!.passos.find((p) => p.metodo === 'order')
    expect(ordem?.args).toEqual(['measured_at', { ascending: false }])
  })

  it('não filtra por perfil no histórico da própria pessoa — quem filtra é a RLS', async () => {
    const falso = clienteFalso({
      tabelas: { body_measurements: [{ data: [], error: null, count: 0 }] },
    })
    await falso.dataSource.listBodyMeasurements('30d')

    expect(passosDe(falso.paraTabela('body_measurements'))).not.toContain('eq:user_profile_id')
  })

  it('filtra por perfil no histórico compartilhado', async () => {
    const falso = clienteFalso({
      tabelas: { body_measurements: [{ data: [], error: null, count: 0 }] },
    })
    await falso.dataSource.listSharedBodyMeasurements(PERFIL, '1a')

    const eq = falso.paraTabela('body_measurements')!.passos.find((p) => p.metodo === 'eq')
    expect(eq?.args).toEqual(['user_profile_id', PERFIL])
  })

  it('prende o tamanho da página entre 5 e 200', async () => {
    for (const [pedido, esperado] of [
      [1, 5],
      [100000, 200],
    ] as const) {
      const falso = clienteFalso({
        tabelas: { body_measurements: [{ data: [], error: null, count: 0 }] },
      })
      const pagina = await falso.dataSource.listBodyMeasurements('tudo', { pageSize: pedido })

      /*
       * `?pageSize=100000` traria a leitura sem corte de volta pela porta dos
       * fundos — e "tudo" é justamente a janela que não recorta nada.
       */
      expect(pagina.pageSize).toBe(esperado)
    }
  })
})

describe('getBodySeries', () => {
  it('pede ao banco o balde que a régua da aplicação manda', async () => {
    for (const periodo of ['7d', '3m', '1a', 'tudo'] as const) {
      const falso = clienteFalso({ rpcs: { serie_de_peso: { data: [], error: null } } })
      await falso.dataSource.getBodySeries(periodo)

      const args = falso.argsDaRpc('serie_de_peso')!
      /*
       * O balde sai de `baldes-da-serie.ts`. Escrevê-lo em SQL criaria uma
       * segunda régua, e a tela rotularia por uma enquanto o banco agrupa por
       * outra.
       */
      expect(args.p_balde, periodo).toBe(baldeDoPeriodo(periodo))
      expect(args.p_user_profile_id, periodo).toBeNull()
    }
  })

  it('manda janela nula em "tudo", e uma data nas outras', async () => {
    const tudo = clienteFalso({ rpcs: { serie_de_peso: { data: [], error: null } } })
    await tudo.dataSource.getBodySeries('tudo')
    expect(tudo.argsDaRpc('serie_de_peso')!.p_desde).toBeNull()

    const ano = clienteFalso({ rpcs: { serie_de_peso: { data: [], error: null } } })
    await ano.dataSource.getBodySeries('1a')
    expect(typeof ano.argsDaRpc('serie_de_peso')!.p_desde).toBe('string')
  })

  it('passa o perfil quando é o histórico de outra pessoa', async () => {
    const falso = clienteFalso({ rpcs: { serie_de_peso: { data: [], error: null } } })
    await falso.dataSource.getBodySeries('1a', PERFIL)
    expect(falso.argsDaRpc('serie_de_peso')!.p_user_profile_id).toBe(PERFIL)
  })

  it('não lê a tabela de pesagens quando a função responde', async () => {
    const falso = clienteFalso({
      rpcs: {
        serie_de_peso: {
          data: [{ instante: '2026-10-01T07:00:00Z', peso: '80.2', medicoes: '3' }],
          error: null,
        },
      },
    })

    const serie = await falso.dataSource.getBodySeries('1a')

    /*
     * O ponto do agrupamento: desenhar o gráfico deixa de trazer linha
     * nenhuma. Se um dia isto cair, a série voltou a sair da tabela.
     */
    expect(falso.todasParaTabela('body_measurements')).toHaveLength(0)
    expect(serie).toEqual([{ instante: '2026-10-01T07:00:00Z', pesoKg: 80.2, medicoes: 3 }])
  })

  it('sem a 0052, agrupa na aplicação com teto escrito', async () => {
    const falso = clienteFalso({
      rpcs: {
        serie_de_peso: {
          data: null,
          error: { code: 'PGRST202', message: 'Could not find the function' },
        },
      },
      tabelas: {
        body_measurements: [
          {
            data: [
              /* Três no mesmo dia, em ordem decrescente como a consulta pede. */
              { measured_at: '2026-10-05T21:00:00Z', weight_kg: 81.2 },
              { measured_at: '2026-10-05T13:00:00Z', weight_kg: 80.6 },
              { measured_at: '2026-10-05T07:00:00Z', weight_kg: 80.0 },
              { measured_at: '2026-10-04T07:00:00Z', weight_kg: 80.4 },
            ],
            error: null,
          },
        ],
      },
    })

    const serie = await falso.dataSource.getBodySeries('30d')

    /* Dois pontos para quatro pesagens, e o do dia cheio é a **última**. */
    expect(serie).toHaveLength(2)
    expect(serie[1]).toEqual({
      instante: '2026-10-05T21:00:00Z',
      pesoKg: 81.2,
      medicoes: 3,
    })
    /* Crescente, como o gráfico lê. */
    expect(serie[0].instante < serie[1].instante).toBe(true)

    /*
     * E o teto é desta função, não do servidor. Sem ele a volta ao caminho
     * antigo reintroduziria o corte silencioso que a migration conserta.
     */
    const limite = falso.paraTabela('body_measurements')!.passos.find((p) => p.metodo === 'limit')
    expect(limite?.args[0]).toBe(1000)
  })

  it('não engole erro que não seja migration faltando', async () => {
    const falso = clienteFalso({
      rpcs: {
        serie_de_peso: { data: null, error: { code: '42501', message: 'permission denied' } },
      },
    })
    await expect(falso.dataSource.getBodySeries('1a')).rejects.toThrow()
  })
})
