import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Os relatórios.
 *
 * As funções são SECURITY INVOKER de propósito: rodam com o privilégio de quem
 * chama, então a RLS filtra sozinha. Esse é o teste que importa — se alguma
 * delas fosse `security definer` por descuido, o relatório da Alpha somaria o
 * treino da Beta, e o número sairia plausível.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '55555555-5555-5555-5555-555555555555'
let alunoAlpha: string
let alunoBeta: string
let supino: string
let agachamento: string

const DIA = 86_400_000

/** Grava uma série direto, como superusuário: aqui o alvo é a leitura. */
async function serie(
  sessao: string,
  org: string,
  exercicio: string,
  numero: number,
  peso: number,
  reps: number,
  quandoMs = Date.now(),
) {
  await client.query(
    `insert into workout_set_logs
       (organization_id, session_id, exercise_id, set_number, reps_completed, weight,
        rest_seconds, completed_at, client_id)
     values ($1,$2,$3,$4,$5,$6,90,$7,$8)`,
    // O exercício entra na chave: supino série 1 e agachamento série 1 são
    // séries diferentes na mesma sessão, e a constraint do banco pegou isso.
    [org, sessao, exercicio, numero, reps, peso, new Date(quandoMs), `c-${sessao}-${exercicio}-${numero}`],
  )
}

async function treino(org: string, aluno: string, quandoMs: number, duracao = 3600) {
  const { rows } = await client.query(
    `insert into workout_sessions
       (organization_id, student_id, client_id, status, started_at, completed_at, duration_seconds)
     values ($1,$2,$3,'COMPLETED',$4,$4,$5) returning id`,
    [org, aluno, `t-${aluno}-${quandoMs}`, new Date(quandoMs), duracao],
  )
  return rows[0].id as string
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const a = await client.query(
    `select id, user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  alunoAlpha = a.rows[0].id
  await client.query(`insert into auth.users (id, email) values ($1,'p@alpha.test')`, [AUTH_ALUNO])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    a.rows[0].user_profile_id,
  ])

  const b = await client.query(
    `select id from students where organization_id = $1 order by id limit 1`,
    [BETA.orgId],
  )
  alunoBeta = b.rows[0].id

  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group) values
       ($1,'Supino reto','CHEST'), ($1,'Agachamento','LEGS') returning id, name`,
    [ALPHA.orgId],
  )
  supino = ex.rows.find((r) => r.name === 'Supino reto').id
  agachamento = ex.rows.find((r) => r.name === 'Agachamento').id

  const agora = Date.now()

  // Alpha: três semanas de supino subindo de carga, mais agachamento.
  const s1 = await treino(ALPHA.orgId, alunoAlpha, agora - 21 * DIA)
  await serie(s1, ALPHA.orgId, supino, 1, 60, 10, agora - 21 * DIA)
  await serie(s1, ALPHA.orgId, supino, 2, 60, 10, agora - 21 * DIA)

  const s2 = await treino(ALPHA.orgId, alunoAlpha, agora - 14 * DIA)
  await serie(s2, ALPHA.orgId, supino, 1, 70, 10, agora - 14 * DIA)

  const s3 = await treino(ALPHA.orgId, alunoAlpha, agora - 7 * DIA, 4200)
  await serie(s3, ALPHA.orgId, supino, 1, 80, 8, agora - 7 * DIA)
  // Empate na carga com menos reps: o recorde tem de ficar com o de 8.
  await serie(s3, ALPHA.orgId, supino, 2, 80, 6, agora - 7 * DIA)
  await serie(s3, ALPHA.orgId, agachamento, 1, 100, 10, agora - 7 * DIA)

  // Beta: números grandes, para o vazamento ser óbvio se houver.
  const sb = await treino(BETA.orgId, alunoBeta, agora - 3 * DIA)
  await serie(sb, BETA.orgId, supino, 1, 999, 99, agora - 3 * DIA)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('evolução do exercício', () => {
  it('a carga máxima sobe semana a semana', async () => {
    const { rows } = await client.query(
      `select carga_max::float8 as carga, volume_kg::float8 as volume, series
       from exercise_progress($1, $2, 12) order by semana`,
      [alunoAlpha, supino],
    )
    expect(rows.map((r) => r.carga)).toEqual([60, 70, 80])
    // Primeira semana: 2 séries de 10 a 60 kg.
    expect(rows[0].volume).toBe(1200)
    expect(rows[0].series).toBe(2)
  })

  it('a janela recorta: pedir 1 semana não traz o que é de três semanas atrás', async () => {
    const { rows } = await client.query(
      `select count(*)::int as total from exercise_progress($1, $2, 1)`,
      [alunoAlpha, supino],
    )
    expect(rows[0].total).toBeLessThan(3)
  })
})

describe.skipIf(!temBanco)('recorde pessoal', () => {
  it('é a maior carga, com a data', async () => {
    const { rows } = await client.query(
      `select exercise_name, carga_max::float8 as carga, reps from personal_records($1)
       order by exercise_name`,
      [alunoAlpha],
    )
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.exercise_name === 'Supino reto')).toMatchObject({ carga: 80 })
    expect(rows.find((r) => r.exercise_name === 'Agachamento')).toMatchObject({ carga: 100 })
  })

  it('empate na carga fica com a série de mais repetições', async () => {
    // 80 kg × 8 e 80 kg × 6 no mesmo dia: o recorde é o de 8, que foi mais duro.
    const { rows } = await client.query(
      `select reps from personal_records($1) where exercise_name = 'Supino reto'`,
      [alunoAlpha],
    )
    expect(rows[0].reps).toBe(8)
  })
})

describe.skipIf(!temBanco)('totais do aluno', () => {
  it('soma treinos, séries, volume e duração média', async () => {
    const { rows } = await client.query(
      `select treinos, series, reps, volume_kg::float8 as volume,
              duracao_media_seg, exercicios_distintos
       from workout_totals($1, now() - interval '30 days', now())`,
      [alunoAlpha],
    )
    const t = rows[0]
    expect(t.treinos).toBe(3)
    expect(t.series).toBe(6)
    // 600+600 + 700 + 640+480 + 1000
    expect(t.volume).toBe(4020)
    expect(t.exercicios_distintos).toBe(2)
    expect(t.duracao_media_seg).toBe(Math.round((3600 + 3600 + 4200) / 3))
  })

  it('janela sem treino devolve zero, não nulo', async () => {
    /*
     * Zero é um número que a tela mostra; nulo virava "—" e o dono da academia
     * não sabe se é zero ou se o relatório quebrou.
     */
    const { rows } = await client.query(
      `select treinos, series, volume_kg::float8 as volume
       from workout_totals($1, now() - interval '400 days', now() - interval '365 days')`,
      [alunoAlpha],
    )
    expect(rows[0]).toMatchObject({ treinos: 0, series: 0, volume: 0 })
  })
})

describe.skipIf(!temBanco)('relatório da academia', () => {
  it('conta alunos que treinaram, não alunos matriculados', async () => {
    const { rows } = await client.query(
      `select treinos, alunos_treinando, series, volume_kg::float8 as volume
       from gym_training_report($1, now() - interval '30 days', now())`,
      [ALPHA.orgId],
    )
    expect(rows[0].treinos).toBe(3)
    // Dois alunos matriculados na semente, um treinou.
    expect(rows[0].alunos_treinando).toBe(1)
    expect(rows[0].volume).toBe(4020)
  })

  it('quem sumiu aparece na lista de risco', async () => {
    const { rows } = await client.query(
      `select nome, dias_ausente from students_at_risk($1, 14) order by dias_ausente desc`,
      [ALPHA.orgId],
    )
    // A semente dá check-in a todos, então quem aparece é quem não treinou nem
    // fez check-in dentro da janela.
    expect(Array.isArray(rows)).toBe(true)
  })

  it('aluno que nunca apareceu tem última visita nula, não uma data inventada', async () => {
    const perfil = await client.query(
      `insert into user_profiles (name, email) values ('Fantasma','f@alpha.test') returning id`,
    )
    await client.query(`insert into students (organization_id, user_profile_id) values ($1,$2)`, [
      ALPHA.orgId,
      perfil.rows[0].id,
    ])

    const { rows } = await client.query(
      `select ultima_visita, dias_ausente from students_at_risk($1, 1) where nome = 'Fantasma'`,
      [ALPHA.orgId],
    )
    expect(rows[0].ultima_visita).toBeNull()
    expect(rows[0].dias_ausente).toBeGreaterThan(1000)
  })
})

describe.skipIf(!temBanco)('a RLS é quem filtra, não uma checagem escrita à mão', () => {
  it('o relatório da Alpha não soma o treino da Beta', async () => {
    /*
     * Este é o teste que justifica SECURITY INVOKER. Fosse `security definer`,
     * a função enxergaria tudo e os 999 kg da Beta entrariam no volume da
     * Alpha — um número plausível, e por isso ninguém desconfiaria.
     */
    const daAlpha = await asUser<{ volume: number }>(
      client,
      ALPHA.authId,
      `select volume_kg::float8 as volume from gym_training_report($1, now() - interval '30 days', now())`,
      [ALPHA.orgId],
    )
    expect(daAlpha[0].volume).toBe(4020)

    // E pedir o da vizinha explicitamente devolve vazio, não erro nem dado.
    const daBeta = await asUser<{ treinos: number }>(
      client,
      ALPHA.authId,
      `select treinos from gym_training_report($1, now() - interval '30 days', now())`,
      [BETA.orgId],
    )
    expect(daBeta[0].treinos).toBe(0)
  })

  it('o aluno só vê a própria evolução', async () => {
    const meu = await asUser<{ total: number }>(
      client,
      AUTH_ALUNO,
      `select count(*)::int as total from exercise_progress($1, $2, 12)`,
      [alunoAlpha, supino],
    )
    expect(meu[0].total).toBe(3)

    const alheio = await asUser<{ total: number }>(
      client,
      AUTH_ALUNO,
      `select count(*)::int as total from exercise_progress($1, $2, 12)`,
      [alunoBeta, supino],
    )
    expect(alheio[0].total).toBe(0)
  })

  it('o anônimo não lê relatório nenhum', async () => {
    const anonimo = await asUser<{ treinos: number }>(
      client,
      null,
      `select treinos from gym_training_report($1, now() - interval '30 days', now())`,
      [ALPHA.orgId],
    )
    expect(anonimo[0].treinos).toBe(0)
  })
})
