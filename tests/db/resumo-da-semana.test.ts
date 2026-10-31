import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { inicioDaSemanaLocal } from '@/features/students/semana'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O resumo da semana (0066).
 *
 * O que estes testes protegem:
 *
 *  - **A semana é a da academia, no fuso dela.** Treino de domingo às 22h em
 *    Brasília é segunda-feira em UTC: numa conta ingênua ele muda de semana, e
 *    metade dos treinos de quem treina à noite vai para a semana seguinte.
 *  - **A semana vazia vem.** Sem linha para a semana atual, a tela mostraria a
 *    passada no lugar dela — dizer que a pessoa treinou quando não treinou é o
 *    pior erro possível num resumo.
 *  - **Dias treinados são dias, não registros.** Dois check-ins no mesmo dia
 *    são um dia; check-in mais Treino Ativo no mesmo dia também.
 *  - **O esforço médio não é pesado pelo número de séries.** O volume sai em
 *    agregado próprio justamente por isso.
 *  - **A meta é a declarada**, não um 5 cravado no código.
 *  - **A função não recebe aluno.** É `security definer` e lê peso e corrida.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '77777777-7777-7777-7777-777777777771'
const AUTH_VIZINHO = '77777777-7777-7777-7777-777777777772'
let aluno: string
let perfilAluno: string
let vizinho: string
let perfilVizinho: string
let plano: string
let exercicio: string

type Semana = {
  week_start: Date
  days_trained: number
  workouts: number
  workout_seconds: number
  volume_kg: string
  sets_count: number
  runs: number
  run_seconds: number
  distance_meters: string
  check_ins: number
  avg_effort: string | null
  weight_kg: string | null
  target_days: number | null
}

const resumo = (semanas = 2, auth = AUTH_ALUNO) =>
  asUser<Semana>(client, auth, `select * from student_week_summary($1)`, [semanas])

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

/**
 * Um instante **relativo ao fuso da academia**, para o teste não envelhecer.
 *
 * `sql` é uma expressão em cima do começo da semana local; o resultado volta
 * como `timestamptz`, que é o que as tabelas guardam. Datas fixas no teste
 * passariam hoje e quebrariam quando a semana virasse.
 */
async function instante(sql: string): Promise<string> {
  const { rows } = await client.query(
    `select ((date_trunc('week', now() at time zone 'America/Sao_Paulo') + (${sql}))
             at time zone 'America/Sao_Paulo') as t`,
  )
  return (rows[0].t as Date).toISOString()
}

/** A segunda-feira local, como 'YYYY-MM-DD', de `semanas` atrás. */
async function segunda(semanas = 0): Promise<string> {
  const { rows } = await client.query(
    `select (date_trunc('week', now() at time zone 'America/Sao_Paulo')
             - make_interval(weeks => $1))::date::text as d`,
    [semanas],
  )
  return rows[0].d as string
}

const diaDaLinha = (linha: Semana) =>
  `${linha.week_start.getFullYear()}-${String(linha.week_start.getMonth() + 1).padStart(2, '0')}-${String(
    linha.week_start.getDate(),
  ).padStart(2, '0')}`

async function treino(
  quando: string,
  { series = 1, esforco = null as number | null, segundos = 3600 } = {},
) {
  const { rows } = await client.query(
    `insert into workout_sessions
       (organization_id, student_id, workout_plan_id, client_id, status, started_at, completed_at, duration_seconds)
     values ($1,$2,$3,$4,'COMPLETED',$5,$5,$6) returning id`,
    [ALPHA.orgId, aluno, plano, `w-${quando}-${Math.random()}`, quando, segundos],
  )
  const id = rows[0].id as string

  for (let i = 1; i <= series; i += 1) {
    await client.query(
      `insert into workout_set_logs
         (organization_id, session_id, exercise_id, set_number, reps_completed, weight, client_id)
       values ($1,$2,$3,$4,10,60,$5)`,
      [ALPHA.orgId, id, exercicio, i, `s-${id}-${i}`],
    )
  }

  if (esforco !== null) {
    await client.query(
      `insert into workout_session_feedback (session_id, organization_id, student_id, effort)
       values ($1,$2,$3,$4)`,
      [id, ALPHA.orgId, aluno, esforco],
    )
  }
  return id
}

const presenca = (quando: string, quem = aluno) =>
  client.query(`insert into check_ins (organization_id, student_id, checked_in_at) values ($1,$2,$3)`, [
    ALPHA.orgId,
    quem,
    quando,
  ])

const corrida = (quando: string, perfil = perfilAluno, metros = 5000) =>
  client.query(
    `insert into activities
       (user_profile_id, organization_id, sport, status, started_at, moving_seconds, distance_meters)
     values ($1,$2,'RUN','COMPLETED',$3,1800,$4)`,
    [perfil, ALPHA.orgId, quando, metros],
  )

const pesagem = (quando: string, peso: number, perfil = perfilAluno) =>
  client.query(
    `insert into body_measurements (user_profile_id, measured_at, source, weight_kg, client_id)
     values ($1,$2,'MANUAL',$3,$4)`,
    [perfil, quando, peso, `p-${quando}-${perfil}-${Math.random()}`],
  )

const limpar = () =>
  client.query(`
    delete from workout_session_feedback;
    delete from workout_set_logs;
    delete from workout_sessions;
    delete from activities;
    delete from check_ins;
    delete from body_measurements;
    delete from student_intake;
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
  perfilAluno = await darConta(aluno, AUTH_ALUNO, 'sem1@alpha.test')
  perfilVizinho = await darConta(vizinho, AUTH_VIZINHO, 'sem2@alpha.test')

  plano = (
    await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Full body') returning id`,
      [ALPHA.orgId],
    )
  ).rows[0].id
  exercicio = (
    await client.query(
      `insert into exercises (organization_id, name, muscle_group) values ($1,'Agachamento','LEGS')
       returning id`,
      [ALPHA.orgId],
    )
  ).rows[0].id
}, 60_000)

beforeEach(async () => {
  if (temBanco) await limpar()
})

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('resumo da semana', () => {
  it('a semana vazia vem com zeros, e não falta', async () => {
    /*
     * Sem linha para a semana atual a tela encostaria na seguinte, e mostraria
     * a semana passada no lugar desta. Zero é uma resposta; ausência não é.
     */
    const linhas = await resumo()
    expect(linhas).toHaveLength(2)
    expect(diaDaLinha(linhas[0])).toBe(await segunda(0))
    expect(diaDaLinha(linhas[1])).toBe(await segunda(1))
    expect(linhas[0].days_trained).toBe(0)
    expect(linhas[0].workouts).toBe(0)
    expect(linhas[0].volume_kg).toBe('0')
    // Esforço e peso ficam nulos: ausência de relato não é esforço zero.
    expect(linhas[0].avg_effort).toBeNull()
    expect(linhas[0].weight_kg).toBeNull()
  })

  it('mais recente primeiro: a linha 0 é esta semana', async () => {
    await treino(await instante(`interval '1 hour'`))
    const linhas = await resumo()
    expect(linhas[0].workouts).toBe(1)
    expect(linhas[1].workouts).toBe(0)
  })

  it('treino de domingo à noite fica na semana que acabou, não na seguinte', async () => {
    /*
     * ── O teste que justifica a função existir no banco ───────────────────
     *
     * Domingo 22h em Brasília é segunda 01h em UTC. Agrupado em UTC, este
     * treino pula para a semana seguinte — e com ele o de sexta 21h, o de
     * sábado 23h, tudo o que acontece depois das 21h. Quem treina à noite
     * veria metade da semana na semana errada, sem nada na tela indicando.
     */
    const domingoTarde = await instante(`- interval '2 hours'`)
    expect(new Date(domingoTarde).getUTCDay()).toBe(1) // em UTC já é segunda
    await treino(domingoTarde)

    const linhas = await resumo()
    expect(linhas[1].workouts).toBe(1) // a semana passada, que terminou nesse domingo
    expect(linhas[0].workouts).toBe(0)
    /*
     * E `days_trained` junto, que é o número do anel.
     *
     * Sem esta linha a cobertura tinha um buraco que a mutação encontrou: o
     * fuso podia estar certo no agregado dos treinos e errado no dos dias, e
     * nenhum teste reclamava. O anel é o número mais visto do resumo.
     */
    expect(linhas[1].days_trained).toBe(1)
    expect(linhas[0].days_trained).toBe(0)
  })

  it('check-in de domingo à noite também fica na semana que acabou', async () => {
    /*
     * A outra metade de `days_trained`. A presença entra por outro ramo do
     * `union all`, com o seu próprio `at time zone` — e um fuso errado só
     * naquele ramo moveria o dia de quem passa na catraca à noite.
     */
    const domingoTarde = await instante(`- interval '2 hours'`)
    await presenca(domingoTarde)

    const linhas = await resumo()
    expect(linhas[1].days_trained).toBe(1)
    expect(linhas[1].check_ins).toBe(1)
    expect(linhas[0].days_trained).toBe(0)
  })

  it('dias treinados conta dias, não registros', async () => {
    const terca = await instante(`interval '1 day' + interval '8 hours'`)
    const tercaDeNoite = await instante(`interval '1 day' + interval '20 hours'`)
    const quarta = await instante(`interval '2 days' + interval '8 hours'`)

    // Dois check-ins e um treino na terça; um check-in na quarta. Dois dias.
    await presenca(terca)
    await presenca(tercaDeNoite)
    await treino(tercaDeNoite)
    await presenca(quarta)

    const [semana] = await resumo()
    expect(semana.days_trained).toBe(2)
    expect(semana.check_ins).toBe(3)
    expect(semana.workouts).toBe(1)
  })

  it('a corrida não entra em dias treinados, e aparece inteira', async () => {
    /*
     * As duas chaves da 0016: treino e presença são da matrícula, a corrida é
     * da pessoa. Somar as três num número só misturaria as chaves e faria
     * este número divergir do anel da home.
     */
    await corrida(await instante(`interval '3 days'`), perfilAluno, 7500)
    await corrida(await instante(`interval '4 days'`), perfilAluno, 3200)

    const [semana] = await resumo()
    expect(semana.days_trained).toBe(0)
    expect(semana.runs).toBe(2)
    expect(Number(semana.distance_meters)).toBe(10700)
    expect(semana.run_seconds).toBe(3600)
  })

  it('a corrida de domingo à noite também respeita a semana da academia', async () => {
    /*
     * A corrida tem o seu próprio `at time zone`, e sem esta linha ele ficava
     * sem teste: as outras corridas do teste acima caem no meio da semana, onde
     * UTC e Brasília concordam. Quem corre domingo à noite é justamente quem o
     * erro moveria.
     */
    await corrida(await instante(`- interval '2 hours'`), perfilAluno, 4200)

    const linhas = await resumo()
    expect(linhas[1].runs).toBe(1)
    expect(Number(linhas[1].distance_meters)).toBe(4200)
    expect(linhas[0].runs).toBe(0)
  })

  it('o esforço médio é a média dos treinos, não das séries', async () => {
    /*
     * O defeito que o agregado separado evita: com o volume na mesma consulta,
     * o `left join` das séries multiplica as linhas, e um treino de oito
     * séries pesa oito vezes mais na média do que um de duas.
     */
    await treino(await instante(`interval '1 day'`), { series: 8, esforco: 10 })
    await treino(await instante(`interval '2 days'`), { series: 2, esforco: 2 })

    const [semana] = await resumo()
    expect(Number(semana.avg_effort)).toBe(6) // (10 + 2) / 2, e não (80 + 4) / 10
    expect(semana.sets_count).toBe(10)
  })

  it('treino sem relato não vira esforço zero', async () => {
    await treino(await instante(`interval '1 day'`), { esforco: 8 })
    await treino(await instante(`interval '2 days'`)) // sem relato

    const [semana] = await resumo()
    expect(Number(semana.avg_effort)).toBe(8)
    expect(semana.workouts).toBe(2)
  })

  it('volume e tempo somam o que foi feito', async () => {
    await treino(await instante(`interval '1 day'`), { series: 3, segundos: 2700 })
    await treino(await instante(`interval '2 days'`), { series: 2, segundos: 1800 })

    const [semana] = await resumo()
    expect(Number(semana.volume_kg)).toBe(5 * 10 * 60)
    expect(semana.workout_seconds).toBe(4500)
    expect(semana.sets_count).toBe(5)
  })

  it('o peso é o último da semana, e falta quando não houve pesagem', async () => {
    await pesagem(await instante(`interval '1 day'`), 80.5)
    await pesagem(await instante(`interval '4 days'`), 79.2)

    const linhas = await resumo()
    expect(Number(linhas[0].weight_kg)).toBe(79.2)
    expect(linhas[1].weight_kg).toBeNull()
  })

  it('a meta vem do que o aluno declarou na entrada guiada', async () => {
    const semMeta = await resumo()
    expect(semMeta[0].target_days).toBeNull()

    await client.query(
      `insert into student_intake (student_id, organization_id, goal, experience, days_per_week, completed_at)
       values ($1,$2,'GANHAR_MASSA','VOLTANDO',3, now())`,
      [aluno, ALPHA.orgId],
    )

    const comMeta = await resumo()
    expect(comMeta[0].target_days).toBe(3)
    expect(comMeta[1].target_days).toBe(3)
  })

  it('a semana do vizinho não entra na minha', async () => {
    await treino(await instante(`interval '1 day'`))
    await presenca(await instante(`interval '1 day'`), vizinho)
    await corrida(await instante(`interval '1 day'`), perfilVizinho)

    const [minha] = await resumo()
    expect(minha.workouts).toBe(1)
    expect(minha.check_ins).toBe(0)
    expect(minha.runs).toBe(0)

    const [dele] = await resumo(2, AUTH_VIZINHO)
    expect(dele.workouts).toBe(0)
    expect(dele.check_ins).toBe(1)
    expect(dele.runs).toBe(1)
  })

  it('o número de semanas tem teto e piso', async () => {
    expect(await resumo(1)).toHaveLength(1)
    expect(await resumo(12)).toHaveLength(12)
    // Pedido absurdo não vira varredura de anos.
    expect(await resumo(10_000)).toHaveLength(12)
    // Zero e negativo não devolvem lista vazia: a tela sempre tem uma semana.
    expect(await resumo(0)).toHaveLength(1)
    expect(await resumo(-5)).toHaveLength(1)
  })

  it('a conta da demonstração dá a mesma semana que o SQL', async () => {
    /*
     * ── A duplicação necessária, com teste ────────────────────────────────
     *
     * A demonstração não tem banco: ela agrupa por semana em JavaScript
     * (`inicioDaSemanaLocal`). São duas implementações da mesma regra, e duas
     * implementações divergem — este teste é o que impede a divergência de
     * chegar à tela.
     *
     * Os instantes não são aleatórios: são as bordas. Domingo 22h e segunda
     * 00h30 em Brasília são os dois lados da virada, e em UTC os dois caem na
     * segunda. Meio-dia de quarta é o caso fácil, que serve de controle.
     */
    const bordas = [
      await instante(`- interval '2 hours'`), // domingo 22h local, segunda em UTC
      await instante(`- interval '1 second'`), // o último segundo do domingo
      await instante(`interval '0 seconds'`), // a segunda, 00h00 em ponto
      await instante(`interval '30 minutes'`), // segunda 00h30 local
      await instante(`interval '2 days' + interval '12 hours'`), // quarta ao meio-dia
      await instante(`interval '6 days' + interval '23 hours'`), // domingo 23h local
    ]

    const { rows } = await client.query(
      `select t as instante,
              date_trunc('week', t at time zone 'America/Sao_Paulo')::date::text as sql_week
       from unnest($1::timestamptz[]) as t`,
      [bordas],
    )

    expect(rows).toHaveLength(bordas.length)
    for (const linha of rows) {
      const daDemonstracao = inicioDaSemanaLocal(
        (linha.instante as Date).toISOString(),
        'America/Sao_Paulo',
      )
      expect(`${linha.sql_week} ← ${(linha.instante as Date).toISOString()}`).toBe(
        `${daDemonstracao} ← ${(linha.instante as Date).toISOString()}`,
      )
    }
  })

  it('anônimo não lê resumo de ninguém', async () => {
    await expect(asUser(client, null, 'select * from student_week_summary(2)')).rejects.toThrow(
      /permission denied/i,
    )
  })

  it('quem está logado sem matrícula não recebe linha de outra pessoa', async () => {
    /*
     * `eu` fica vazio, e aí todo `join` dele não casa. O risco de uma função
     * `security definer` é o contrário: sem a amarra, uma conta sem matrícula
     * veria a soma de **todos**.
     */
    await treino(await instante(`interval '1 day'`))

    const semVinculo = '77777777-7777-7777-7777-77777777777f'
    await client.query(`insert into auth.users (id, email) values ($1,'solto@n.test')`, [semVinculo])
    await client.query(
      `insert into user_profiles (auth_user_id, name, email) values ($1,'Solto','solto@n.test')`,
      [semVinculo],
    )

    const linhas = await resumo(2, semVinculo)
    expect(linhas.every((linha) => linha.workouts === 0 && linha.days_trained === 0)).toBe(true)
  })
})
