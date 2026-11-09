import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O histórico integrado (0064).
 *
 * Quatro origens numa consulta só: treino, corrida, presença e pesagem. O que
 * estes testes protegem:
 *
 *  - **As duas chaves.** Treino e check-in pendem da matrícula; corrida e
 *    pesagem pendem da pessoa. Errar isso mostra o histórico de outro aluno da
 *    mesma academia, ou esconde as corridas de quem trocou de academia.
 *  - **O cursor.** Com quatro origens, dois eventos no mesmo instante são
 *    possíveis. Um cursor só de data pula o segundo na página seguinte — e o
 *    evento some do histórico sem erro nenhum.
 *  - **A função não recebe aluno.** Ela é `security definer` e lê peso e
 *    corrida. Um parâmetro de aluno seria porta para o histórico alheio.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '88888888-8888-8888-8888-888888888881'
const AUTH_VIZINHO = '88888888-8888-8888-8888-888888888882'
let aluno: string
let perfilAluno: string
let vizinho: string
let perfilVizinho: string
let plano: string

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

type Linha = {
  kind: string
  ref_id: string
  happened_at: Date
  title: string | null
  duration_seconds: number | null
  distance_meters: string | null
  volume_kg: string | null
  sets_count: number | null
  weight_kg: string | null
  effort: number | null
  discomfort: boolean | null
}

const linhaDoTempo = ({
  limite = 20,
  antesEm = null as string | null,
  antesId = null as string | null,
  auth = AUTH_ALUNO,
} = {}) =>
  asUser<Linha>(client, auth, `select * from student_timeline($1, $2, $3)`, [
    limite,
    antesEm,
    antesId,
  ])

/** Um treino concluído, com uma série dentro. */
async function treino(quando: string, { comRelato = false } = {}) {
  const { rows } = await client.query(
    `insert into workout_sessions
       (organization_id, student_id, workout_plan_id, client_id, status, started_at, completed_at, duration_seconds)
     values ($1, $2, $3, $4, 'COMPLETED', $5, $5, 3600) returning id`,
    [ALPHA.orgId, aluno, plano, `t-${quando}-${Math.random()}`, quando],
  )
  const id = rows[0].id as string
  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group) values ($1,'Supino','CHEST')
     returning id`,
    [ALPHA.orgId],
  )
  await client.query(
    `insert into workout_set_logs
       (organization_id, session_id, exercise_id, set_number, reps_completed, weight, client_id)
     values ($1, $2, $3, 1, 10, 60, $4)`,
    [ALPHA.orgId, id, ex.rows[0].id, `s-${id}`],
  )
  if (comRelato) {
    await client.query(
      `insert into workout_session_feedback
         (session_id, organization_id, student_id, effort, discomfort)
       values ($1, $2, $3, 9, true)`,
      [id, ALPHA.orgId, aluno],
    )
  }
  return id
}

const corrida = async (quando: string, perfil = perfilAluno) =>
  (
    await client.query(
      `insert into activities
         (user_profile_id, organization_id, sport, status, started_at, moving_seconds, distance_meters)
       values ($1, $2, 'RUN', 'COMPLETED', $3, 1800, 5000) returning id`,
      [perfil, ALPHA.orgId, quando],
    )
  ).rows[0].id as string

const presenca = async (quando: string, quem = aluno) =>
  (
    await client.query(
      `insert into check_ins (organization_id, student_id, checked_in_at) values ($1,$2,$3)
       returning id`,
      [ALPHA.orgId, quem, quando],
    )
  ).rows[0].id as string

const pesagem = async (quando: string, peso: number, perfil = perfilAluno) =>
  (
    await client.query(
      `insert into body_measurements (user_profile_id, measured_at, source, weight_kg, client_id)
       values ($1,$2,'MANUAL',$3,$4) returning id`,
      [perfil, quando, peso, `p-${quando}-${perfil}-${Math.random()}`],
    )
  ).rows[0].id as string

const limpar = () =>
  client.query(`
    delete from workout_session_feedback;
    delete from workout_set_logs;
    delete from workout_sessions;
    delete from activities;
    delete from check_ins;
    delete from body_measurements;
  `)

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
  vizinho = rows[1].id
  perfilAluno = await darConta(aluno, AUTH_ALUNO, 'hist1@alpha.test')
  perfilVizinho = await darConta(vizinho, AUTH_VIZINHO, 'hist2@alpha.test')

  plano = (
    await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Peito e Tríceps') returning id`,
      [ALPHA.orgId],
    )
  ).rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('as quatro origens', () => {
  it('aparecem todas, na ordem do tempo', async () => {
    await limpar()
    await treino('2026-10-20T10:00:00Z')
    await corrida('2026-10-21T07:00:00Z')
    await presenca('2026-10-22T18:00:00Z')
    await pesagem('2026-10-23T06:00:00Z', 81.5)

    const linhas = await linhaDoTempo()
    expect(linhas.map((l) => l.kind)).toEqual(['PESAGEM', 'CHECKIN', 'CORRIDA', 'TREINO'])
  })

  it('o treino traz plano, duração, volume e séries', async () => {
    await limpar()
    await treino('2026-10-20T10:00:00Z')

    const [t] = await linhaDoTempo()
    expect(t.title).toBe('Peito e Tríceps')
    expect(t.duration_seconds).toBe(3600)
    expect(Number(t.volume_kg)).toBe(600)
    expect(t.sets_count).toBe(1)
  })

  it('o relato do treino vem junto, sem segunda consulta', async () => {
    await limpar()
    await treino('2026-10-20T10:00:00Z', { comRelato: true })

    const [t] = await linhaDoTempo()
    expect(t.effort).toBe(9)
    expect(t.discomfort).toBe(true)
  })

  it('a corrida traz o tempo em movimento, não o decorrido', async () => {
    await limpar()
    await corrida('2026-10-21T07:00:00Z')

    const [c] = await linhaDoTempo()
    expect(c.kind).toBe('CORRIDA')
    expect(c.duration_seconds).toBe(1800)
    expect(Number(c.distance_meters)).toBe(5000)
  })

  it('treino em andamento não entra — histórico é do que terminou', async () => {
    await limpar()
    await client.query(
      `insert into workout_sessions (organization_id, student_id, client_id, status, started_at)
       values ($1,$2,'aberto','IN_PROGRESS', now())`,
      [ALPHA.orgId, aluno],
    )
    expect(await linhaDoTempo()).toHaveLength(0)
  })

  it('pesagem sem peso não entra', async () => {
    await limpar()
    await client.query(
      `insert into body_measurements (user_profile_id, measured_at, source, body_fat_percent, client_id)
       values ($1, now(), 'MANUAL', 22.5, 'sem-peso')`,
      [perfilAluno],
    )
    expect(await linhaDoTempo()).toHaveLength(0)
  })
})

describe.skipIf(!temBanco)('as duas chaves', () => {
  it('não mostra treino nem presença do colega', async () => {
    await limpar()
    await presenca('2026-10-22T18:00:00Z', vizinho)
    expect(await linhaDoTempo()).toHaveLength(0)
  })

  it('não mostra corrida nem pesagem de outra pessoa', async () => {
    await limpar()
    await corrida('2026-10-21T07:00:00Z', perfilVizinho)
    await pesagem('2026-10-23T06:00:00Z', 70, perfilVizinho)
    expect(await linhaDoTempo()).toHaveLength(0)
  })

  it('cada um vê o seu', async () => {
    await limpar()
    await presenca('2026-10-22T18:00:00Z')
    await presenca('2026-10-22T19:00:00Z', vizinho)

    expect(await linhaDoTempo()).toHaveLength(1)
    expect(await linhaDoTempo({ auth: AUTH_VIZINHO })).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('o cursor', () => {
  it('a página seguinte continua de onde a primeira parou', async () => {
    await limpar()
    for (let dia = 1; dia <= 6; dia++) {
      await presenca(`2026-10-0${dia}T12:00:00Z`)
    }

    const primeira = await linhaDoTempo({ limite: 3 })
    expect(primeira).toHaveLength(3)

    const ultima = primeira[2]
    const segunda = await linhaDoTempo({
      limite: 3,
      antesEm: ultima.happened_at.toISOString(),
      antesId: ultima.ref_id,
    })
    expect(segunda).toHaveLength(3)

    const ids = [...primeira, ...segunda].map((l) => l.ref_id)
    // Nem repetiu nem pulou: seis eventos, seis identificadores distintos.
    expect(new Set(ids).size).toBe(6)
  })

  it('dois eventos no mesmo instante não se perdem entre páginas', async () => {
    /*
     * O caso que o cursor de par existe para resolver: a pesagem gravada no
     * mesmo segundo do check-in da catraca. Com cursor só de data, o segundo
     * evento daquele instante some na página seguinte — e some em silêncio.
     */
    await limpar()
    const instante = '2026-10-15T12:00:00Z'
    await presenca(instante)
    await pesagem(instante, 80)
    await presenca('2026-10-14T12:00:00Z')

    const primeira = await linhaDoTempo({ limite: 1 })
    const segunda = await linhaDoTempo({
      limite: 5,
      antesEm: primeira[0].happened_at.toISOString(),
      antesId: primeira[0].ref_id,
    })

    const todos = new Set([...primeira, ...segunda].map((l) => l.ref_id))
    expect(todos.size).toBe(3)
  })

  it('o teto corta em cem, mesmo com mais eventos do que isso', async () => {
    /*
     * Com um evento só, pedir 10 mil devolvia 1 com ou sem teto — o teste
     * passava sem provar nada, e foi um mutante sobrevivente. Precisa de mais
     * de cem no banco para a diferença existir.
     */
    await limpar()
    await client.query(
      `insert into check_ins (organization_id, student_id, checked_in_at)
       select $1, $2, timestamptz '2026-01-01T12:00:00Z' + (n || ' hours')::interval
       from generate_series(1, 105) as n`,
      [ALPHA.orgId, aluno],
    )

    expect(await linhaDoTempo({ limite: 10_000 })).toHaveLength(100)
    expect(await linhaDoTempo({ limite: 20 })).toHaveLength(20)
  })

  it('pedido de zero ou negativo ainda devolve uma linha', async () => {
    // `greatest(..., 1)`: limite zero no SQL é lista vazia, e lista vazia aqui
    // leria como "você nunca fez nada".
    await limpar()
    await presenca('2026-10-22T18:00:00Z')
    expect(await linhaDoTempo({ limite: 0 })).toHaveLength(1)
    expect(await linhaDoTempo({ limite: -5 })).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('quem pode chamar', () => {
  it('conta sem matrícula recebe lista vazia, não erro', async () => {
    /*
     * A dona da academia não é aluna. A função devolve nada em vez de
     * estourar: ela é `stable` e usada em leitura de tela, e um erro aqui
     * quebraria a página de quem abriu o endereço por engano.
     */
    await limpar()
    await presenca('2026-10-22T18:00:00Z')
    expect(await linhaDoTempo({ auth: ALPHA.authId })).toHaveLength(0)
  })

  it('anônimo não executa', async () => {
    await expect(
      asUser(client, null, `select * from student_timeline(5, null, null)`),
    ).rejects.toThrow(/permission denied|permissão negada/i)
  })
})
