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
 * ── Número derivado contado no banco (0050) ─────────────────────────────────
 *
 * Três números da tela eram somados na aplicação, sobre leituras sem teto:
 * alunos por plano, fichas atribuídas por treino, e o resumo de corridas. O
 * PostgREST corta a resposta no teto do servidor sem dar erro, e somar sobre
 * uma resposta cortada devolve um número errado com cara de certo.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * 1. **O número é o do banco inteiro**, e cresce com os dados — é a asserção
 *    que um teto na consulta quebraria.
 * 2. **Os filtros de antes continuam valendo**: só matrícula `ACTIVE` conta,
 *    só atividade `COMPLETED` entra no resumo, e a data recorta.
 * 3. **Sem nada, a resposta é zero** e não vazia: a tela espera uma linha.
 * 4. **Uma academia não conta a outra**, nem passando o id dela.
 */

let client: Client
const temBanco = await databaseAvailable()

/** O perfil da dona da Alpha: a RLS de `activities` só deixa ver as próprias. */
let perfilAlpha = ''
let planoMensal = ''
let planoAnual = ''
let fichaA = ''
let fichaB = ''

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  const { rows: mensal } = await client.query(
    `select id from membership_plans where organization_id = $1 and name = 'Mensal'`,
    [ALPHA.orgId],
  )
  planoMensal = mensal[0].id
  const { rows: anual } = await client.query(
    `insert into membership_plans (organization_id, name, price, billing_cycle)
     values ($1,'Anual',899,'ANNUAL') returning id`,
    [ALPHA.orgId],
  )
  planoAnual = anual[0].id

  const { rows: treinoA } = await client.query(
    `insert into workout_plans (organization_id, name, split_label)
     values ($1,'Full body','A') returning id`,
    [ALPHA.orgId],
  )
  fichaA = treinoA[0].id
  const { rows: treinoB } = await client.query(
    `insert into workout_plans (organization_id, name, split_label)
     values ($1,'Superior','B') returning id`,
    [ALPHA.orgId],
  )
  fichaB = treinoB[0].id

  /*
   * Doze alunos, repartidos de propósito em números diferentes por plano e por
   * ficha: um teto na consulta ou um agrupamento errado daria o mesmo número
   * nos dois casos, e aí o teste passaria sem provar nada.
   *
   *   plano   Mensal 7  · Anual 4  · sem plano 1 (e 1 do seed = 8 no Mensal)
   *   ficha   A 9       · B 3
   *
   * Dois dos do Mensal entram com matrícula `CANCELLED`: eles não contam, e é
   * o filtro que a aplicação aplicava antes de somar.
   */
  for (let i = 0; i < 12; i += 1) {
    const { rows: perfil } = await client.query(
      `insert into user_profiles (name, email) values ($1,$2) returning id`,
      [`Aluno n${i}`, `n${i}@derivado.test`],
    )
    const { rows: aluno } = await client.query(
      `insert into students (organization_id, user_profile_id, status)
       values ($1,$2,'ACTIVE') returning id`,
      [ALPHA.orgId, perfil[0].id],
    )
    const id = aluno[0].id

    if (i < 7) {
      await client.query(
        `insert into memberships (organization_id, student_id, plan_id, price, billing_day, status)
         values ($1,$2,$3,109.9,5,$4)`,
        [ALPHA.orgId, id, planoMensal, i < 5 ? 'ACTIVE' : 'CANCELLED'],
      )
    } else if (i < 11) {
      await client.query(
        `insert into memberships (organization_id, student_id, plan_id, price, billing_day)
         values ($1,$2,$3,899,5)`,
        [ALPHA.orgId, id, planoAnual],
      )
    }

    await client.query(
      `insert into workout_assignments (organization_id, workout_plan_id, student_id)
       values ($1,$2,$3)`,
      [ALPHA.orgId, i < 9 ? fichaA : fichaB, id],
    )
  }

  /*
   * As corridas são da própria dona da Alpha, e não de um perfil solto:
   * `activities_self` (0016) só deixa a pessoa ver as suas, então corrida de
   * terceiro não somaria nada e o teste passaria medindo a RLS em vez da
   * função.
   *
   * Três concluídas e uma em andamento. A em andamento não entra em soma
   * nenhuma, e a mais antiga sai quando a data recorta.
   */
  const { rows: dona } = await client.query(
    `select id from user_profiles where auth_user_id = $1`,
    [ALPHA.authId],
  )
  perfilAlpha = dona[0].id
  await client.query(
    `insert into activities
       (user_profile_id, status, started_at, moving_seconds, distance_meters, calories, elevation_gain)
     values
       ($1,'COMPLETED', now() - interval '400 days', 3600, 10000, 600, 120),
       ($1,'COMPLETED', now() - interval '10 days',  1800,  5000, 300,  40),
       ($1,'COMPLETED', now() - interval '2 days',    900,  2500, 150,  10),
       ($1,'IN_PROGRESS', now() - interval '1 hour', 1200,  4000, 200,  30)`,
    [perfilAlpha],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const porPlano = (authId: string | null = ALPHA.authId, orgId = ALPHA.orgId) =>
  asUser<{ plan_id: string; total: string }>(client, authId, `select * from alunos_por_plano($1)`, [
    orgId,
  ])

const porFicha = (authId: string | null = ALPHA.authId, orgId = ALPHA.orgId) =>
  asUser<{ workout_plan_id: string; total: string }>(
    client,
    authId,
    `select * from treinos_por_plano($1)`,
    [orgId],
  )

const resumo = (desde: string, authId: string | null = ALPHA.authId, perfil?: string) =>
  asUser<{ atividades: string; metros: string; segundos: string; calorias: string; ganho: string }>(
    client,
    authId,
    `select * from resumo_de_corridas($1, $2::timestamptz)`,
    [perfil ?? perfilAlpha, desde],
  )

describe.skipIf(!temBanco)('alunos por plano', () => {
  it('conta o plano inteiro, e só matrícula ativa', async () => {
    const linhas = await porPlano()
    const mapa = Object.fromEntries(linhas.map((l) => [l.plan_id, Number(l.total)]))

    // 5 ativas do teste + 1 do seed; as 2 canceladas ficam fora.
    expect(mapa[planoMensal]).toBe(6)
    expect(mapa[planoAnual]).toBe(4)
  })

  it('plano sem ninguém simplesmente não aparece', async () => {
    const { rows: vazio } = await client.query(
      `insert into membership_plans (organization_id, name, price, billing_cycle)
       values ($1,'Semestral',499,'SEMIANNUAL') returning id`,
      [ALPHA.orgId],
    )
    const ids = (await porPlano()).map((l) => l.plan_id)

    // A tela já trata ausência como zero; devolver a linha exigiria repetir
    // aqui o filtro de academia que a RLS aplica.
    expect(ids).not.toContain(vazio[0].id)
  })
})

describe.skipIf(!temBanco)('fichas atribuídas', () => {
  it('conta por ficha, e não devolve o mesmo número para as duas', async () => {
    const mapa = Object.fromEntries(
      (await porFicha()).map((l) => [l.workout_plan_id, Number(l.total)]),
    )

    expect(mapa[fichaA]).toBe(9)
    expect(mapa[fichaB]).toBe(3)
  })
})

describe.skipIf(!temBanco)('resumo de corridas', () => {
  it('soma tudo desde o começo, e ignora o que não terminou', async () => {
    const [tudo] = await resumo(new Date(0).toISOString())

    // As três concluídas: 10000 + 5000 + 2500. A em andamento fica fora.
    expect(Number(tudo.atividades)).toBe(3)
    expect(Number(tudo.metros)).toBe(17500)
    expect(Number(tudo.segundos)).toBe(6300)
    expect(Number(tudo.calorias)).toBe(1050)
    expect(Number(tudo.ganho)).toBe(170)
  })

  it('a data recorta', async () => {
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const [mes] = await resumo(desde)

    // A de 400 dias sai; sobram as de 10 e 2 dias.
    expect(Number(mes.atividades)).toBe(2)
    expect(Number(mes.metros)).toBe(7500)
  })

  it('sem corrida nenhuma devolve zero de verdade, e não nulo', async () => {
    /*
     * `sum` de conjunto vazio é nulo, e a função promete número. Nulo não
     * quebraria a tela — `Number(null)` é 0 —, e é justamente por isso que a
     * asserção tem de olhar o valor cru: `expect(Number(x)).toBe(0)` passa com
     * nulo e não prova nada. Quem depende disto é qualquer leitor que faça
     * conta com a resposta, incluindo SQL.
     *
     * A data no futuro é o jeito de chegar ao conjunto vazio sem trocar de
     * identidade: a RLS continua deixando ver, e o recorte não deixa nada
     * passar.
     */
    const amanha = new Date(Date.now() + 86_400_000).toISOString()
    const linhas = await resumo(amanha)

    expect(linhas).toHaveLength(1)
    expect(linhas[0].atividades).toBe('0')
    expect(linhas[0].metros).not.toBeNull()
    expect(linhas[0].segundos).not.toBeNull()
    expect(linhas[0].calorias).not.toBeNull()
    expect(linhas[0].ganho).not.toBeNull()
    expect(Number(linhas[0].metros)).toBe(0)
  })
})

describe.skipIf(!temBanco)('o isolamento', () => {
  it('a vizinha não conta os alunos daqui, nem passando o id daqui', async () => {
    /*
     * `security invoker`: quem filtra é a RLS de `memberships`, não um `where`
     * que alguém pode esquecer.
     */
    expect(await porPlano(BETA.authId, ALPHA.orgId)).toHaveLength(0)
    expect(await porFicha(BETA.authId, ALPHA.orgId)).toHaveLength(0)
  })

  it('a dona da Beta conta os dela', async () => {
    // O controle do teste acima: ele passaria com uma função que nunca devolve
    // nada, e é isto que separa "isolada" de "quebrada".
    expect((await porPlano(BETA.authId, BETA.orgId)).length).toBeGreaterThan(0)
  })

  it('a vizinha pede o resumo do perfil daqui e recebe zero', async () => {
    /*
     * A função recebe um perfil como argumento e **não** confere se é o de
     * quem pediu — não precisa, porque `activities_self` só deixa a pessoa ver
     * as próprias. Este teste é o que sustenta aquela decisão: sem a RLS
     * fazendo o trabalho, passar o perfil de outra pessoa entregaria a
     * quilometragem dela.
     */
    const [linha] = await resumo(new Date(0).toISOString(), BETA.authId, perfilAlpha)

    expect(Number(linha.atividades)).toBe(0)
    expect(Number(linha.metros)).toBe(0)
  })

  it('o anônimo não executa nenhuma das três', async () => {
    await expect(porPlano(null)).rejects.toThrow(/permission denied|permissão/i)
    await expect(porFicha(null)).rejects.toThrow(/permission denied|permissão/i)
    await expect(resumo(new Date(0).toISOString(), null)).rejects.toThrow(
      /permission denied|permissão/i,
    )
  })
})
