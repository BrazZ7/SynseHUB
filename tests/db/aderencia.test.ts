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
 * Aderência ao planejado (0035).
 *
 * Duas coisas estão sob teste, e a segunda é a que importa mais:
 *
 * 1. Que série sem `reps_planned` fique fora dos dois lados da conta. Contá-la
 *    como falha puniria quem fez série extra; contá-la como acerto inventaria
 *    um plano que nunca existiu.
 * 2. Que a função seja SECURITY INVOKER de verdade. Se alguém a marcasse
 *    `security definer` por descuido, a Alpha leria a aderência da Beta — e o
 *    número sairia plausível, que é o pior jeito de vazar.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '66666666-6666-6666-6666-666666666666'
let alunoAlpha: string
let alunoBeta: string
let supino: string

const DIA = 86_400_000
const AGORA = Date.now()
const DESDE = new Date(AGORA - 30 * DIA)
const ATE = new Date(AGORA + DIA)

async function treino(org: string, aluno: string, quandoMs: number) {
  const { rows } = await client.query(
    `insert into workout_sessions
       (organization_id, student_id, client_id, status, started_at, completed_at, duration_seconds)
     values ($1,$2,$3,'COMPLETED',$4,$4,3600) returning id`,
    [org, aluno, `a-${aluno}-${quandoMs}`, new Date(quandoMs)],
  )
  return rows[0].id as string
}

/** `planejadas` nulo é a série sem previsão — treino livre ou série extra. */
async function serie(
  sessao: string,
  org: string,
  numero: number,
  feitas: number,
  planejadas: number | null,
  quandoMs: number,
) {
  await client.query(
    `insert into workout_set_logs
       (organization_id, session_id, exercise_id, set_number, reps_completed, reps_planned,
        weight, rest_seconds, completed_at, client_id)
     values ($1,$2,$3,$4,$5,$6,50,90,$7,$8)`,
    [org, sessao, supino, numero, feitas, planejadas, new Date(quandoMs), `c-${sessao}-${numero}`],
  )
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
  await client.query(`insert into auth.users (id, email) values ($1,'ad@alpha.test')`, [AUTH_ALUNO])
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
    `insert into exercises (organization_id, name, muscle_group)
     values ($1,'Supino reto','CHEST') returning id`,
    [ALPHA.orgId],
  )
  supino = ex.rows[0].id

  // Sessão cheia: 3 séries de 10 previstas, 3 séries de 10 feitas.
  const cheia = await treino(ALPHA.orgId, alunoAlpha, AGORA - 20 * DIA)
  await serie(cheia, ALPHA.orgId, 1, 10, 10, AGORA - 20 * DIA)
  await serie(cheia, ALPHA.orgId, 2, 10, 10, AGORA - 20 * DIA)
  await serie(cheia, ALPHA.orgId, 3, 10, 10, AGORA - 20 * DIA)

  // Sessão que desandou: a última série parou na metade.
  const curta = await treino(ALPHA.orgId, alunoAlpha, AGORA - 10 * DIA)
  await serie(curta, ALPHA.orgId, 1, 10, 10, AGORA - 10 * DIA)
  await serie(curta, ALPHA.orgId, 2, 8, 10, AGORA - 10 * DIA)
  await serie(curta, ALPHA.orgId, 3, 5, 10, AGORA - 10 * DIA)

  // Sessão com série extra sem previsão, e uma prevista fechada.
  const extra = await treino(ALPHA.orgId, alunoAlpha, AGORA - 5 * DIA)
  await serie(extra, ALPHA.orgId, 1, 10, 10, AGORA - 5 * DIA)
  await serie(extra, ALPHA.orgId, 2, 12, null, AGORA - 5 * DIA)

  // Sessão só de série livre: não tem o que aderir, e some do resultado.
  const livre = await treino(ALPHA.orgId, alunoAlpha, AGORA - 2 * DIA)
  await serie(livre, ALPHA.orgId, 1, 15, null, AGORA - 2 * DIA)

  // Beta com números gritantes, para o vazamento ser inconfundível.
  const daBeta = await treino(BETA.orgId, alunoBeta, AGORA - 4 * DIA)
  await serie(daBeta, BETA.orgId, 1, 999, 999, AGORA - 4 * DIA)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const aderencia = (aluno: string) =>
  client
    .query(
      `select series_planejadas, reps_planejadas, reps_feitas, series_abaixo
       from workout_adherence($1, $2, $3) order by iniciado_em`,
      [aluno, DESDE, ATE],
    )
    .then((r) => r.rows)

describe.skipIf(!temBanco)('workout_adherence', () => {
  it('devolve uma linha por sessão que teve série prevista', async () => {
    const linhas = await aderencia(alunoAlpha)
    // Quatro sessões foram gravadas; a de série livre não tem o que aderir.
    expect(linhas).toHaveLength(3)
  })

  it('conta a sessão fechada como planejado igual a feito', async () => {
    const [cheia] = await aderencia(alunoAlpha)
    expect(cheia).toMatchObject({
      series_planejadas: 3,
      reps_planejadas: 30,
      reps_feitas: 30,
      series_abaixo: 0,
    })
  })

  it('separa a série que ficou abaixo da diferença de repetições', async () => {
    const [, curta] = await aderencia(alunoAlpha)
    // 10+8+5 de 30 previstas, e duas das três séries abaixo do combinado.
    expect(curta).toMatchObject({ reps_planejadas: 30, reps_feitas: 23, series_abaixo: 2 })
  })

  it('deixa a série sem previsão fora dos dois lados da conta', async () => {
    const [, , comExtra] = await aderencia(alunoAlpha)
    // A série de 12 repetições sem plano não vira crédito nem débito: a sessão
    // fala de uma série prevista só, e ela foi cumprida.
    expect(comExtra).toMatchObject({
      series_planejadas: 1,
      reps_planejadas: 10,
      reps_feitas: 10,
      series_abaixo: 0,
    })
  })

  it('a janela recorta pelo início da sessão', async () => {
    const { rows } = await client.query(
      `select count(*)::int as total from workout_adherence($1, $2, $3)`,
      [alunoAlpha, new Date(AGORA - 7 * DIA), ATE],
    )
    expect(rows[0].total).toBe(1)
  })

  it('não enxerga sessão abandonada', async () => {
    const abandonada = await client.query(
      `insert into workout_sessions
         (organization_id, student_id, client_id, status, started_at, duration_seconds)
       values ($1,$2,'abandonada','ABANDONED',$3,600) returning id`,
      [ALPHA.orgId, alunoAlpha, new Date(AGORA - DIA)],
    )
    await serie(abandonada.rows[0].id, ALPHA.orgId, 1, 2, 10, AGORA - DIA)

    const linhas = await aderencia(alunoAlpha)
    expect(linhas).toHaveLength(3)
  })

  it('a RLS filtra: o aluno da Alpha não lê a aderência do aluno da Beta', async () => {
    // O teste que justifica SECURITY INVOKER. Fosse `security definer`, esta
    // chamada devolveria as 999 repetições da Beta — um número com cara de
    // dado legítimo, que é o pior jeito de vazar.
    const daBeta = await asUser<{ total: number }>(
      client,
      AUTH_ALUNO,
      `select count(*)::int as total from workout_adherence($1, $2, $3)`,
      [alunoBeta, DESDE, ATE],
    )
    expect(daBeta[0].total).toBe(0)
  })

  it('a RLS deixa o aluno ler a própria aderência', async () => {
    const minha = await asUser<{ total: number }>(
      client,
      AUTH_ALUNO,
      `select count(*)::int as total from workout_adherence($1, $2, $3)`,
      [alunoAlpha, DESDE, ATE],
    )
    expect(minha[0].total).toBe(3)
  })
})
