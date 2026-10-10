import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Encerrar a própria conta.
 *
 * É a única operação irreversível do produto, e a que mais pode destruir dado
 * de terceiro por engano: a ficha que a academia mantém do aluno não é da
 * pessoa que está saindo, e a prova de consentimento é justamente o que o
 * controlador precisa guardar depois que ela sai.
 */

let client: Client
const temBanco = await databaseAvailable()

const ANA = '11110000-0000-0000-0000-00000000aaaa'
const DONO = '22220000-0000-0000-0000-00000000bbbb'
const SOZINHO = '33330000-0000-0000-0000-00000000cccc'
const ORG = 'f0f0f0f0-0000-0000-0000-000000000001'
const ORG_VAZIA = 'f0f0f0f0-0000-0000-0000-000000000002'

let perfilAna: string

async function conta(authId: string, email: string, nome: string) {
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  const { rows } = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,$2,$3) returning id`,
    [authId, nome, email],
  )
  return rows[0].id as string
}

const encerrar = (authId: string, confirmacao = 'APAGAR') =>
  asUser(client, authId, `select close_own_account($1)`, [confirmacao])

const perfil = (id: string) =>
  client
    .query(`select name, email, phone, auth_user_id from user_profiles where id = $1`, [id])
    .then((r) => r.rows[0])

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(
    `insert into organizations (id, name, slug) values ($1,'Academia Saída','saida'), ($2,'Studio Só Meu','so-meu')`,
    [ORG, ORG_VAZIA],
  )

  perfilAna = await conta(ANA, 'ana@saida.test', 'Ana Saindo')
  await client.query(`update user_profiles set phone = '11988887777' where id = $1`, [perfilAna])

  const perfilDono = await conta(DONO, 'dono@saida.test', 'Dono')
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG, perfilDono],
  )

  const perfilSozinho = await conta(SOZINHO, 'sozinho@saida.test', 'Sozinho')
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG_VAZIA, perfilSozinho],
  )

  // A Ana é aluna da academia do Dono, com histórico e consentimento.
  const { rows: aluno } = await client.query(
    `insert into students (organization_id, user_profile_id, status) values ($1,$2,'ACTIVE') returning id`,
    [ORG, perfilAna],
  )
  await client.query(
    `insert into check_ins (organization_id, student_id, method) values ($1,$2,'MANUAL')`,
    [ORG, aluno[0].id],
  )
  await client.query(
    `insert into charges (organization_id, student_id, description, amount, due_date)
     values ($1,$2,'Mensalidade de agosto',149.9,'2026-08-10')`,
    [ORG, aluno[0].id],
  )
  await asUser(client, ANA, `select record_consent('PROGRESS_PHOTOS', true)`)
  await client.query(
    `insert into activities (user_profile_id, sport, status, started_at, distance_meters, elapsed_seconds)
     values ($1,'RUN','COMPLETED', now(), 5000, 1800)`,
    [perfilAna],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('confirmação', () => {
  it('sem a palavra certa, nada acontece', async () => {
    await expect(encerrar(ANA, 'sim')).rejects.toThrow(/Confirmação inválida/)
    await expect(encerrar(ANA, '')).rejects.toThrow(/Confirmação inválida/)

    // A tela pergunta, mas a última operação irreversível do produto não pode
    // depender só dela.
    expect((await perfil(perfilAna)).name).toBe('Ana Saindo')
  })

  it('anônimo não encerra conta de ninguém', async () => {
    await expect(asUser(client, null, `select close_own_account('APAGAR')`)).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('dono de academia', () => {
  it('não some deixando alunos para trás', async () => {
    await expect(encerrar(DONO)).rejects.toThrow(/único responsável/)
  })

  it('academia sem aluno não bloqueia', async () => {
    // O bloqueio protege terceiros. Sem terceiros, não há o que proteger.
    await expect(encerrar(SOZINHO)).resolves.toBeTruthy()
  })
})

describe.skipIf(!temBanco)('o que sai e o que fica', () => {
  it('encerra e devolve o que foi apagado', async () => {
    const [linha] = await encerrar(ANA)
    expect((linha as { close_own_account: Record<string, number> }).close_own_account).toMatchObject(
      { atividades: 1 },
    )
  })

  it('a identificação sai do perfil', async () => {
    const p = await perfil(perfilAna)
    expect(p.name).toBe('Conta encerrada')
    expect(p.phone).toBeNull()
    // `.invalid` é o domínio que a RFC 2606 reserva para nunca existir.
    expect(p.email).toMatch(/@synse\.invalid$/)
  })

  it('o login é desligado, que é o que encerra a conta de fato', async () => {
    expect((await perfil(perfilAna)).auth_user_id).toBeNull()

    // E a sessão antiga deixa de encontrar qualquer coisa.
    const resolvido = await asUser<{ id: string | null }>(
      client,
      ANA,
      `select auth_profile_id() as id`,
    )
    expect(resolvido[0].id).toBeNull()
  })

  it('as corridas dela somem', async () => {
    const { rows } = await client.query(
      `select count(*)::int as total from activities where user_profile_id = $1`,
      [perfilAna],
    )
    expect(rows[0].total).toBe(0)
  })

  it('o consentimento fica, porque é a prova que a lei cobra do controlador', async () => {
    const { rows } = await client.query(
      `select consent_type, accepted from consents where user_profile_id = $1`,
      [perfilAna],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ consent_type: 'PROGRESS_PHOTOS', accepted: true })
  })

  it('a cobrança fica, porque é registro fiscal da academia', async () => {
    const { rows } = await client.query(
      `select count(*)::int as total from charges c
       join students s on s.id = c.student_id
       where s.user_profile_id = $1`,
      [perfilAna],
    )
    expect(rows[0].total).toBe(1)
  })

  it('o histórico na academia fica, com a matrícula encerrada', async () => {
    /*
     * Presença é registro da academia, não da pessoa: apagar destruiria dado de
     * um terceiro que também responde por ele.
     */
    const { rows } = await client.query(
      `select s.status, s.cancelled_at is not null as encerrada,
              (select count(*)::int from check_ins c where c.student_id = s.id) as presencas
       from students s where s.user_profile_id = $1`,
      [perfilAna],
    )
    expect(rows[0]).toMatchObject({ status: 'CANCELLED', encerrada: true, presencas: 1 })
  })

  it('fica o registro de que houve exclusão, sem dizer de quem', async () => {
    const { rows } = await client.query(
      `select actor_id, entity_id from audit_logs where action = 'account.closed' and entity_id = $1`,
      [perfilAna],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].actor_id).toBeNull()
  })

  it('o e-mail antigo é liberado para um cadastro novo', async () => {
    // O índice de e-mail é único: se a anonimização não trocasse o endereço, a
    // pessoa não conseguiria voltar a se cadastrar com o próprio e-mail.
    await expect(
      client.query(
        `insert into user_profiles (name, email) values ('Ana de novo','ana@saida.test')`,
      ),
    ).resolves.toBeTruthy()
  })
})
