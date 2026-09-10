import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O isolamento entre academias é a promessa central do produto. Se ele falhar,
 * uma academia lê a base de alunos da concorrente.
 */

let client: Client
const temBanco = await databaseAvailable()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const contar = async (authId: string | null, tabela: string) => {
  const rows = await asUser<{ n: string }>(client, authId, `select count(*)::text as n from ${tabela}`)
  return Number(rows[0].n)
}

describe.skipIf(!temBanco)('isolamento entre academias', () => {
  for (const tabela of ['students', 'charges', 'check_ins', 'memberships']) {
    it(`${tabela}: cada dona vê só a própria academia`, async () => {
      const total = Number(
        (await client.query(`select count(*)::text as n from ${tabela}`)).rows[0].n,
      )
      const alpha = await contar(ALPHA.authId, tabela)
      const beta = await contar(BETA.authId, tabela)

      expect(alpha).toBeGreaterThan(0)
      expect(beta).toBeGreaterThan(0)
      // A soma exata é o que prova que ninguém enxerga linha da outra.
      expect(alpha + beta).toBe(total)
    })
  }

  it('organizations: cada dona vê apenas a própria', async () => {
    const alpha = await asUser<{ slug: string }>(client, ALPHA.authId, 'select slug from organizations')
    const beta = await asUser<{ slug: string }>(client, BETA.authId, 'select slug from organizations')

    expect(alpha.map((row) => row.slug)).toEqual(['alpha'])
    expect(beta.map((row) => row.slug)).toEqual(['beta'])
  })
})

describe.skipIf(!temBanco)('acesso anônimo', () => {
  for (const tabela of ['organizations', 'user_profiles', 'students', 'charges', 'check_ins']) {
    it(`${tabela}: não lê nada — e não estoura`, async () => {
      // Erro em vez de lista vazia viraria 500 no app. Já aconteceu: revogar as
      // funções auxiliares do papel `anon` fazia o Postgres abortar a consulta.
      await expect(contar(null, tabela)).resolves.toBe(0)
    })
  }

  it('não consegue criar academia', async () => {
    await expect(
      asUser(client, null, `insert into organizations (name, slug) values ('Invasora','invasora')`),
    ).rejects.toThrow(/row-level security/i)
  })
})

describe.skipIf(!temBanco)('usuário autenticado sem vínculo', () => {
  const semVinculo = '99999999-9999-9999-9999-999999999999'

  it('não lê academia nenhuma', async () => {
    expect(await contar(semVinculo, 'organizations')).toBe(0)
    expect(await contar(semVinculo, 'students')).toBe(0)
  })
})

describe.skipIf(!temBanco)('equipe enxerga o nome dos próprios alunos', () => {
  it('o join com user_profiles devolve nome e Synse ID', async () => {
    // Regressão da 0005: a RLS liberava a matrícula e bloqueava o perfil, então
    // a lista de alunos vinha inteira sem nome.
    const rows = await asUser<{ name: string; synse_id: string }>(
      client,
      ALPHA.authId,
      `select p.name, p.synse_id
       from students s join user_profiles p on p.id = s.user_profile_id
       where s.organization_id = $1`,
      [ALPHA.orgId],
    )

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.name).toBeTruthy()
      expect(row.synse_id).toMatch(/^SYN-[0-9A-HJKMNP-TV-Z]{8}$/)
    }
  })

  it('não enxerga o perfil de aluno da concorrente', async () => {
    const rows = await asUser<{ n: string }>(
      client,
      ALPHA.authId,
      `select count(*)::text as n from user_profiles where email like 'b%@alunos.test'`,
    )
    expect(Number(rows[0].n)).toBe(0)
  })
})
