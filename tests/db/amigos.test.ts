import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Amigos e o ranking (0037).
 *
 * Duas trancas independentes, e as duas precisam segurar sozinhas:
 *
 * 1. **Amizade.** Ninguém enxerga a amizade alheia, nem entra num ranking em
 *    que não foi aceito.
 * 2. **Consentimento.** Aceitar alguém como amigo não é autorizar a publicação
 *    do próprio número. Amigo sem `RANKING_VISIBILITY` não sai do ranking.
 *
 * O teste que mais importa é o de amigo-sem-consentimento: é o caso em que
 * tudo parece certo — a amizade existe, o número existe — e publicar seria
 * quebrar a regra do produto.
 */

let client: Client
const temBanco = await databaseAvailable()

/** Três contas: duas amigas, uma estranha — e a estranha é a testemunha. */
const AUTH_ANA = '88888888-8888-8888-8888-888888888881'
const AUTH_BRUNO = '88888888-8888-8888-8888-888888888882'
const AUTH_CARLA = '88888888-8888-8888-8888-888888888883'

let ana: string
let bruno: string
let carla: string
let synseDoBruno: string
let synseDaCarla: string
let alunoDaAna: string
let alunoDoBruno: string

const DIA = 86_400_000
const DESDE = new Date(Date.now() - 30 * DIA)
const ATE = new Date(Date.now() + DIA)

async function contaEm(orgId: string, posicao: number, authId: string, email: string) {
  const { rows } = await client.query(
    `select id, user_profile_id from students
      where organization_id = $1 order by id offset $2 limit 1`,
    [orgId, posicao],
  )
  await client.query(`insert into auth.users (id, email) values ($1, $2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
  const { rows: perfil } = await client.query(
    `select synse_id from user_profiles where id = $1`,
    [rows[0].user_profile_id],
  )
  return {
    perfil: rows[0].user_profile_id as string,
    aluno: rows[0].id as string,
    synse: perfil[0].synse_id as string,
  }
}

/** Grava um treino concluído, que é o número pelo qual o ranking ordena. */
async function treino(orgId: string, alunoId: string, quandoMs: number) {
  const { rows } = await client.query(
    `insert into workout_sessions
       (organization_id, student_id, client_id, status, started_at, completed_at, duration_seconds)
     values ($1,$2,$3,'COMPLETED',$4,$4,3600) returning id`,
    [orgId, alunoId, `r-${alunoId}-${quandoMs}`, new Date(quandoMs)],
  )
  return rows[0].id as string
}

async function consentir(perfilId: string, aceito: boolean) {
  await client.query(
    `insert into consents (user_profile_id, consent_type, accepted, version, accepted_at)
     values ($1, 'RANKING_VISIBILITY', $2, 'v1', now())
     on conflict (user_profile_id, consent_type, version)
       do update set accepted = excluded.accepted, accepted_at = now(), revoked_at = null`,
    [perfilId, aceito],
  )
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 3)

  const a = await contaEm(ALPHA.orgId, 0, AUTH_ANA, 'ana@alpha.test')
  const b = await contaEm(ALPHA.orgId, 1, AUTH_BRUNO, 'bruno@alpha.test')
  // Carla é de **outra academia**: amizade atravessa organização de propósito.
  const c = await contaEm(BETA.orgId, 0, AUTH_CARLA, 'carla@beta.test')

  ana = a.perfil
  alunoDaAna = a.aluno
  bruno = b.perfil
  alunoDoBruno = b.aluno
  synseDoBruno = b.synse
  carla = c.perfil
  synseDaCarla = c.synse

  const agora = Date.now()
  // Ana treinou duas vezes; Bruno, quatro. O ranking tem de inverter a ordem.
  await treino(ALPHA.orgId, alunoDaAna, agora - 3 * DIA)
  await treino(ALPHA.orgId, alunoDaAna, agora - 5 * DIA)
  for (let i = 1; i <= 4; i += 1) await treino(ALPHA.orgId, alunoDoBruno, agora - i * DIA)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const comoAna = <T = unknown>(sql: string, params: unknown[] = []) =>
  asUser<T>(client, AUTH_ANA, sql, params)
const comoBruno = <T = unknown>(sql: string, params: unknown[] = []) =>
  asUser<T>(client, AUTH_BRUNO, sql, params)
const comoCarla = <T = unknown>(sql: string, params: unknown[] = []) =>
  asUser<T>(client, AUTH_CARLA, sql, params)

describe.skipIf(!temBanco)('pedir e responder', () => {
  let amizade: string

  it('pede pelo Synse ID e devolve só o id da amizade', async () => {
    const r = await comoAna<{ request_friendship: string }>(
      `select request_friendship($1)`,
      [synseDoBruno],
    )
    amizade = r[0].request_friendship
    expect(amizade).toBeTruthy()
  })

  it('pedir de novo não duplica', async () => {
    // O índice do par ordenado é o que impede (A,B) e (B,A) virarem duas.
    const r = await comoAna<{ request_friendship: string }>(
      `select request_friendship($1)`,
      [synseDoBruno],
    )
    expect(r[0].request_friendship).toBe(amizade)

    const { rows } = await client.query(`select count(*)::int as n from friendships`)
    expect(rows[0].n).toBe(1)
  })

  it('o outro lado pedindo cai na mesma amizade', async () => {
    const r = await comoBruno<{ request_friendship: string }>(
      `select request_friendship($1)`,
      [(await client.query(`select synse_id from user_profiles where id = $1`, [ana])).rows[0]
        .synse_id],
    )
    expect(r[0].request_friendship).toBe(amizade)
  })

  it('não deixa pedir para si mesmo', async () => {
    const meu = (await client.query(`select synse_id from user_profiles where id = $1`, [ana]))
      .rows[0].synse_id
    await expect(comoAna(`select request_friendship($1)`, [meu])).rejects.toThrow(/é o seu/)
  })

  it('recusa Synse ID que não existe', async () => {
    await expect(comoAna(`select request_friendship('SYN-ZZZZZZZZ')`)).rejects.toThrow(
      /Não encontramos/,
    )
  })

  it('quem pediu não aceita o próprio pedido', async () => {
    await expect(
      comoAna(`select respond_friendship($1, true)`, [amizade]),
    ).rejects.toThrow(/não é seu/)
  })

  it('um estranho não responde por ninguém', async () => {
    await expect(
      comoCarla(`select respond_friendship($1, true)`, [amizade]),
    ).rejects.toThrow(/não é seu/)
  })

  it('o destinatário aceita', async () => {
    await comoBruno(`select respond_friendship($1, true)`, [amizade])
    const { rows } = await client.query(`select status from friendships where id = $1`, [amizade])
    expect(rows[0].status).toBe('ACCEPTED')
  })

  it('responder duas vezes não passa', async () => {
    await expect(
      comoBruno(`select respond_friendship($1, false)`, [amizade]),
    ).rejects.toThrow(/já respondido/)
  })
})

describe.skipIf(!temBanco)('quem enxerga o quê', () => {
  it('a estranha não vê a amizade dos outros', async () => {
    // A política olha a própria linha, e não a organização: este é o teste que
    // prova que "atravessar academia" não virou "ver tudo".
    const dela = await comoCarla<{ n: number }>(`select count(*)::int as n from friendships`)
    expect(dela[0].n).toBe(0)
  })

  it('as duas pontas veem a amizade delas', async () => {
    for (const como of [comoAna, comoBruno]) {
      const r = await como<{ n: number }>(`select count(*)::int as n from friendships`)
      expect(r[0].n).toBe(1)
    }
  })

  it('a lista traz o outro, e diz de que lado veio o pedido', async () => {
    const daAna = await comoAna<{ nome: string; sou_quem_pediu: boolean; situacao: string }>(
      `select nome, sou_quem_pediu, situacao from list_friends()`,
    )
    expect(daAna).toHaveLength(1)
    expect(daAna[0].situacao).toBe('ACCEPTED')
    expect(daAna[0].sou_quem_pediu).toBe(true)

    const doBruno = await comoBruno<{ sou_quem_pediu: boolean }>(
      `select sou_quem_pediu from list_friends()`,
    )
    expect(doBruno[0].sou_quem_pediu).toBe(false)
  })

  it('a lista da estranha é vazia', async () => {
    expect(await comoCarla(`select * from list_friends()`)).toEqual([])
  })
})

describe.skipIf(!temBanco)('o ranking', () => {
  it('sem consentimento, o amigo não aparece — nem o nome, nem o número', async () => {
    /*
     * O teste que mais importa. A amizade está aceita e o número existe: tudo
     * parece certo, e publicar seria quebrar a regra do produto. Só você sai
     * daqui, porque o seu próprio número não é publicação.
     */
    const r = await comoAna<{ nome: string; sou_eu: boolean }>(
      `select nome, sou_eu from friends_ranking($1, $2)`,
      [DESDE, ATE],
    )
    expect(r).toHaveLength(1)
    expect(r[0].sou_eu).toBe(true)
  })

  it('com consentimento, entra — e na ordem de quem treinou mais', async () => {
    await consentir(bruno, true)
    await consentir(ana, true)

    const r = await comoAna<{ posicao: number; nome: string; treinos: number; sou_eu: boolean }>(
      `select posicao, nome, treinos, sou_eu from friends_ranking($1, $2) order by posicao`,
      [DESDE, ATE],
    )

    expect(r).toHaveLength(2)
    // Bruno treinou 4, Ana 2.
    expect(r[0]).toMatchObject({ posicao: 1, treinos: 4, sou_eu: false })
    expect(r[1]).toMatchObject({ posicao: 2, treinos: 2, sou_eu: true })
  })

  it('revogar tira do ranking na hora', async () => {
    await client.query(
      `update consents set revoked_at = now()
        where user_profile_id = $1 and consent_type = 'RANKING_VISIBILITY'`,
      [bruno],
    )

    const r = await comoAna<{ sou_eu: boolean }>(
      `select sou_eu from friends_ranking($1, $2)`,
      [DESDE, ATE],
    )
    expect(r).toHaveLength(1)
    expect(r[0].sou_eu).toBe(true)

    await consentir(bruno, true)
  })

  it('desmarcar também tira — desmarcado é "fora", não "sem resposta"', async () => {
    await consentir(bruno, false)
    const r = await comoAna(`select * from friends_ranking($1, $2)`, [DESDE, ATE])
    expect(r).toHaveLength(1)
    await consentir(bruno, true)
  })

  it('quem não é amigo não entra, mesmo tendo consentido', async () => {
    // Carla autorizou aparecer em ranking — mas não é amiga de ninguém aqui.
    await consentir(carla, true)
    const r = await comoAna<{ nome: string }>(
      `select nome from friends_ranking($1, $2)`,
      [DESDE, ATE],
    )
    expect(r.map((linha) => linha.nome)).not.toContain(
      (await client.query(`select name from user_profiles where id = $1`, [carla])).rows[0].name,
    )
  })

  it('pedido pendente não entra no ranking', async () => {
    const pedido = await comoCarla<{ request_friendship: string }>(
      `select request_friendship($1)`,
      [synseDoBruno],
    )
    expect(pedido[0].request_friendship).toBeTruthy()

    // Carla pediu e Bruno não respondeu: ninguém entra no ranking do outro.
    const daCarla = await comoCarla(`select * from friends_ranking($1, $2)`, [DESDE, ATE])
    expect(daCarla).toHaveLength(1)
  })

  it('a janela recorta', async () => {
    const antiga = new Date(Date.now() - 365 * DIA)
    const r = await comoAna<{ treinos: number }>(
      `select treinos from friends_ranking($1, $2) where sou_eu`,
      [antiga, new Date(Date.now() - 300 * DIA)],
    )
    expect(r[0].treinos).toBe(0)
  })
})

describe.skipIf(!temBanco)('desfazer', () => {
  it('qualquer uma das pontas desfaz', async () => {
    const { rows } = await client.query(
      `select id from friendships where status = 'ACCEPTED' limit 1`,
    )
    await comoBruno(`select remove_friendship($1)`, [rows[0].id])

    const sobrou = await client.query(`select count(*)::int as n from friendships where id = $1`, [
      rows[0].id,
    ])
    expect(sobrou.rows[0].n).toBe(0)
  })

  it('um estranho não desfaz a amizade alheia', async () => {
    const nova = await comoAna<{ request_friendship: string }>(
      `select request_friendship($1)`,
      [synseDoBruno],
    )
    await expect(
      comoCarla(`select remove_friendship($1)`, [nova[0].request_friendship]),
    ).rejects.toThrow(/não é sua/)
  })

  it('as funções são negadas ao anônimo', async () => {
    for (const sql of [
      `select request_friendship('SYN-AAAAAAAA')`,
      `select list_friends()`,
      `select friends_ranking(now(), now())`,
    ]) {
      await expect(asUser(client, null, sql), sql).rejects.toThrow()
    }
  })
})

describe.skipIf(!temBanco)('o Synse ID da Carla não vaza por engano', () => {
  it('pedir por Synse ID não devolve dado do perfil alheio', async () => {
    /*
     * `request_friendship` é `security definer` e acha um perfil que quem pede
     * não enxerga — é o ponto de existir um identificador público. Em troca ela
     * devolve só o id da amizade: se um dia alguém acrescentar o nome ao
     * retorno, vira sonda de existência de conta.
     */
    const colunas = await client.query(
      `select pg_get_function_result(oid) as r from pg_proc where proname = 'request_friendship'`,
    )
    expect(colunas.rows[0].r).toBe('uuid')
    expect(synseDaCarla).toMatch(/^SYN-/)
  })
})
