import { describe, expect, it } from 'vitest'

import { clienteFalso } from '../postgrest-falso'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { FICHAS_POR_PAGINA } from '@/features/workouts/por-pagina'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'

/**
 * ── As fichas da academia, por página ───────────────────────────────────────
 *
 * `listWorkoutPlans` lia **todas** as fichas da academia, sem teto. Professor
 * cria ficha e não apaga: uma academia de três anos chega a centenas.
 *
 * O corte do PostgREST aqui é mais traiçoeiro que o normal, porque a ordem é
 * por divisão. O que sumiria não seriam "as mais antigas" — seriam **todas as
 * divisões do fim do alfabeto**. Um "Treino E — Pernas" deixaria de existir
 * para a tela, e quem o procurasse concluiria que alguém apagou.
 *
 * Três das quatro telas que liam isso nem queriam a lista: queriam o nome das
 * duas ou três fichas atribuídas a **um** aluno. Essas passaram a perguntar
 * por id, e é o que `listWorkoutPlansByIds` trava aqui.
 */

const plano = (id: string, divisao: string) => ({
  id,
  organization_id: 'org_1',
  name: `Treino ${divisao}`,
  goal: null,
  split_label: divisao,
  created_by_staff_id: null,
  status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00Z',
})

describe('listWorkoutPlans no Supabase', () => {
  it('pede uma faixa, e o total vem do banco', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_plans: [{ data: [plano('p1', 'A')], error: null, count: 137 }] },
    })

    const pagina = await dataSource.listWorkoutPlans('org_1', { page: 3, pageSize: 10 })

    const passos = paraTabela('workout_plans')?.passos ?? []
    expect(passos.find((p) => p.metodo === 'range')?.args).toEqual([20, 29])
    expect(passos.find((p) => p.metodo === 'select')?.args[1]).toEqual({ count: 'exact' })
    expect(pagina.total).toBe(137)
    expect(pagina.page).toBe(3)
    expect(pagina.rows).toHaveLength(1)
  })

  it('o padrão é a página da tela', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_plans: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listWorkoutPlans('org_1')

    const faixa = (paraTabela('workout_plans')?.passos ?? []).find((p) => p.metodo === 'range')
    expect(faixa?.args).toEqual([0, FICHAS_POR_PAGINA - 1])
  })

  it('a ordem é a divisão, e o desempate não depende do banco', async () => {
    /*
     * Com `range`, duas fichas da mesma divisão em ordem indefinida podem
     * trocar de página entre uma requisição e outra — e a que troca some de
     * uma sem aparecer na outra. O segundo critério é o que fecha isso.
     */
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_plans: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listWorkoutPlans('org_1')

    const ordens = (paraTabela('workout_plans')?.passos ?? [])
      .filter((p) => p.metodo === 'order')
      .map((p) => p.args[0])
    expect(ordens).toEqual(['split_label', 'created_at'])
  })

  it('confere a academia', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_plans: [{ data: [], error: null, count: 0 }] },
    })

    await dataSource.listWorkoutPlans('org_1')

    const iguais = (paraTabela('workout_plans')?.passos ?? []).filter((p) => p.metodo === 'eq')
    expect(iguais.map((p) => p.args)).toEqual([['organization_id', 'org_1']])
  })
})

describe('listWorkoutPlansByIds no Supabase', () => {
  it('recorta pelas fichas perguntadas', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_plans: [{ data: [], error: null }] },
    })

    await dataSource.listWorkoutPlansByIds('org_1', ['p1', 'p2'])

    const recorte = (paraTabela('workout_plans')?.passos ?? []).find(
      (p) => p.metodo === 'in' && p.args[0] === 'id',
    )
    expect(recorte?.args[1]).toEqual(['p1', 'p2'])
  })

  it('id repetido não vira filtro repetido', async () => {
    // Dois treinos atribuídos à mesma ficha — reatribuição renova a validade
    // e deixa duas linhas — não precisam pedir a mesma ficha duas vezes.
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_plans: [{ data: [], error: null }] },
    })

    await dataSource.listWorkoutPlansByIds('org_1', ['p1', 'p1', 'p2'])

    const recorte = (paraTabela('workout_plans')?.passos ?? []).find(
      (p) => p.metodo === 'in' && p.args[0] === 'id',
    )
    expect(recorte?.args[1]).toEqual(['p1', 'p2'])
  })

  it('aluno sem treino atribuído não vai ao banco', async () => {
    const { dataSource, chamadas } = clienteFalso({})

    expect(await dataSource.listWorkoutPlansByIds('org_1', [])).toEqual([])
    expect(chamadas).toHaveLength(0)
  })
})

describe('as fichas na demonstração', () => {
  const fonte = () => new DemoDataSource()

  it('a página tem teto e o total é o conjunto', async () => {
    /*
     * `pageSize: 2` não existe: os dois data sources travam o piso em 5, e
     * pedir menos devolve 5. Afirmar "tem 2" aqui seria afirmar o contrário
     * do código — a asserção certa é que a página **não passa** do pedido.
     */
    const pagina = await fonte().listWorkoutPlans(DEMO_ORG_ID, { page: 1, pageSize: 5 })
    expect(pagina.pageSize).toBe(5)
    expect(pagina.rows.length).toBeLessThanOrEqual(5)
    expect(pagina.total).toBe(
      getDemoDataset().workoutPlans.filter((p) => p.organizationId === DEMO_ORG_ID).length,
    )
  })

  it('uma página além do fim vem vazia, e o total continua de pé', async () => {
    // A asserção que não depende de quantas fichas a semente tem.
    const alem = await fonte().listWorkoutPlans(DEMO_ORG_ID, { page: 999, pageSize: 5 })
    expect(alem.rows).toEqual([])
    expect(alem.total).toBeGreaterThan(0)
  })

  it('nenhuma ficha aparece em duas páginas, nem some entre elas', async () => {
    const f = fonte()
    const total = (await f.listWorkoutPlans(DEMO_ORG_ID)).total

    const vistas: string[] = []
    for (let pagina = 1; vistas.length < total && pagina < 50; pagina++) {
      const p = await f.listWorkoutPlans(DEMO_ORG_ID, { page: pagina, pageSize: 5 })
      if (p.rows.length === 0) break
      vistas.push(...p.rows.map((r) => r.id))
    }

    expect(vistas).toHaveLength(total)
    expect(new Set(vistas).size).toBe(total)
  })

  it('só devolve as fichas perguntadas, e não atravessa academia', async () => {
    const dados = getDemoDataset()
    const uma = dados.workoutPlans.find((p) => p.organizationId === DEMO_ORG_ID)!

    expect((await fonte().listWorkoutPlansByIds(DEMO_ORG_ID, [uma.id])).map((p) => p.id)).toEqual([
      uma.id,
    ])
    expect(await fonte().listWorkoutPlansByIds('outra-academia', [uma.id])).toEqual([])
    expect(await fonte().listWorkoutPlansByIds(DEMO_ORG_ID, [])).toEqual([])
  })
})

describe('countExercises', () => {
  it('conta no banco, sem trazer linha', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { exercises: [{ data: null, error: null, count: 412 }] },
    })

    expect(await dataSource.countExercises('org_1')).toBe(412)

    const select = (paraTabela('exercises')?.passos ?? []).find((p) => p.metodo === 'select')
    expect(select?.args[1]).toEqual({ count: 'exact', head: true })
  })

  it('a demonstração conta o mesmo que lista', async () => {
    const f = new DemoDataSource()
    expect(await f.countExercises(DEMO_ORG_ID)).toBe((await f.listExercises(DEMO_ORG_ID)).length)
  })
})
