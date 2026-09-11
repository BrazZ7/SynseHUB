import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * O sino.
 *
 * O que se verifica aqui não é a tela: é que o fato gera o aviso no banco, sem
 * a aplicação pedir. Se o aviso dependesse de uma chamada da aplicação, uma
 * confirmação feita por script ou por SQL de suporte não avisaria ninguém — e
 * essa é exatamente a falha que o gatilho existe para impedir.
 */

let client: Client
const temBanco = await databaseAvailable()

const DONA = '55555555-5555-5555-5555-555555555555'
const ALUNO = '66666666-6666-6666-6666-666666666666'
const ORG = 'cccccccc-0000-0000-0000-000000000003'

let donaProfile: string
let alunoProfile: string
let studentId: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(`insert into auth.users (id, email) values ($1,'dona@n.test'), ($2,'aluno@n.test')`, [
    DONA,
    ALUNO,
  ])
  await client.query(
    `insert into organizations (id, name, slug, invite_code, status)
     values ($1,'Academia Sino','sino','SINO22','ACTIVE')`,
    [ORG],
  )

  const dona = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Dona','dona@n.test') returning id`,
    [DONA],
  )
  donaProfile = dona.rows[0].id
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG, donaProfile],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const avisos = (profileId: string) =>
  client
    .query(
      `select category, title, body, action_url, read_at from notifications
       where user_profile_id = $1 order by created_at`,
      [profileId],
    )
    .then((result) => result.rows)

describe.skipIf(!temBanco)('gatilhos de notificação', () => {
  it('aluno que entra pelo código avisa a academia', async () => {
    const [{ join_organization_as_student: id }] = await asUser<{
      join_organization_as_student: string
    }>(
      client,
      ALUNO,
      `select join_organization_as_student('sino22','Aluno Novo') as join_organization_as_student`,
    )
    studentId = id

    const daDona = await avisos(donaProfile)
    expect(daDona).toHaveLength(1)
    expect(daDona[0].title).toBe('Aluno Novo entrou pelo código de convite')
    expect(daDona[0].action_url).toBe('/students?status=PENDING')
    expect(daDona[0].read_at).toBeNull()

    const perfil = await client.query(`select id from user_profiles where auth_user_id = $1`, [ALUNO])
    alunoProfile = perfil.rows[0].id
    // O aviso é para a academia decidir. O aluno não é notificado da própria entrada.
    expect(await avisos(alunoProfile)).toHaveLength(0)
  })

  it('confirmar a matrícula avisa o aluno', async () => {
    await client.query(`update students set status = 'ACTIVE' where id = $1`, [studentId])

    const doAluno = await avisos(alunoProfile)
    expect(doAluno).toHaveLength(1)
    expect(doAluno[0].title).toBe('Matrícula confirmada')
    expect(doAluno[0].body).toContain('Academia Sino')
  })

  it('mudança de status que não é confirmação nem cancelamento não avisa', async () => {
    await client.query(`update students set status = 'INACTIVE' where id = $1`, [studentId])
    expect(await avisos(alunoProfile)).toHaveLength(1)
  })

  it('cobrança criada avisa o aluno com valor em reais', async () => {
    await client.query(
      `insert into charges (organization_id, student_id, description, amount, due_date)
       values ($1,$2,'Mensalidade de março',149.9,'2026-03-10')`,
      [ORG, studentId],
    )

    const doAluno = await avisos(alunoProfile)
    expect(doAluno).toHaveLength(2)
    expect(doAluno[1].title).toBe('Nova cobrança de R$ 149,90')
    expect(doAluno[1].body).toContain('vence em 10/03/2026')
  })

  it('pagamento confirmado avisa os dois lados', async () => {
    await client.query(`update charges set status = 'PAID', paid_at = now() where student_id = $1`, [
      studentId,
    ])

    const doAluno = await avisos(alunoProfile)
    expect(doAluno.at(-1)?.title).toBe('Pagamento confirmado')

    const daDona = await avisos(donaProfile)
    expect(daDona.at(-1)?.title).toBe('Pagamento recebido de Aluno Novo')
    expect(daDona.at(-1)?.body).toContain('R$ 149,90')
  })

  it('cada pessoa só enxerga os próprios avisos', async () => {
    const vistoPeloAluno = await asUser<{ user_profile_id: string }>(
      client,
      ALUNO,
      'select user_profile_id from notifications',
    )
    expect(vistoPeloAluno.every((row) => row.user_profile_id === alunoProfile)).toBe(true)
    expect(vistoPeloAluno.length).toBeGreaterThan(0)
  })

  it('marcar como lido não alcança o aviso de outra pessoa', async () => {
    const naoLidosDaDona = () =>
      client
        .query(`select count(*)::int as total from notifications where user_profile_id = $1 and read_at is null`, [
          donaProfile,
        ])
        .then((result) => result.rows[0].total as number)

    const antes = await naoLidosDaDona()
    expect(antes).toBeGreaterThan(0)

    const [{ mark_notifications_read: marcados }] = await asUser<{
      mark_notifications_read: number
    }>(client, ALUNO, 'select mark_notifications_read() as mark_notifications_read')

    expect(marcados).toBeGreaterThan(0)
    expect(await naoLidosDaDona()).toBe(antes)

    const doAluno = await avisos(alunoProfile)
    expect(doAluno.every((row) => row.read_at !== null)).toBe(true)
  })

  it('anônimo não marca nada como lido', async () => {
    await expect(
      asUser(client, null, 'select mark_notifications_read()'),
    ).rejects.toThrow(/permission denied/i)
  })
})
