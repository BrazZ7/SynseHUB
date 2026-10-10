import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O Treino Ativo no banco.
 *
 * O que estes testes protegem é o toque duplo. Numa academia isso não é
 * hipótese: mão suada, conexão lenta, a pessoa toca de novo. Sem garantia no
 * banco, a série 2 entra duas vezes e o volume do mês fica errado para sempre.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '44444444-4444-4444-4444-444444444444'
let alunoAlpha: string
let exercicio: string
let planoAlpha: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id, user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  alunoAlpha = rows[0].id

  // O aluno da semente não tem conta; damos uma para exercitar a RLS de verdade.
  await client.query(`insert into auth.users (id, email) values ($1,'aluno@alpha.test')`, [
    AUTH_ALUNO,
  ])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    rows[0].user_profile_id,
  ])

  const ex = await client.query(
    `insert into exercises (organization_id, name, muscle_group)
     values ($1, 'Supino reto', 'CHEST') returning id`,
    [ALPHA.orgId],
  )
  exercicio = ex.rows[0].id

  const plano = await client.query(
    `insert into workout_plans (organization_id, name) values ($1, 'Peito') returning id`,
    [ALPHA.orgId],
  )
  planoAlpha = plano.rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const abrirTreino = async (clientId: string, plano: string | null = null) => {
  const rows = await asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select start_workout_session($1, $2) as id`,
    [clientId, plano],
  )
  return rows[0].id
}

const registrarSerie = (
  sessao: string,
  numero: number,
  clientId: string,
  reps = 10,
  peso = 70,
) =>
  asUser<{ id: string }>(
    client,
    AUTH_ALUNO,
    `select log_workout_set($1, $2, $3::smallint, $4::smallint, $5, $6::numeric) as id`,
    [sessao, exercicio, numero, reps, clientId, peso],
  )

describe.skipIf(!temBanco)('abertura do treino', () => {
  it('o aluno sai do usuário autenticado, não do que o cliente mandou', async () => {
    const sessao = await abrirTreino('c-1', planoAlpha)
    const { rows } = await client.query(
      `select student_id, organization_id, status from workout_sessions where id = $1`,
      [sessao],
    )
    expect(rows[0].student_id).toBe(alunoAlpha)
    expect(rows[0].organization_id).toBe(ALPHA.orgId)
    expect(rows[0].status).toBe('IN_PROGRESS')
  })

  it('abrir de novo devolve o treino que já estava aberto', async () => {
    /*
     * O aluno volta ao app depois de o celular descartar a página. Criar uma
     * segunda sessão deixaria as séries caindo em lugares diferentes.
     */
    const primeira = await abrirTreino('c-2', planoAlpha)
    const segunda = await abrirTreino('c-3', planoAlpha)
    expect(segunda).toBe(primeira)
  })

  it('o treino esquecido de três dias atrás não engole o de hoje', async () => {
    /*
     * ── O treino fantasma ───────────────────────────────────────────────────
     *
     * `start_workout_session` devolve a sessão já aberta em vez de criar
     * outra, e está certo para quem voltou ao app dez minutos depois — é o
     * teste acima. O que ele não distinguia era **quando** aquela sessão
     * abriu.
     *
     * Sessão fica pendurada com facilidade: o app morre no meio, a bateria
     * acaba, ou a fila offline desiste do FINISH. Aí, na terça, as séries do
     * aluno caíam dentro da sessão de sábado — com o `started_at` de sábado.
     * Duração de 72 horas, volume somado dos dois treinos, e o histórico da
     * terça sem nada. Nenhum erro em lugar nenhum.
     *
     * O limite é de oito horas. Treino mais longo que isso não é treino, e
     * quem passou disso não está mais na academia.
     */
    await client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [
      alunoAlpha,
    ])

    const sabado = await abrirTreino('fantasma-1', planoAlpha)
    await client.query(
      `update workout_sessions set started_at = now() - interval '3 days' where id = $1`,
      [sabado],
    )

    const terca = await abrirTreino('fantasma-2', planoAlpha)
    expect(terca).not.toBe(sabado)

    // E a de sábado fica fechada, não pendurada para sempre.
    const { rows } = await client.query(`select status from workout_sessions where id = $1`, [
      sabado,
    ])
    expect(rows[0].status).toBe('ABANDONED')
  })

  it('mas o de dez minutos atrás continua sendo o mesmo', async () => {
    // O controle do anterior: o limite não pode atropelar a recuperação, que
    // é a razão de `start_workout_session` reaproveitar a sessão aberta.
    await client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [
      alunoAlpha,
    ])
    const agora = await abrirTreino('recente-1', planoAlpha)
    await client.query(
      `update workout_sessions set started_at = now() - interval '10 minutes' where id = $1`,
      [agora],
    )
    expect(await abrirTreino('recente-2', planoAlpha)).toBe(agora)
  })

  it('a arrumação da 0047 fecha o que já estava pendurado', async () => {
    /*
     * A outra metade da migration. A função conserta daqui para frente; este
     * `update` é o que resolve as linhas que já existem — e sem ele a
     * academia que roda o SQL hoje continua com o painel mostrando gente que
     * foi embora na semana passada.
     *
     * Rodar o arquivo de novo é seguro: é `create or replace` mais um
     * `update` com `where`, e é assim que ele chegaria num banco já migrado.
     */
    await client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [
      alunoAlpha,
    ])
    const pendurada = await abrirTreino('arrumacao-1', planoAlpha)
    await client.query(
      `update workout_sessions set started_at = now() - interval '2 days' where id = $1`,
      [pendurada],
    )

    await client.query(
      readFileSync(join(process.cwd(), 'src/db/migrations/0047_treino_fantasma.sql'), 'utf8'),
    )

    const { rows } = await client.query(
      `select status, completed_at, started_at from workout_sessions where id = $1`,
      [pendurada],
    )
    expect(rows[0].status).toBe('ABANDONED')
    // Fechada no fim da janela, não agora: carimbar `now()` inventaria um
    // treino de dois dias de duração no relatório do mês.
    const horas = (rows[0].completed_at - rows[0].started_at) / 3_600_000
    expect(horas).toBeCloseTo(8, 1)
  })

  it('plano de outra academia não vira treino', async () => {
    await client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [
      alunoAlpha,
    ])
    const outro = await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Alheio') returning id`,
      [BETA.orgId],
    )
    await expect(abrirTreino('c-4', outro.rows[0].id)).rejects.toThrow(/não é da sua academia/i)
  })
})

describe.skipIf(!temBanco)('o toque duplo', () => {
  it('a mesma série enviada duas vezes grava uma linha só', async () => {
    await client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [
      alunoAlpha,
    ])
    const sessao = await abrirTreino('t-1', planoAlpha)

    const primeira = await registrarSerie(sessao, 1, 'serie-1')
    const segunda = await registrarSerie(sessao, 1, 'serie-1')

    // Mesmo id de volta: a fila local pode marcar como sincronizada sem duvidar.
    expect(segunda[0].id).toBe(primeira[0].id)

    const { rows } = await client.query(
      `select count(*)::int as total from workout_set_logs where session_id = $1`,
      [sessao],
    )
    expect(rows[0].total).toBe(1)
  })

  it('duas séries 2 com ids diferentes não é reenvio: é dado errado', async () => {
    const { rows } = await client.query(
      `select id from workout_sessions where student_id = $1 and status = 'IN_PROGRESS'`,
      [alunoAlpha],
    )
    const sessao = rows[0].id
    await registrarSerie(sessao, 2, 'serie-2a')

    await expect(registrarSerie(sessao, 2, 'serie-2b')).rejects.toThrow(
      /duplicate key|workout_set_logs_session_id_exercise_id_set_number_key/i,
    )
  })

  it('série em treino já encerrado é recusada', async () => {
    const { rows } = await client.query(
      `select id from workout_sessions where student_id = $1 and status = 'IN_PROGRESS'`,
      [alunoAlpha],
    )
    await asUser(client, AUTH_ALUNO, `select finish_workout_session($1, 1800, 'COMPLETED')`, [
      rows[0].id,
    ])

    await expect(registrarSerie(rows[0].id, 3, 'serie-3')).rejects.toThrow(/já foi encerrado/i)
  })
})

describe.skipIf(!temBanco)('progresso e encerramento', () => {
  it('a duração efetiva é gravada, não recalculada da diferença', async () => {
    const sessao = await abrirTreino('d-1', planoAlpha)
    // 1800 s de treino numa sessão aberta agora: quem pausou não treinou o
    // tempo de parede.
    await asUser(client, AUTH_ALUNO, `select finish_workout_session($1, 1800, 'COMPLETED')`, [
      sessao,
    ])

    const { rows } = await client.query(
      `select duration_seconds, status, completed_at from workout_sessions where id = $1`,
      [sessao],
    )
    expect(rows[0].duration_seconds).toBe(1800)
    expect(rows[0].status).toBe('COMPLETED')
    expect(rows[0].completed_at).not.toBeNull()
  })

  it('só um treino em andamento por aluno', async () => {
    await client.query(`update workout_sessions set status = 'COMPLETED' where student_id = $1`, [
      alunoAlpha,
    ])
    await abrirTreino('u-1', planoAlpha)

    /*
     * O índice parcial é a garantia; `start_workout_session` devolve o aberto
     * antes de chegar nele. Aqui o insert cru prova que a garantia é do banco.
     */
    await expect(
      client.query(
        `insert into workout_sessions (organization_id, student_id, client_id)
         values ($1, $2, 'u-2')`,
        [ALPHA.orgId, alunoAlpha],
      ),
    ).rejects.toThrow(/duplicate key|workout_sessions_um_ativo_idx/i)
  })
})

describe.skipIf(!temBanco)('quem enxerga o treino', () => {
  it('o aluno lê o próprio', async () => {
    const meus = await asUser<{ total: number }>(
      client,
      AUTH_ALUNO,
      `select count(*)::int as total from workout_sessions`,
    )
    expect(meus[0].total).toBeGreaterThan(0)
  })

  it('a academia vizinha não lê nada', async () => {
    const daBeta = await asUser<{ total: number }>(
      client,
      BETA.authId,
      `select count(*)::int as total from workout_sessions`,
    )
    expect(daBeta[0].total).toBe(0)
  })

  it('o professor da academia lê, porque é o trabalho dele', async () => {
    const daAlpha = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select count(*)::int as total from workout_sessions`,
    )
    expect(daAlpha[0].total).toBeGreaterThan(0)
  })

  it('o aluno não grava série na mão', async () => {
    /*
     * Sem este revoke, um insert cru escolheria o `organization_id` e gravaria
     * em treino já fechado — as duas checagens que `log_workout_set` faz.
     */
    const { rows } = await client.query(
      `select id from workout_sessions where student_id = $1 limit 1`,
      [alunoAlpha],
    )
    await expect(
      asUser(
        client,
        AUTH_ALUNO,
        `insert into workout_set_logs
           (organization_id, session_id, exercise_id, set_number, reps_completed, client_id)
         values ($1, $2, $3, 9, 10, 'na-mao')`,
        [ALPHA.orgId, rows[0].id, exercicio],
      ),
    ).rejects.toThrow(/permission denied|permissão/i)
  })

  it('as preferências são de cada um', async () => {
    await asUser(
      client,
      AUTH_ALUNO,
      `insert into workout_preferences (user_profile_id, default_rest_seconds)
       values (auth_profile_id(), 120)`,
    )
    const doDono = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select count(*)::int as total from workout_preferences`,
    )
    expect(doDono[0].total).toBe(0)
  })
})
