import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Atividade, rota e recorde.
 *
 * O que mais importa aqui é o que a academia **não** vê: saber que o aluno
 * correu 7 km é uma coisa, poder refazer o caminho de casa dele é outra. Se um
 * dia alguém afrouxar a política da rota, este arquivo cai.
 */

let client: Client
const temBanco = await databaseAvailable()

const ATLETA = 'aaaa1111-0000-0000-0000-00000000aaaa'
const OUTRO = 'bbbb2222-0000-0000-0000-00000000bbbb'
const DONA = 'cccc3333-0000-0000-0000-00000000cccc'
const ORG = 'dddd4444-0000-0000-0000-00000000dddd'

let perfilAtleta: string
let atividadeId: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(
    `insert into auth.users (id, email) values ($1,'atleta@r.test'), ($2,'outro@r.test'), ($3,'dona@r.test')`,
    [ATLETA, OUTRO, DONA],
  )
  await client.query(
    `insert into organizations (id, name, slug, invite_code, status)
     values ($1,'Academia Run','run','RUN222','ACTIVE')`,
    [ORG],
  )

  const perfis = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values
       ($1,'Atleta','atleta@r.test'), ($2,'Outro','outro@r.test'), ($3,'Dona','dona@r.test')
     returning id, auth_user_id`,
    [ATLETA, OUTRO, DONA],
  )
  const porAuth = new Map(perfis.rows.map((linha) => [linha.auth_user_id, linha.id]))
  perfilAtleta = porAuth.get(ATLETA)

  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG, porAuth.get(DONA)],
  )
  await client.query(`insert into students (organization_id, user_profile_id) values ($1,$2)`, [
    ORG,
    perfilAtleta,
  ])
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('atividade', () => {
  it('a pessoa cria a própria atividade', async () => {
    const [linha] = await asUser<{ id: string }>(
      client,
      ATLETA,
      `insert into activities (user_profile_id, organization_id, sport, started_at, privacy)
       values ($1, $2, 'RUN', now() - interval '40 minutes', 'GYM') returning id`,
      [perfilAtleta, ORG],
    )
    atividadeId = linha.id
    expect(atividadeId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ninguém cria atividade no nome de outra pessoa', async () => {
    await expect(
      asUser(
        client,
        OUTRO,
        `insert into activities (user_profile_id, sport, started_at) values ($1,'RUN', now())`,
        [perfilAtleta],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('outro atleta não enxerga a corrida alheia', async () => {
    const vistas = await asUser(client, OUTRO, 'select id from activities')
    expect(vistas).toHaveLength(0)
  })

  it('o mesmo client_id não vira duas corridas', async () => {
    await asUser(
      client,
      ATLETA,
      `insert into activities (user_profile_id, sport, started_at, client_id)
       values ($1,'RUN', now(), 'local-123')`,
      [perfilAtleta],
    )

    await expect(
      asUser(
        client,
        ATLETA,
        `insert into activities (user_profile_id, sport, started_at, client_id)
         values ($1,'RUN', now(), 'local-123')`,
        [perfilAtleta],
      ),
    ).rejects.toThrow(/duplicate key|unique/i)
  })
})

describe.skipIf(!temBanco)('privacidade da rota', () => {
  beforeAll(async () => {
    if (!temBanco) return
    // Uma rota curta e reta, com marcas de distância conhecidas.
    for (let i = 0; i <= 60; i += 1) {
      await client.query(
        `insert into activity_points
           (activity_id, latitude, longitude, altitude, recorded_at, distance_from_previous, total_distance)
         values ($1, $2, -46.65, 750, (select started_at from activities where id = $1) + ($3 || ' seconds')::interval, 100, $4)`,
        [atividadeId, -23.56 + i * 0.0009, i * 10, i * 100],
      )
    }
    await client.query(
      `update activities set status = 'COMPLETED', distance_meters = 6000,
         elapsed_seconds = 600, moving_seconds = 600, ended_at = now() where id = $1`,
      [atividadeId],
    )
  })

  it('a academia vê a atividade compartilhada', async () => {
    const vistas = await asUser<{ id: string }>(client, DONA, 'select id from activities')
    expect(vistas.map((linha) => linha.id)).toContain(atividadeId)
  })

  it('a academia NÃO vê a rota', async () => {
    const pontos = await asUser(client, DONA, 'select id from activity_points')
    expect(pontos).toHaveLength(0)
  })

  it('o dono da corrida vê a própria rota', async () => {
    const pontos = await asUser(client, ATLETA, 'select id from activity_points')
    expect(pontos.length).toBeGreaterThan(50)
  })

  it('atividade privada some para a academia', async () => {
    await client.query(`update activities set privacy = 'PRIVATE' where id = $1`, [atividadeId])
    const vistas = await asUser(client, DONA, 'select id from activities')
    expect(vistas).toHaveLength(0)

    await client.query(`update activities set privacy = 'GYM' where id = $1`, [atividadeId])
  })
})

describe.skipIf(!temBanco)('recordes', () => {
  it('reconhece as distâncias clássicas alcançadas', async () => {
    const [{ claim_personal_records: novos }] = await asUser<{ claim_personal_records: number }>(
      client,
      ATLETA,
      'select claim_personal_records($1) as claim_personal_records',
      [atividadeId],
    )
    expect(novos).toBeGreaterThan(0)

    const recordes = await asUser<{ distance_meters: number; seconds: string }>(
      client,
      ATLETA,
      'select distance_meters, seconds from personal_records order by distance_meters',
    )

    // 6 km percorridos: 400 m, 1 km, 1 milha e 5 km entram; 10 km não.
    expect(recordes.map((linha) => linha.distance_meters)).toEqual([400, 1000, 1609, 5000])
    // 100 m a cada 10 s: o quilômetro sai em 100 s, pace de 1:40/km.
    expect(Number(recordes[1].seconds)).toBeCloseTo(100, 0)
  })

  it('não substitui um recorde por um tempo pior', async () => {
    const antes = await asUser<{ seconds: string }>(
      client,
      ATLETA,
      `select seconds from personal_records where distance_meters = 5000`,
    )

    // Uma corrida mais lenta: o dobro de tempo para a mesma distância.
    const [lenta] = await client
      .query(
        `insert into activities (user_profile_id, sport, status, started_at, distance_meters)
         values ($1,'RUN','COMPLETED', now() - interval '1 hour', 6000) returning id`,
        [perfilAtleta],
      )
      .then((r) => r.rows)

    for (let i = 0; i <= 60; i += 1) {
      await client.query(
        `insert into activity_points
           (activity_id, latitude, longitude, recorded_at, distance_from_previous, total_distance)
         values ($1, $2, -46.65, (select started_at from activities where id = $1) + ($3 || ' seconds')::interval, 100, $4)`,
        [lenta.id, -23.56 + i * 0.0009, i * 20, i * 100],
      )
    }

    await asUser(client, ATLETA, 'select claim_personal_records($1)', [lenta.id])

    const depois = await asUser<{ seconds: string }>(
      client,
      ATLETA,
      `select seconds from personal_records where distance_meters = 5000`,
    )
    expect(Number(depois[0].seconds)).toBeCloseTo(Number(antes[0].seconds), 5)
  })

  it('recorde é do dono, e ninguém escreve na tabela', async () => {
    const doOutro = await asUser(client, OUTRO, 'select id from personal_records')
    expect(doOutro).toHaveLength(0)

    await expect(
      asUser(
        client,
        ATLETA,
        `insert into personal_records
           (user_profile_id, distance_meters, seconds, pace_seconds, activity_id)
         values ($1, 42195, 1, 1, $2)`,
        [perfilAtleta, atividadeId],
      ),
    ).rejects.toThrow(/row-level security/i)
  })
})
