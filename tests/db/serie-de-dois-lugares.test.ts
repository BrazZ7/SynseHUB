import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A série que chega de dois lugares (0059).
 *
 * O produto mantém uma sessão aberta por aluno e `start_workout_session`
 * devolve a que já está aberta. Quando a mesma pessoa tem o treino aberto em
 * dois lugares — duas abas, celular e tablet, ou uma aba antiga cuja fila só
 * drena horas depois — os dois lados contam as séries por conta própria e os
 * dois mandam "série 3 do supino".
 *
 * `unique (session_id, exercise_id, set_number)` recusava a segunda. A fila
 * insistia oito vezes, desistia, e a tela dizia "uma série não pôde ser
 * enviada" para uma série que a pessoa fez.
 *
 * A política está escrita no cabeçalho da migration: reenvio é `client_id`
 * repetido e não cria linha; série de outro lugar entra no próximo número
 * livre. É o aceite 13.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '5d5d5d5d-5d5d-5d5d-5d5d-5d5d5d5d5d5d'
let aluno: string
let exercicio: string
let outroExercicio: string
let plano: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id, user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  aluno = rows[0].id
  await client.query(`insert into auth.users (id, email) values ($1,'doislugares@alpha.test')`, [
    AUTH_ALUNO,
  ])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    rows[0].user_profile_id,
  ])

  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group)
     values ($1,'Supino','CHEST'), ($1,'Remada','BACK') returning id, name`,
    [ALPHA.orgId],
  )
  exercicio = ex.rows.find((r) => r.name === 'Supino').id
  outroExercicio = ex.rows.find((r) => r.name === 'Remada').id

  const p = await client.query(
    `insert into workout_plans (organization_id, name) values ($1,'Peito') returning id`,
    [ALPHA.orgId],
  )
  plano = p.rows[0].id
  await client.query(
    `insert into workout_exercises (workout_plan_id, exercise_id, position, sets, reps, rest_seconds)
     values ($1,$2,1,4,'10',60), ($1,$3,2,4,'10',60)`,
    [plano, exercicio, outroExercicio],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const limparTreinos = () =>
  client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [aluno])

const abrirTreino = async (clientId: string) => {
  const rows = await asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select start_workout_session($1, $2) as id`,
    [clientId, plano],
  )
  return rows[0].id
}

const registrar = (
  sessao: string,
  numero: number,
  clientId: string,
  qualExercicio = exercicio,
  reps = 10,
) =>
  asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select log_workout_set($1, $2, $3::smallint, $4::smallint, $5, 70::numeric) as id`,
    [sessao, qualExercicio, numero, reps, clientId],
  )

const series = async (sessao: string, qualExercicio = exercicio) => {
  const { rows } = await client.query(
    `select set_number, client_id, reps_completed from workout_set_logs
     where session_id = $1 and exercise_id = $2 order by set_number`,
    [sessao, qualExercicio],
  )
  return rows as { set_number: number; client_id: string; reps_completed: number }[]
}

describe.skipIf(!temBanco)('a série de outro lugar', () => {
  it('entra no próximo número livre em vez de ser recusada', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('dl-1')
    await registrar(sessao, 1, 'aba-a-1')
    await registrar(sessao, 2, 'aba-a-2')

    // A outra aba conta por conta própria e também chama a sua de "2".
    await registrar(sessao, 2, 'aba-b-1')

    expect(await series(sessao)).toEqual([
      { set_number: 1, client_id: 'aba-a-1', reps_completed: 10 },
      { set_number: 2, client_id: 'aba-a-2', reps_completed: 10 },
      { set_number: 3, client_id: 'aba-b-1', reps_completed: 10 },
    ])
  })

  it('o deslocamento é por exercício, não pela sessão', async () => {
    /*
     * As quatro séries de supino antes das da remada são o que faz este teste
     * medir alguma coisa: com o deslocamento contado pela sessão inteira, a
     * segunda série da remada viraria "série 5". A primeira versão deste teste
     * usava uma série de supino só, e aí os dois jeitos davam 2 — passava com a
     * conta errada.
     */
    await limparTreinos()
    const sessao = await abrirTreino('dl-2')
    for (const n of [1, 2, 3, 4]) await registrar(sessao, n, `sup-${n}`)

    await registrar(sessao, 1, 'rem-1', outroExercicio)
    await registrar(sessao, 1, 'rem-2', outroExercicio)

    expect((await series(sessao, outroExercicio)).map((s) => s.set_number)).toEqual([1, 2])
  })

  it('nenhuma série se perde quando as duas abas mandam tudo', async () => {
    /*
     * O caso da aba antiga que estava sem rede: ela drena a fila inteira
     * depois, com os mesmos números que a aba de agora já usou.
     */
    await limparTreinos()
    const sessao = await abrirTreino('dl-3')
    for (const n of [1, 2, 3]) await registrar(sessao, n, `a-${n}`)
    for (const n of [1, 2, 3]) await registrar(sessao, n, `b-${n}`)

    const todas = await series(sessao)
    expect(todas).toHaveLength(6)
    expect(todas.map((s) => s.set_number)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe.skipIf(!temBanco)('o reenvio continua sendo reenvio', () => {
  it('o mesmo client_id não cria segunda linha', async () => {
    /*
     * O controle que importa mais aqui. Se o deslocamento viesse antes da
     * conferência do `client_id`, cada tentativa da fila ganharia um número
     * novo e a série entraria várias vezes — o defeito oposto, e pior, porque
     * infla o volume do treino.
     */
    await limparTreinos()
    const sessao = await abrirTreino('dl-4')
    await registrar(sessao, 1, 'r-1')
    await registrar(sessao, 1, 'r-1')
    await registrar(sessao, 1, 'r-1')

    expect(await series(sessao)).toHaveLength(1)
  })

  it('o reenvio devolve sempre o mesmo id', async () => {
    // É o id que a fila usa para marcar como sincronizada e parar de tentar.
    await limparTreinos()
    const sessao = await abrirTreino('dl-5')
    const primeiro = await registrar(sessao, 1, 'r-1')
    const segundo = await registrar(sessao, 1, 'r-1')

    expect(segundo[0].id).toBe(primeiro[0].id)
  })

  it('o reenvio corrige as repetições sem mudar o número da série', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('dl-6')
    await registrar(sessao, 1, 'r-1', exercicio, 10)
    await registrar(sessao, 1, 'r-1', exercicio, 8)

    expect(await series(sessao)).toEqual([
      { set_number: 1, client_id: 'r-1', reps_completed: 8 },
    ])
  })

  it('a série desfeita e refeita cabe no mesmo número', async () => {
    /*
     * A ligação com a 0058: desfazer apaga a linha, então o número volta a
     * estar livre e a correção não desloca. É o caso que o desfazer offline
     * produz, e o que a ordenação da fila (`ordem.ts`) garante chegar nesta
     * sequência.
     */
    await limparTreinos()
    const sessao = await abrirTreino('dl-7')
    await registrar(sessao, 1, 'x-1')
    await registrar(sessao, 2, 'x-2')
    await asUser(client, AUTH_ALUNO, `select desfazer_serie($1, $2)`, [sessao, 'x-2'])

    await registrar(sessao, 2, 'x-2-corrigida', exercicio, 8)

    expect(await series(sessao)).toEqual([
      { set_number: 1, client_id: 'x-1', reps_completed: 10 },
      { set_number: 2, client_id: 'x-2-corrigida', reps_completed: 8 },
    ])
  })
})

describe.skipIf(!temBanco)('a sessão única continua única', () => {
  it('o segundo lugar entra na mesma sessão, não abre outra', async () => {
    // É o que faz as séries dos dois lugares se encontrarem — e é a razão de o
    // deslocamento ser necessário.
    await limparTreinos()
    const doCelular = await abrirTreino('dl-8')
    const doTablet = await abrirTreino('dl-9')

    expect(doTablet).toBe(doCelular)
  })
})
