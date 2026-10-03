import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A foto de perfil.
 *
 * O balde é privado de propósito: a foto é o rosto de alguém, fica ao lado de
 * dado de saúde, e uma URL pública continuaria funcionando para sempre — em
 * captura de tela, em log de proxy, no histórico do navegador.
 *
 * O que estes testes prendem é quem alcança o quê: a pessoa escreve só na
 * pasta dela, a equipe da academia dela consegue ver, e aluno não vê foto de
 * aluno.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ALUNO = '77777777-0000-0000-0000-000000000001'
const AUTH_COLEGA = '77777777-0000-0000-0000-000000000002'
const AUTH_PROFESSOR = '77777777-0000-0000-0000-000000000003'
const AUTH_DE_OUTRA = '77777777-0000-0000-0000-000000000004'

let perfilAluno: string

async function darConta(org: string, indice: number, authId: string, email: string) {
  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1
     order by created_at, id offset $2 limit 1`,
    [org, indice],
  )
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
  return rows[0].user_profile_id as string
}

/** Sobe um objeto como o Storage faria, para as políticas terem o que filtrar. */
async function porFoto(authId: string, arquivo = 'rosto.webp') {
  return asUser(
    client,
    authId,
    `insert into storage.objects (bucket_id, name) values ('avatars', $1) returning id`,
    [`${authId}/${arquivo}`],
  )
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 3)

  perfilAluno = await darConta(ALPHA.orgId, 0, AUTH_ALUNO, 'aluno.foto@alpha.test')
  await darConta(ALPHA.orgId, 1, AUTH_COLEGA, 'colega.foto@alpha.test')
  await darConta(BETA.orgId, 0, AUTH_DE_OUTRA, 'outra@beta.test')

  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_PROFESSOR,
    'prof.foto@alpha.test',
  ])
  const prof = await client.query(
    `insert into user_profiles (auth_user_id, name, email)
     values ($1,'Professor','prof.foto@alpha.test') returning id`,
    [AUTH_PROFESSOR],
  )
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role)
     values ($1,$2,'TRAINER')`,
    [ALPHA.orgId, prof.rows[0].id],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe('o balde', () => {
  it('não é público', async () => {
    const { rows } = await client.query(`select public, file_size_limit from storage.buckets where id = 'avatars'`)
    expect(rows[0].public).toBe(false)
    // O limite mora no balde, e não só na aplicação: o cliente pode mentir.
    expect(Number(rows[0].file_size_limit)).toBe(2_097_152)
  })
})

describe('quem escreve', () => {
  it('a pessoa põe foto na própria pasta', async () => {
    const linhas = await porFoto(AUTH_ALUNO)
    expect(linhas).toHaveLength(1)
  })

  it('e não na pasta de outra pessoa', async () => {
    /*
     * O caminho é `<auth.uid()>/<arquivo>`. Sem esta política, bastaria mandar
     * o identificador alheio no caminho para escrever por cima da foto dele.
     */
    await expect(
      asUser(
        client,
        AUTH_COLEGA,
        `insert into storage.objects (bucket_id, name) values ('avatars', $1)`,
        [`${AUTH_ALUNO}/invasao.webp`],
      ),
    ).rejects.toThrow(/row-level security|violates/i)
  })

  it('apagar é da pessoa', async () => {
    await porFoto(AUTH_COLEGA, 'antiga.webp')
    await asUser(client, AUTH_COLEGA, `delete from storage.objects where name = $1`, [
      `${AUTH_COLEGA}/antiga.webp`,
    ])
    const { rows } = await client.query(`select count(*)::int as t from storage.objects where name = $1`, [
      `${AUTH_COLEGA}/antiga.webp`,
    ])
    expect(rows[0].t).toBe(0)
  })
})

describe('quem enxerga', () => {
  it('a própria pessoa', async () => {
    const linhas = await asUser(client, AUTH_ALUNO, `select id from storage.objects where name = $1`, [
      `${AUTH_ALUNO}/rosto.webp`,
    ])
    expect(linhas).toHaveLength(1)
  })

  it('o professor da academia dela — ele precisa reconhecer quem chega', async () => {
    const linhas = await asUser(client, AUTH_PROFESSOR, `select id from storage.objects where name = $1`, [
      `${AUTH_ALUNO}/rosto.webp`,
    ])
    expect(linhas).toHaveLength(1)
  })

  it('colega de academia NÃO vê foto de colega', async () => {
    const linhas = await asUser(client, AUTH_COLEGA, `select id from storage.objects where name = $1`, [
      `${AUTH_ALUNO}/rosto.webp`,
    ])
    expect(linhas).toHaveLength(0)
  })

  it('a academia concorrente muito menos', async () => {
    const linhas = await asUser(client, AUTH_DE_OUTRA, `select id from storage.objects where name = $1`, [
      `${AUTH_ALUNO}/rosto.webp`,
    ])
    expect(linhas).toHaveLength(0)
  })

  it('o anônimo não vê nada', async () => {
    const linhas = await asUser(client, null, `select id from storage.objects`, [])
    expect(linhas).toHaveLength(0)
  })
})

describe('registrar a foto no perfil', () => {
  it('grava o caminho da própria pessoa', async () => {
    await asUser(client, AUTH_ALUNO, `select set_profile_avatar($1)`, [`${AUTH_ALUNO}/rosto.webp`])
    const { rows } = await client.query(`select avatar_url from user_profiles where id = $1`, [
      perfilAluno,
    ])
    expect(rows[0].avatar_url).toBe(`${AUTH_ALUNO}/rosto.webp`)
  })

  it('recusa caminho de outra pessoa', async () => {
    /*
     * O arquivo já estaria protegido pela política de leitura. O que isto
     * impede é o perfil apontar para a foto alheia — a equipe veria a pessoa
     * errada na lista.
     */
    await expect(
      asUser(client, AUTH_COLEGA, `select set_profile_avatar($1)`, [`${AUTH_ALUNO}/rosto.webp`]),
    ).rejects.toThrow(/não é seu/i)
  })

  it('nulo apaga a foto', async () => {
    await asUser(client, AUTH_ALUNO, `select set_profile_avatar(null)`, [])
    const { rows } = await client.query(`select avatar_url from user_profiles where id = $1`, [
      perfilAluno,
    ])
    expect(rows[0].avatar_url).toBeNull()
  })

  it('sem sessão não grava', async () => {
    await expect(
      asUser(client, null, `select set_profile_avatar($1)`, ['x/y.webp']),
    ).rejects.toThrow(/permission denied|permissão|não identificada/i)
  })
})
