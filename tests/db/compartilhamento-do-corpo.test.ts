import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ALPHA,
  BETA,
  applyMigrations,
  asUser,
  connect,
  databaseAvailable,
  seedTwoGyms,
} from './helpers'

/**
 * Quem o aluno pode autorizar a ver o corpo dele (0045).
 *
 * ── O que esta migration existe para resolver ───────────────────────────────
 *
 * A 0032 criou a autorização nominal e revogável, e as actions que a operam.
 * A tela nunca existiu, e a razão é esta: para oferecer "autorize alguém", a
 * tela precisa listar **quem** — e `staff_read` (0004) exige
 * `is_org_staff(organization_id)`. O aluno não lê a tabela `staff`, e está
 * certo que não leia.
 *
 * `equipe_para_autorizar()` devolve a projeção estreita que a escolha pede, e
 * `autorizar_corpo()` confere que a pessoa é mesmo da equipe de uma academia
 * desta conta.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * 1. **A projeção não vaza a relação de trabalho de ninguém** — sem CREF, sem
 *    especialidade, sem situação de contrato.
 * 2. **A equipe da outra academia não aparece, nem pode ser autorizada.**
 * 3. **Autorizar não é ler**: quem recebe passa a ver o histórico, quem não
 *    recebe continua sem ver, e revogar fecha na hora.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ALUNO = 'dddd1111-1111-1111-1111-111111111111'
const AUTH_PROF = 'dddd2222-2222-2222-2222-222222222222'
const AUTH_PROF_BETA = 'dddd3333-3333-3333-3333-333333333333'

let perfilAluno: string
let perfilProf: string
let perfilProfBeta: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  // O aluno: já vem de `seedTwoGyms`, matriculado na Alpha.
  const { rows: alunos } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  perfilAluno = alunos[0].user_profile_id
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_ALUNO,
    'aluno@corpo.test',
  ])
  await client.query(`update user_profiles set auth_user_id = $1, email = $2 where id = $3`, [
    AUTH_ALUNO,
    'aluno@corpo.test',
    perfilAluno,
  ])

  // Um professor em cada academia.
  for (const [auth, email, nome, org] of [
    [AUTH_PROF, 'prof@alpha.test', 'Professor Alpha', ALPHA.orgId],
    [AUTH_PROF_BETA, 'prof@beta.test', 'Professor Beta', BETA.orgId],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    const { rows } = await client.query(
      `insert into user_profiles (name, email, auth_user_id) values ($1,$2,$3) returning id`,
      [nome, email, auth],
    )
    const perfil = rows[0].id
    if (auth === AUTH_PROF) perfilProf = perfil
    else perfilProfBeta = perfil

    await client.query(
      `insert into staff (organization_id, user_profile_id, role, registration_number, specialties, status)
       values ($1, $2, 'TRAINER', 'CREF-12345', array['musculação'], 'ACTIVE')`,
      [org, perfil],
    )
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role, status)
       values ($1, $2, 'TRAINER', 'ACTIVE')`,
      [org, perfil],
    )
  }
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const equipe = () =>
  asUser<{ perfil_id: string; nome: string; papel: string }>(
    client,
    AUTH_ALUNO,
    `select * from equipe_para_autorizar()`,
  )

describe.skipIf(!temBanco)('a lista de quem dá para autorizar', () => {
  it('o aluno não lê a tabela staff direto — era o impedimento', async () => {
    /*
     * O controle da migration inteira. Se um dia esta asserção cair, alguém
     * afrouxou `staff_read` e a função perdeu a razão de existir — pior,
     * todo aluno passou a ver CREF e situação de contrato da equipe.
     */
    const linhas = await asUser(client, AUTH_ALUNO, `select * from staff`)
    expect(linhas).toHaveLength(0)
  })

  it('mas enxerga a equipe da própria academia pela função', async () => {
    const r = await equipe()
    expect(r.map((p) => p.nome)).toEqual(['Professor Alpha'])
    expect(r[0].papel).toBe('TRAINER')
  })

  it('e a equipe da outra academia não aparece', async () => {
    const r = await equipe()
    expect(r.map((p) => p.nome)).not.toContain('Professor Beta')
  })

  it('a projeção não leva CREF, especialidade nem situação', async () => {
    /*
     * A razão de a função existir em vez de abrir a política: isto é dado da
     * relação de trabalho de outra pessoa, e não ajuda a decidir "autorizo
     * este professor?".
     */
    const [{ r: assinatura }] = await asUser<{ r: string }>(
      client,
      AUTH_ALUNO,
      `select pg_get_function_result(oid) as r from pg_proc where proname = 'equipe_para_autorizar'`,
    )
    expect(assinatura).toContain('nome text')
    for (const proibida of ['registration_number', 'specialties', 'status', 'created_at']) {
      expect(assinatura).not.toContain(proibida)
    }

    const texto = JSON.stringify(await equipe())
    expect(texto).not.toContain('CREF')
    expect(texto).not.toContain('musculação')
  })

  it('quem já está autorizado sai da lista', async () => {
    // `unique (user_profile_id, shared_with_profile_id)` na 0032: oferecer de
    // novo seria um botão que sempre falha.
    await asUser(client, AUTH_ALUNO, `select autorizar_corpo($1)`, [perfilProf])
    expect(await equipe()).toHaveLength(0)

    await client.query(`delete from body_measurement_shares where user_profile_id = $1`, [
      perfilAluno,
    ])
  })
})

describe.skipIf(!temBanco)('autorizar', () => {
  it('recusa quem não é da equipe de uma academia sua', async () => {
    await expect(
      asUser(client, AUTH_ALUNO, `select autorizar_corpo($1)`, [perfilProfBeta]),
    ).rejects.toThrow(/não é da equipe/i)
  })

  it('recusa autorizar a si mesmo', async () => {
    await expect(
      asUser(client, AUTH_ALUNO, `select autorizar_corpo($1)`, [perfilAluno]),
    ).rejects.toThrow(/próprio histórico/i)
  })

  it('o anônimo não autoriza nada', async () => {
    await expect(asUser(client, null, `select autorizar_corpo($1)`, [perfilProf])).rejects.toThrow()
  })

  it('autoriza, e o professor passa a ler o histórico', async () => {
    await client.query(
      `insert into body_measurements (user_profile_id, client_id, measured_at, source, weight_kg)
       values ($1, 'c1', now(), 'MANUAL', 80.0)
       on conflict do nothing`,
      [perfilAluno],
    )

    const antes = await asUser(
      client,
      AUTH_PROF,
      `select weight_kg from body_measurements where user_profile_id = $1`,
      [perfilAluno],
    )
    expect(antes).toHaveLength(0) // o controle: sem autorização, não lê

    await asUser(client, AUTH_ALUNO, `select autorizar_corpo($1)`, [perfilProf])

    const depois = await asUser(
      client,
      AUTH_PROF,
      `select weight_kg from body_measurements where user_profile_id = $1`,
      [perfilAluno],
    )
    expect(depois).toHaveLength(1)
  })

  it('e revogar fecha de novo, na hora', async () => {
    const { rows } = await client.query(
      `select id from body_measurement_shares
        where user_profile_id = $1 and shared_with_profile_id = $2`,
      [perfilAluno, perfilProf],
    )
    await asUser(
      client,
      AUTH_ALUNO,
      `update body_measurement_shares set revoked_at = now() where id = $1`,
      [rows[0].id],
    )

    const depois = await asUser(
      client,
      AUTH_PROF,
      `select weight_kg from body_measurements where user_profile_id = $1`,
      [perfilAluno],
    )
    expect(depois).toHaveLength(0)
  })

  it('reautorizar quem foi revogado funciona, em vez de esbarrar na unicidade', async () => {
    // Trocar de professor e voltar é o caso comum. Sem o `on conflict`,
    // revogar seria definitivo por acidente de schema.
    await asUser(client, AUTH_ALUNO, `select autorizar_corpo($1)`, [perfilProf])

    const depois = await asUser(
      client,
      AUTH_PROF,
      `select weight_kg from body_measurements where user_profile_id = $1`,
      [perfilAluno],
    )
    expect(depois).toHaveLength(1)
  })

  it('o professor não autoriza a si mesmo no corpo do aluno', async () => {
    /*
     * `body_shares_owner` (0032) casa `user_profile_id = auth_profile_id()`
     * na escrita, e `autorizar_corpo` grava sempre em nome de quem chama.
     * Nenhum dos dois caminhos deixa o professor se dar acesso.
     */
    await client.query(`delete from body_measurement_shares where user_profile_id = $1`, [
      perfilAluno,
    ])

    await expect(
      asUser(
        client,
        AUTH_PROF,
        `insert into body_measurement_shares (user_profile_id, shared_with_profile_id)
         values ($1, $2)`,
        [perfilAluno, perfilProf],
      ),
    ).rejects.toThrow()

    const leu = await asUser(
      client,
      AUTH_PROF,
      `select weight_kg from body_measurements where user_profile_id = $1`,
      [perfilAluno],
    )
    expect(leu).toHaveLength(0)
  })
})

describe.skipIf(!temBanco)('apagar a própria medição', () => {
  it('a pessoa apaga a dela', async () => {
    // `deleteBodyMeasurementAction` existia desde a 0032 sem tela. A trava é
    // a RLS (`body_measurements_delete_self`); o que faltava era o gesto.
    await client.query(
      `insert into body_measurements (user_profile_id, client_id, measured_at, source, weight_kg)
       values ($1, 'apagar-1', now(), 'MANUAL', 81.0) on conflict do nothing`,
      [perfilAluno],
    )
    const { rows } = await client.query(
      `select id from body_measurements where user_profile_id = $1 and client_id = 'apagar-1'`,
      [perfilAluno],
    )

    await asUser(client, AUTH_ALUNO, `delete from body_measurements where id = $1`, [rows[0].id])

    const { rows: depois } = await client.query(
      `select count(*)::int as n from body_measurements where id = $1`,
      [rows[0].id],
    )
    expect(depois[0].n).toBe(0)
  })

  it('e não apaga a de outra pessoa, nem com autorização de leitura', async () => {
    /*
     * O que mais importa aqui. `body_shared_with_me` abre a **leitura**; a
     * política de delete fala só de `user_profile_id = auth_profile_id()`.
     * Se um dia alguém reaproveitar a condição de leitura no delete, o
     * professor passa a apagar o histórico do aluno — e este teste cai.
     */
    await asUser(client, AUTH_ALUNO, `select autorizar_corpo($1)`, [perfilProf])

    await client.query(
      `insert into body_measurements (user_profile_id, client_id, measured_at, source, weight_kg)
       values ($1, 'do-aluno', now(), 'MANUAL', 82.0) on conflict do nothing`,
      [perfilAluno],
    )
    const { rows } = await client.query(
      `select id from body_measurements where user_profile_id = $1 and client_id = 'do-aluno'`,
      [perfilAluno],
    )

    // O professor lê — a autorização está de pé.
    const lido = await asUser(
      client,
      AUTH_PROF,
      `select weight_kg from body_measurements where id = $1`,
      [rows[0].id],
    )
    expect(lido).toHaveLength(1)

    // E não apaga.
    await asUser(client, AUTH_PROF, `delete from body_measurements where id = $1`, [rows[0].id])
    const { rows: continua } = await client.query(
      `select count(*)::int as n from body_measurements where id = $1`,
      [rows[0].id],
    )
    expect(continua[0].n).toBe(1)
  })
})
