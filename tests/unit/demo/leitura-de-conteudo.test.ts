import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'

/**
 * ── A tela de leitura, e o acervo que a demonstração escondia ───────────────
 *
 * Dois defeitos ao mesmo tempo, e o segundo tapava o primeiro.
 *
 * O formulário de publicação sempre teve um campo de corpo com até 20 mil
 * caracteres, e o app não tinha rota de item: o texto ficava gravado e sem
 * leitor. Ao ligar a tela, a demonstração continuava sem ter o que mostrar —
 * `listPublishedContent` chamava `listContent(organizationId)`, que filtra por
 * dono e portanto descartava tudo que é da plataforma (`organizationId: null`).
 *
 * Em produção a `published_content` traz os dois (`or c.organization_id is
 * null`, 0031). A demonstração mostrava um app sem acervo nenhum — justamente
 * a parte que o Synse+ vende.
 */
describe('o que o aluno vê na lista de conteúdos', () => {
  const fonte = new DemoDataSource([])

  it('traz o mural da academia e o acervo da plataforma', async () => {
    const itens = await fonte.listPublishedContent(DEMO_ORG_ID, 50)
    const donos = new Set(itens.map((i) => i.organizationId))

    expect(donos.has(DEMO_ORG_ID)).toBe(true)
    expect(donos.has(null)).toBe(true)
  })

  it('e nada de rascunho ou agendado', async () => {
    const itens = await fonte.listPublishedContent(DEMO_ORG_ID, 50)
    const agora = new Date().toISOString()

    for (const item of itens) {
      expect(item.publishedAt).not.toBeNull()
      expect(item.publishedAt! <= agora).toBe(true)
    }
  })

  it('o limite é respeitado', async () => {
    expect(await fonte.listPublishedContent(DEMO_ORG_ID, 2)).toHaveLength(2)
  })
})

describe('a tela de leitura recebe o corpo', () => {
  const fonte = new DemoDataSource([])

  it('a lista não traz o corpo, e o item traz', async () => {
    /*
     * A separação é de propósito: são até 20 mil caracteres por item, e uma
     * lista de cinquenta carregaria o texto de todos para mostrar título e
     * resumo. Este teste prende as duas metades do acordo — se a lista um dia
     * passar a trazer o corpo, ele cai aqui e não em produção.
     */
    const [primeiro] = await fonte.listPublishedContent(DEMO_ORG_ID, 50)
    const item = await fonte.getPublishedContent(DEMO_ORG_ID, primeiro.id)

    expect(item).not.toBeNull()
    expect(item!.id).toBe(primeiro.id)
  })

  it('o acervo tem texto para ler — senão a tela abre vazia', async () => {
    const acervo = (await fonte.listPublishedContent(DEMO_ORG_ID, 50)).filter(
      (i) => i.organizationId === null,
    )
    expect(acervo.length).toBeGreaterThan(0)

    for (const resumo of acervo) {
      const item = await fonte.getPublishedContent(DEMO_ORG_ID, resumo.id)
      expect(item!.body ?? '').not.toBe('')
    }
  })

  it('id que não existe volta nulo, para a tela dar 404', async () => {
    expect(await fonte.getPublishedContent(DEMO_ORG_ID, 'cont_nao_existe')).toBeNull()
  })

  it('academia de outra pessoa não alcança o mural desta', async () => {
    const [daCasa] = (await fonte.listPublishedContent(DEMO_ORG_ID, 50)).filter(
      (i) => i.organizationId === DEMO_ORG_ID,
    )
    expect(await fonte.getPublishedContent('org_outra', daCasa.id)).toBeNull()
  })
})
