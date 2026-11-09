import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aplicarBase, connect, databaseAvailable } from './helpers'

/**
 * ── Toda migration tem que colar de uma vez ─────────────────────────────────
 *
 * "Publicar não é migrar": a Vercel publica no push, e o SQL é colado à mão no
 * SQL Editor do Supabase. O Editor roda o texto inteiro **numa transação** —
 * se um comando no meio falhar, nada entra, nem o `insert into
 * schema_migrations` do fim. O sintoma é a sonda continuar acusando a
 * migration como pendente depois de alguém jurar que a rodou.
 *
 * `applyMigrations`, que todos os outros testes usam, roda cada arquivo fora
 * de transação. Isso é certo para montar o banco de teste rápido e **não é**
 * como a migration chega em produção: um arquivo com um comando que falha no
 * meio deixaria o banco de teste meio aplicado e verde.
 *
 * Aqui cada arquivo entra como é colado — `begin`, o texto inteiro, `commit` —
 * e o teste confere que a versão ficou registrada. É o mais perto que dá de
 * ensaiar a colagem sem tocar em produção.
 */

const temBanco = await databaseAvailable()
let client: Client

/** A 0018 cria `schema_migrations`. Antes dela não há onde registrar. */
const REGISTRO_EXISTE_A_PARTIR_DE = '0018_reativacao_avisa.sql'

const MIGRATIONS = readdirSync(join(process.cwd(), 'src/db/migrations'))
  .filter((nome) => nome.endsWith('.sql'))
  .sort()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await client.query('drop schema if exists public cascade; create schema public;')
  await client.query('drop schema if exists auth cascade;')
  await client.query('drop schema if exists storage cascade;')
  await aplicarBase(client)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('colar no SQL Editor', () => {
  it('tem migration para conferir, e o corte do registro é real', () => {
    // O controle: um glob quebrado deixaria o `it.each` abaixo sem caso
    // nenhum, e a suíte passaria sem ensaiar colagem alguma.
    expect(MIGRATIONS.length).toBeGreaterThan(40)
    // E a 0018 existe mesmo — um nome errado na constante desligaria a
    // asserção de registro para todos os arquivos, calada.
    expect(MIGRATIONS).toContain(REGISTRO_EXISTE_A_PARTIR_DE)
  })

  /*
   * Em ordem e em sequência, no mesmo banco: é assim que elas chegam em
   * produção, uma depois da outra, e é a única forma de a 0045 encontrar o
   * que a 0032 criou.
   */
  it.each(MIGRATIONS)('%s entra inteira, numa transação só', async (arquivo) => {
    const sql = readFileSync(join(process.cwd(), 'src/db/migrations', arquivo), 'utf8')

    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('commit')
    } catch (erro) {
      await client.query('rollback')
      throw erro
    }

    /*
     * E a versão ficou registrada. Sem esta asserção, um arquivo que
     * esquecesse o `insert into schema_migrations` do fim passaria aqui e
     * deixaria a sonda cega em produção — o defeito que a
     * `schema-migrations.test.ts` guarda pelo outro lado.
     *
     * Da 0018 para a frente, e não antes: é a 0018 que **cria** a tabela de
     * registro. As dezessete anteriores não têm onde se registrar, e exigir
     * isso delas foi a primeira versão deste teste reprovando dezessete
     * arquivos que estão certos.
     */
    if (arquivo >= REGISTRO_EXISTE_A_PARTIR_DE) {
      const { rows } = await client.query(
        `select count(*)::int as n from schema_migrations where version = $1`,
        [arquivo],
      )
      expect(rows[0].n).toBe(1)
    }
  })
})
