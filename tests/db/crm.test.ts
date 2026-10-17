import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O CRM.
 *
 * Dois testes carregam o módulo: a conversão acontece inteira ou não acontece
 * (aluno criado com lead aberto é lead que alguém liga duas vezes), e o
 * histórico é escrito venha a mudança de onde vier — porque taxa de conversão
 * com buraco é um número que ninguém desconfia.
 */

let client: Client
const temBanco = await databaseAvailable()
let planoAlpha: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  const { rows } = await client.query(
    `select id from membership_plans where organization_id = $1 limit 1`,
    [ALPHA.orgId],
  )
  planoAlpha = rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

async function criarLead(nome: string, org = ALPHA.orgId, email: string | null = null) {
  const { rows } = await client.query(
    `insert into leads (organization_id, name, phone, email) values ($1,$2,'11999990000',$3)
     returning id`,
    [org, nome, email],
  )
  return rows[0].id as string
}

const eventosDe = async (leadId: string) => {
  const { rows } = await client.query(
    `select kind, from_stage, to_stage from lead_events where lead_id = $1 order by created_at`,
    [leadId],
  )
  return rows
}

describe.skipIf(!temBanco)('histórico do funil', () => {
  it('o lead nasce com um evento de criação', async () => {
    const lead = await criarLead('Joana')
    expect(await eventosDe(lead)).toEqual([
      { kind: 'CREATED', from_stage: null, to_stage: 'NEW' },
    ])
  })

  it('cada mudança de etapa vira evento, com de-onde e para-onde', async () => {
    const lead = await criarLead('Marcos')
    await client.query(`update leads set stage = 'CONTACTED' where id = $1`, [lead])
    await client.query(`update leads set stage = 'TRIAL_CLASS' where id = $1`, [lead])

    const eventos = await eventosDe(lead)
    expect(eventos).toHaveLength(3)
    expect(eventos[1]).toMatchObject({ from_stage: 'NEW', to_stage: 'CONTACTED' })
    expect(eventos[2]).toMatchObject({ from_stage: 'CONTACTED', to_stage: 'TRIAL_CLASS' })
  })

  it('editar o lead sem mexer na etapa não polui o histórico', async () => {
    /*
     * Corrigir um telefone não é uma mudança de funil. Sem esta checagem, cada
     * salvamento inflaria o histórico e o tempo médio entre etapas viraria
     * ruído.
     */
    const lead = await criarLead('Paula')
    await client.query(`update leads set phone = '11888887777' where id = $1`, [lead])
    expect(await eventosDe(lead)).toHaveLength(1)
  })

  it('o motivo da perda entra no evento', async () => {
    const lead = await criarLead('Rui')
    await client.query(
      `update leads set stage = 'LOST', lost_reason = 'Achou caro' where id = $1`,
      [lead],
    )
    const { rows } = await client.query(
      `select body from lead_events where lead_id = $1 and to_stage = 'LOST'`,
      [lead],
    )
    expect(rows[0].body).toBe('Achou caro')
  })

  it('o histórico não é escrito na mão pelo cliente', async () => {
    // Forjar uma mudança de etapa faria a taxa de conversão medir ficção.
    const lead = await criarLead('Tentativa')
    await expect(
      asUser(
        client,
        ALPHA.authId,
        `insert into lead_events (organization_id, lead_id, kind, to_stage)
         values ($1, $2, 'STAGE_CHANGE', 'ENROLLED')`,
        [ALPHA.orgId, lead],
      ),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})

describe.skipIf(!temBanco)('conversão', () => {
  it('cria perfil, aluno e matrícula, e fecha o lead — tudo junto', async () => {
    const lead = await criarLead('Carla', ALPHA.orgId, 'carla@exemplo.test')

    // `asUser` já devolve as linhas, não um resultado com `.rows`.
    const convertido = await asUser<{ id: string }>(
      client,
      ALPHA.authId,
      `select convert_lead_to_student($1, $2, 5::smallint) as id`,
      [lead, planoAlpha],
    )
    const aluno = convertido[0].id

    const estado = await client.query(
      `select l.stage, l.converted_student_id, s.status, p.name, p.email::text as email,
              m.price::float8 as preco, m.billing_day
       from leads l
       join students s on s.id = l.converted_student_id
       join user_profiles p on p.id = s.user_profile_id
       join memberships m on m.student_id = s.id
       where l.id = $1`,
      [lead],
    )
    expect(estado.rows[0]).toMatchObject({
      stage: 'ENROLLED',
      converted_student_id: aluno,
      status: 'ACTIVE',
      name: 'Carla',
      email: 'carla@exemplo.test',
      preco: 109.9,
      billing_day: 5,
    })
  })

  it('lead sem e-mail vira aluno mesmo assim, com endereço reservado', async () => {
    /*
     * Lead de balcão não tem e-mail. Recusar a conversão seria travar o caso
     * mais comum da recepção; `.invalid` é reservado por norma e não pode
     * receber mensagem, então ocupa a coluna única sem enganar ninguém.
     */
    const lead = await criarLead('Sem Email')
    const convertido = await asUser<{ id: string }>(
      client,
      ALPHA.authId,
      `select convert_lead_to_student($1) as id`,
      [lead],
    )

    const { rows: perfil } = await client.query(
      `select p.email::text as email from students s
       join user_profiles p on p.id = s.user_profile_id where s.id = $1`,
      [convertido[0].id],
    )
    expect(perfil[0].email).toMatch(/@synse\.invalid$/)
  })

  it('converter duas vezes devolve o mesmo aluno, sem criar um segundo', async () => {
    const lead = await criarLead('Duplo', ALPHA.orgId, 'duplo@exemplo.test')

    const primeira = await asUser<{ id: string }>(
      client, ALPHA.authId, `select convert_lead_to_student($1, $2) as id`, [lead, planoAlpha],
    )
    const segunda = await asUser<{ id: string }>(
      client, ALPHA.authId, `select convert_lead_to_student($1, $2) as id`, [lead, planoAlpha],
    )

    expect(segunda[0].id).toBe(primeira[0].id)
    const { rows } = await client.query(
      `select count(*)::int as total from memberships where student_id = $1`,
      [primeira[0].id],
    )
    expect(rows[0].total).toBe(1)
  })

  it('a conversão registra a passagem para ENROLLED no histórico', async () => {
    const lead = await criarLead('Histórico', ALPHA.orgId, 'h@exemplo.test')
    await asUser(client, ALPHA.authId, `select convert_lead_to_student($1)`, [lead])

    const eventos = await eventosDe(lead)
    expect(eventos.at(-1)).toMatchObject({ to_stage: 'ENROLLED' })
  })

  it('plano de outra academia é recusado', async () => {
    const outro = await client.query(
      `insert into membership_plans (organization_id, name, price) values ($1,'Alheio',99)
       returning id`,
      [BETA.orgId],
    )
    const lead = await criarLead('Plano errado')

    await expect(
      asUser(client, ALPHA.authId, `select convert_lead_to_student($1, $2)`, [
        lead,
        outro.rows[0].id,
      ]),
    ).rejects.toThrow(/não é da sua academia/i)
  })

  it('lead da academia vizinha não é convertido', async () => {
    const lead = await criarLead('Da Beta', BETA.orgId)
    await expect(
      asUser(client, ALPHA.authId, `select convert_lead_to_student($1)`, [lead]),
    ).rejects.toThrow(/não é da sua academia/i)
  })
})

describe.skipIf(!temBanco)('quem enxerga o funil', () => {
  it('a academia vizinha não lê lead nem histórico', async () => {
    const daBeta = await asUser<{ leads: number; eventos: number }>(
      client,
      BETA.authId,
      `select (select count(*) from leads where organization_id = $1)::int as leads,
              (select count(*) from lead_events where organization_id = $1)::int as eventos`,
      [ALPHA.orgId],
    )
    expect(daBeta[0]).toMatchObject({ leads: 0, eventos: 0 })
  })

  it('o funil conta por etapa, e só o da própria academia', async () => {
    const meu = await asUser<{ etapa: string; total: number }>(
      client,
      ALPHA.authId,
      `select etapa::text, total from lead_funnel($1, now() - interval '1 day', now() + interval '1 day')`,
      [ALPHA.orgId],
    )
    expect(meu.length).toBeGreaterThan(0)

    const alheio = await asUser<{ total: number }>(
      client,
      BETA.authId,
      `select coalesce(sum(total), 0)::int as total
       from lead_funnel($1, now() - interval '1 day', now() + interval '1 day')`,
      [ALPHA.orgId],
    )
    expect(Number(alheio[0].total)).toBe(0)
  })
})
