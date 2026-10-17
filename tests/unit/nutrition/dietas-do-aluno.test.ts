import { describe, expect, it } from 'vitest'

import { dietasDoAluno } from '@/features/nutrition/state'
import { DemoDataSource } from '@/lib/database/demo-data-source'
import { DEMO_ORG_ID, getDemoDataset } from '@/lib/database/demo-seed'
import type { NutritionPlan } from '@/types/domain'

/**
 * ── O histórico de dietas ───────────────────────────────────────────────────
 *
 * `listNutritionPlansForStudent` estava no data source desde a 0030 e nenhuma
 * tela a chamava: a aba "Nutrição" da ficha era um aviso escrito à mão —
 * "Nenhum plano nutricional publicado" — que **nunca consultava nada**. Dizia
 * isso para o aluno que tinha três versões prescritas.
 *
 * A própria página de nutrição já dizia a razão e não a cumpria: "num dado de
 * saúde, o que foi prescrito antes é o que importa quando alguém pergunta
 * depois". Versão arquivada é o registro de uma conduta, com autor e data.
 */

const PLANO = (parcial: Partial<NutritionPlan>): NutritionPlan => ({
  id: 'p',
  organizationId: 'org_1',
  studentId: 'stu_1',
  studentName: 'Aluno',
  authorStaffId: 'staff_1',
  authorName: 'Nutricionista',
  title: 'Plano',
  version: 1,
  status: 'ARCHIVED',
  publishedAt: null,
  notes: null,
  targetCalories: null,
  targetProteinG: null,
  targetCarbsG: null,
  targetFatG: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...parcial,
})

describe('separar o que vale do que já valeu', () => {
  it('a publicada é a vigente, e as arquivadas descem para o histórico', () => {
    const r = dietasDoAluno([
      PLANO({ id: 'v3', version: 3, status: 'PUBLISHED' }),
      PLANO({ id: 'v1', version: 1 }),
      PLANO({ id: 'v2', version: 2 }),
    ])

    expect(r.vigente?.id).toBe('v3')
    expect(r.rascunho).toBeNull()
    // Mais recente primeiro: é a ordem em que alguém procura o que mudou.
    expect(r.anteriores.map((p) => p.id)).toEqual(['v2', 'v1'])
  })

  it('o rascunho fica de fora do histórico — ele ainda não foi nada', () => {
    /*
     * Rascunho não é "o que foi prescrito antes": é trabalho em andamento, e
     * misturá-lo com as versões arquivadas faria parecer que o aluno já
     * seguiu aquilo.
     */
    const r = dietasDoAluno([
      PLANO({ id: 'rascunho', version: 4, status: 'DRAFT' }),
      PLANO({ id: 'vigente', version: 3, status: 'PUBLISHED' }),
      PLANO({ id: 'velha', version: 2 }),
    ])

    expect(r.rascunho?.id).toBe('rascunho')
    expect(r.vigente?.id).toBe('vigente')
    expect(r.anteriores.map((p) => p.id)).toEqual(['velha'])
  })

  it('sem nada publicado, o vigente é nulo em vez de virar o rascunho', () => {
    // A tela avisa que o aluno não vê dieta nenhuma no app. Promover o
    // rascunho aqui esconderia exatamente esse aviso.
    const r = dietasDoAluno([PLANO({ id: 'rascunho', version: 1, status: 'DRAFT' })])

    expect(r.vigente).toBeNull()
    expect(r.rascunho?.id).toBe('rascunho')
    expect(r.anteriores).toEqual([])
  })

  it('duas publicadas por acidente: vence a maior versão, e a outra não some', () => {
    /*
     * `publish_nutrition_plan` (0030) arquiva a anterior, então o normal é
     * uma só. Banco mexido à mão ou migration pela metade produz duas — e aí
     * a tela precisa escolher uma sem apagar a outra da vista.
     */
    const r = dietasDoAluno([
      PLANO({ id: 'antiga', version: 2, status: 'PUBLISHED' }),
      PLANO({ id: 'nova', version: 5, status: 'PUBLISHED' }),
    ])

    expect(r.vigente?.id).toBe('nova')
    expect(r.anteriores.map((p) => p.id)).toEqual(['antiga'])
  })

  it('lista vazia não quebra nem inventa', () => {
    expect(dietasDoAluno([])).toEqual({ vigente: null, rascunho: null, anteriores: [] })
  })
})

describe('o histórico na demonstração', () => {
  const alunoDoApp = () => getDemoDataset().studentIdForApp

  it('traz a versão em vigor e a anterior arquivada', async () => {
    /*
     * Com um plano só, a aba mostraria o vigente e nada mais — o histórico,
     * que é a razão de ela existir, ficaria invisível justamente onde a
     * academia conhece o produto.
     */
    const fonte = new DemoDataSource([])
    const planos = await fonte.listNutritionPlansForStudent(DEMO_ORG_ID, alunoDoApp())

    const { vigente, anteriores } = dietasDoAluno(planos)
    expect(vigente?.status).toBe('PUBLISHED')
    expect(anteriores).toHaveLength(1)
    expect(anteriores[0].status).toBe('ARCHIVED')
    expect(anteriores[0].version).toBeLessThan(vigente!.version)
  })

  it('e o plano de um aluno não aparece no de outro', async () => {
    const fonte = new DemoDataSource([])
    const outro = getDemoDataset().students.find((s) => s.id !== alunoDoApp())!

    expect(await fonte.listNutritionPlansForStudent(DEMO_ORG_ID, outro.id)).toEqual([])
  })

  it('e a academia vizinha não vê nenhum', async () => {
    const fonte = new DemoDataSource([])
    expect(await fonte.listNutritionPlansForStudent('org_vizinha', alunoDoApp())).toEqual([])
  })
})

describe('o aluno que vem da ficha chega ao seletor', () => {
  /*
   * ── A premissa do conserto em `/nutrition/new` ────────────────────────────
   *
   * O botão "Novo plano" da ficha manda `?aluno=`, e a página busca esse
   * aluno à parte para garantir que ele esteja no `select`. Isso só é
   * necessário porque a lista **não traz todos**: os dois data sources
   * limitam a página a 100 (`Math.min(100, …)`), e o `pageSize: 300` da
   * página não muda nada.
   *
   * Estes dois testes fixam a premissa. Se um dia alguém levantar o limite e
   * o primeiro cair, o conserto virou desnecessário — e é bom saber. Se o
   * segundo cair, `getStudent` deixou de alcançar quem está fora da página, e
   * aí o botão da ficha voltou a levar a um seletor sem o aluno.
   */
  it('a lista de alunos para por 100, mesmo pedindo 300', async () => {
    const fonte = new DemoDataSource([])
    const pagina = await fonte.listStudents(DEMO_ORG_ID, {
      status: 'ACTIVE',
      page: 1,
      pageSize: 300,
    })

    expect(pagina.total).toBeGreaterThan(100)
    expect(pagina.rows).toHaveLength(100)
  })

  it('e o aluno do app está fora dela, mas `getStudent` o alcança', async () => {
    const fonte = new DemoDataSource([])
    const alvo = getDemoDataset().studentIdForApp

    const pagina = await fonte.listStudents(DEMO_ORG_ID, {
      status: 'ACTIVE',
      page: 1,
      pageSize: 300,
    })
    expect(pagina.rows.some((s) => s.id === alvo)).toBe(false)

    const direto = await fonte.getStudent(DEMO_ORG_ID, alvo)
    expect(direto?.id).toBe(alvo)
  })
})
