import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Desafios da academia.
 *
 * Dois testes carregam o módulo. O da contagem automática — porque desafio cujo
 * progresso alguém digita é competição de quem mente melhor. E o do
 * consentimento: frequência e carga dizem muito sobre o corpo e a rotina de
 * alguém, e o ranking exige a academia ligar E o aluno marcar.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '66666666-6666-6666-6666-666666666666'
const AUTH_OUTRO = '77777777-7777-7777-7777-777777777777'
let aluno: string
let perfilAluno: string
let outroAluno: string
let perfilOutro: string
let exercicio: string

async function darConta(studentId: string, authId: string, email: string) {
  const { rows } = await client.query(`select user_profile_id from students where id = $1`, [
    studentId,
  ])
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
  return rows[0].user_profile_id as string
}

async function criarDesafio(campos: Record<string, unknown> = {}) {
  const base = {
    organization_id: ALPHA.orgId,
    title: 'Desafio',
    metric: 'CHECKINS',
    target_value: 3,
    starts_at: 'current_date - 1',
    ends_at: 'current_date + 30',
    ranking_enabled: false,
    status: 'ACTIVE',
    ...campos,
  }
  const { rows } = await client.query(
    `insert into challenges
       (organization_id, title, metric, target_value, starts_at, ends_at, ranking_enabled, status)
     values ($1,$2,$3,$4, current_date - 1, current_date + 30, $5, $6) returning id`,
    [
      base.organization_id,
      base.title,
      base.metric,
      base.target_value,
      base.ranking_enabled,
      base.status,
    ],
  )
  return rows[0].id as string
}

const progressoDe = async (desafio: string, perfil: string) => {
  const { rows } = await client.query(
    `select progress_value::float8 as valor, completed_at from challenge_participants
     where challenge_id = $1 and user_profile_id = $2`,
    [desafio, perfil],
  )
  return rows[0] as { valor: number; completed_at: string | null } | undefined
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [ALPHA.orgId],
  )
  aluno = rows[0].id
  outroAluno = rows[1].id
  perfilAluno = await darConta(aluno, AUTH_ALUNO, 'd1@alpha.test')
  perfilOutro = await darConta(outroAluno, AUTH_OUTRO, 'd2@alpha.test')

  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group) values ($1,'Supino','CHEST')
     returning id`,
    [ALPHA.orgId],
  )
  exercicio = ex.rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('entrar no desafio', () => {
  it('o aluno entra e começa em zero', async () => {
    const desafio = await criarDesafio()
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1, false)`, [desafio])

    expect(await progressoDe(desafio, perfilAluno)).toMatchObject({ valor: 0, completed_at: null })
  })

  it('entrar de novo muda a escolha de ranking sem zerar o progresso', async () => {
    const desafio = await criarDesafio()
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1, false)`, [desafio])
    await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
      ALPHA.orgId,
      aluno,
    ])

    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1, true)`, [desafio])

    const depois = await progressoDe(desafio, perfilAluno)
    expect(depois?.valor).toBe(1)
    const { rows } = await client.query(
      `select ranking_opt_in from challenge_participants where challenge_id = $1 and user_profile_id = $2`,
      [desafio, perfilAluno],
    )
    expect(rows[0].ranking_opt_in).toBe(true)
  })

  it('desafio de outra academia é recusado', async () => {
    const daBeta = await criarDesafio({ organization_id: BETA.orgId })
    await expect(
      asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [daBeta]),
    ).rejects.toThrow(/não é aluno desta academia/i)
  })

  it('rascunho não aceita inscrição', async () => {
    const rascunho = await criarDesafio({ status: 'DRAFT' })
    await expect(
      asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [rascunho]),
    ).rejects.toThrow(/não está aberto/i)
  })

  it('o aluno não escreve participação na mão', async () => {
    // Um insert cru permitiria entrar em desafio alheio e digitar o progresso.
    const desafio = await criarDesafio()
    await expect(
      asUser(
        client,
        AUTH_ALUNO,
        `insert into challenge_participants (challenge_id, user_profile_id, progress_value)
         values ($1, $2, 999)`,
        [desafio, perfilAluno],
      ),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})

describe.skipIf(!temBanco)('a contagem é do sistema, não do aluno', () => {
  it('check-in soma em CHECKINS', async () => {
    const desafio = await criarDesafio({ metric: 'CHECKINS', target_value: 3 })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [desafio])

    for (let i = 0; i < 2; i += 1) {
      await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
        ALPHA.orgId,
        aluno,
      ])
    }
    expect((await progressoDe(desafio, perfilAluno))?.valor).toBe(2)
  })

  it('treino concluído soma em WORKOUTS, e só na transição', async () => {
    /*
     * Sem a checagem de transição, cada UPDATE da sessão somaria de novo — e o
     * aluno bateria a meta editando a mesma linha.
     */
    const desafio = await criarDesafio({ metric: 'WORKOUTS', target_value: 5 })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [desafio])

    const { rows } = await client.query(
      `insert into workout_sessions (organization_id, student_id, client_id)
       values ($1,$2,'w-1') returning id`,
      [ALPHA.orgId, aluno],
    )
    await client.query(
      `update workout_sessions set status = 'COMPLETED', completed_at = now() where id = $1`,
      [rows[0].id],
    )
    await client.query(`update workout_sessions set duration_seconds = 3600 where id = $1`, [
      rows[0].id,
    ])

    expect((await progressoDe(desafio, perfilAluno))?.valor).toBe(1)
  })

  it('série soma em SETS e o volume em VOLUME_KG', async () => {
    const porSerie = await criarDesafio({ metric: 'SETS', target_value: 10 })
    const porVolume = await criarDesafio({ metric: 'VOLUME_KG', target_value: 5000 })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [porSerie])
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [porVolume])

    const { rows } = await client.query(
      `insert into workout_sessions (organization_id, student_id, client_id)
       values ($1,$2,'w-series') returning id`,
      [ALPHA.orgId, aluno],
    )
    for (let i = 1; i <= 3; i += 1) {
      await client.query(
        `insert into workout_set_logs
           (organization_id, session_id, exercise_id, set_number, reps_completed, weight, client_id)
         values ($1,$2,$3,$4,10,70,$5)`,
        [ALPHA.orgId, rows[0].id, exercicio, i, `s-${i}`],
      )
    }

    expect((await progressoDe(porSerie, perfilAluno))?.valor).toBe(3)
    expect((await progressoDe(porVolume, perfilAluno))?.valor).toBe(3 * 10 * 70)
  })

  it('série sem carga soma zero de volume, não anula o total', async () => {
    // Peso corporal: `coalesce` evita que o nulo zere a soma inteira.
    const porVolume = await criarDesafio({ metric: 'VOLUME_KG', target_value: 1000 })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [porVolume])

    // O índice de "um treino ativo por aluno" da 0026 recusa a segunda sessão
    // aberta. Fechar a anterior é o que o app faz ao encerrar o treino.
    await client.query(
      `update workout_sessions set status = 'COMPLETED' where student_id = $1 and status = 'IN_PROGRESS'`,
      [aluno],
    )
    const { rows } = await client.query(
      `insert into workout_sessions (organization_id, student_id, client_id)
       values ($1,$2,'w-corporal') returning id`,
      [ALPHA.orgId, aluno],
    )
    await client.query(
      `insert into workout_set_logs
         (organization_id, session_id, exercise_id, set_number, reps_completed, weight, client_id)
       values ($1,$2,$3,1,20,null,'sc-1'), ($1,$2,$3,2,10,50,'sc-2')`,
      [ALPHA.orgId, rows[0].id, exercicio],
    )

    expect((await progressoDe(porVolume, perfilAluno))?.valor).toBe(500)
  })

  it('a data de conclusão é gravada uma vez, na primeira vez que a meta cai', async () => {
    const desafio = await criarDesafio({ metric: 'CHECKINS', target_value: 2 })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1)`, [desafio])

    for (let i = 0; i < 2; i += 1) {
      await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
        ALPHA.orgId,
        aluno,
      ])
    }
    const naConquista = await progressoDe(desafio, perfilAluno)
    expect(naConquista?.completed_at).not.toBeNull()

    // Ninguém para de treinar porque o desafio acabou: continua somando, e a
    // data da conquista não se move.
    await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
      ALPHA.orgId,
      aluno,
    ])
    const depois = await progressoDe(desafio, perfilAluno)
    expect(depois?.valor).toBe(3)
    expect(depois?.completed_at).toEqual(naConquista?.completed_at)
  })

  it('desafio fora da janela não conta', async () => {
    const { rows: passado } = await client.query(
      `insert into challenges
         (organization_id, title, metric, target_value, starts_at, ends_at, status)
       values ($1,'Terminado','CHECKINS',3, current_date - 60, current_date - 30, 'ACTIVE')
       returning id`,
      [ALPHA.orgId],
    )
    await client.query(
      `insert into challenge_participants (challenge_id, user_profile_id) values ($1,$2)`,
      [passado[0].id, perfilAluno],
    )

    await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
      ALPHA.orgId,
      aluno,
    ])
    expect((await progressoDe(passado[0].id, perfilAluno))?.valor).toBe(0)
  })
})

describe.skipIf(!temBanco)('o ranking exige dois consentimentos', () => {
  it('a academia ligar não basta: quem não marcou não aparece', async () => {
    /*
     * A regra do produto é explícita — métrica pessoal não é publicada sem
     * consentimento. Frequência e carga dizem onde a pessoa estava e o que o
     * corpo dela aguenta.
     */
    const desafio = await criarDesafio({ ranking_enabled: true, target_value: 1 })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1, true)`, [desafio])
    await asUser(client, AUTH_OUTRO, `select join_gym_challenge($1, false)`, [desafio])

    for (const estudante of [aluno, outroAluno]) {
      await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
        ALPHA.orgId,
        estudante,
      ])
    }

    const { rows } = await client.query(`select nome from gym_challenge_ranking($1)`, [desafio])
    const nomes = rows.map((r) => r.nome)
    const quemMarcou = await client.query(`select name from user_profiles where id = $1`, [
      perfilAluno,
    ])
    const quemNao = await client.query(`select name from user_profiles where id = $1`, [
      perfilOutro,
    ])

    expect(nomes).toContain(quemMarcou.rows[0].name)
    expect(nomes).not.toContain(quemNao.rows[0].name)
  })

  it('o aluno marcar não basta: desafio sem ranking não tem quadro', async () => {
    const semRanking = await criarDesafio({ ranking_enabled: false })
    await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1, true)`, [semRanking])

    const { rows } = await client.query(`select count(*)::int as total from gym_challenge_ranking($1)`, [
      semRanking,
    ])
    expect(rows[0].total).toBe(0)
  })

  it('nem a equipe da academia vê quem não marcou', async () => {
    // A tranca é da consulta, não da permissão: não há caminho que a contorne.
    const desafio = await criarDesafio({ ranking_enabled: true })
    await asUser(client, AUTH_OUTRO, `select join_gym_challenge($1, false)`, [desafio])

    const daEquipe = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select count(*)::int as total from gym_challenge_ranking($1)`,
      [desafio],
    )
    expect(daEquipe[0].total).toBe(0)
  })
})

describe.skipIf(!temBanco)('isolamento entre academias', () => {
  it('a vizinha não lê o desafio desta', async () => {
    await criarDesafio({ title: 'Só da Alpha' })
    const daBeta = await asUser<{ total: number }>(
      client,
      BETA.authId,
      `select count(*)::int as total from challenges where organization_id = $1`,
      [ALPHA.orgId],
    )
    expect(daBeta[0].total).toBe(0)
  })

  it('check-in numa academia não move desafio da outra', async () => {
    const daBeta = await criarDesafio({ organization_id: BETA.orgId, metric: 'CHECKINS' })
    await client.query(
      `insert into challenge_participants (challenge_id, user_profile_id) values ($1,$2)`,
      [daBeta, perfilAluno],
    )

    await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
      ALPHA.orgId,
      aluno,
    ])
    expect((await progressoDe(daBeta, perfilAluno))?.valor).toBe(0)
  })
})
