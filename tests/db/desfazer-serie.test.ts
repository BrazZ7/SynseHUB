import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Desfazer a série concluída por engano (0057).
 *
 * O toque em "concluir série" é grande, fica no meio da tela e é apertado com a
 * mão cansada. O que estes testes protegem não é o delete — é o que a série
 * tinha movido antes de sair: o exercício que ficou marcado como concluído, o
 * progresso do desafio, e a medalha que `bump_gym_challenge` grava e nunca
 * limpa. Desfazer que apaga a linha e deixa a medalha de pé premia um treino
 * que não aconteceu, e medalha vale XP.
 *
 * O outro risco é o reenvio: a fila offline manda de novo o que não teve
 * resposta, e um desconto aplicado duas vezes deixa o placar errado sem
 * ninguém saber de onde veio.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '55555555-5555-5555-5555-555555555555'
const AUTH_OUTRO = '55555555-5555-5555-5555-555555555556'
let aluno: string
let perfilAluno: string
let outroAluno: string
let exercicio: string
let planoAlpha: string
let itemDoPlano: string

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

async function criarDesafio(metric: string, alvo: number) {
  const { rows } = await client.query(
    `insert into challenges
       (organization_id, title, metric, target_value, starts_at, ends_at, ranking_enabled, status)
     values ($1, 'Desafio', $2, $3, current_date - 1, current_date + 30, false, 'ACTIVE')
     returning id`,
    [ALPHA.orgId, metric, alvo],
  )
  await asUser(client, AUTH_ALUNO, `select join_gym_challenge($1, false)`, [rows[0].id])
  return rows[0].id as string
}

const progressoDe = async (desafio: string) => {
  const { rows } = await client.query(
    `select progress_value::float8 as valor, completed_at from challenge_participants
     where challenge_id = $1`,
    [desafio],
  )
  return rows[0] as { valor: number; completed_at: string | null } | undefined
}

/** Um treino aberto, com o exercício do plano dentro. */
async function abrirTreino(clientId: string) {
  const rows = await asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select start_workout_session($1, $2) as id`,
    [clientId, planoAlpha],
  )
  return rows[0].id
}

const registrarSerie = (sessao: string, numero: number, clientId: string, peso = 70, reps = 10) =>
  asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select log_workout_set($1, $2, $3::smallint, $4::smallint, $5, $6::numeric) as id`,
    [sessao, exercicio, numero, reps, clientId, peso],
  )

const desfazer = (sessao: string, clientId: string, auth = AUTH_ALUNO) =>
  asUser<{ desfeita: boolean }>(client, auth, `select desfazer_serie($1, $2) as desfeita`, [
    sessao,
    clientId,
  ])

const seriesDe = async (sessao: string) => {
  const { rows } = await client.query(
    `select client_id from workout_set_logs where session_id = $1 order by set_number`,
    [sessao],
  )
  return rows.map((r) => r.client_id as string)
}

/**
 * `'sem-linha'` quando a sessão não tem o exercício.
 *
 * A distinção não é preciosismo: `workout_session_exercises` passou tempo sem
 * ninguém escrevendo nela, e `undefined` passa num `not.toBeNull()` — foi
 * exatamente assim que a ausência da linha se escondeu de um teste antes.
 */
const concluidoEm = async (sessao: string): Promise<Date | null | 'sem-linha'> => {
  const { rows } = await client.query(
    `select completed_at from workout_session_exercises
     where session_id = $1 and exercise_id = $2`,
    [sessao, exercicio],
  )
  if (!rows.length) return 'sem-linha'
  // `pg` devolve timestamptz como `Date`; é por isso que as asserções usam
  // `toBeInstanceOf(Date)` em vez de conferir texto.
  return rows[0].completed_at as Date | null
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
  perfilAluno = await darConta(aluno, AUTH_ALUNO, 'desfazer1@alpha.test')
  await darConta(outroAluno, AUTH_OUTRO, 'desfazer2@alpha.test')

  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group) values ($1,'Supino','CHEST')
     returning id`,
    [ALPHA.orgId],
  )
  exercicio = ex.rows[0].id

  const plano = await client.query(
    `insert into workout_plans (organization_id, name) values ($1,'Peito') returning id`,
    [ALPHA.orgId],
  )
  planoAlpha = plano.rows[0].id

  // Duas séries previstas: é o que permite testar o `completed_at` do exercício
  // indo e voltando.
  const item = await client.query(
    `insert into workout_exercises (workout_plan_id, exercise_id, position, sets, reps, rest_seconds)
     values ($1, $2, 1, 2, '10', 60) returning id`,
    [planoAlpha, exercicio],
  )
  itemDoPlano = item.rows[0].id
  expect(itemDoPlano).toBeTruthy()
}, 60_000)

afterAll(async () => {
  await client?.end()
})

/** Fecha o que estiver aberto: só um treino por aluno pode estar em andamento. */
const limparTreinos = () =>
  client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [aluno])

describe.skipIf(!temBanco)('desfazer a série', () => {
  it('tira a série do treino e diz que desfez', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('t-1')
    await registrarSerie(sessao, 1, 's-1')
    await registrarSerie(sessao, 2, 's-2')

    const rows = await desfazer(sessao, 's-2')

    expect(rows[0].desfeita).toBe(true)
    expect(await seriesDe(sessao)).toEqual(['s-1'])
  })

  it('o reenvio não desfaz duas vezes', async () => {
    /*
     * A fila manda de novo o que não teve resposta. A segunda passagem precisa
     * ser inofensiva: nada a apagar, nada a descontar, e `false` para quem
     * chamou — que trata igual, porque a série não está mais lá.
     */
    await limparTreinos()
    const sessao = await abrirTreino('t-2')
    await registrarSerie(sessao, 1, 's-1')

    expect((await desfazer(sessao, 's-1'))[0].desfeita).toBe(true)
    expect((await desfazer(sessao, 's-1'))[0].desfeita).toBe(false)
  })

  it('série que nunca existiu devolve false em vez de estourar', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('t-3')
    expect((await desfazer(sessao, 'nunca-existiu'))[0].desfeita).toBe(false)
  })

  it('a série pode ser registrada de novo com o mesmo número', async () => {
    /*
     * `unique (session_id, exercise_id, set_number)` é o que impede duas
     * "série 2" — e seria também o que impediria corrigir a série desfeita se
     * o desfazer não apagasse a linha de verdade.
     */
    await limparTreinos()
    const sessao = await abrirTreino('t-4')
    await registrarSerie(sessao, 1, 's-1', 70)
    await desfazer(sessao, 's-1')

    await registrarSerie(sessao, 1, 's-1-corrigida', 80)

    const { rows } = await client.query(
      `select weight::float8 as peso from workout_set_logs where session_id = $1`,
      [sessao],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].peso).toBe(80)
  })
})

describe.skipIf(!temBanco)('o exercício volta a não estar concluído', () => {
  it('desfazer a última série prevista desmarca o exercício', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('e-1')
    await registrarSerie(sessao, 1, 's-1')
    await registrarSerie(sessao, 2, 's-2')
    // O gatilho da 0026 marcou: duas de duas previstas. `toBeInstanceOf(Date)`
    // e não `not.toBeNull()`, para a linha ausente não passar por marcada.
    expect(await concluidoEm(sessao)).toBeInstanceOf(Date)

    await desfazer(sessao, 's-2')

    expect(await concluidoEm(sessao)).toBeNull()
  })

  it('mas segue concluído quando as séries que restaram ainda alcançam as previstas', async () => {
    /*
     * Controle do teste acima: um desfazer que limpasse `completed_at` sempre
     * passaria lá e apagaria aqui o progresso de um exercício que está, de
     * fato, concluído.
     */
    await limparTreinos()
    const sessao = await abrirTreino('e-2')
    await registrarSerie(sessao, 1, 's-1')
    await registrarSerie(sessao, 2, 's-2')
    await registrarSerie(sessao, 3, 's-3')

    await desfazer(sessao, 's-3')

    expect(await concluidoEm(sessao)).toBeInstanceOf(Date)
  })
})

describe.skipIf(!temBanco)('o desafio volta atrás', () => {
  it('a série desfeita sai da contagem de SETS', async () => {
    await limparTreinos()
    const desafio = await criarDesafio('SETS', 10)
    const sessao = await abrirTreino('d-1')
    await registrarSerie(sessao, 1, 's-1')
    expect((await progressoDe(desafio))?.valor).toBe(1)

    await desfazer(sessao, 's-1')

    expect((await progressoDe(desafio))?.valor).toBe(0)
  })

  it('e sai do VOLUME_KG com o peso que ela tinha', async () => {
    await limparTreinos()
    const desafio = await criarDesafio('VOLUME_KG', 10_000)
    const sessao = await abrirTreino('d-2')
    await registrarSerie(sessao, 1, 's-1', 70, 10)
    await registrarSerie(sessao, 2, 's-2', 80, 10)
    expect((await progressoDe(desafio))?.valor).toBe(1500)

    await desfazer(sessao, 's-2')

    expect((await progressoDe(desafio))?.valor).toBe(700)
  })

  it('o reenvio não desconta duas vezes', async () => {
    await limparTreinos()
    const desafio = await criarDesafio('SETS', 10)
    const sessao = await abrirTreino('d-3')
    await registrarSerie(sessao, 1, 's-1')
    await registrarSerie(sessao, 2, 's-2')

    await desfazer(sessao, 's-2')
    await desfazer(sessao, 's-2')

    expect((await progressoDe(desafio))?.valor).toBe(1)
  })

  it('a medalha cai quando o progresso fica abaixo da meta', async () => {
    /*
     * O defeito que isto fecha: `bump_gym_challenge` grava `completed_at` na
     * primeira vez que a meta é batida e nunca a limpa. Sem a limpeza, a
     * conquista — que vale XP — ficaria de pé em cima de uma série que a
     * pessoa diz que não fez.
     */
    await limparTreinos()
    const desafio = await criarDesafio('SETS', 2)
    const sessao = await abrirTreino('d-4')
    await registrarSerie(sessao, 1, 's-1')
    await registrarSerie(sessao, 2, 's-2')
    expect((await progressoDe(desafio))?.completed_at).not.toBeNull()

    await desfazer(sessao, 's-2')

    const depois = await progressoDe(desafio)
    expect(depois?.valor).toBe(1)
    expect(depois?.completed_at).toBeNull()
  })

  it('mas a medalha fica quando o progresso continua na meta', async () => {
    // Controle: desfazer não pode tirar conquista de quem continua acima dela.
    await limparTreinos()
    const desafio = await criarDesafio('SETS', 2)
    const sessao = await abrirTreino('d-5')
    await registrarSerie(sessao, 1, 's-1')
    await registrarSerie(sessao, 2, 's-2')
    await registrarSerie(sessao, 3, 's-3')

    await desfazer(sessao, 's-3')

    const depois = await progressoDe(desafio)
    expect(depois?.valor).toBe(2)
    expect(depois?.completed_at).not.toBeNull()
  })

  it('o progresso não fica negativo', async () => {
    await limparTreinos()
    const desafio = await criarDesafio('SETS', 5)
    const sessao = await abrirTreino('d-6')
    await registrarSerie(sessao, 1, 's-1')
    await client.query(`update challenge_participants set progress_value = 0 where challenge_id = $1`, [
      desafio,
    ])

    await desfazer(sessao, 's-1')

    expect((await progressoDe(desafio))?.valor).toBe(0)
  })
})

describe.skipIf(!temBanco)('quem pode desfazer', () => {
  it('a série de outro aluno não se desfaz', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('p-1')
    await registrarSerie(sessao, 1, 's-1')

    await expect(desfazer(sessao, 's-1', AUTH_OUTRO)).rejects.toThrow(/não é seu/i)
    expect(await seriesDe(sessao)).toEqual(['s-1'])
  })

  it('treino encerrado não se desfaz por aqui', async () => {
    /*
     * Depois do encerramento o número já entrou no histórico, no resumo da
     * semana e no placar de quem olhou. Corrigir isso é outra operação, com
     * outra conversa na tela.
     */
    await limparTreinos()
    const sessao = await abrirTreino('p-2')
    await registrarSerie(sessao, 1, 's-1')
    await asUser(client, AUTH_ALUNO, `select finish_workout_session($1, 600, 'COMPLETED')`, [sessao])

    await expect(desfazer(sessao, 's-1')).rejects.toThrow(/já foi encerrado/i)
  })

  it('identificador vazio é recusado', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('p-3')
    await expect(desfazer(sessao, '   ')).rejects.toThrow(/ausente/i)
  })

  it('treino que não existe é recusado', async () => {
    await expect(
      desfazer('00000000-0000-0000-0000-000000000000', 's-1'),
    ).rejects.toThrow(/não encontrado/i)
  })
})

describe.skipIf(!temBanco)('o perfil do aluno', () => {
  it('é o do dono do treino, não o de quem chamou', async () => {
    // O desconto no desafio sai de `students.user_profile_id` da sessão. Se
    // saísse do `auth.uid()`, staff desfazendo série de aluno descontaria o
    // desafio da pessoa errada.
    expect(perfilAluno).toBeTruthy()
    const { rows } = await client.query(`select user_profile_id from students where id = $1`, [
      aluno,
    ])
    expect(rows[0].user_profile_id).toBe(perfilAluno)
  })
})
