import { describe, expect, it } from 'vitest'

import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'

/**
 * ── A vitrine do cadeado, na demonstração ───────────────────────────────────
 *
 * Em produção quem decide é o banco: a RLS esconde o conteúdo pago e
 * `acervo_trancado` (0041) devolve o anúncio. A demonstração não tem RLS
 * nenhuma, e sem este tratamento o aluno do plano grátis leria o e-book
 * inteiro — a persona "Aluno no plano grátis" existe justamente para mostrar
 * a oferta, e mostraria o contrário dela.
 *
 * O risco que estes testes guardam é o mesmo do lado do banco: vitrine que
 * entrega o produto.
 */

const semPlus = () => new DemoDataSource([], { temPlus: false })
const comPlus = () => new DemoDataSource([], { temPlus: true })

const TITULO_PAGO = 'E-book: hipertrofia sem achismo'

describe('quem não assina', () => {
  it('não encontra o item pago na lista do que dá para ler', async () => {
    const itens = await semPlus().listPublishedContent(DEMO_ORG_ID, 50)
    expect(itens.map((i) => i.title)).not.toContain(TITULO_PAGO)
  })

  it('mas o encontra na vitrine', async () => {
    const vitrine = await semPlus().listLockedShowcase()
    expect(vitrine.map((i) => i.title)).toContain(TITULO_PAGO)
  })

  it('e a vitrine não tem onde guardar o corpo', async () => {
    /*
     * A garantia é de tipo, não de disciplina: `ItemTrancado` não declara
     * `body` nem `mediaUrl`, então nem um descuido de mapeamento os coloca na
     * resposta. Este teste confere que o mapeamento também não os contrabandeia
     * por fora do tipo.
     */
    const [item] = await semPlus().listLockedShowcase()
    expect(Object.keys(item).sort()).toEqual(
      ['coverUrl', 'id', 'pinned', 'publishedAt', 'summary', 'title', 'type'].sort(),
    )
  })

  it('abrindo o item direto pelo id, também não recebe o conteúdo', async () => {
    /*
     * A lista filtra; o endereço não passa por lista nenhuma. É por aqui que
     * um paywall costuma vazar.
     */
    const fonte = semPlus()
    const [anuncio] = await fonte.listLockedShowcase()

    expect(await fonte.getPublishedContent(DEMO_ORG_ID, anuncio.id)).toBeNull()
  })

  it('o conteúdo aberto continua chegando', async () => {
    // O cadeado não pode ter fechado o que era para ficar aberto.
    const itens = await semPlus().listPublishedContent(DEMO_ORG_ID, 50)
    expect(itens.map((i) => i.title)).toContain('Como montar sua primeira semana de treino')
  })
})

describe('quem assina', () => {
  it('lê o item pago, com o corpo', async () => {
    const fonte = comPlus()
    const itens = await fonte.listPublishedContent(DEMO_ORG_ID, 50)
    const pago = itens.find((i) => i.title === TITULO_PAGO)

    expect(pago).toBeDefined()

    const completo = await fonte.getPublishedContent(DEMO_ORG_ID, pago!.id)
    expect(completo!.body ?? '').not.toBe('')
  })

  it('e não recebe vitrine nenhuma, porque seria a mesma prateleira duas vezes', async () => {
    expect(await comPlus().listLockedShowcase()).toEqual([])
    const fonte = comPlus()
    const [qualquer] = await fonte.listPublishedContent(DEMO_ORG_ID, 50)
    expect(await fonte.getLockedShowcase(qualquer.id)).toBeNull()
  })
})
