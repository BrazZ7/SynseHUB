import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Desafio base, plano da conta e medalha.
 *
 * O que mais importa aqui não é a medalha: é que nem o limite do plano
 * gratuito nem o plano em si sejam decididos pelo cliente. Um POST não pode
 * virar medalha de ouro, e um PATCH não pode virar assinatura Pro.
 */

let client: Client
const temBanco = await databaseAvailable()

const LIVRE = 'aaaaaaaa-1111-1111-1111-111111111111'
const PRO = 'bbbbbbbb-2222-2222-2222-222222222222'
const SOLO_ORG = '00000000-0000-0000-0000-000000000001'

let perfilLivre: string
let perfilPro: string

const cicloAtual = () =>
  client.query('select current_cycle() as ciclo').then((r) => r.rows[0].ciclo as Date)

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(
    `insert into auth.users (id, email) values ($1,'livre@d.test'), ($2,'pro@d.test')`,
    [LIVRE, PRO],
  )

  const l = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Livre','livre@d.test') returning id`,
    [LIVRE],
  )
  perfilLivre = l.rows[0].id
  const p = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Pro','pro@d.test') returning id`,
    [PRO],
  )
  perfilPro = p.rows[0].id

  await client.query(`select set_user_tier($1,'PRO')`, [perfilPro])
  // Ambos treinam sem academia: a matrícula na organização reservada é o que
  // dá check-in, e é por ela que o desafio de constância conta sozinho.
  for (const perfil of [perfilLivre, perfilPro]) {
    await client.query(`insert into students (organization_id, user_profile_id) values ($1,$2)`, [
      SOLO_ORG,
      perfil,
    ])
  }
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const escolher = (authId: string, codigo: string) =>
  asUser(client, authId, `select choose_baseline_challenge($1)`, [codigo])

describe.skipIf(!temBanco)('plano da conta', () => {
  it('a pessoa não muda o próprio plano', async () => {
    await expect(
      asUser(client, LIVRE, `update user_profiles set tier = 'PRO' where auth_user_id = $1`, [
        LIVRE,
      ]),
    ).rejects.toThrow(/não é editável pelo cliente/i)

    const { rows } = await client.query(`select tier from user_profiles where id = $1`, [
      perfilLivre,
    ])
    expect(rows[0].tier).toBe('FREE')
  })

  it('editar o resto da ficha continua funcionando', async () => {
    await asUser(
      client,
      LIVRE,
      `update user_profiles set name = 'Livre Silva' where auth_user_id = $1`,
      [LIVRE],
    )
    const { rows } = await client.query(`select name, tier from user_profiles where id = $1`, [
      perfilLivre,
    ])
    expect(rows[0]).toMatchObject({ name: 'Livre Silva', tier: 'FREE' })
  })

  it('a pessoa não chama a função que muda o plano', async () => {
    await expect(
      asUser(client, LIVRE, `select set_user_tier($1,'PRO')`, [perfilLivre]),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe.skipIf(!temBanco)('escolha do desafio', () => {
  it('o catálogo é legível por quem está autenticado', async () => {
    const linhas = await asUser<{ code: string }>(
      client,
      LIVRE,
      'select code from baseline_challenges',
    )
    expect(linhas.length).toBeGreaterThanOrEqual(6)
  })

  it('plano gratuito escolhe um por mês', async () => {
    await escolher(LIVRE, 'CORRIDA_20KM')

    await expect(escolher(LIVRE, 'CARDIO_POS_TREINO')).rejects.toThrow(/um desafio por mês/i)

    const entradas = await asUser<{ challenge_code: string }>(
      client,
      LIVRE,
      'select challenge_code from challenge_entries',
    )
    expect(entradas.map((row) => row.challenge_code)).toEqual(['CORRIDA_20KM'])
  })

  it('escolher o mesmo de novo não é erro nem duplica', async () => {
    await escolher(LIVRE, 'CORRIDA_20KM')
    const { rows } = await client.query(
      `select count(*)::int as total from challenge_entries where user_profile_id = $1`,
      [perfilLivre],
    )
    expect(rows[0].total).toBe(1)
  })

  it('desafio Pro é recusado no plano gratuito', async () => {
    await expect(escolher(LIVRE, 'MOBILIDADE_300')).rejects.toThrow(/plano Pro/i)
  })

  it('Pro escolhe mais de um e alcança os desafios Pro', async () => {
    await escolher(PRO, 'MOBILIDADE_300')
    await escolher(PRO, 'CORRIDA_20KM')

    const entradas = await asUser<{ challenge_code: string }>(
      client,
      PRO,
      'select challenge_code from challenge_entries order by challenge_code',
    )
    expect(entradas.map((row) => row.challenge_code)).toEqual(['CORRIDA_20KM', 'MOBILIDADE_300'])
  })

  it('cada pessoa só enxerga a própria escolha', async () => {
    const doLivre = await asUser<{ user_profile_id: string }>(
      client,
      LIVRE,
      'select user_profile_id from challenge_entries',
    )
    expect(doLivre.every((row) => row.user_profile_id === perfilLivre)).toBe(true)
  })

  it('a escolha vira aviso no sino', async () => {
    const avisos = await asUser<{ title: string }>(
      client,
      LIVRE,
      `select title from notifications where category = 'PROGRAM'`,
    )
    expect(avisos[0].title).toBe('Desafio do mês escolhido')
  })
})

describe.skipIf(!temBanco)('progresso', () => {
  it('registra e soma', async () => {
    const [{ record_challenge_progress: total }] = await asUser<{
      record_challenge_progress: string
    }>(
      client,
      LIVRE,
      `select record_challenge_progress('CORRIDA_20KM', 6.5) as record_challenge_progress`,
    )
    expect(Number(total)).toBe(6.5)

    await asUser(client, LIVRE, `select record_challenge_progress('CORRIDA_20KM', 3.5)`)
    const { rows } = await client.query(
      `select progress_value from challenge_entries where user_profile_id = $1`,
      [perfilLivre],
    )
    expect(Number(rows[0].progress_value)).toBe(10)
  })

  it('recusa valor absurdo e desafio que a pessoa não escolheu', async () => {
    await expect(
      asUser(client, LIVRE, `select record_challenge_progress('CORRIDA_20KM', 5000)`),
    ).rejects.toThrow(/entre 0 e 1000/i)

    await expect(
      asUser(client, LIVRE, `select record_challenge_progress('CONSTANCIA_12', 1)`),
    ).rejects.toThrow(/não tem este desafio/i)
  })

  /*
   * UPDATE sem política não é erro no Postgres: nenhuma linha fica visível
   * para alterar, e o comando volta dizendo que alterou zero. Verificar o
   * valor é o que prova a proteção — esperar exceção passaria a impressão
   * errada de que uma falha ruidosa nos avisaria.
   */
  it('não dá para escrever progresso direto na tabela', async () => {
    await asUser(client, LIVRE, `update challenge_entries set progress_value = 999`)

    const { rows } = await client.query(
      `select progress_value from challenge_entries where user_profile_id = $1`,
      [perfilLivre],
    )
    expect(Number(rows[0].progress_value)).toBe(10)
  })

  it('check-in conta sozinho no desafio de constância', async () => {
    await escolher(PRO, 'CONSTANCIA_20')

    const { rows: aluno } = await client.query(
      `select id from students where user_profile_id = $1`,
      [perfilPro],
    )
    await client.query(`insert into check_ins (organization_id, student_id) values ($1,$2)`, [
      SOLO_ORG,
      aluno[0].id,
    ])

    const { rows } = await client.query(
      `select progress_value from challenge_entries
       where user_profile_id = $1 and challenge_code = 'CONSTANCIA_20'`,
      [perfilPro],
    )
    expect(Number(rows[0].progress_value)).toBe(1)
  })
})

describe.skipIf(!temBanco)('fechamento do ciclo', () => {
  it('entrega uma medalha por ciclo passado, com nível pelo alcançado', async () => {
    const ciclo = await cicloAtual()
    const anterior = new Date(ciclo)
    anterior.setUTCMonth(anterior.getUTCMonth() - 1)
    const cicloAnterior = anterior.toISOString().slice(0, 10)

    // Mês passado: 15 de 20 km — 75%, prata.
    await client.query(
      `insert into challenge_entries (user_profile_id, challenge_code, cycle, target_value, progress_value)
       values ($1,'CORRIDA_20KM',$2,20,15)`,
      [perfilLivre, cicloAnterior],
    )

    const [{ close_own_challenge_cycles: fechados }] = await asUser<{
      close_own_challenge_cycles: number
    }>(client, LIVRE, 'select close_own_challenge_cycles() as close_own_challenge_cycles')
    expect(fechados).toBe(1)

    const medalhas = await asUser<{ level: string; cycle: Date }>(
      client,
      LIVRE,
      'select level, cycle from challenge_medals',
    )
    expect(medalhas).toHaveLength(1)
    expect(medalhas[0].level).toBe('PRATA')

    // O desafio do mês corrente não é fechado junto.
    const { rows } = await client.query(
      `select count(*)::int as total from challenge_entries
       where user_profile_id = $1 and closed_at is null`,
      [perfilLivre],
    )
    expect(rows[0].total).toBe(1)
  })

  it('chamar de novo não entrega medalha nova', async () => {
    const [{ close_own_challenge_cycles: fechados }] = await asUser<{
      close_own_challenge_cycles: number
    }>(client, LIVRE, 'select close_own_challenge_cycles() as close_own_challenge_cycles')
    expect(fechados).toBe(0)

    const medalhas = await asUser(client, LIVRE, 'select id from challenge_medals')
    expect(medalhas).toHaveLength(1)
  })

  it('quem ficou longe da meta recebe participação, não medalha vazia', async () => {
    const ciclo = await cicloAtual()
    const anterior = new Date(ciclo)
    anterior.setUTCMonth(anterior.getUTCMonth() - 2)

    await client.query(
      `insert into challenge_entries (user_profile_id, challenge_code, cycle, target_value, progress_value)
       values ($1,'CARDIO_POS_TREINO',$2,12,2)`,
      [perfilPro, anterior.toISOString().slice(0, 10)],
    )
    await asUser(client, PRO, 'select close_own_challenge_cycles()')

    const medalhas = await asUser<{ level: string }>(
      client,
      PRO,
      'select level from challenge_medals',
    )
    expect(medalhas.map((row) => row.level)).toEqual(['PARTICIPACAO'])
  })

  it('medalha não se inventa pelo cliente', async () => {
    await expect(
      asUser(
        client,
        LIVRE,
        `insert into challenge_medals (user_profile_id, challenge_code, cycle, level, progress_value, target_value)
         values ($1,'CORRIDA_20KM', current_cycle(), 'OURO', 20, 20)`,
        [perfilLivre],
      ),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('catálogo', () => {
  /*
   * O modo demonstração não tem banco e carrega uma cópia do catálogo em
   * TypeScript. Cópia sem conferência envelhece: um dia alguém muda a meta de
   * 20 para 25 km no SQL e a demonstração segue prometendo 20.
   */
  it('a cópia em TypeScript é igual à do banco', async () => {
    const { BASELINE_CHALLENGES } = await import('@/lib/baseline/challenges')

    const doBanco = await client
      .query(
        `select code, title, description, metric, unit, target_value, min_tier, position
         from baseline_challenges order by position`,
      )
      .then((r) =>
        r.rows.map((row) => ({
          code: row.code,
          title: row.title,
          description: row.description,
          metric: row.metric,
          unit: row.unit,
          targetValue: Number(row.target_value),
          minTier: row.min_tier,
          position: row.position,
        })),
      )

    expect(BASELINE_CHALLENGES).toEqual(doBanco)
  })
})
