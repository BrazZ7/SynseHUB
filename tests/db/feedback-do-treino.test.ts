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
 * O relato do treino, do aluno para o professor (0062).
 *
 * O que estes testes protegem não é o insert — é quem pode escrever, quem pode
 * ler e o que acontece quando a fila offline manda duas vezes.
 *
 * Três riscos concretos:
 *
 *  - **Relato com autor errado.** "Senti dor no ombro" é relato de saúde, e
 *    quem escreve tem de ser a pessoa. Nem a academia, nem o aluno vizinho.
 *  - **Relato na academia errada.** A função preenche `organization_id` a
 *    partir da sessão; se ela aceitasse do cliente, dava para plantar relato
 *    na ficha de outra academia.
 *  - **Reenvio.** A fila insiste até receber sucesso. Duas chegadas têm de
 *    deixar uma linha, não duas opiniões sobre o mesmo treino.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '66666666-6666-6666-6666-666666666661'
const AUTH_VIZINHO = '66666666-6666-6666-6666-666666666662'
let aluno: string
let vizinho: string
let planoAlpha: string

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

const abrirTreino = async (clientId: string, auth = AUTH_ALUNO) => {
  const rows = await asUser<{ id: string }>(
    client,
    auth,
    `select start_workout_session($1, $2) as id`,
    [clientId, planoAlpha],
  )
  return rows[0].id
}

const relatar = (
  sessao: string,
  esforco: number,
  { dor = false, nota = null as string | null, auth = AUTH_ALUNO } = {},
) =>
  asUser(client, auth, `select set_workout_feedback($1, $2::smallint, $3, $4)`, [
    sessao,
    esforco,
    dor,
    nota,
  ])

const lerRelato = async (sessao: string) => {
  const { rows } = await client.query(
    `select organization_id, student_id, effort, discomfort, note, seen_at, seen_by
     from workout_session_feedback where session_id = $1`,
    [sessao],
  )
  return rows[0] as
    | {
        organization_id: string
        student_id: string
        effort: number
        discomfort: boolean
        note: string | null
        seen_at: Date | null
        seen_by: string | null
      }
    | undefined
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
  vizinho = rows[1].id
  await darConta(aluno, AUTH_ALUNO, 'relato1@alpha.test')
  await darConta(vizinho, AUTH_VIZINHO, 'relato2@alpha.test')

  const plano = await client.query(
    `insert into workout_plans (organization_id, name) values ($1,'Peito') returning id`,
    [ALPHA.orgId],
  )
  planoAlpha = plano.rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

/** Só um treino aberto por aluno: `start_workout_session` devolve o que já existe. */
const limparTreinos = () =>
  client.query(`update workout_sessions set status = 'COMPLETED' where student_id = any($1)`, [
    [aluno, vizinho],
  ])

describe.skipIf(!temBanco)('o relato do treino', () => {
  it('grava o que o aluno mandou, com a academia vinda da sessão', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('relato-a')
    await relatar(sessao, 8, { dor: true, nota: '  ombro direito na terceira  ' })

    const relato = await lerRelato(sessao)
    expect(relato?.effort).toBe(8)
    expect(relato?.discomfort).toBe(true)
    // `btrim` na função: espaço de teclado de celular não vira conteúdo.
    expect(relato?.note).toBe('ombro direito na terceira')
    expect(relato?.organization_id).toBe(ALPHA.orgId)
    expect(relato?.student_id).toBe(aluno)
    expect(relato?.seen_at).toBeNull()
  })

  it('observação só de espaço vira nulo', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('relato-b')
    await relatar(sessao, 5, { nota: '   ' })
    expect((await lerRelato(sessao))?.note).toBeNull()
  })

  it('reenvio da fila deixa uma linha só', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('relato-c')
    await relatar(sessao, 6)
    await relatar(sessao, 6)
    await relatar(sessao, 6)

    const { rows } = await client.query(
      `select count(*)::int as n from workout_session_feedback where session_id = $1`,
      [sessao],
    )
    expect(rows[0].n).toBe(1)
  })

  it('recusa esforço fora da escala', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('relato-d')
    await expect(relatar(sessao, 11)).rejects.toThrow(/Esforço fora da escala/)
    await expect(relatar(sessao, 0)).rejects.toThrow(/Esforço fora da escala/)
    expect(await lerRelato(sessao)).toBeUndefined()
  })

  it('o aluno vizinho não relata o treino dos outros', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('relato-e')
    await expect(relatar(sessao, 7, { auth: AUTH_VIZINHO })).rejects.toThrow(
      /Este treino não é seu/,
    )
    expect(await lerRelato(sessao)).toBeUndefined()
  })

  it('nem a academia escreve pelo aluno', async () => {
    /*
     * Ao contrário de `finish_workout_session`, que a recepção pode chamar.
     * Encerrar um treino é operação; dizer que doeu é a voz do aluno, e
     * professor escrevendo isso no lugar dele é relato de saúde com autor
     * errado.
     */
    await limparTreinos()
    const sessao = await abrirTreino('relato-f')
    await expect(relatar(sessao, 7, { auth: ALPHA.authId })).rejects.toThrow(
      /Este treino não é seu/,
    )
  })

  it('insert direto é negado — a escrita passa pela função', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('relato-g')
    await expect(
      asUser(
        client,
        AUTH_ALUNO,
        `insert into workout_session_feedback (session_id, organization_id, student_id, effort)
         values ($1, $2, $3, 5)`,
        [sessao, BETA.orgId, aluno],
      ),
    ).rejects.toThrow(/permission denied|permissão negada/i)
  })
})

describe.skipIf(!temBanco)('quem lê o relato', () => {
  it('o aluno lê o próprio e a academia dele também', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('leitura-a')
    await relatar(sessao, 9)

    const doAluno = await asUser(
      client,
      AUTH_ALUNO,
      `select effort from workout_session_feedback where session_id = $1`,
      [sessao],
    )
    expect(doAluno).toHaveLength(1)

    const daAcademia = await asUser(
      client,
      ALPHA.authId,
      `select effort from workout_session_feedback where session_id = $1`,
      [sessao],
    )
    expect(daAcademia).toHaveLength(1)
  })

  it('a academia vizinha não vê nada', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('leitura-b')
    await relatar(sessao, 9, { nota: 'dor lombar' })

    const daBeta = await asUser(
      client,
      BETA.authId,
      `select effort from workout_session_feedback where session_id = $1`,
      [sessao],
    )
    expect(daBeta).toHaveLength(0)
  })

  it('o aluno vizinho não vê o relato do colega', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('leitura-c')
    await relatar(sessao, 9)

    const doVizinho = await asUser(
      client,
      AUTH_VIZINHO,
      `select effort from workout_session_feedback where session_id = $1`,
      [sessao],
    )
    expect(doVizinho).toHaveLength(0)
  })
})

describe.skipIf(!temBanco)('marcar como visto', () => {
  it('a academia marca, e a segunda marcação não mexe no carimbo', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('visto-a')
    await relatar(sessao, 7)

    await asUser(client, ALPHA.authId, `select marcar_feedback_visto($1)`, [sessao])
    const primeiro = await lerRelato(sessao)
    expect(primeiro?.seen_at).toBeInstanceOf(Date)
    expect(primeiro?.seen_by).toBeTruthy()

    await asUser(client, ALPHA.authId, `select marcar_feedback_visto($1)`, [sessao])
    const segundo = await lerRelato(sessao)
    /*
     * "Visto" é a primeira vez. Carimbar de novo a cada abertura da ficha
     * faria qualquer medida de tempo de resposta medir o último clique.
     */
    expect(segundo?.seen_at?.getTime()).toBe(primeiro?.seen_at?.getTime())
  })

  it('a academia vizinha não marca', async () => {
    await limparTreinos()
    const sessao = await abrirTreino('visto-b')
    await relatar(sessao, 7)

    await expect(
      asUser(client, BETA.authId, `select marcar_feedback_visto($1)`, [sessao]),
    ).rejects.toThrow(/não é da sua academia/)
    expect((await lerRelato(sessao))?.seen_at).toBeNull()
  })

  it('relato corrigido volta a ser novidade', async () => {
    /*
     * O caso real: a pessoa manda, lembra que esqueceu de marcar a dor e
     * manda de novo. Sem limpar o `seen_at`, o relato novo nasce marcado como
     * já lido e ninguém olha.
     */
    await limparTreinos()
    const sessao = await abrirTreino('visto-c')
    await relatar(sessao, 5)
    await asUser(client, ALPHA.authId, `select marcar_feedback_visto($1)`, [sessao])
    expect((await lerRelato(sessao))?.seen_at).toBeInstanceOf(Date)

    await relatar(sessao, 5, { dor: true })
    const depois = await lerRelato(sessao)
    expect(depois?.discomfort).toBe(true)
    expect(depois?.seen_at).toBeNull()
    expect(depois?.seen_by).toBeNull()
  })
})
