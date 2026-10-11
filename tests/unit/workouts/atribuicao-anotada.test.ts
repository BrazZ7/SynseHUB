import { describe, expect, it } from 'vitest'

import { clienteFalso } from '../postgrest-falso'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { getDemoDataset } from '@/lib/database/demo-seed'

/**
 * ── Quem já tem a ficha, entre estes alunos ─────────────────────────────────
 *
 * `listAssignmentsForPlan` lia **toda** atribuição de uma ficha, sem teto. A
 * única razão de existir era anotar "já tem este treino" na lista do seletor
 * de aluno — doze nomes na tela —, e para isso a página mandava ao navegador
 * a lista inteira de ids de quem tem a ficha.
 *
 * Numa academia que atribui a mesma ficha de iniciante a todo mundo, "toda
 * atribuição da ficha" é a academia inteira. E quando o PostgREST cortasse, o
 * sintoma não seria erro: seria um aluno que já tem o treino aparecendo sem a
 * marca, e o professor atribuindo de novo achando que era a primeira vez.
 *
 * O recorte agora é obrigatório na assinatura: `studentIds` é a pergunta
 * "destes aqui, quem tem?". Sem ela não há consulta.
 */

const ids = ['stu_1', 'stu_2', 'stu_3'] as const

describe('listAssignmentsForPlan no Supabase', () => {
  it('recorta pelos alunos perguntados', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_assignments: [{ data: [], error: null }] },
    })

    await dataSource.listAssignmentsForPlan('org_1', 'plan_1', ids)

    const chamada = paraTabela('workout_assignments')
    const recorte = chamada?.passos.find((p) => p.metodo === 'in' && p.args[0] === 'student_id')
    expect(recorte?.args[1]).toEqual(['stu_1', 'stu_2', 'stu_3'])
  })

  it('confere a academia e a ficha', async () => {
    const { dataSource, paraTabela } = clienteFalso({
      tabelas: { workout_assignments: [{ data: [], error: null }] },
    })

    await dataSource.listAssignmentsForPlan('org_1', 'plan_1', ids)

    const iguais = (paraTabela('workout_assignments')?.passos ?? [])
      .filter((p) => p.metodo === 'eq')
      .map((p) => p.args)
    expect(iguais).toEqual([
      ['organization_id', 'org_1'],
      ['workout_plan_id', 'plan_1'],
    ])
  })

  it('pergunta sem aluno nenhum não vai ao banco', async () => {
    // `in` com lista vazia é uma ida à rede para receber nada — e é o que
    // acontece em toda busca que não encontrou ninguém.
    const { dataSource, chamadas } = clienteFalso({})

    const r = await dataSource.listAssignmentsForPlan('org_1', 'plan_1', [])

    expect(r).toEqual([])
    expect(chamadas).toHaveLength(0)
  })

  it('devolve a atribuição no formato da aplicação', async () => {
    const { dataSource } = clienteFalso({
      tabelas: {
        workout_assignments: [
          {
            data: [
              {
                id: 'asg_1',
                organization_id: 'org_1',
                workout_plan_id: 'plan_1',
                student_id: 'stu_2',
                assigned_at: '2026-10-01T12:00:00Z',
                valid_until: null,
              },
            ],
            error: null,
          },
        ],
      },
    })

    const r = await dataSource.listAssignmentsForPlan('org_1', 'plan_1', ids)

    expect(r).toEqual([
      {
        id: 'asg_1',
        organizationId: 'org_1',
        workoutPlanId: 'plan_1',
        studentId: 'stu_2',
        assignedAt: '2026-10-01T12:00:00Z',
        validUntil: null,
      },
    ])
  })
})

describe('listAssignmentsForPlan na demonstração', () => {
  /*
   * A demonstração responde a mesma pergunta, ou a tela de atribuir treino
   * mentiria no modo de demonstração — que é onde o produto é mostrado.
   */
  const dados = getDemoDataset()
  const primeira = dados.workoutAssignments[0]
  const fonte = () => new DemoDataSource()

  it('só devolve quem foi perguntado', async () => {
    const todas = await fonte().listAssignmentsForPlan(
      primeira.organizationId,
      primeira.workoutPlanId,
      dados.workoutAssignments.map((a) => a.studentId),
    )
    expect(todas.length).toBeGreaterThan(0)
    expect(todas.every((a) => a.workoutPlanId === primeira.workoutPlanId)).toBe(true)

    const nenhuma = await fonte().listAssignmentsForPlan(
      primeira.organizationId,
      primeira.workoutPlanId,
      ['aluno-que-nao-existe'],
    )
    expect(nenhuma).toEqual([])
  })

  it('pergunta vazia devolve vazio', async () => {
    expect(
      await fonte().listAssignmentsForPlan(primeira.organizationId, primeira.workoutPlanId, []),
    ).toEqual([])
  })

  it('não atravessa academia', async () => {
    const r = await fonte().listAssignmentsForPlan('outra-academia', primeira.workoutPlanId, [
      primeira.studentId,
    ])
    expect(r).toEqual([])
  })
})
