import { describe, expect, it } from 'vitest'

import { SupabaseDataSource } from '@/lib/database/supabase-data-source'

/**
 * ── A lista de alunos sem corte: o lado da aplicação (0049) ─────────────────
 *
 * Os testes de banco (`tests/db/lista-de-alunos.test.ts`) provam o que as duas
 * funções da 0049 respondem. Estes provam que `listStudents` as **usa**, e que
 * os três defeitos que ela tinha não voltam:
 *
 * 1. a decoração lia `charges` e `check_ins` sem teto, e o PostgREST cortava
 *    a resposta em silêncio;
 * 2. o recorte por plano era `planName != null` — "tem algum plano" —, feito
 *    depois de paginar, então escolher "Mensal" trazia quem estava no
 *    trimestral e o rodapé ignorava o filtro;
 * 3. a aba "Sumidos" filtrava a página já lida e lia o total de uma consulta
 *    sem filtro: dizia "478 alunos" e mostrava três.
 *
 * ── Por que um cliente de mentira, e o que ele não prova ───────────────────
 *
 * O que está sob teste aqui é a **ligação**: qual consulta sai, com quais
 * argumentos, e o que a aplicação faz com a resposta. A semântica do SQL —
 * `distinct on`, a ordem da fila, o isolamento entre academias — é dos testes
 * de banco, que rodam contra Postgres de verdade. Separar os dois evita o
 * pior dos mundos, que é um dublê caprichado o bastante para o teste passar
 * provando as regras do dublê.
 */

type Resposta = { data: unknown; error: unknown; count?: number | null }
type Passo = { metodo: string; args: unknown[] }
type Chamada = { nome: string; passos: Passo[] }

/**
 * Um cliente que anota o que foi pedido e devolve o que o teste combinou.
 *
 * Cada método de construção devolve o próprio objeto, como no PostgREST, e o
 * `then` é o que resolve: é ele que registra a chamada, no momento em que ela
 * de fato acontece. `tabelas` aceita uma fila por tabela, porque o caminho dos
 * sumidos lê `students` depois da função.
 */
function clienteFalso(combinado: {
  tabelas?: Record<string, Resposta[]>
  rpcs?: Record<string, Resposta>
}) {
  const chamadas: Chamada[] = []
  const rpcs: Chamada[] = []
  const filas = Object.fromEntries(
    Object.entries(combinado.tabelas ?? {}).map(([tabela, fila]) => [tabela, [...fila]]),
  )

  const construtor = (tabela: string) => {
    const passos: Passo[] = []
    const alvo: Record<string, unknown> = {
      then(resolve: (r: Resposta) => unknown, reject?: (e: unknown) => unknown) {
        chamadas.push({ nome: tabela, passos })
        const resposta = filas[tabela]?.shift() ?? { data: [], error: null, count: 0 }
        return Promise.resolve(resposta).then(resolve, reject)
      },
    }
    for (const metodo of [
      'select',
      'eq',
      'in',
      'gte',
      'or',
      'order',
      'range',
      'limit',
      'maybeSingle',
      'single',
    ]) {
      alvo[metodo] = (...args: unknown[]) => {
        passos.push({ metodo, args })
        return alvo
      }
    }
    return alvo
  }

  const cliente = {
    from: (tabela: string) => construtor(tabela),
    rpc: (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, passos: [{ metodo: 'rpc', args: [args] }] })
      return Promise.resolve(combinado.rpcs?.[nome] ?? { data: [], error: null })
    },
  }

  return {
    // O data source só usa `from` e `rpc`; o resto do SupabaseClient não entra.
    dataSource: new SupabaseDataSource(cliente as never),
    chamadas,
    rpcs,
    paraTabela: (tabela: string) => chamadas.find((c) => c.nome === tabela),
    argsDaRpc: (nome: string) =>
      rpcs.find((c) => c.nome === nome)?.passos[0].args[0] as Record<string, unknown> | undefined,
  }
}

/** Uma linha de `students` como o PostgREST a devolve, com os embutidos. */
const linha = (id: string, nome: string, comPlano = true) => ({
  id,
  organization_id: 'org-1',
  user_profile_id: `perfil-${id}`,
  status: 'ACTIVE',
  goal: null,
  enrolled_at: '2025-01-10',
  cancelled_at: null,
  trainer_id: null,
  notes: null,
  user_profiles: { synse_id: `SY-${id}`, name: nome, email: `${id}@aluno.test` },
  memberships: comPlano
    ? [
        {
          id: `m-${id}`,
          plan_id: 'plano-mensal',
          price: '109.90',
          status: 'ACTIVE',
          membership_plans: { name: 'Mensal' },
        },
      ]
    : [],
  staff: null,
})

const SEM_MIGRATION = {
  code: 'PGRST202',
  message: 'Could not find the function in the schema cache',
}

describe('o filtro de plano', () => {
  it('recorta no servidor, com a junção obrigatória', async () => {
    const t = clienteFalso({
      tabelas: { students: [{ data: [linha('s-1', 'Ana')], error: null, count: 1 }] },
      rpcs: { decoracao_dos_alunos: { data: [], error: null } },
    })

    await t.dataSource.listStudents('org-1', {
      page: 1,
      pageSize: 20,
      status: 'ALL',
      planId: 'plano-mensal',
    })

    const passos = t.paraTabela('students')!.passos
    const select = String(passos.find((p) => p.metodo === 'select')!.args[0])

    /*
     * Sem o `!inner` o PostgREST aceita o `.eq('memberships.plan_id', …)` e não
     * recorta nada: a junção é à esquerda, então o aluno de outro plano
     * continua vindo, só com a matrícula de fora.
     */
    expect(select).toContain('memberships!inner')
    expect(passos).toEqual(
      expect.arrayContaining([
        { metodo: 'eq', args: ['memberships.plan_id', 'plano-mensal'] },
        { metodo: 'eq', args: ['memberships.status', 'ACTIVE'] },
      ]),
    )
  })

  it('sem plano escolhido, a junção segue opcional', async () => {
    /*
     * O outro lado da moeda, e o defeito que a correção poderia criar: com
     * `memberships!inner` sempre ligado, o aluno sem matrícula desapareceria
     * da lista de alunos.
     */
    const t = clienteFalso({
      tabelas: { students: [{ data: [linha('s-1', 'Ana', false)], error: null, count: 1 }] },
      rpcs: { decoracao_dos_alunos: { data: [], error: null } },
    })

    const r = await t.dataSource.listStudents('org-1', { page: 1, pageSize: 20, status: 'ALL' })

    const select = String(
      t.paraTabela('students')!.passos.find((p) => p.metodo === 'select')!.args[0],
    )
    expect(select).not.toContain('!inner')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].planName).toBeNull()
  })

  it('não recorta de novo na aplicação depois de paginar', async () => {
    /*
     * Esta é a asserção que mata o remendo antigo. O servidor já recortou, e
     * `count` é o total **do filtro**. As três linhas vêm sem matrícula
     * embutida de propósito: o `rows.filter(r => r.planName != null)` de antes
     * apagaria as três e devolveria uma página vazia dizendo "41 alunos".
     */
    const t = clienteFalso({
      tabelas: {
        students: [
          {
            data: [
              linha('s-1', 'Ana', false),
              linha('s-2', 'Bia', false),
              linha('s-3', 'Cau', false),
            ],
            error: null,
            count: 41,
          },
        ],
      },
      rpcs: { decoracao_dos_alunos: { data: [], error: null } },
    })

    const r = await t.dataSource.listStudents('org-1', {
      page: 1,
      pageSize: 20,
      status: 'ALL',
      planId: 'plano-mensal',
    })

    expect(r.rows).toHaveLength(3)
    expect(r.total).toBe(41)
  })
})

describe('a aba Sumidos', () => {
  const sumidosCombinados = () =>
    clienteFalso({
      // A função devolve a fila; o `.in('id', …)` lê os alunos em outra ordem.
      rpcs: {
        alunos_dormentes: {
          data: [
            { student_id: 's-2', total_geral: '41' },
            { student_id: 's-1', total_geral: '41' },
          ],
          error: null,
        },
        decoracao_dos_alunos: { data: [], error: null },
      },
      tabelas: {
        students: [{ data: [linha('s-1', 'Ana'), linha('s-2', 'Bia')], error: null, count: 478 }],
      },
    })

  it('pergunta ao banco, com os filtros da tela', async () => {
    const t = sumidosCombinados()

    await t.dataSource.listStudents('org-1', {
      page: 2,
      pageSize: 20,
      status: 'ALL',
      inactiveAttendance: true,
      search: '  teresa  ',
      planId: 'plano-mensal',
      trainerId: 'prof-9',
    })

    expect(t.argsDaRpc('alunos_dormentes')).toEqual({
      p_organization_id: 'org-1',
      p_dias: 21,
      p_busca: 'teresa',
      p_trainer_id: 'prof-9',
      p_plan_id: 'plano-mensal',
      p_limit: 20,
      p_offset: 20,
    })
  })

  it('o total é o da função, não o da academia', async () => {
    /*
     * 478 é o `count` da consulta de alunos; 41 é quantos estão sumidos. O
     * rodapé mostrava o primeiro e listava os segundos.
     */
    const t = sumidosCombinados()

    const r = await t.dataSource.listStudents('org-1', {
      page: 1,
      pageSize: 20,
      status: 'ALL',
      inactiveAttendance: true,
    })

    expect(r.total).toBe(41)
  })

  it('a ordem da fila é reimposta depois de ler os alunos', async () => {
    /*
     * `.in('id', [...])` devolve na ordem que o Postgres quiser, e a ordem da
     * aba é a da urgência — quem está sumido há mais tempo primeiro. Perder
     * isso aqui desfaria metade do conserto sem quebrar mais nada.
     */
    const t = sumidosCombinados()

    const r = await t.dataSource.listStudents('org-1', {
      page: 1,
      pageSize: 20,
      status: 'ALL',
      inactiveAttendance: true,
    })

    expect(r.rows.map((aluno) => aluno.id)).toEqual(['s-2', 's-1'])
  })

  it('lê no máximo a página, e não a academia', async () => {
    const t = sumidosCombinados()

    await t.dataSource.listStudents('org-1', {
      page: 1,
      pageSize: 20,
      status: 'ALL',
      inactiveAttendance: true,
    })

    // O recorte é por id — dois aqui —, então não há resposta para cortar.
    expect(t.paraTabela('students')!.passos).toEqual(
      expect.arrayContaining([{ metodo: 'in', args: ['id', ['s-2', 's-1']] }]),
    )
  })
})

describe('a decoração', () => {
  it('vem da função, e o valor chega como número', async () => {
    const t = clienteFalso({
      tabelas: { students: [{ data: [linha('s-1', 'Ana')], error: null, count: 1 }] },
      rpcs: {
        decoracao_dos_alunos: {
          data: [
            {
              student_id: 's-1',
              next_charge_due_date: '2026-10-10',
              next_charge_amount: '111.50',
              last_check_in_at: '2026-09-30T10:00:00Z',
            },
          ],
          error: null,
        },
      },
    })

    const r = await t.dataSource.listStudents('org-1', { page: 1, pageSize: 20, status: 'ALL' })

    expect(t.argsDaRpc('decoracao_dos_alunos')).toEqual({
      p_organization_id: 'org-1',
      p_student_ids: ['s-1'],
    })
    expect(r.rows[0].nextChargeDueDate).toBe('2026-10-10')
    // `numeric` chega como string no PostgREST: somar sem converter concatena.
    expect(r.rows[0].nextChargeAmount).toBe(111.5)
    expect(r.rows[0].lastCheckInAt).toBe('2026-09-30T10:00:00Z')
  })

  it('não lê mais charges nem check_ins quando a função responde', async () => {
    const t = clienteFalso({
      tabelas: { students: [{ data: [linha('s-1', 'Ana')], error: null, count: 1 }] },
      rpcs: { decoracao_dos_alunos: { data: [], error: null } },
    })

    await t.dataSource.listStudents('org-1', { page: 1, pageSize: 20, status: 'ALL' })

    expect(t.chamadas.map((c) => c.nome)).toEqual(['students'])
  })
})

describe('a janela entre publicar e migrar', () => {
  it('sem a 0049, a decoração volta ao caminho antigo em vez de esvaziar as colunas', async () => {
    /*
     * A Vercel publica no push; o SQL é colado à mão depois. Nessa janela o
     * código novo fala com o banco velho — e aqui devolver vazio seria pior
     * que a leitura que pode cortar: a tela inteira diria "—".
     */
    const t = clienteFalso({
      tabelas: {
        students: [{ data: [linha('s-1', 'Ana')], error: null, count: 1 }],
        charges: [
          { data: [{ student_id: 's-1', due_date: '2026-10-10', amount: '99.90' }], error: null },
        ],
        check_ins: [
          { data: [{ student_id: 's-1', checked_in_at: '2026-09-30T10:00:00Z' }], error: null },
        ],
      },
      rpcs: { decoracao_dos_alunos: { data: null, error: SEM_MIGRATION } },
    })

    const r = await t.dataSource.listStudents('org-1', { page: 1, pageSize: 20, status: 'ALL' })

    expect(t.chamadas.map((c) => c.nome).sort()).toEqual(['charges', 'check_ins', 'students'])
    expect(r.rows[0].nextChargeAmount).toBe(99.9)
    expect(r.rows[0].lastCheckInAt).toBe('2026-09-30T10:00:00Z')
  })

  it('sem a 0049, a aba Sumidos volta a filtrar na aplicação', async () => {
    const t = clienteFalso({
      tabelas: {
        students: [{ data: [linha('s-1', 'Ana'), linha('s-2', 'Bia')], error: null, count: 2 }],
        charges: [{ data: [], error: null }],
        check_ins: [
          { data: [{ student_id: 's-1', checked_in_at: new Date().toISOString() }], error: null },
        ],
      },
      rpcs: {
        alunos_dormentes: { data: null, error: SEM_MIGRATION },
        decoracao_dos_alunos: { data: null, error: SEM_MIGRATION },
      },
    })

    const r = await t.dataSource.listStudents('org-1', {
      page: 1,
      pageSize: 20,
      status: 'ALL',
      inactiveAttendance: true,
    })

    // Ana entrou agora; Bia não tem presença nenhuma. Errado como sempre foi,
    // porque olha só a página — mas de pé, que é o que a janela exige.
    expect(r.rows.map((aluno) => aluno.id)).toEqual(['s-2'])
  })

  it('erro que não é migration sobe, e não vira coluna vazia', async () => {
    /*
     * A distinção que o `isPendingMigration` existe para fazer. Engolir
     * "permission denied" aqui transformaria uma política de RLS mal
     * configurada numa tela de alunos sem mensalidade e sem presença — que é
     * exatamente o defeito desta migration, reaparecendo por outra porta.
     */
    const t = clienteFalso({
      tabelas: { students: [{ data: [linha('s-1', 'Ana')], error: null, count: 1 }] },
      rpcs: {
        decoracao_dos_alunos: {
          data: null,
          error: { code: '42501', message: 'permission denied' },
        },
      },
    })

    const erro = await t.dataSource
      .listStudents('org-1', { page: 1, pageSize: 20, status: 'ALL' })
      .then(
        () => null,
        (e: Error) => e,
      )

    expect(erro).toBeInstanceOf(Error)
    expect(erro!.message).toContain('decorateStudents')
    // O original viaja em `cause`: é por ele que quem pega lá em cima
    // distingue "ainda não migrou" de "defeito".
    expect(erro!.cause).toMatchObject({ code: '42501' })
  })
})
