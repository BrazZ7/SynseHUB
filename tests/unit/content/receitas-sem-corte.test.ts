import { describe, expect, it } from 'vitest'

import { RECEITAS_POR_PAGINA } from '@/features/nutrition/receitas-por-pagina'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { clienteFalso } from '../postgrest-falso'

/**
 * ── A biblioteca de receitas por página ─────────────────────────────────────
 *
 * `listRecipes` lia o catálogo inteiro, e a tela do aluno agrupava por
 * refeição. A biblioteca cresce a cada publicação da Synse: um dia a leitura
 * encosta no corte silencioso do PostgREST e **um grupo inteiro some** — sem
 * erro, sem aviso, só uma refeição a menos para quem procura o que cozinhar.
 *
 * A tela de plataforma tinha o mesmo defeito noutra forma: os dois cartões
 * contavam sobre o arranjo lido.
 */
const fonte = () => new DemoDataSource([])

describe('a demonstração diz qual é a resposta certa', () => {
  it('a contagem é do catálogo inteiro, e sobrevive a uma página vazia', async () => {
    /*
     * A asserção que separa "total do conjunto" de "total da página" sem
     * depender de quantas receitas existem — a lição da mutação que
     * sobreviveu no acervo.
     */
    const [contagem, longe] = await Promise.all([
      fonte().contarReceitas(),
      fonte().listRecipes({ page: 99 }),
    ])

    expect(longe.rows).toEqual([])
    expect(longe.total).toBe(contagem.total)
    expect(longe.total).toBeGreaterThan(0)
  })

  it('só assinantes é um recorte do total, nunca maior que ele', async () => {
    const { total, doPlus } = await fonte().contarReceitas()
    expect(doPlus).toBeLessThanOrEqual(total)
  })

  it('o filtro por refeição recorta e só então conta', async () => {
    const todas = await fonte().listRecipes({ pageSize: 200 })
    const categoria = todas.rows[0].category
    const daCategoria = await fonte().listRecipes({ categoria, pageSize: 200 })

    expect(daCategoria.rows.every((r) => r.category === categoria)).toBe(true)
    expect(daCategoria.total).toBe(todas.rows.filter((r) => r.category === categoria).length)
    expect(daCategoria.total).toBeLessThan(todas.total)
  })

  it('as páginas somadas são o catálogo inteiro, sem repetir nem perder', async () => {
    const inteiro = await fonte().listRecipes({ pageSize: 200 })
    const tamanho = 5

    const juntas: string[] = []
    for (let p = 1; p <= Math.ceil(inteiro.total / tamanho); p += 1) {
      juntas.push(
        ...(await fonte().listRecipes({ page: p, pageSize: tamanho })).rows.map((r) => r.id),
      )
    }

    expect(juntas).toEqual(inteiro.rows.map((r) => r.id))
    expect(new Set(juntas).size).toBe(juntas.length)
  })

  it('a ordem continua sendo categoria e depois título', async () => {
    // Quem reordena os grupos para a ordem do dia é a tela, não o data source.
    const { rows } = await fonte().listRecipes({ pageSize: 200 })
    const chaves = rows.map((r) => `${r.category}|${r.title}`)

    expect(chaves).toEqual([...chaves].sort())
  })
})

describe('o que o caminho do Supabase pede ao servidor', () => {
  const passos = (c: { passos: { metodo: string; args: unknown[] }[] } | undefined) =>
    c?.passos ?? []

  it('pede uma faixa e o total, nunca a tabela inteira', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { recipes: [{ data: [], error: null, count: 340 }] },
    })

    const pagina = await dataSource.listRecipes({ page: 3, pageSize: 12 })

    const range = passos(paraTabela('recipes')).find((p) => p.metodo === 'range')
    expect(range?.args).toEqual([24, 35])
    expect(pagina.total).toBe(340)
  })

  it('a refeição vai como filtro ao servidor, e não é aplicada depois', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { recipes: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listRecipes({ categoria: 'ALMOCO' })

    expect(
      passos(paraTabela('recipes')).some(
        (p) => p.metodo === 'eq' && p.args[0] === 'category' && p.args[1] === 'ALMOCO',
      ),
    ).toBe(true)
  })

  it('sem refeição escolhida, nenhum filtro de categoria é enviado', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { recipes: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listRecipes({})

    // `eq`, e não qualquer passo: a ordenação também cita `category`.
    expect(
      passos(paraTabela('recipes')).some((p) => p.metodo === 'eq' && p.args[0] === 'category'),
    ).toBe(false)
  })

  it('as duas contagens não trazem linha nenhuma', async () => {
    const { dataSource, todasParaTabela } = clienteFalso({
      tabelas: {
        recipes: [
          { data: null, error: null, count: 9 },
          { data: null, error: null, count: 4 },
        ],
      },
    })

    const { total, doPlus } = await dataSource.contarReceitas()

    const chamadas = todasParaTabela('recipes')
    expect(chamadas.length).toBe(2)
    for (const chamada of chamadas) {
      expect(chamada.passos[0].args[1]).toEqual({ count: 'exact', head: true })
    }
    expect(total + doPlus).toBe(13)
  })

  it('o padrão de linhas por página é o da tela', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { recipes: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listRecipes()

    const range = passos(paraTabela('recipes')).find((p) => p.metodo === 'range')
    expect(range?.args).toEqual([0, RECEITAS_POR_PAGINA - 1])
  })
})
