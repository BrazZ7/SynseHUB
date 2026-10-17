import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Entrada sem academia.
 *
 * A organização reservada é compartilhada por todo mundo que entra sozinho, e
 * é justamente por isso que estes testes existem: o isolamento não vem de cada
 * um ter a sua organização, vem de a reservada não ter equipe. Se um dia
 * alguém for inserido como membro dela, o teste de isolamento cai.
 */

let client: Client
const temBanco = await databaseAvailable()

const SOLO_ORG = '00000000-0000-0000-0000-000000000001'
const ANA = '77777777-7777-7777-7777-777777777777'
const BRUNO = '88888888-8888-8888-8888-888888888888'
const DONA = '99999999-9999-9999-9999-999999999999'
const ORG = 'dddddddd-0000-0000-0000-000000000004'

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(
    `insert into auth.users (id, email) values ($1,'ana@s.test'), ($2,'bruno@s.test'), ($3,'dona@s.test')`,
    [ANA, BRUNO, DONA],
  )
  await client.query(
    `insert into organizations (id, name, slug, invite_code, status)
     values ($1,'Academia Real','real','REAL22','ACTIVE')`,
    [ORG],
  )
  const dona = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Dona','dona@s.test') returning id`,
    [DONA],
  )
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG, dona.rows[0].id],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const entrarSozinho = (authId: string | null, nome: string) =>
  asUser<{ join_synse_as_solo_student: string }>(
    client,
    authId,
    `select join_synse_as_solo_student($1) as join_synse_as_solo_student`,
    [nome],
  )

describe.skipIf(!temBanco)('join_synse_as_solo_student', () => {
  it('a organização reservada existe e não aceita convite', async () => {
    const { rows } = await client.query(
      `select name, invite_code from organizations where id = $1`,
      [SOLO_ORG],
    )
    expect(rows[0].name).toBe('Synse')
    // Código nulo: nada em SQL é igual a nulo, então nenhum código digitado
    // faz alguém cair aqui por engano.
    expect(rows[0].invite_code).toBeNull()
  })

  it('anônimo não entra', async () => {
    await expect(entrarSozinho(null, 'Ninguém')).rejects.toThrow(/permission denied/i)
  })

  it('cria matrícula ativa e o aviso de boas-vindas', async () => {
    const [{ join_synse_as_solo_student: id }] = await entrarSozinho(ANA, 'Ana Solo')
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    const { rows } = await client.query(
      `select status, organization_id from students where id = $1`,
      [id],
    )
    expect(rows[0]).toMatchObject({ status: 'ACTIVE', organization_id: SOLO_ORG })

    const avisos = await asUser<{ title: string }>(client, ANA, 'select title from notifications')
    expect(avisos.map((row) => row.title)).toEqual(['Bem-vindo ao Synse'])
  })

  it('chamar de novo não duplica a matrícula', async () => {
    const [{ join_synse_as_solo_student: repetido }] = await entrarSozinho(ANA, 'Ana Solo')
    const { rows } = await client.query(
      `select count(*)::int as total from students where organization_id = $1`,
      [SOLO_ORG],
    )
    expect(rows[0].total).toBe(1)
    expect(repetido).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('um solo não enxerga o outro', async () => {
    await entrarSozinho(BRUNO, 'Bruno Solo')

    const paraAna = await asUser<{ id: string }>(client, ANA, 'select id from students')
    const paraBruno = await asUser<{ id: string }>(client, BRUNO, 'select id from students')

    expect(paraAna).toHaveLength(1)
    expect(paraBruno).toHaveLength(1)
    expect(paraAna[0].id).not.toBe(paraBruno[0].id)

    // Nem o nome um do outro: `user_profiles` é visível para equipe, e a
    // organização reservada não tem nenhuma.
    const perfis = await asUser<{ name: string }>(client, ANA, 'select name from user_profiles')
    expect(perfis.map((row) => row.name)).toEqual(['Ana Solo'])
  })

  it('nenhuma academia enxerga quem entrou sozinho', async () => {
    const vistoPelaDona = await asUser<{ id: string }>(client, DONA, 'select id from students')
    expect(vistoPelaDona).toHaveLength(0)
  })

  it('quem entrou sozinho ainda pode entrar numa academia depois', async () => {
    await asUser(client, ANA, `select join_organization_as_student('real22','Ana Solo')`)

    const matriculas = await asUser<{ organization_id: string; status: string }>(
      client,
      ANA,
      'select organization_id, status from students order by organization_id',
    )
    expect(matriculas).toHaveLength(2)
    expect(matriculas.find((row) => row.organization_id === ORG)?.status).toBe('PENDING')
    expect(matriculas.find((row) => row.organization_id === SOLO_ORG)?.status).toBe('ACTIVE')
  })
})
