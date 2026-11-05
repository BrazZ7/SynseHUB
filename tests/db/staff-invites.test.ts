import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Convite de equipe.
 *
 * O que se protege aqui é o acesso ao painel — financeiro, dados de saúde dos
 * alunos, permissão de apagar. Dois caminhos entregariam isso sem quebrar
 * nada visível: um link que qualquer um abre, e um gerente que se promove a
 * dono convidando o próprio e-mail alternativo.
 */

let client: Client
const temBanco = await databaseAvailable()

const DONA = '88888888-8888-8888-8888-888888888888'
const GERENTE = '99999999-9999-9999-9999-999999999999'
const CONVIDADO = 'aaaaaaaa-9999-9999-9999-999999999999'
const INTRUSO = 'bbbbbbbb-9999-9999-9999-999999999999'
const ORG = 'eeeeeeee-0000-0000-0000-000000000005'

const EMAIL_CONVIDADO = 'novo.professor@equipe.test'

let perfilDona: string
let perfilGerente: string

async function criarConta(authId: string, email: string, nome: string, papel?: string) {
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  const { rows } = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,$2,$3) returning id`,
    [authId, nome, email],
  )
  if (papel) {
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,$3)`,
      [ORG, rows[0].id, papel],
    )
  }
  return rows[0].id as string
}

const convidar = (
  authId: string,
  email: string,
  papel: string,
  extras: { jobTitle?: string; registro?: string } = {},
) =>
  asUser<{ token: string }>(
    client,
    authId,
    `select create_staff_invite($1::uuid, $2, $3::user_role, $4, $5) as token`,
    [ORG, email, papel, extras.jobTitle ?? null, extras.registro ?? null],
  ).then((linhas) => linhas[0].token)

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(
    `insert into organizations (id, name, slug) values ($1,'Academia Equipe','equipe')`,
    [ORG],
  )
  perfilDona = await criarConta(DONA, 'dona@equipe.test', 'Dona', 'OWNER')
  perfilGerente = await criarConta(GERENTE, 'gerente@equipe.test', 'Gerente', 'MANAGER')
  await criarConta(CONVIDADO, EMAIL_CONVIDADO, 'Professor Novo')
  await criarConta(INTRUSO, 'intruso@outro.test', 'Intruso')
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('criar convite', () => {
  it('a dona convida, e o token volta uma vez só para ela', async () => {
    const token = await convidar(DONA, EMAIL_CONVIDADO, 'TRAINER', { registro: 'CREF 123456-G/SP' })
    expect(token).toMatch(/^[0-9a-f]{48}$/)

    const { rows } = await client.query(
      `select email, role, status, registration_number from staff_invites where token = $1`,
      [token],
    )
    expect(rows[0].email).toBe(EMAIL_CONVIDADO)
    expect(rows[0].role).toBe('TRAINER')
    expect(rows[0].status).toBe('PENDING')
    expect(rows[0].registration_number).toBe('CREF 123456-G/SP')
  })

  it('reconvidar renova o prazo e troca o token', async () => {
    const primeiro = await convidar(DONA, 'renovado@equipe.test', 'RECEPTIONIST')
    const segundo = await convidar(DONA, 'renovado@equipe.test', 'RECEPTIONIST')

    // O link antigo pode estar numa conversa esquecida; ele para de valer.
    expect(segundo).not.toBe(primeiro)

    const { rows } = await client.query(
      `select count(*)::int as total from staff_invites
       where organization_id = $1 and email = 'renovado@equipe.test'`,
      [ORG],
    )
    expect(rows[0].total).toBe(1)
  })

  it('ninguém convida acima do próprio acesso', async () => {
    /*
     * Sem esta trava, o caminho para tomar a academia é um gerente convidar o
     * próprio e-mail alternativo como OWNER.
     */
    await expect(convidar(GERENTE, 'golpe@equipe.test', 'OWNER')).rejects.toThrow(
      /acesso maior que o seu/,
    )
    await expect(convidar(DONA, 'outro.dono@equipe.test', 'OWNER')).resolves.toBeTruthy()
  })

  it('quem não é da direção não convida', async () => {
    await expect(convidar(CONVIDADO, 'qualquer@equipe.test', 'TRAINER')).rejects.toThrow(
      /direção da academia/,
    )
    await expect(convidar(INTRUSO, 'qualquer2@equipe.test', 'TRAINER')).rejects.toThrow()
  })

  it('aluno e super admin não se convidam por aqui', async () => {
    await expect(convidar(DONA, 'aluno@equipe.test', 'STUDENT')).rejects.toThrow(/não se convida/)
    await expect(convidar(DONA, 'deus@equipe.test', 'SUPER_ADMIN')).rejects.toThrow()
  })

  it('e-mail malformado é recusado antes de virar link', async () => {
    await expect(convidar(DONA, 'sem-arroba', 'TRAINER')).rejects.toThrow(/inválido/)
    await expect(convidar(DONA, 'a@b', 'TRAINER')).rejects.toThrow(/inválido/)
  })

  it('quem já é da equipe não recebe convite', async () => {
    await expect(convidar(DONA, 'gerente@equipe.test', 'TRAINER')).rejects.toThrow(/já faz parte/)
  })
})

describe.skipIf(!temBanco)('aceitar convite', () => {
  it('o link sozinho não dá acesso: o e-mail precisa bater', async () => {
    const token = await convidar(DONA, 'so.para.ela@equipe.test', 'TRAINER')

    // Convite encaminhado por engano, ou token adivinhado: quem abre primeiro
    // não leva o painel da academia.
    await expect(
      asUser(client, INTRUSO, `select accept_staff_invite($1)`, [token]),
    ).rejects.toThrow(/outro e-mail/)

    const { rows } = await client.query(`select status from staff_invites where token = $1`, [
      token,
    ])
    expect(rows[0].status).toBe('PENDING')
  })

  it('sem sessão nenhuma, nada acontece', async () => {
    const token = await convidar(DONA, 'anonimo@equipe.test', 'TRAINER')
    await expect(asUser(client, null, `select accept_staff_invite($1)`, [token])).rejects.toThrow()
  })

  it('aceitar cria o vínculo e a ficha de profissional', async () => {
    const token = await convidar(DONA, EMAIL_CONVIDADO, 'TRAINER', { registro: 'CREF 999' })

    await asUser(client, CONVIDADO, `select accept_staff_invite($1)`, [token])

    const membro = await client.query(
      `select m.role, m.status from organization_members m
       join user_profiles u on u.id = m.user_profile_id
       where m.organization_id = $1 and lower(u.email) = $2`,
      [ORG, EMAIL_CONVIDADO],
    )
    expect(membro.rows[0]).toMatchObject({ role: 'TRAINER', status: 'ACTIVE' })

    // Sem a ficha, a pessoa teria acesso e não apareceria na lista de
    // profissionais — nem poderia assinar um treino.
    const ficha = await client.query(
      `select s.role, s.registration_number from staff s
       join user_profiles u on u.id = s.user_profile_id
       where s.organization_id = $1 and lower(u.email) = $2`,
      [ORG, EMAIL_CONVIDADO],
    )
    expect(ficha.rows[0]).toMatchObject({ role: 'TRAINER', registration_number: 'CREF 999' })

    const convite = await client.query(`select status from staff_invites where token = $1`, [token])
    expect(convite.rows[0].status).toBe('ACCEPTED')
  })

  it('o mesmo link não serve duas vezes', async () => {
    const token = await convidar(DONA, 'duasvezes@equipe.test', 'RECEPTIONIST')
    await client.query(`update staff_invites set status = 'ACCEPTED' where token = $1`, [token])

    await expect(
      asUser(client, CONVIDADO, `select accept_staff_invite($1)`, [token]),
    ).rejects.toThrow(/inválido ou já usado/)
  })

  it('convite vencido não vale, e fica marcado como vencido', async () => {
    const token = await convidar(DONA, 'atrasado@equipe.test', 'TRAINER')
    await client.query(
      `update staff_invites set expires_at = now() - interval '1 day' where token = $1`,
      [token],
    )
    await criarConta('cccccccc-9999-9999-9999-999999999999', 'atrasado@equipe.test', 'Atrasado')

    await expect(
      asUser(client, 'cccccccc-9999-9999-9999-999999999999', `select accept_staff_invite($1)`, [
        token,
      ]),
    ).rejects.toThrow(/vencido/)

    /*
     * O status só muda na varredura do próximo convite: a exceção desfaz a
     * transação, então marcar como vencido dentro da função seria escrita
     * fantasma. Recusar é o que importa; arrumar a etiqueta pode esperar.
     */
    await convidar(DONA, 'varredura@equipe.test', 'TRAINER')

    const { rows } = await client.query(`select status from staff_invites where token = $1`, [
      token,
    ])
    expect(rows[0].status).toBe('EXPIRED')
  })

  it('token inventado não encontra nada', async () => {
    await expect(
      asUser(client, CONVIDADO, `select accept_staff_invite('naoexiste')`),
    ).rejects.toThrow(/inválido/)
  })
})

describe.skipIf(!temBanco)('o token não circula', () => {
  it('a lista que a tela usa não expõe o token', async () => {
    const colunas = await client.query(
      `select column_name from information_schema.columns
       where table_name = 'staff_invites_public'`,
    )
    /*
     * Um token legível por qualquer pessoa da equipe é um token que circula. A
     * view existe para que a lista de convites pendentes possa ser mostrada sem
     * entregar junto a chave de cada um.
     */
    expect(colunas.rows.map((linha) => linha.column_name)).not.toContain('token')
  })

  it('cancelar exige direção, e só alcança convite pendente', async () => {
    const token = await convidar(DONA, 'cancelado@equipe.test', 'TRAINER')
    const { rows } = await client.query(`select id from staff_invites where token = $1`, [token])
    const id = rows[0].id

    await expect(
      asUser(client, CONVIDADO, `select revoke_staff_invite($1::uuid)`, [id]),
    ).rejects.toThrow(/direção/)

    await asUser(client, DONA, `select revoke_staff_invite($1::uuid)`, [id])
    const depois = await client.query(`select status from staff_invites where id = $1`, [id])
    expect(depois.rows[0].status).toBe('REVOKED')
  })

  it('academia nenhuma enxerga convite de outra', async () => {
    const vistos = await asUser<{ total: number }>(
      client,
      INTRUSO,
      `select count(*)::int as total from staff_invites`,
    )
    expect(vistos[0].total).toBe(0)
    expect(perfilDona && perfilGerente).toBeTruthy()
  })
})
