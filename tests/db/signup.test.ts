import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Cadastro de academia. Precisa funcionar para quem ainda não pertence a
 * organização nenhuma, sem abrir brecha para quem não está autenticado.
 */

let client: Client
const temBanco = await databaseAvailable()
const NOVO = '33333333-3333-3333-3333-333333333333'
const OUTRO = '44444444-4444-4444-4444-444444444444'

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await client.query(`insert into auth.users (id, email) values ($1,'novo@x.com'), ($2,'outro@x.com')`, [
    NOVO,
    OUTRO,
  ])
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const cadastrar = (authId: string | null, nome: string, slug: string) =>
  asUser<{ create_organization_with_owner: string }>(
    client,
    authId,
    `select create_organization_with_owner($1,$2,'Dono') as create_organization_with_owner`,
    [nome, slug],
  )

describe.skipIf(!temBanco)('create_organization_with_owner', () => {
  it('anônimo não cadastra', async () => {
    await expect(cadastrar(null, 'Invasora', 'invasora')).rejects.toThrow(/permission denied/i)
  })

  it('autenticado sem vínculo cadastra e vira proprietário', async () => {
    const rows = await cadastrar(NOVO, 'Academia Nova', 'nova')
    expect(rows[0].create_organization_with_owner).toMatch(/^[0-9a-f-]{36}$/)

    const visiveis = await asUser<{ name: string }>(client, NOVO, 'select name from organizations')
    expect(visiveis.map((row) => row.name)).toEqual(['Academia Nova'])

    const papel = await asUser<{ role: string }>(
      client,
      NOVO,
      `select m.role from organization_members m
       join user_profiles p on p.id = m.user_profile_id
       where p.auth_user_id = $1`,
      [NOVO],
    )
    expect(papel[0].role).toBe('OWNER')
  })

  it('cria as configurações junto, com a comissão do padrão do banco', async () => {
    const rows = await asUser<{ platform_fee_percentage: string }>(
      client,
      NOVO,
      'select platform_fee_percentage from organization_billing_settings',
    )
    expect(Number(rows[0].platform_fee_percentage)).toBe(2)
  })

  it('recusa a segunda academia da mesma pessoa', async () => {
    // Sem esta trava, clique duplo no botão criaria organizações órfãs.
    await expect(cadastrar(NOVO, 'Segunda', 'segunda')).rejects.toThrow(/já é proprietária/i)
  })

  it('a academia nova não enxerga a de outra pessoa', async () => {
    await cadastrar(OUTRO, 'Academia Outra', 'outra')

    const doNovo = await asUser<{ name: string }>(client, NOVO, 'select name from organizations')
    const doOutro = await asUser<{ name: string }>(client, OUTRO, 'select name from organizations')

    expect(doNovo.map((row) => row.name)).toEqual(['Academia Nova'])
    expect(doOutro.map((row) => row.name)).toEqual(['Academia Outra'])
  })
})
