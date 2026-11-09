import { describe, expect, it } from 'vitest'

import { eventosPorDia, tituloDoEvento } from '@/features/crm/state'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
import type { DemoMutation } from '@/lib/database/demo-journal'
import { STAGE_LABELS } from '@/lib/validations/lead'
import type { LeadEvent, LeadStage } from '@/types/domain'

/**
 * ── A ficha do lead ─────────────────────────────────────────────────────────
 *
 * `listLeadEvents` estava no data source desde a 0028, o gatilho gravava cada
 * passagem de etapa, cada ligação registrada ia para `lead_events` — e
 * nenhuma tela lia. A recepção anotava "liguei, pediu para retornar na
 * quinta", via "Registrado no histórico", e não havia histórico à vista.
 *
 * Num CRM isso anula o módulo: o valor de um funil não é saber em que etapa a
 * pessoa está, é saber o que já foi tentado com ela.
 */

const EVENTO = (parcial: Partial<LeadEvent>): LeadEvent => ({
  id: 'ev',
  leadId: 'lead_0001',
  kind: 'NOTE',
  fromStage: null,
  toStage: null,
  body: null,
  actorName: null,
  createdAt: '2026-09-10T14:00:00.000Z',
  ...parcial,
})

const rotulo = (etapa: LeadStage) => STAGE_LABELS[etapa]

describe('o título de cada linha do histórico', () => {
  it('contato comum usa o rótulo do tipo', () => {
    expect(tituloDoEvento(EVENTO({ kind: 'CALL' }), rotulo)).toBe('Ligação')
    expect(tituloDoEvento(EVENTO({ kind: 'VISIT' }), rotulo)).toBe('Visita')
  })

  it('mudança de etapa mostra de onde para onde', () => {
    const titulo = tituloDoEvento(
      EVENTO({ kind: 'STAGE_CHANGE', fromStage: 'NEW', toStage: 'CONTACTED' }),
      rotulo,
    )
    expect(titulo).toBe('Novo → Contatado')
  })

  it('sem etapa de origem não deixa uma seta solta', () => {
    /*
     * Acontece de verdade: o gatilho da 0028 grava `from_stage` nulo na
     * criação. "→ Novo" pareceria um erro de renderização.
     */
    const titulo = tituloDoEvento(
      EVENTO({ kind: 'STAGE_CHANGE', fromStage: null, toStage: 'NEW' }),
      rotulo,
    )
    expect(titulo).toBe('Entrou em Novo')
    expect(titulo).not.toContain('→')
  })

  it('mudança sem destino cai no rótulo genérico em vez de quebrar', () => {
    expect(tituloDoEvento(EVENTO({ kind: 'STAGE_CHANGE' }), rotulo)).toBe('Mudou de etapa')
  })
})

describe('o agrupamento por dia', () => {
  it('junta o que aconteceu no mesmo dia e ordena do mais recente', () => {
    const dias = eventosPorDia([
      EVENTO({ id: 'c', createdAt: '2026-09-12T09:00:00.000Z' }),
      EVENTO({ id: 'b', createdAt: '2026-09-10T18:00:00.000Z' }),
      EVENTO({ id: 'a', createdAt: '2026-09-10T09:00:00.000Z' }),
    ])

    expect(dias.map((d) => d.dia)).toEqual(['2026-09-12', '2026-09-10'])
    expect(dias[1].eventos.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('não reordena dentro do dia — quem ordena é a consulta', () => {
    /*
     * Ordenar de novo aqui seria uma segunda regra de ordem, e duas regras de
     * ordem divergem. A consulta já devolve o mais recente primeiro.
     */
    const dias = eventosPorDia([
      EVENTO({ id: 'primeiro', createdAt: '2026-09-10T09:00:00.000Z' }),
      EVENTO({ id: 'segundo', createdAt: '2026-09-10T18:00:00.000Z' }),
    ])
    expect(dias[0].eventos.map((e) => e.id)).toEqual(['primeiro', 'segundo'])
  })

  it('lista vazia devolve nenhum dia, e não um dia vazio', () => {
    expect(eventosPorDia([])).toEqual([])
  })
})

// ── A demonstração ──────────────────────────────────────────────────────────

/**
 * Um lead que **não** está perdido nem matriculado.
 *
 * Era `leads[0]`, e isso tornou o teste frágil de um jeito que só aparece em
 * certos dias: a semente é determinística para uma data, não entre datas —
 * `createdAt` sai de `DEMO_NOW`, e um ramo a mais num dia desloca a sequência
 * do gerador, mudando a etapa que cada lead recebe. Em 02/10 o `lead_0001`
 * era TRIAL_CLASS; em 03/10 nasceu LOST, e o teste que marcava "perdido com
 * motivo" passou a cair — `moveLeadStage` não faz nada quando a etapa já é a
 * pedida, então o motivo lido era o da semente.
 *
 * Escolher pela **situação**, e não pela posição, vale em qualquer dia.
 */
const UM_LEAD = (() => {
  const emNegociacao = getDemoDataset().leads.find(
    (l) => l.stage !== 'LOST' && l.stage !== 'ENROLLED',
  )
  if (!emNegociacao) throw new Error('A semente ficou sem lead em negociação.')
  return emNegociacao.id
})()

describe('o histórico na demonstração', () => {
  it('a semente já traz uma história para cada lead', async () => {
    /*
     * Sem isto a ficha abriria vazia em toda a demonstração, e a tela nova
     * pareceria a tela quebrada — que é pior que não ter a tela.
     */
    const fonte = new DemoDataSource([])
    const eventos = await fonte.listLeadEvents(DEMO_ORG_ID, UM_LEAD)

    expect(eventos.length).toBeGreaterThan(0)
    expect(eventos.some((e) => e.kind === 'CREATED')).toBe(true)
    // Mais recente primeiro, como a ficha desenha.
    expect(eventos[0].createdAt >= eventos[eventos.length - 1].createdAt).toBe(true)
  })

  it('o contato registrado pelo visitante sobrevive ao recarregar', async () => {
    /*
     * O defeito que o diário corrige: `demoLeadEvents` é campo de instância, e
     * o data source é remontado a cada requisição. Registrar uma ligação
     * mostrava "Registrado no histórico" e o histórico voltava sem ela.
     */
    const diario: DemoMutation[] = [
      { t: 'lead', id: UM_LEAD, a: 'event', k: 'CALL', b: 'Retornou e quer visitar sábado.' },
    ]
    const depoisDoRecarregar = new DemoDataSource(diario)
    const eventos = await depoisDoRecarregar.listLeadEvents(DEMO_ORG_ID, UM_LEAD)

    expect(eventos.some((e) => e.body === 'Retornou e quer visitar sábado.')).toBe(true)
  })

  it('a mudança de etapa também, com o evento que ela gera', async () => {
    const fonte = new DemoDataSource([{ t: 'lead', id: UM_LEAD, a: 'stage', s: 'PROPOSAL' }])

    const lead = await fonte.getLead(DEMO_ORG_ID, UM_LEAD)
    expect(lead?.stage).toBe('PROPOSAL')

    const eventos = await fonte.listLeadEvents(DEMO_ORG_ID, UM_LEAD)
    expect(eventos.some((e) => e.kind === 'STAGE_CHANGE' && e.toStage === 'PROPOSAL')).toBe(true)
  })

  it('a perda guarda o motivo, que é o que explica a conversão depois', async () => {
    const fonte = new DemoDataSource([
      { t: 'lead', id: UM_LEAD, a: 'stage', s: 'LOST', b: 'Achou caro.' },
    ])

    const lead = await fonte.getLead(DEMO_ORG_ID, UM_LEAD)
    expect(lead?.stage).toBe('LOST')
    expect(lead?.lostReason).toBe('Achou caro.')
  })

  it('a conversão sobrevive e aponta o aluno', async () => {
    const fonte = new DemoDataSource([{ t: 'lead', id: UM_LEAD, a: 'convert' }])

    const lead = await fonte.getLead(DEMO_ORG_ID, UM_LEAD)
    expect(lead?.stage).toBe('ENROLLED')
    expect(lead?.convertedStudentId).toBeTruthy()
  })

  it('e o histórico de um lead não aparece no de outro', async () => {
    // Outro lead qualquer, desde que não seja o mesmo — pela mesma razão de
    // `UM_LEAD` não ser mais `leads[0]`: posição fixa na semente não é estável
    // entre dias, e aqui o teste chegou a comparar um lead com ele mesmo.
    const outro = getDemoDataset().leads.find((l) => l.id !== UM_LEAD)!.id
    const fonte = new DemoDataSource([
      { t: 'lead', id: UM_LEAD, a: 'event', k: 'NOTE', b: 'só deste' },
    ])

    const eventos = await fonte.listLeadEvents(DEMO_ORG_ID, outro)
    expect(eventos.every((e) => e.leadId === outro)).toBe(true)
    expect(eventos.some((e) => e.body === 'só deste')).toBe(false)
  })
})
