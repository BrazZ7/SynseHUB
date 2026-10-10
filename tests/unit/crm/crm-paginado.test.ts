import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── O CRM paginado ──────────────────────────────────────────────────────────
 *
 * Lead entra no CRM e não sai. A tela lia **todos** os leads da academia e
 * montava com eles três coisas: os quatro cartões, o funil e a lista "Já
 * decididos". A leitura não tinha teto, e o PostgREST corta a resposta no teto
 * configurado no servidor sem dar erro.
 *
 * O corte caía no pior lugar possível: a ordem põe o retorno mais atrasado
 * primeiro, então o que sobrava eram justamente os contatos vencidos, e sumia
 * quem ainda estava morno. "Retorno atrasado" acertava por acidente — os
 * outros três números erravam.
 *
 * ── Como os testes se dividem ───────────────────────────────────────────────
 *
 * A demonstração é a especificação: ela tem o conjunto inteiro em memória, não
 * tem o que cortar, e portanto diz qual é a resposta certa. Os testes do
 * cliente de mentira provam que o caminho do Supabase **pede** a mesma coisa:
 * qual filtro vai ao servidor, e de onde sai o total.
 */

const fonte = () => new DemoDataSource([])

describe('as duas listas da demonstração', () => {
  it('o funil traz quem está em negociação, e nunca quem já decidiu', async () => {
    const { rows } = await fonte().listLeads(DEMO_ORG_ID, { pageSize: 200 })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((lead) => lead.stage === 'ENROLLED' || lead.stage === 'LOST')).toBe(false)
  })

  it('"Já decididos" traz só matriculado e perdido', async () => {
    const { rows } = await fonte().listLeads(DEMO_ORG_ID, { decided: true, pageSize: 200 })

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((lead) => lead.stage === 'ENROLLED' || lead.stage === 'LOST')).toBe(true)
  })

  it('as duas juntas são o CRM inteiro, sem repetir nem perder ninguém', async () => {
    /*
     * A asserção que impede o recorte de inventar uma terceira categoria: uma
     * etapa nova que caísse fora dos dois filtros desapareceria da tela sem
     * ninguém notar, porque cada lista sozinha continuaria parecendo certa.
     */
    const f = fonte()
    const funil = await f.listLeads(DEMO_ORG_ID, { pageSize: 500 })
    const decididos = await f.listLeads(DEMO_ORG_ID, { decided: true, pageSize: 500 })

    const ids = [...funil.rows, ...decididos.rows].map((lead) => lead.id)
    const resumo = await f.getCrmSummary(DEMO_ORG_ID)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(resumo.emNegociacao + resumo.matriculados + resumo.perdidos)
  })

  it('recorta e só então conta: o total é do filtro', async () => {
    /*
     * O defeito que isto tranca. O rodapé lia o total da academia e mostrava
     * uma página — era "478 alunos" da lista de alunos, com outro nome.
     */
    const f = fonte()
    const tudo = await f.listLeads(DEMO_ORG_ID, { decided: true, pageSize: 500 })
    // 5 é o piso de `pageSize` nos dois data sources; pedir 3 vira 5.
    const umaPagina = await f.listLeads(DEMO_ORG_ID, { decided: true, pageSize: 5 })

    expect(umaPagina.rows).toHaveLength(5)
    expect(umaPagina.total).toBe(tudo.total)
    expect(umaPagina.total).toBeGreaterThan(5)

    /*
     * E a âncora independente: comparar as duas chamadas entre si não basta,
     * porque um total que ignora o filtro erra igual nas duas e o teste
     * passaria. `matriculados + perdidos` vem de outra contagem, então só bate
     * se o recorte valeu.
     */
    const resumo = await f.getCrmSummary(DEMO_ORG_ID)
    expect(umaPagina.total).toBe(resumo.matriculados + resumo.perdidos)
  })

  it('paginar não repete nem perde ninguém', async () => {
    const f = fonte()
    const tudo = (await f.listLeads(DEMO_ORG_ID, { decided: true, pageSize: 500 })).rows.map(
      (lead) => lead.id,
    )

    const pedaços: string[] = []
    for (let pagina = 1; pedaços.length < tudo.length; pagina += 1) {
      const { rows } = await f.listLeads(DEMO_ORG_ID, { decided: true, page: pagina, pageSize: 5 })
      if (rows.length === 0) break
      pedaços.push(...rows.map((lead) => lead.id))
    }

    expect(pedaços).toEqual(tudo)
    expect(new Set(pedaços).size).toBe(tudo.length)
  })

  it('a ordem põe o retorno mais atrasado primeiro', async () => {
    /*
     * Não é estética: é a ordem que decide quem fica de fora quando a lista é
     * cortada, e era por ela que o corte comia justamente quem estava morno.
     */
    const { rows } = await fonte().listLeads(DEMO_ORG_ID, { pageSize: 200 })
    const comRetorno = rows.filter((lead) => lead.nextFollowUpAt)

    expect(comRetorno.length).toBeGreaterThan(1)
    expect(rows.slice(0, comRetorno.length)).toEqual(comRetorno)
    for (let i = 1; i < comRetorno.length; i += 1) {
      expect(comRetorno[i - 1].nextFollowUpAt! <= comRetorno[i].nextFollowUpAt!).toBe(true)
    }
  })
})

describe('os quatro cartões da demonstração', () => {
  it('contam o CRM inteiro, e não a página', async () => {
    const f = fonte()
    const resumo = await f.getCrmSummary(DEMO_ORG_ID)
    const funil = await f.listLeads(DEMO_ORG_ID, { pageSize: 5 })

    expect(funil.rows).toHaveLength(5)
    expect(resumo.emNegociacao).toBe(funil.total)
    expect(resumo.emNegociacao).toBeGreaterThan(5)
  })

  it('"retorno atrasado" é só de quem ainda está em negociação', async () => {
    /*
     * Retorno vencido de quem já matriculou ou já desistiu não é trabalho
     * pendente, é resíduo — e contá-lo encheria o cartão de alarme falso que
     * nunca zera, porque ninguém volta para desmarcar o retorno de um lead
     * perdido.
     */
    const f = fonte()
    const resumo = await f.getCrmSummary(DEMO_ORG_ID)
    const agora = new Date().toISOString()

    const decididos = await f.listLeads(DEMO_ORG_ID, { decided: true, pageSize: 500 })
    const decididosAtrasados = decididos.rows.filter(
      (lead) => lead.nextFollowUpAt && lead.nextFollowUpAt < agora,
    )

    const funil = await f.listLeads(DEMO_ORG_ID, { pageSize: 500 })
    const abertosAtrasados = funil.rows.filter(
      (lead) => lead.nextFollowUpAt && lead.nextFollowUpAt < agora,
    )

    expect(resumo.retornoAtrasado).toBe(abertosAtrasados.length)
    // O controle: se não houvesse decidido com retorno vencido, o teste acima
    // passaria contando os dois conjuntos juntos.
    expect(decididosAtrasados.length).toBeGreaterThan(0)
  })
})

describe('o que o caminho do Supabase pede', () => {
  const LEAD = {
    id: 'lead-1',
    organization_id: 'org-1',
    name: 'Joana',
    phone: null,
    email: null,
    source: 'WALK_IN',
    stage: 'NEW',
    interest_plan_id: null,
    owner_staff_id: null,
    next_follow_up_at: null,
    lost_reason: null,
    notes: null,
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
    staff: null,
  }

  it('o funil exclui as etapas decididas no servidor', async () => {
    const t = clienteFalso({ tabelas: { leads: [{ data: [LEAD], error: null, count: 41 }] } })

    const r = await t.dataSource.listLeads('org-1', { pageSize: 150 })

    expect(t.paraTabela('leads')!.passos).toEqual(
      expect.arrayContaining([{ metodo: 'not', args: ['stage', 'in', '(ENROLLED,LOST)'] }]),
    )
    // O total é o do filtro, vindo do `count: 'exact'` — não o da academia.
    expect(r.total).toBe(41)
  })

  it('"Já decididos" pede exatamente as duas etapas', async () => {
    const t = clienteFalso({ tabelas: { leads: [{ data: [], error: null, count: 0 }] } })

    await t.dataSource.listLeads('org-1', { decided: true })

    expect(t.paraTabela('leads')!.passos).toEqual(
      expect.arrayContaining([{ metodo: 'in', args: ['stage', ['ENROLLED', 'LOST']] }]),
    )
  })

  it('a página pedida é a faixa que vai ao servidor', async () => {
    const t = clienteFalso({ tabelas: { leads: [{ data: [], error: null, count: 0 }] } })

    await t.dataSource.listLeads('org-1', { decided: true, page: 3, pageSize: 24 })

    expect(t.paraTabela('leads')!.passos).toEqual(
      expect.arrayContaining([{ metodo: 'range', args: [48, 71] }]),
    )
  })

  it('os quatro números saem de contagem no banco, sem trazer linha', async () => {
    /*
     * `head: true` é o que faz a contagem não ter o que cortar: o Postgres
     * conta e devolve o número no cabeçalho. Quatro consultas em paralelo
     * saem mais baratas que uma leitura da tabela inteira.
     */
    const t = clienteFalso({
      tabelas: {
        leads: [
          { data: null, error: null, count: 41 },
          { data: null, error: null, count: 7 },
          { data: null, error: null, count: 120 },
          { data: null, error: null, count: 33 },
        ],
      },
    })

    const resumo = await t.dataSource.getCrmSummary('org-1')

    expect(resumo).toEqual({
      emNegociacao: 41,
      retornoAtrasado: 7,
      matriculados: 120,
      perdidos: 33,
    })

    const chamadas = t.todasParaTabela('leads')
    expect(chamadas).toHaveLength(4)
    for (const chamada of chamadas) {
      const select = chamada.passos.find((p) => p.metodo === 'select')!
      expect(select.args[1]).toEqual({ count: 'exact', head: true })
    }
  })

  it('"retorno atrasado" exclui quem já decidiu, também no servidor', async () => {
    const t = clienteFalso({
      tabelas: {
        leads: [
          { data: null, error: null, count: 0 },
          { data: null, error: null, count: 0 },
          { data: null, error: null, count: 0 },
          { data: null, error: null, count: 0 },
        ],
      },
    })

    await t.dataSource.getCrmSummary('org-1')

    const atrasados = t
      .todasParaTabela('leads')
      .find((c) => c.passos.some((p) => p.metodo === 'lt' && p.args[0] === 'next_follow_up_at'))

    expect(atrasados).toBeDefined()
    expect(atrasados!.passos).toEqual(
      expect.arrayContaining([{ metodo: 'not', args: ['stage', 'in', '(ENROLLED,LOST)'] }]),
    )
  })
})
