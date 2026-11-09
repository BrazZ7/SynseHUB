import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O retrato da prescrição dentro da sessão (0057).
 *
 * `workout_session_exercises` existe desde a 0026 e passou todo esse tempo
 * vazia: nada inseria linha nela. O gatilho `workout_set_progress`, que existe
 * para marcar o exercício como concluído quando a última série prevista entra,
 * procurava a linha, não achava, e atualizava zero linhas. Sem erro e sem log —
 * um progresso que o banco achava que estava mantendo.
 *
 * Preenchida, ela também resolve o que o pedido chama de consistência da
 * sessão: o treinador que edita a ficha no meio do treino não pode mudar o que
 * a sessão em andamento considera previsto.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '5a5a5a5a-5a5a-5a5a-5a5a-5a5a5a5a5a5a'
let aluno: string
let supino: string
let rosca: string
let plano: string
let itemDoSupino: string

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
  await client.query(`insert into auth.users (id, email) values ($1,'sessao@alpha.test')`, [
    AUTH_ALUNO,
  ])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    rows[0].user_profile_id,
  ])

  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group)
     values ($1,'Supino','CHEST'), ($1,'Rosca','ARMS') returning id, name`,
    [ALPHA.orgId],
  )
  supino = ex.rows.find((r) => r.name === 'Supino').id
  rosca = ex.rows.find((r) => r.name === 'Rosca').id

  const p = await client.query(
    `insert into workout_plans (organization_id, name) values ($1,'Peito') returning id`,
    [ALPHA.orgId],
  )
  plano = p.rows[0].id

  const item = await client.query(
    `insert into workout_exercises (workout_plan_id, exercise_id, position, sets, reps, rest_seconds)
     values ($1,$2,1,2,'10',60) returning id`,
    [plano, supino],
  )
  itemDoSupino = item.rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const limparTreinos = () =>
  client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [aluno])

const abrirTreino = async (clientId: string, comPlano: string | null = plano) => {
  const rows = await asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select start_workout_session($1, $2) as id`,
    [clientId, comPlano],
  )
  return rows[0].id
}

const registrarSerie = (sessao: string, exercicio: string, numero: number, clientId: string) =>
  asUser(
    client,
    AUTH_ALUNO,
    `select log_workout_set($1, $2, $3::smallint, 10::smallint, $4, 70::numeric) as id`,
    [sessao, exercicio, numero, clientId],
  )

const exerciciosDa = async (sessao: string) => {
  const { rows } = await client.query(
    `select exercise_id, workout_exercise_id, position, sets_planned, completed_at
     from workout_session_exercises where session_id = $1 order by position`,
    [sessao],
  )
  return rows as {
    exercise_id: string
    workout_exercise_id: string | null
    position: number
    sets_planned: number | null
    completed_at: Date | null
  }[]
}

describe.skipIf(!temBanco)('abrir o treino', () => {
  it('copia os exercícios da ficha para dentro da sessão', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('s-1')

    const itens = await exerciciosDa(sessao)
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({
      exercise_id: supino,
      workout_exercise_id: itemDoSupino,
      position: 1,
      sets_planned: 2,
      completed_at: null,
    })
  })

  it('treino sem ficha abre sem exercício nenhum', async () => {
    // Controle: a cópia precisa vir da ficha, não aparecer do nada.
    await limparTreinos()
    const sessao = await abrirTreino('s-2', null)
    expect(await exerciciosDa(sessao)).toEqual([])
  })

  it('reabrir o treino em andamento não duplica nem recopia', async () => {
    await limparTreinos()
    const primeira = await abrirTreino('s-3')
    const segunda = await abrirTreino('s-4')

    expect(segunda).toBe(primeira)
    expect(await exerciciosDa(primeira)).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('a ficha editada no meio do treino', () => {
  it('não muda o que a sessão em andamento considera previsto', async () => {
    /*
     * O caso que o retrato existe para resolver. A sessão abriu com duas
     * séries previstas; o treinador passou a ficha para quatro enquanto o
     * aluno treinava. As duas séries dele continuam fechando o exercício,
     * porque é isso que estava prescrito quando ele começou.
     *
     * Sem o retrato, `workout_set_progress` leria `workout_exercises.sets` de
     * agora e o exercício ficaria 2 de 4: progresso que anda para trás sem
     * ninguém ter desfeito nada.
     */
    await limparTreinos()
    const sessao = await abrirTreino('e-1')

    await client.query(`update workout_exercises set sets = 4 where id = $1`, [itemDoSupino])

    await registrarSerie(sessao, supino, 1, 'x-1')
    await registrarSerie(sessao, supino, 2, 'x-2')

    const itens = await exerciciosDa(sessao)
    expect(itens[0].sets_planned).toBe(2)
    expect(itens[0].completed_at).toBeInstanceOf(Date)

    await client.query(`update workout_exercises set sets = 2 where id = $1`, [itemDoSupino])
  })

  it('e o treino aberto depois já nasce com a ficha nova', async () => {
    // O outro lado da mesma regra: o retrato é do instante da abertura, não um
    // valor congelado para sempre.
    await limparTreinos()
    await client.query(`update workout_exercises set sets = 5 where id = $1`, [itemDoSupino])

    const sessao = await abrirTreino('e-2')
    expect((await exerciciosDa(sessao))[0].sets_planned).toBe(5)

    await client.query(`update workout_exercises set sets = 2 where id = $1`, [itemDoSupino])
  })
})

describe.skipIf(!temBanco)('o exercício fora da ficha', () => {
  it('ganha a própria linha na primeira série', async () => {
    /*
     * O aparelho estava ocupado e a pessoa fez outro exercício. Sem esta
     * linha, a série entrava e o gatilho de progresso não tinha onde escrever:
     * o exercício trocado na hora ficava fora do retrato, como se não tivesse
     * acontecido.
     */
    await limparTreinos()
    const sessao = await abrirTreino('f-1')

    await registrarSerie(sessao, rosca, 1, 'r-1')

    const itens = await exerciciosDa(sessao)
    expect(itens).toHaveLength(2)
    const daRosca = itens.find((i) => i.exercise_id === rosca)
    // Sem previsão de séries, porque não havia previsão — e no fim da lista,
    // porque fora do plano não tem lugar reservado.
    expect(daRosca).toMatchObject({ workout_exercise_id: null, sets_planned: null, position: 2 })
  })

  it('a segunda série não cria uma segunda linha', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('f-2')

    await registrarSerie(sessao, rosca, 1, 'r-1')
    await registrarSerie(sessao, rosca, 2, 'r-2')

    expect(await exerciciosDa(sessao)).toHaveLength(2)
  })

  it('o exercício da ficha não ganha linha repetida ao registrar série', async () => {
    // Controle do par acima: a garantia da linha não pode duplicar o que a
    // abertura já copiou.
    await limparTreinos()
    const sessao = await abrirTreino('f-3')

    await registrarSerie(sessao, supino, 1, 'p-1')

    const itens = await exerciciosDa(sessao)
    expect(itens).toHaveLength(1)
    expect(itens[0].workout_exercise_id).toBe(itemDoSupino)
  })

  it('o exercício fora da ficha não fecha sozinho', async () => {
    /*
     * `sets_planned` nula significa "não havia previsão". O gatilho só marca
     * concluído quando há previsão e ela foi alcançada; sem previsão, marcar
     * seria inventar a meta.
     */
    await limparTreinos()
    const sessao = await abrirTreino('f-4')

    await registrarSerie(sessao, rosca, 1, 'r-1')
    await registrarSerie(sessao, rosca, 2, 'r-2')
    await registrarSerie(sessao, rosca, 3, 'r-3')

    const daRosca = (await exerciciosDa(sessao)).find((i) => i.exercise_id === rosca)
    expect(daRosca?.completed_at).toBeNull()
  })

  it('a primeira série marca o começo do exercício', async () => {
    // `started_at` vem do gatilho da 0026, que também só funcionava se a linha
    // existisse.
    await limparTreinos()
    const sessao = await abrirTreino('f-5')

    await registrarSerie(sessao, supino, 1, 'i-1')

    const { rows } = await client.query(
      `select started_at from workout_session_exercises where session_id = $1`,
      [sessao],
    )
    expect(rows[0].started_at).toBeInstanceOf(Date)
  })
})
