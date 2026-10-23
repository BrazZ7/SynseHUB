import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'

/**
 * ── A fila de avaliação na demonstração ─────────────────────────────────────
 *
 * A demonstração reproduz `fila_de_avaliacao` (0048) inteira, e não por
 * aproximação: ordena **todos** os ativos — nunca avaliado primeiro, depois a
 * avaliação mais antiga, desempate por nome — e só então recorta a página.
 *
 * Cortar antes de ordenar é exatamente o defeito que a migration conserta, e
 * a demonstração ensinando o contrário seria pior que não ter demonstração.
 */

const fonte = () => new DemoDataSource([])

describe('a fila ordena antes de paginar', () => {
  it('o total é o da academia, não o da página', async () => {
    const f = fonte()
    const pagina = await f.listAssessmentQueue(DEMO_ORG_ID, 25, 0)

    expect(pagina.linhas).toHaveLength(25)
    expect(pagina.total).toBeGreaterThan(100)
  })

  it('quem nunca foi avaliado encabeça', async () => {
    const { linhas } = await fonte().listAssessmentQueue(DEMO_ORG_ID, 25, 0)
    expect(linhas[0].assessedAt).toBeNull()
  })

  it('a ordem é a mesma lida de uma vez ou de página em página', async () => {
    /*
     * A asserção que impede o conserto de regredir para "paginar o
     * alfabeto": se a ordenação acontecesse depois do recorte, as páginas
     * emendadas não bateriam com a lista inteira.
     */
    const f = fonte()
    const tudo = await f.listAssessmentQueue(DEMO_ORG_ID, 10_000, 0)

    const emPedacos: string[] = []
    for (let i = 0; i < 75; i += 25) {
      const pagina = await f.listAssessmentQueue(DEMO_ORG_ID, 25, i)
      emPedacos.push(...pagina.linhas.map((l) => l.studentId))
    }

    expect(emPedacos).toEqual(tudo.linhas.slice(0, 75).map((l) => l.studentId))
    expect(new Set(emPedacos).size).toBe(emPedacos.length)
  })

  it('depois dos nunca avaliados, a data só cresce', async () => {
    const { linhas } = await fonte().listAssessmentQueue(DEMO_ORG_ID, 10_000, 0)
    const comData = linhas.filter((l) => l.assessedAt !== null).map((l) => l.assessedAt as string)

    expect(comData.length).toBeGreaterThan(0)
    expect([...comData].sort()).toEqual(comData)
  })

  it('os cartões contam a academia inteira', async () => {
    const f = fonte()
    const resumo = await f.getAssessmentQueueSummary(DEMO_ORG_ID, 90)
    const tudo = await f.listAssessmentQueue(DEMO_ORG_ID, 10_000, 0)

    expect(resumo.ativos).toBe(tudo.total)
    expect(resumo.nuncaAvaliados).toBe(tudo.linhas.filter((l) => l.assessedAt === null).length)
    // E não o número da primeira página, que é o defeito que isto conserta.
    expect(resumo.ativos).toBeGreaterThan(25)
  })

  it('a academia vizinha não entra na fila', async () => {
    const vizinha = await fonte().listAssessmentQueue('org_vizinha', 25, 0)
    expect(vizinha).toEqual({ linhas: [], total: 0 })
  })
})
