import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Regressão do timeout.
 *
 * Com o banco populado, o Supabase passou a responder 57014 em `charges`,
 * `check_ins` e `user_profiles`. A causa era a forma das políticas:
 * `is_org_staff(organization_id)` recebe uma coluna, então roda uma vez por
 * linha, e cada chamada faz um join.
 *
 * O que este teste protege não é o número de milissegundos — é a forma do
 * plano. Uma política que volte a ser avaliada por linha aparece como chamada
 * de função no `Filter`, e não como InitPlan ou SubPlan com hash.
 */

let client: Client
const temBanco = await databaseAvailable()
const ALUNOS = 400
const COBRANCAS_POR_ALUNO = 6

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  // Volume comparável ao de uma academia em operação.
  await client.query(
    `insert into user_profiles (name, email)
     select 'Aluno ' || g, 'perf' || g || '@x.test' from generate_series(1, $1) g`,
    [ALUNOS],
  )
  await client.query(
    `insert into students (organization_id, user_profile_id)
     select $1, id from user_profiles where email like 'perf%@x.test'`,
    [ALPHA.orgId],
  )
  await client.query(
    `insert into charges (organization_id, student_id, description, amount, due_date, status)
     select $1, s.id, 'Mensalidade', 109.9, current_date, 'PAID'
     from students s, generate_series(1, $2) g
     where s.organization_id = $1`,
    [ALPHA.orgId, COBRANCAS_POR_ALUNO],
  )
  await client.query('analyze')
}, 120_000)

afterAll(async () => {
  await client?.end()
})

const planoDe = async (tabela: string) => {
  const linhas = await asUser<{ 'QUERY PLAN': string }>(
    client,
    ALPHA.authId,
    `explain (analyze, timing off) select count(*) from ${tabela}`,
  )
  return linhas.map((linha) => linha['QUERY PLAN']).join('\n')
}

describe.skipIf(!temBanco)('RLS não pode voltar a ser avaliada por linha', () => {
  for (const tabela of ['charges', 'check_ins', 'user_profiles', 'students']) {
    it(`${tabela}: o filtro usa subplano, não chamada de função por linha`, async () => {
      const plano = await planoDe(tabela)

      // Marca do problema antigo: a função aparece sendo chamada no filtro.
      expect(plano).not.toMatch(/Filter:.*is_org_staff\(/)
      expect(plano).not.toMatch(/Filter:.*owns_student\(/)
      // Marca da forma correta: avaliado uma vez.
      expect(plano).toMatch(/InitPlan|SubPlan/)
    })
  }

  it('contar milhares de cobranças é rápido', async () => {
    const plano = await planoDe('charges')
    const tempo = Number(plano.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? Infinity)

    // Antes da correção: ~1000 ms com 3.000 linhas, e timeout no Supabase.
    // O limite é folgado de propósito — só falha se a forma do plano regredir.
    expect(tempo).toBeLessThan(200)
  })

  it('o volume não vaza para a concorrente', async () => {
    const rows = await asUser<{ n: string }>(client, BETA.authId, 'select count(*)::text as n from charges')
    expect(Number(rows[0].n)).toBe(1)
  })
})
