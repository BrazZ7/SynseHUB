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
  await client.query(
    `insert into auth.users (id, email) values ($1,'novo@x.com'), ($2,'outro@x.com')`,
    [NOVO, OUTRO],
  )
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

describe.skipIf(!temBanco)('join_organization_as_student', () => {
  const ALUNO = '55555555-5555-5555-5555-555555555555'
  const INTRUSO = '66666666-6666-6666-6666-666666666666'
  let codigo = ''

  beforeAll(async () => {
    if (!temBanco) return
    await client.query(
      `insert into auth.users (id, email) values ($1,'aluno@x.com'), ($2,'intruso@x.com')
       on conflict do nothing`,
      [ALUNO, INTRUSO],
    )
    const { rows } = await client.query<{ invite_code: string }>(
      `select invite_code from organizations where slug = 'nova'`,
    )
    codigo = rows[0].invite_code
  })

  const entrar = (authId: string | null, code: string) =>
    asUser<{ join_organization_as_student: string }>(
      client,
      authId,
      `select join_organization_as_student($1, 'Aluno Teste') as join_organization_as_student`,
      [code],
    )

  it('toda academia tem código, e ele não se repete', async () => {
    const { rows } = await client.query<{ total: string; distintos: string }>(
      `select count(invite_code)::text as total, count(distinct invite_code)::text as distintos
       from organizations`,
    )
    expect(Number(rows[0].total)).toBeGreaterThan(0)
    expect(rows[0].total).toBe(rows[0].distintos)
  })

  /*
   * Sem letras que se confundem faladas ou lidas de um cartaz: nada de I, L, O,
   * U, zero ou um. O código vai ser ditado na recepção.
   */
  it('o código não usa caracteres ambíguos', async () => {
    const { rows } = await client.query<{ invite_code: string }>(
      `select invite_code from organizations where invite_code is not null`,
    )
    for (const row of rows) {
      expect(row.invite_code).toMatch(/^[2-9A-HJKMNPQRSTVWXYZ]{6}$/)
      expect(row.invite_code).not.toMatch(/[ILOU01]/)
    }
  })

  it('anônimo não entra em academia nenhuma', async () => {
    await expect(entrar(null, codigo)).rejects.toThrow(/permission denied/i)
  })

  it('código inválido é recusado', async () => {
    await expect(entrar(ALUNO, 'ZZZZZZ')).rejects.toThrow(/Código de convite inválido/i)
  })

  it('com o código certo, a matrícula nasce pendente de confirmação', async () => {
    const rows = await entrar(ALUNO, codigo)
    expect(rows[0].join_organization_as_student).toMatch(/^[0-9a-f-]{36}$/)

    const { rows: matricula } = await client.query<{ status: string; name: string }>(
      `select s.status, p.name from students s
       join user_profiles p on p.id = s.user_profile_id
       where p.auth_user_id = $1`,
      [ALUNO],
    )
    // Nascer ATIVA colocaria o aluno na contagem de mensalidades de uma
    // academia que nunca o cadastrou.
    expect(matricula[0].status).toBe('PENDING')
    expect(matricula[0].name).toBe('Aluno Teste')
  })

  it('entrar duas vezes com o mesmo código não duplica a matrícula', async () => {
    await entrar(ALUNO, codigo)

    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from students s
       join user_profiles p on p.id = s.user_profile_id
       where p.auth_user_id = $1`,
      [ALUNO],
    )
    expect(Number(rows[0].n)).toBe(1)
  })

  it('o código aceita minúsculas e espaço sobrando, como quem digita no celular', async () => {
    const rows = await entrar(INTRUSO, `  ${codigo.toLowerCase()}  `)
    expect(rows[0].join_organization_as_student).toMatch(/^[0-9a-f-]{36}$/)
  })

  /*
   * A entrada pelo código dá acesso àquela academia e a nenhuma outra. Se a RLS
   * falhasse aqui, um aluno veria a base de alunos de quem nunca o convidou.
   */
  it('o aluno passa a enxergar só a academia do código', async () => {
    const visiveis = await asUser<{ name: string }>(client, ALUNO, 'select name from organizations')
    expect(visiveis.map((row) => row.name)).toEqual(['Academia Nova'])
  })
})
