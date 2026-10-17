import { describe, expect, it } from 'vitest'

import {
  CONTEUDOS_POR_PAGINA,
  filtroDeSituacao,
  situacaoDoConteudo,
} from '@/features/content/situacao'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID } from '@/lib/database/demo-seed'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── O acervo por página ─────────────────────────────────────────────────────
 *
 * As duas telas de conteúdo liam o acervo inteiro e repartiam na aplicação:
 * publicados, agendados e rascunhos, com o tamanho de cada grupo virando o
 * número do cartão. A leitura não tinha teto, e o PostgREST corta a resposta
 * no teto do servidor **sem erro** — numa academia que publica há anos, as
 * três contagens ficariam menores que a verdade e um rascunho esquecido
 * sumiria sem deixar rastro. É o defeito da 0049 outra vez, noutra tela.
 *
 * A divisão dos testes segue a do projeto: a demonstração tem o conjunto
 * inteiro em memória e portanto **diz qual é a resposta certa**; o cliente de
 * mentira prova que o caminho do Supabase **pede** a mesma coisa — qual filtro
 * vai ao servidor, e de onde sai o total.
 */

const DIA = 86_400_000
const agora = new Date('2026-10-11T12:00:00.000Z')

describe('a situação de um conteúdo', () => {
  it('sem data é rascunho; no passado, publicado; no futuro, agendado', () => {
    const em = (dias: number) => ({
      publishedAt: new Date(agora.getTime() + dias * DIA).toISOString(),
    })

    expect(situacaoDoConteudo({ publishedAt: null }, agora)).toBe('RASCUNHO')
    expect(situacaoDoConteudo(em(-1), agora)).toBe('PUBLICADO')
    expect(situacaoDoConteudo(em(1), agora)).toBe('AGENDADO')
  })

  it('publicar exatamente agora já conta como publicado', () => {
    // A borda importa: um conteúdo agendado para este instante tem de sair.
    expect(situacaoDoConteudo({ publishedAt: agora.toISOString() }, agora)).toBe('PUBLICADO')
  })

  it('filtro desconhecido da barra de endereços vira TODOS, não lista vazia', () => {
    /*
     * `?situacao=lixo` mostrando "nenhum conteúdo" faria a pessoa achar que o
     * acervo sumiu. Mostrar tudo é o pior caso aceitável.
     */
    expect(filtroDeSituacao('lixo')).toBe('TODOS')
    expect(filtroDeSituacao(undefined)).toBe('TODOS')
    expect(filtroDeSituacao('rascunho')).toBe('RASCUNHO')
    expect(filtroDeSituacao('PUBLICADO')).toBe('PUBLICADO')
  })
})

describe('a demonstração diz qual é a resposta certa', () => {
  const fonte = () => new DemoDataSource([])

  it('a contagem é do acervo inteiro, não da página', async () => {
    const [pagina, contagem] = await Promise.all([
      fonte().listContent(DEMO_ORG_ID, { pageSize: 5 }),
      fonte().contarConteudos(DEMO_ORG_ID),
    ])

    expect(contagem.total).toBe(pagina.total)
    expect(contagem.publicados + contagem.agendados + contagem.rascunhos).toBe(contagem.total)
  })

  it('uma página além do fim vem vazia e o total continua de pé', async () => {
    /*
     * A asserção que separa "total do conjunto" de "total da página", sem
     * depender de quantos itens a demonstração tem.
     *
     * Comparar `total` com o tamanho da página não serve aqui: o acervo da
     * demonstração cabe inteiro numa página, e `pageSize` tem piso de 5 — os
     * dois números seriam iguais por acidente, e uma mutação que contasse a
     * página passaria. Foi o que aconteceu, e é por isso que este teste
     * existe nesta forma.
     */
    const longe = await fonte().listContent(DEMO_ORG_ID, { page: 99, pageSize: 5 })
    const contagem = await fonte().contarConteudos(DEMO_ORG_ID)

    expect(longe.rows).toEqual([])
    expect(longe.total).toBe(contagem.total)
    expect(longe.total).toBeGreaterThan(0)
  })

  it('o filtro recorta e só então conta: o total é do filtro', async () => {
    const todos = await fonte().contarConteudos(DEMO_ORG_ID)
    const rascunhos = await fonte().listContent(DEMO_ORG_ID, {
      situacao: 'RASCUNHO',
      pageSize: 200,
    })

    expect(rascunhos.total).toBe(todos.rascunhos)
    expect(rascunhos.rows.every((c) => c.publishedAt === null)).toBe(true)
  })

  it('as páginas somadas são o acervo inteiro, sem repetir nem perder', async () => {
    const inteiro = await fonte().listContent(DEMO_ORG_ID, { pageSize: 200 })
    const tamanho = 3

    const juntas: string[] = []
    for (let p = 1; p <= Math.ceil(inteiro.total / tamanho); p += 1) {
      const pagina = await fonte().listContent(DEMO_ORG_ID, { page: p, pageSize: tamanho })
      juntas.push(...pagina.rows.map((c) => c.id))
    }

    expect(juntas).toEqual(inteiro.rows.map((c) => c.id))
    expect(new Set(juntas).size).toBe(juntas.length)
  })

  it('o acervo da plataforma segue a mesma regra', async () => {
    const [pagina, contagem, longe] = await Promise.all([
      fonte().listSynseContent({ pageSize: 5 }),
      fonte().contarAcervoSynse(),
      fonte().listSynseContent({ page: 99, pageSize: 5 }),
    ])

    expect(pagina.total).toBe(contagem.total)
    // Mesma prova do acervo da academia, aplicada ao da plataforma.
    expect(longe.rows).toEqual([])
    expect(longe.total).toBe(contagem.total)
    // `doPlus` é um recorte dos publicados, nunca maior que eles.
    expect(contagem.doPlus).toBeLessThanOrEqual(contagem.publicados)
  })

  it('o aluno continua vendo o acervo inteiro, e não a primeira página', async () => {
    /*
     * `listPublishedContent` junta o acervo da academia com o da plataforma.
     * Recortar antes de juntar deixaria de fora o que coubesse fora da
     * primeira página — e foi por isso que o helper interno parou de passar
     * por `listContent`.
     */
    const doAluno = await fonte().listPublishedContent(DEMO_ORG_ID, 100)

    expect(doAluno.length).toBeGreaterThan(0)
    expect(doAluno.every((c) => c.publishedAt !== null)).toBe(true)
  })
})

describe('o que o caminho do Supabase pede ao servidor', () => {
  type Chamada = { passos: { metodo: string; args: unknown[] }[] } | undefined
  const passos = (chamada: Chamada) => chamada?.passos ?? []
  const temPasso = (chamada: Chamada, metodo: string) =>
    passos(chamada).some((p) => p.metodo === metodo)

  it('a listagem pede uma faixa e o total, nunca a tabela inteira', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { content_library: [{ data: [], error: null, count: 87 }] },
    })

    const pagina = await dataSource.listContent('org_1', { page: 2, pageSize: 25 })

    const chamada = paraTabela('content_library')
    const range = passos(chamada).find((p) => p.metodo === 'range')
    expect(range?.args).toEqual([25, 49])
    expect(passos(chamada)[0].args[1]).toEqual({ count: 'exact' })
    // O total é o do servidor, e não o tamanho da página devolvida.
    expect(pagina.total).toBe(87)
  })

  it('o filtro de rascunho vai como `is(published_at, null)`', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { content_library: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listContent('org_1', { situacao: 'RASCUNHO' })

    expect(
      passos(paraTabela('content_library')).some(
        (p) => p.metodo === 'is' && p.args[0] === 'published_at' && p.args[1] === null,
      ),
    ).toBe(true)
  })

  it('agendado e publicado se separam por comparação com agora', async () => {
    for (const [situacao, metodo] of [
      ['PUBLICADO', 'lte'],
      ['AGENDADO', 'gt'],
    ] as const) {
      const { dataSource, paraTabela } = clienteFalso({
        tabelas: { content_library: [{ data: [], error: null, count: 0 }] },
      })

      await dataSource.listContent('org_1', { situacao })

      expect(
        passos(paraTabela('content_library')).some(
          (p) => p.metodo === metodo && p.args[0] === 'published_at',
        ),
      ).toBe(true)
    }
  })

  it('o acervo da plataforma é o que não tem dono, e não um id qualquer', async () => {
    // `eq('organization_id', 'synse')` traria conteúdo de academia nenhuma.
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { content_library: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listSynseContent({})

    expect(
      passos(paraTabela('content_library')).some(
        (p) => p.metodo === 'is' && p.args[0] === 'organization_id' && p.args[1] === null,
      ),
    ).toBe(true)
  })

  it('as contagens não trazem linha nenhuma', async () => {
    /*
     * `head: true` é o que separa "contar" de "ler para contar". Sem ele,
     * cinco contagens puxariam cinco vezes o acervo inteiro — trocar um corte
     * silencioso por cinco leituras completas seria piorar.
     */
    const { dataSource, todasParaTabela } = clienteFalso({
      tabelas: {
        content_library: Array.from({ length: 5 }, () => ({ data: null, error: null, count: 3 })),
      },
    })

    await dataSource.contarConteudos('org_1')

    const chamadas = todasParaTabela('content_library')
    expect(chamadas.length).toBe(5)
    for (const chamada of chamadas) {
      expect(chamada.passos[0].args[1]).toEqual({ count: 'exact', head: true })
      expect(temPasso(chamada, 'range')).toBe(false)
    }
  })

  it('o padrão de linhas por página é o da tela, não um número solto', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { content_library: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listContent('org_1')

    const range = passos(paraTabela('content_library')).find((p) => p.metodo === 'range')
    expect(range?.args).toEqual([0, CONTEUDOS_POR_PAGINA - 1])
  })
})
