import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { applyMigrations, connect, databaseAvailable } from './helpers'

/*
 * O arquivo roda **literalmente**, byte por byte.
 *
 * A rodada anterior deste teste filtrava a linha `\set` e substituía
 * `:'email'` antes de executar — ou seja, testava uma cópia transformada e
 * aprovava um arquivo que o SQL Editor do Supabase recusava na primeira linha.
 * Aqui não há `.replace` nem `.filter`: o que o teste executa é o que eu
 * entrego. O e-mail do arquivo é semeado como conta para que o insert da
 * trilha tenha o que casar, em vez de o teste reescrever o arquivo.
 */
const ARQUIVO = join(process.cwd(), 'src/db/seeds/programa-21-dias.sql')

const PLACEHOLDER = 'seu-email@exemplo.com'

const temBanco = await databaseAvailable()
let client: Client
const sql = readFileSync(ARQUIVO, 'utf8')

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await client.query(
    `insert into user_profiles (name, email) values ('Teste', $1) on conflict do nothing`,
    [PLACEHOLDER],
  )
}, 60_000)
afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('o SQL dos 21 dias, como entregue', () => {
  it('não tem comando de psql — foi o que quebrou antes', () => {
    const ofensivas = sql
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /^\s*\\/.test(l) || /:'/.test(l))
    expect(ofensivas).toEqual([])
  })

  it('roda inteiro, sem retoque, e grava os 21', async () => {
    await client.query(sql)
    const { rows } = await client.query(
      `select count(*)::int as n from program_steps s
        join programs p on p.id = s.program_id where p.code = 'SYNSE_21'`,
    )
    expect(rows[0].n).toBe(21)
  })

  it('rodar de novo não duplica', async () => {
    await client.query(sql)
    const { rows } = await client.query(
      `select count(*)::int as n from program_steps s
        join programs p on p.id = s.program_id where p.code = 'SYNSE_21'`,
    )
    expect(rows[0].n).toBe(21)
  })

  it('os dias vão de 1 a 21, sem buraco', async () => {
    const { rows } = await client.query(
      `select day_number from program_steps s
        join programs p on p.id = s.program_id where p.code = 'SYNSE_21'
        order by day_number`,
    )
    expect(rows.map((r) => r.day_number)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1))
  })

  it('as tarefas chegam como lista de texto, que é o que a tela espera', async () => {
    const { rows } = await client.query(
      `select tasks from program_steps s
        join programs p on p.id = s.program_id
       where p.code = 'SYNSE_21' and s.day_number = 1`,
    )
    expect(Array.isArray(rows[0].tasks)).toBe(true)
    expect(rows[0].tasks.every((t: unknown) => typeof t === 'string')).toBe(true)
    expect(rows[0].tasks[1]).toContain('Agachamento')
  })

  it('o programa é do Synse+ e dura 21 dias', async () => {
    const { rows } = await client.query(
      `select duration_days, visibility from programs where code = 'SYNSE_21'`,
    )
    expect(rows[0].duration_days).toBe(21)
    expect(rows[0].visibility).toBe('SYNSE_PLUS')
  })

  it('e a trilha registra a carga', async () => {
    const { rows } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'PROGRAMA'`,
    )
    expect(rows[0].n).toBeGreaterThan(0)
  })

  it('com o e-mail trocado — o único retoque que o arquivo pede — também roda', async () => {
    await client.query(
      `insert into user_profiles (name, email) values ('Dono','dono@real.test')
       on conflict do nothing`,
    )
    await client.query(sql.replaceAll(PLACEHOLDER, 'dono@real.test'))
    const { rows } = await client.query(
      `select count(*)::int as n from platform_access_log l
        join user_profiles u on u.id = l.user_profile_id
       where l.context = 'PROGRAMA' and u.email = 'dono@real.test'`,
    )
    expect(rows[0].n).toBe(1)
  })
})
