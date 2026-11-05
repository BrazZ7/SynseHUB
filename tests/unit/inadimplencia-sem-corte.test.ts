import { describe, expect, it } from 'vitest'

import { clienteFalso } from './postgrest-falso'
import { CORTES_DAS_FAIXAS, janelaDaFaixa } from '@/features/payments/faixas-de-atraso'

/**
 * ── A inadimplência sem corte (0051) ────────────────────────────────────────
 *
 * Aqui se testa **qual consulta saiu**. A semântica do SQL — as faixas, o
 * aluno que deve dois meses, o isolamento entre academias — fica em
 * `tests/db/inadimplencia.test.ts`, contra Postgres de verdade.
 *
 * O que importa provar deste lado:
 *
 *   o filtro de faixa vai para o **servidor**, e não sobre a página já lida;
 *   a contagem total vem do PostgREST, e não do tamanho da página;
 *   a RPC recebe o mesmo dia e os mesmos cortes que a tela usa;
 *   sem a 0051, volta a somar na aplicação em vez de deixar a tela sem número.
 */

const ORG = 'org-1'
const HOJE = new Date(2026, 9, 7)

const linha = (id: string, dueDate: string, amount = 100) => ({
  id,
  organization_id: ORG,
  student_id: `aluno-${id}`,
  due_date: dueDate,
  amount,
  status: 'OVERDUE',
})

/** Os passos de uma chamada, achatados em `metodo:arg0`. */
const passosDe = (chamada: { passos: { metodo: string; args: unknown[] }[] } | undefined) =>
  (chamada?.passos ?? []).map((p) => `${p.metodo}:${String(p.args[0])}`)

describe('listOverdueCharges', () => {
  it('manda a faixa para a consulta, como janela de vencimento', async () => {
    const falso = clienteFalso({
      tabelas: { charges: [{ data: [linha('c1', '2026-09-25')], error: null, count: 1 }] },
    })

    await falso.dataSource.listOverdueCharges(ORG, { faixa: '6-15', hoje: HOJE })

    const passos = passosDe(falso.paraTabela('charges'))
    const esperada = janelaDaFaixa('6-15', HOJE)

    /*
     * Mais atraso é vencimento mais **antigo**, então o fim da faixa em dias
     * vira o começo dela em datas. Inverter os dois é o erro natural, e é por
     * isso que o teste confere os dois lados e não só a presença do filtro.
     */
    expect(passos).toContain(`gte:due_date`)
    expect(passos).toContain(`lte:due_date`)
    const gte = falso.paraTabela('charges')!.passos.find((p) => p.metodo === 'gte')
    const lte = falso.paraTabela('charges')!.passos.find((p) => p.metodo === 'lte')
    expect(gte?.args[1]).toBe(esperada.de)
    expect(lte?.args[1]).toBe(esperada.ate)
    expect(esperada.de! < esperada.ate!).toBe(true)
  })

  it('não põe limite de data na primeira faixa, por causa do piso em zero', async () => {
    const falso = clienteFalso({ tabelas: { charges: [{ data: [], error: null, count: 0 }] } })

    await falso.dataSource.listOverdueCharges(ORG, { faixa: '1-5', hoje: HOJE })

    /*
     * Cobrança marcada como vencida com data futura tem zero dia de atraso e
     * pertence à primeira faixa. Um `lte` em `hoje` a excluiria da lista
     * enquanto o resumo do banco continuaria contando-a — e a tela mostraria
     * "4" num filtro que abre com três linhas.
     */
    const passos = passosDe(falso.paraTabela('charges'))
    expect(passos).toContain('gte:due_date')
    expect(passos).not.toContain('lte:due_date')
  })

  it('não filtra nada quando a faixa é todas', async () => {
    const falso = clienteFalso({ tabelas: { charges: [{ data: [], error: null, count: 0 }] } })

    await falso.dataSource.listOverdueCharges(ORG, { faixa: 'ALL', hoje: HOJE })

    const passos = passosDe(falso.paraTabela('charges'))
    expect(passos.filter((p) => p.startsWith('gte') || p.startsWith('lte'))).toEqual([])
  })

  it('tira o total da contagem do servidor, não do tamanho da página', async () => {
    const falso = clienteFalso({
      tabelas: {
        charges: [
          { data: [linha('c1', '2026-09-01'), linha('c2', '2026-09-02')], error: null, count: 137 },
        ],
      },
    })

    const pagina = await falso.dataSource.listOverdueCharges(ORG, { page: 2, pageSize: 25 })

    /*
     * Duas linhas na resposta e 137 no total: era exatamente este o defeito —
     * a tela dizia o tamanho do que coube em vez do tamanho do que existe.
     */
    expect(pagina.rows).toHaveLength(2)
    expect(pagina.total).toBe(137)
    expect(pagina.page).toBe(2)

    const passos = falso.paraTabela('charges')!.passos
    expect(passos.find((p) => p.metodo === 'select')?.args[1]).toEqual({ count: 'exact' })
    expect(passos.find((p) => p.metodo === 'range')?.args).toEqual([25, 49])
  })

  it('prende o tamanho da página entre 5 e 200', async () => {
    /*
     * `?pageSize=` vem da URL. Sem piso, `1` transformaria a tela num pedido
     * por linha; sem teto, `100000` traria a leitura sem corte de volta pela
     * porta dos fundos — que é justamente o defeito que a 0051 fecha.
     */
    for (const [pedido, esperado] of [
      [1, 5],
      [100000, 200],
    ] as const) {
      const falso = clienteFalso({ tabelas: { charges: [{ data: [], error: null, count: 0 }] } })
      const pagina = await falso.dataSource.listOverdueCharges(ORG, { pageSize: pedido })

      expect(pagina.pageSize).toBe(esperado)
      expect(falso.paraTabela('charges')!.passos.find((p) => p.metodo === 'range')?.args).toEqual([
        0,
        esperado - 1,
      ])
    }
  })

  it('traz a mais antiga primeiro, que é a ordem de quem cobra', async () => {
    const falso = clienteFalso({ tabelas: { charges: [{ data: [], error: null, count: 0 }] } })

    await falso.dataSource.listOverdueCharges(ORG)

    const ordem = falso.paraTabela('charges')!.passos.find((p) => p.metodo === 'order')
    expect(ordem?.args).toEqual(['due_date', { ascending: true }])
  })
})

describe('getOverdueSummary', () => {
  it('pede ao banco o mesmo dia e os mesmos cortes que a tela usa', async () => {
    const falso = clienteFalso({
      rpcs: {
        resumo_de_inadimplencia: {
          data: [{ faixa: 0, cobrancas: 11, alunos: 10, valor: 1036, dias_total: 236 }],
          error: null,
        },
      },
    })

    await falso.dataSource.getOverdueSummary(ORG, HOJE)

    /*
     * Os cortes saem de `faixas-de-atraso.ts` e viram argumento. Se alguém os
     * repetisse em SQL, a tela rotularia por uma régua e o banco contaria por
     * outra — e nada quebraria até alguém reparar num "7 dias" dentro do
     * filtro de 1 a 5.
     */
    expect(falso.argsDaRpc('resumo_de_inadimplencia')).toEqual({
      p_organization_id: ORG,
      p_hoje: '2026-10-07',
      p_cortes: [...CORTES_DAS_FAIXAS],
    })
  })

  it('separa a linha de total das linhas de faixa', async () => {
    const falso = clienteFalso({
      rpcs: {
        resumo_de_inadimplencia: {
          data: [
            { faixa: 0, cobrancas: 11, alunos: 10, valor: 1036, dias_total: 236 },
            { faixa: 1, cobrancas: 4, alunos: 4, valor: 350, dias_total: 8 },
            { faixa: 4, cobrancas: 3, alunos: 3, valor: 300, dias_total: 161 },
          ],
          error: null,
        },
      },
    })

    const resumo = await falso.dataSource.getOverdueSummary(ORG, HOJE)

    /*
     * `alunos` é 10 e `cobrancas` é 11 de propósito: um aluno deve dois meses.
     * Somar as faixas daria 7 cobranças e 7 alunos, e os dois estariam errados.
     */
    expect(resumo).toEqual({
      cobrancas: 11,
      alunos: 10,
      valor: 1036,
      dias: 236,
      porFaixa: { '1-5': 4, '6-15': 0, '16-30': 0, '30+': 3 },
    })
  })

  it('devolve zero em toda faixa que o banco não mandou', async () => {
    const falso = clienteFalso({
      rpcs: {
        resumo_de_inadimplencia: {
          data: [{ faixa: 0, cobrancas: 0, alunos: 0, valor: 0, dias_total: 0 }],
          error: null,
        },
      },
    })

    const resumo = await falso.dataSource.getOverdueSummary(ORG, HOJE)

    /*
     * A função só devolve faixa que tem alguém. Faixa ausente é zero, e não
     * `undefined`: a tela imprime o número direto no chip do filtro.
     */
    expect(resumo.porFaixa).toEqual({ '1-5': 0, '6-15': 0, '16-30': 0, '30+': 0 })
  })

  it('sem a 0051, soma na aplicação em vez de deixar a tela sem número', async () => {
    const falso = clienteFalso({
      rpcs: {
        resumo_de_inadimplencia: {
          data: null,
          /* `PGRST202`: a função não existe neste banco ainda. */
          error: { code: 'PGRST202', message: 'Could not find the function' },
        },
      },
      tabelas: {
        charges: [
          {
            data: [
              { student_id: 'a1', amount: 100, due_date: '2026-10-05' },
              { student_id: 'a1', amount: 150, due_date: '2026-08-01' },
              { student_id: 'a2', amount: 200, due_date: '2026-09-25' },
            ],
            error: null,
          },
        ],
      },
    })

    const resumo = await falso.dataSource.getOverdueSummary(ORG, HOJE)

    /* 2 dias, 67 dias, 12 dias — primeira faixa, última, e a do meio. */
    expect(resumo).toEqual({
      cobrancas: 3,
      alunos: 2,
      valor: 450,
      dias: 2 + 67 + 12,
      porFaixa: { '1-5': 1, '6-15': 1, '16-30': 0, '30+': 1 },
    })
  })

  it('não engole erro que não seja migration faltando', async () => {
    const falso = clienteFalso({
      rpcs: {
        resumo_de_inadimplencia: {
          data: null,
          error: { code: '42501', message: 'permission denied' },
        },
      },
    })

    await expect(falso.dataSource.getOverdueSummary(ORG, HOJE)).rejects.toThrow()
  })
})
