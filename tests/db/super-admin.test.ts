import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A conta de plataforma.
 *
 * Ela lê dado de saúde de qualquer aluno de qualquer academia — é o que
 * permite dar suporte, e é exatamente o tipo de poder que precisa de limites
 * explícitos. O que estes testes prendem são três coisas: quem pode criar a
 * conta, o que ela alcança depois de criada, e que a trilha de acesso não pode
 * ser apagada por quem está sendo auditado.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ADMIN = '99999999-1111-0000-0000-000000000001'
const AUTH_DONO_ALPHA = ALPHA.authId
const AUTH_ALUNO = '99999999-1111-0000-0000-000000000002'

const PLATAFORMA = '00000000-0000-0000-0000-000000000002'
let perfilAdmin: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 3)

  await client.query(`insert into auth.users (id, email) values ($1,'admin@synse.com.br')`, [
    AUTH_ADMIN,
  ])
  const perfil = await client.query(
    `insert into user_profiles (auth_user_id, name, email)
     values ($1,'Plataforma','admin@synse.com.br') returning id`,
    [AUTH_ADMIN],
  )
  perfilAdmin = perfil.rows[0].id

  // Um aluno com conta, para provar que gente comum não alcança nada disto.
  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 limit 1`,
    [ALPHA.orgId],
  )
  await client.query(`insert into auth.users (id, email) values ($1,'aluno@alpha.test')`, [
    AUTH_ALUNO,
  ])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    rows[0].user_profile_id,
  ])
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe('criar a conta', () => {
  it('a organização da plataforma existe e é reservada', async () => {
    const { rows } = await client.query(`select name, slug from organizations where id = $1`, [
      PLATAFORMA,
    ])
    expect(rows[0].name).toBe('Synse Plataforma')
  })

  it('promover exige service_role — o app não alcança', async () => {
    /*
     * Se a aplicação pudesse promover, um defeito numa tela criaria uma conta
     * que lê o banco inteiro. A porta é o SQL Editor, e só.
     */
    await expect(
      asUser(client, AUTH_DONO_ALPHA, `select grant_super_admin('admin@synse.com.br')`),
    ).rejects.toThrow(/permission denied|permissão/i)

    await expect(
      asUser(client, null, `select grant_super_admin('admin@synse.com.br')`),
    ).rejects.toThrow(/permission denied|permissão/i)
  })

  it('e-mail sem conta recusa em vez de criar do nada', async () => {
    await expect(
      client.query(`select grant_super_admin('ninguem@lugar.nenhum')`),
    ).rejects.toThrow(/Nenhuma conta com o e-mail/i)
  })

  it('promove, e promover de novo não duplica', async () => {
    await client.query(`select grant_super_admin('admin@synse.com.br')`)
    await client.query(`select grant_super_admin('ADMIN@synse.com.br')`)

    const { rows } = await client.query(
      `select count(*)::int as total from organization_members
       where user_profile_id = $1 and role = 'SUPER_ADMIN'`,
      [perfilAdmin],
    )
    expect(rows[0].total).toBe(1)
  })
})

describe('o que a conta alcança', () => {
  it('enxerga as duas academias, sem ser membro de nenhuma', async () => {
    const linhas = await asUser<{ id: string }>(
      client,
      AUTH_ADMIN,
      `select id from organizations where id in ($1,$2)`,
      [ALPHA.orgId, BETA.orgId],
    )
    expect(linhas).toHaveLength(2)
  })

  it('enxerga os alunos das duas', async () => {
    const linhas = await asUser(client, AUTH_ADMIN, `select id from students`, [])
    // Três em cada academia, semeados pelo helper.
    expect(linhas.length).toBeGreaterThanOrEqual(6)
  })

  it('o dono da Alpha continua sem ver a Beta — nada afrouxou para os outros', async () => {
    /*
     * O risco de somar um papel que vê tudo é afrouxar o resto sem perceber.
     * Este teste existe para falhar no dia em que isso acontecer.
     */
    const linhas = await asUser(client, AUTH_DONO_ALPHA, `select id from students`, [])
    expect(linhas).toHaveLength(3)
  })
})

describe('a trilha de acesso', () => {
  it('registra a entrada numa academia', async () => {
    await asUser(client, AUTH_ADMIN, `select log_platform_context($1, 'ACADEMIA')`, [ALPHA.orgId])

    const { rows } = await client.query(
      `select organization_id, context from platform_access_log where user_profile_id = $1`,
      [perfilAdmin],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].organization_id).toBe(ALPHA.orgId)
    expect(rows[0].context).toBe('ACADEMIA')
  })

  it('quem não é conta de plataforma não troca de contexto', async () => {
    // A tela também recusa, mas é aqui que a recusa vale: cookie é editável.
    await expect(
      asUser(client, AUTH_ALUNO, `select log_platform_context($1, 'ACADEMIA')`, [BETA.orgId]),
    ).rejects.toThrow(/Somente contas de plataforma/i)
  })

  it('o aluno não lê a trilha', async () => {
    const linhas = await asUser(client, AUTH_ALUNO, `select id from platform_access_log`, [])
    expect(linhas).toHaveLength(0)
  })

  it('nem o dono da academia', async () => {
    const linhas = await asUser(client, AUTH_DONO_ALPHA, `select id from platform_access_log`, [])
    expect(linhas).toHaveLength(0)
  })

  it('o próprio auditado não apaga o que fez', async () => {
    /*
     * Trilha que o auditado limpa não é trilha. O `revoke` de delete vale
     * inclusive para a conta de plataforma — ela lê, e só.
     */
    await expect(
      asUser(client, AUTH_ADMIN, `delete from platform_access_log`, []),
    ).rejects.toThrow(/permission denied|permissão/i)

    await expect(
      asUser(client, AUTH_ADMIN, `update platform_access_log set context = 'PESSOAL'`, []),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})

describe('tirar o poder', () => {
  it('revogar devolve a conta ao normal', async () => {
    await client.query(`select revoke_super_admin('admin@synse.com.br')`)

    const linhas = await asUser(client, AUTH_ADMIN, `select id from students`, [])
    expect(linhas).toHaveLength(0)
  })

  it('e revogar também é só do service_role', async () => {
    await expect(
      asUser(client, AUTH_DONO_ALPHA, `select revoke_super_admin('admin@synse.com.br')`),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})
