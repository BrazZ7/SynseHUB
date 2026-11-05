import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A 0055 no banco.
 *
 * O defeito que ela fecha é de origem errada, não de conta errada: "Carga
 * atual", "Ganho de carga", "Treinos registrados" e o gráfico de evolução
 * saíam de `workout_logs`, e **nada no produto escreve nessa tabela**. O
 * treino de verdade entra em `workout_set_logs` pela 0026. Numa academia real
 * os quatro eram `—`, `—`, `0` e um gráfico ausente, para sempre.
 *
 * E a conta também estava errada: comparava a primeira carga de qualquer
 * exercício com a última de qualquer exercício. Rosca de 20 kg seguida de
 * agachamento de 100 kg virava "+80 kg de ganho".
 */

let client: Client
const temBanco = await databaseAvailable()

type Linha = {
  exercise_id: string
  exercise_name: string
  primeira: string
  ultima: string
  dias: string
  primeiro_dia: string
  ultimo_dia: string
}

const num = (v: string | null) => (v == null ? null : Number(v))

let aluno: string
let outroAluno: string
let supino: string
let rosca: string

/*
 * O aluno precisa de conta para o teste de isolamento valer.
 *
 * `seedTwoGyms` cria os alunos sem `auth_user_id` — eles existem como
 * cadastro, não como login. Sem ligar um deles a `auth.users`, a asserção
 * "o aluno não enxerga o treino de outro" não tem como ser feita: não há
 * quem autenticar. A primeira versão deste arquivo tinha um `if` em volta
 * dela, e o `if` era sempre falso — o teste passava sem exercitar nada.
 */
const AUTH_DO_ALUNO = '77777777-0000-0000-0000-000000000001'

/** Uma sessão daquele dia com uma série de cada carga. */
async function registrar(
  studentId: string,
  orgId: string,
  exerciseId: string,
  dia: string,
  cargas: number[],
) {
  const { rows } = await client.query(
    `insert into workout_sessions (organization_id, student_id, client_id, status, started_at, completed_at)
     values ($1,$2,$3,'COMPLETED',$4,$4) returning id`,
    [orgId, studentId, `s-${studentId}-${exerciseId}-${dia}`, `${dia}T10:00:00Z`],
  )
  await Promise.all(
    cargas.map((carga, i) =>
      client.query(
        `insert into workout_set_logs
           (organization_id, session_id, exercise_id, set_number, reps_completed, weight, completed_at, client_id)
         values ($1,$2,$3,$4,10,$5,$6,$7)`,
        [orgId, rows[0].id, exerciseId, i + 1, carga, `${dia}T10:${10 + i}:00Z`, `c-${rows[0].id}-${i}`],
      ),
    ),
  )
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows: alunos } = await client.query(
    `select id from students where organization_id = $1 order by created_at, id`,
    [ALPHA.orgId],
  )
  aluno = alunos[0].id
  outroAluno = alunos[1].id

  const { rows: ex } = await client.query(
    `insert into exercises (slug, name, muscle_group) values
       ('supino-teste','Supino reto','CHEST'),
       ('rosca-teste','Rosca direta','ARMS')
     returning id, slug`,
  )
  supino = ex.find((e) => e.slug === 'supino-teste').id
  rosca = ex.find((e) => e.slug === 'rosca-teste').id

  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_DO_ALUNO,
    'aluno-carga@alpha.test',
  ])
  await client.query(
    `update user_profiles set auth_user_id = $1
      where id = (select user_profile_id from students where id = $2)`,
    [AUTH_DO_ALUNO, aluno],
  )
}, 120_000)

afterAll(async () => {
  await client?.end()
})

const ganho = (quem: string) =>
  client.query<Linha>(`select * from ganho_de_carga($1)`, [quem]).then((r) => r.rows)

describe.skipIf(!temBanco)('ganho_de_carga', () => {
  it('sem dois dias do mesmo exercício, não devolve linha', async () => {
    /*
     * O caso do aluno novo. Devolver zero diria "você não evoluiu" para quem
     * acabou de começar — a tela precisa distinguir isso de ausência.
     */
    await registrar(aluno, ALPHA.orgId, supino, '2026-01-05', [40])
    expect(await ganho(aluno)).toHaveLength(0)
  })

  it('com dois dias, o ganho é a diferença entre o primeiro e o último', async () => {
    await registrar(aluno, ALPHA.orgId, supino, '2026-02-05', [52.5])

    const [linha] = await ganho(aluno)
    expect(linha.exercise_name).toBe('Supino reto')
    expect(num(linha.primeira)).toBe(40)
    expect(num(linha.ultima)).toBe(52.5)
    expect(Number(linha.dias)).toBe(2)
  })

  it('a carga do dia é a máxima do dia, não uma série solta', async () => {
    /*
     * Numa sessão há aquecimento e série valendo. Pegar a primeira série
     * anotada faria o número oscilar com a ordem em que foram digitadas — e
     * o aquecimento de 20 kg viraria "a carga do dia".
     */
    await registrar(aluno, ALPHA.orgId, supino, '2026-03-05', [20, 60, 45])

    const [linha] = await ganho(aluno)
    expect(num(linha.ultima)).toBe(60)
  })

  it('não mistura exercícios: escolhe o mais treinado', async () => {
    // A rosca tem um dia só; o supino tem três. O "+80 kg" da rosca para o
    // agachamento era exatamente o defeito.
    await registrar(aluno, ALPHA.orgId, rosca, '2026-03-06', [100])

    const [linha] = await ganho(aluno)
    expect(linha.exercise_name).toBe('Supino reto')
    expect(num(linha.ultima)).toBe(60)
  })

  it('mais treinado conta dias, não séries', async () => {
    /*
     * Quem faz seis séries de rosca num dia não treinou rosca mais que
     * supino, que tem três dias. Contar séries inverteria a escolha.
     */
    await registrar(aluno, ALPHA.orgId, rosca, '2026-03-07', [10, 10, 10, 10, 10, 10])

    const [linha] = await ganho(aluno)
    expect(linha.exercise_name, 'contou série em vez de dia').toBe('Supino reto')
  })

  it('o aluno não enxerga o treino de outro', async () => {
    /*
     * ── Dois controles antes da asserção, e os dois são necessários ────────
     *
     * O primeiro: o outro aluno **tem** ganho quando lido sem RLS. Sem ele,
     * "voltou vazio" provaria que o outro não treinou, não que este não
     * enxerga.
     *
     * O segundo: autenticado, o aluno enxerga o **próprio** ganho. Sem ele,
     * um `set_config` mal feito faria tudo voltar vazio e a asserção passaria
     * pelo motivo errado — que é como esta mesma asserção passava antes, com
     * um `if (authDoAluno)` que nunca era verdadeiro porque a semente cria
     * aluno sem conta.
     */
    await registrar(outroAluno, ALPHA.orgId, rosca, '2026-04-01', [30])
    await registrar(outroAluno, ALPHA.orgId, rosca, '2026-04-08', [35])
    expect(await ganho(outroAluno), 'o outro aluno não tem ganho nenhum').toHaveLength(1)

    const oProprio = await asUser<Linha>(
      client,
      AUTH_DO_ALUNO,
      `select * from ganho_de_carga($1)`,
      [aluno],
    )
    expect(oProprio, 'o aluno não enxerga o próprio treino: a sessão não valeu').toHaveLength(1)

    const oDoOutro = await asUser<Linha>(
      client,
      AUTH_DO_ALUNO,
      `select * from ganho_de_carga($1)`,
      [outroAluno],
    )
    expect(oDoOutro).toHaveLength(0)
  })

  it('a academia vizinha não enxerga nada', async () => {
    const comoBeta = await asUser<Linha>(client, BETA.authId, `select * from ganho_de_carga($1)`, [
      aluno,
    ])
    expect(comoBeta).toHaveLength(0)
  })

  it('série sem carga anotada não entra', async () => {
    // Treino de peso corporal: `weight` nulo. Se entrasse como zero, o ganho
    // de quem faz flexão apareceria como queda de carga.
    const { rows } = await client.query(
      `insert into workout_sessions (organization_id, student_id, client_id, status, started_at)
       values ($1,$2,'sem-carga','COMPLETED',$3) returning id`,
      [ALPHA.orgId, aluno, '2026-05-01T10:00:00Z'],
    )
    await client.query(
      `insert into workout_set_logs
         (organization_id, session_id, exercise_id, set_number, reps_completed, weight, completed_at, client_id)
       values ($1,$2,$3,1,15,null,$4,'sc-1')`,
      [ALPHA.orgId, rows[0].id, supino, '2026-05-01T10:05:00Z'],
    )

    const [linha] = await ganho(aluno)
    // Continua sendo o último dia COM carga, não o dia da flexão.
    expect(num(linha.ultima)).toBe(60)
    expect(Number(linha.dias)).toBe(3)
  })

  it('não lê `workout_logs` — é a tabela que ninguém escreve', async () => {
    /*
     * O teste que trava a origem. `workout_logs` é preenchida só pela semente
     * da demonstração; se a função voltar a olhar para ela, os números somem
     * em produção e aparecem na demo — que foi como o defeito sobreviveu
     * tanto tempo.
     */
    const { rows } = await client.query<{ definicao: string }>(
      `select pg_get_functiondef(oid) as definicao from pg_proc where proname = 'ganho_de_carga'`,
    )
    expect(rows[0].definicao).not.toContain('workout_logs')
    expect(rows[0].definicao).toContain('workout_set_logs')
  })
})
