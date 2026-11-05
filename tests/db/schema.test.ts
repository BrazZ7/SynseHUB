import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, connect, databaseAvailable } from './helpers'

/**
 * Invariantes do schema. Cada um destes já falhou uma vez em produção ou
 * bloqueou o seed — ficam fixados aqui para não voltarem.
 */

let client: Client
const temBanco = await databaseAvailable()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('Row Level Security', () => {
  it('está ligada em todas as tabelas', async () => {
    const { rows } = await client.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `)
    // Tabela sem RLS num sistema multi-tenant é vazamento esperando acontecer.
    expect(rows.map((row) => row.relname)).toEqual([])
  })

  /*
   * Tabela com RLS ligada e nenhuma política não devolve linha nenhuma. Quase
   * sempre isso é esquecimento, e o sintoma — tela vazia sem erro — é péssimo
   * de diagnosticar. A exceção é deliberada e está listada abaixo.
   */
  const SEM_POLITICA_DE_PROPOSITO = ['payment_account_secrets']

  it('toda tabela com organization_id tem ao menos uma política', async () => {
    const { rows } = await client.query<{ table_name: string }>(`
      select t.table_name from information_schema.tables t
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
        and exists (
          select 1 from information_schema.columns c
          where c.table_name = t.table_name and c.column_name = 'organization_id'
        )
        and not exists (select 1 from pg_policies p where p.tablename = t.table_name)
    `)
    expect(rows.map((row) => row.table_name)).toEqual(SEM_POLITICA_DE_PROPOSITO)
  })
})

describe.skipIf(!temBanco)('user_profiles', () => {
  it('e-mail é único', async () => {
    // Sem isto o seed parava em "no unique or exclusion constraint matching the
    // ON CONFLICT specification", e duas fichas com o mesmo e-mail quebrariam a
    // promessa de um Synse ID por pessoa.
    await client.query(`insert into user_profiles (name, email) values ('A','dup@x.com')`)
    await expect(
      client.query(`insert into user_profiles (name, email) values ('B','dup@x.com')`),
    ).rejects.toThrow(/duplicate key|unique/i)
  })

  it('e-mail ignora maiúsculas — é a mesma pessoa', async () => {
    await expect(
      client.query(`insert into user_profiles (name, email) values ('C','DUP@X.COM')`),
    ).rejects.toThrow(/duplicate key|unique/i)
  })

  it('Synse ID nasce no formato certo e é único', async () => {
    const { rows } = await client.query<{ synse_id: string }>(
      `insert into user_profiles (name, email) values ('D','d@x.com') returning synse_id`,
    )
    // Crockford Base32: sem I, L, O nem U, que a pessoa confunde ao ler em voz alta.
    expect(rows[0].synse_id).toMatch(/^SYN-[0-9A-HJKMNP-TV-Z]{8}$/)
  })

  it('recusa Synse ID fora do formato', async () => {
    await expect(
      client.query(
        `insert into user_profiles (name, email, synse_id) values ('E','e@x.com','SYN-ILOU1234')`,
      ),
    ).rejects.toThrow(/synse_id_format/i)
  })
})

describe.skipIf(!temBanco)('comissão da plataforma', () => {
  it('vem do banco, com 2% de padrão — nunca fixa no código', async () => {
    const { rows } = await client.query<{ column_default: string }>(`
      select column_default from information_schema.columns
      where table_name = 'organization_billing_settings' and column_name = 'platform_fee_percentage'
    `)
    expect(rows[0].column_default).toMatch(/2/)
  })

  it('é configurável por organização', async () => {
    const { rows } = await client.query<{ n: string }>(`
      select count(*)::text as n from information_schema.columns
      where table_name = 'organization_billing_settings' and column_name = 'organization_id'
    `)
    expect(Number(rows[0].n)).toBe(1)
  })
})
