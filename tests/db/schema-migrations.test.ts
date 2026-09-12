import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * O registro de migrations.
 *
 * Existe porque a sonda de saúde adivinhava pelo formato do schema — "existe a
 * coluna `tier`? então a 0014 subiu" — e isso só funciona enquanto toda
 * migration cria algo visível. A 0018 não cria: troca o corpo de um gatilho.
 */

let client: Client
const temBanco = await databaseAvailable()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
})

afterAll(async () => {
  await client?.end()
})

const registradas = () =>
  client
    .query('select version from schema_migrations order by version')
    .then((r) => r.rows.map((linha) => linha.version as string))

describe.skipIf(!temBanco)('schema_migrations', () => {
  it('registra as versões cujas marcas o próprio banco confirma', async () => {
    const versoes = await registradas()
    expect(versoes).toContain('0001_core.sql')
    expect(versoes).toContain('0017_consentimento.sql')
    expect(versoes).toContain('0018_reativacao_avisa.sql')
  })

  it('a última migration do repositório está registrada', async () => {
    /*
     * É o teste que cobra a disciplina: arquivo novo sem `insert into
     * schema_migrations` no fim volta a deixar a sonda cega, e o sintoma
     * apareceria só em produção, como "publiquei e nada mudou".
     */
    const arquivos = readdirSync(join(process.cwd(), 'src/db/migrations'))
      .filter((nome) => nome.endsWith('.sql'))
      .sort()

    const ultima = arquivos.at(-1)!
    expect(await registradas()).toContain(ultima)
  })

  it('não inventa versão que o banco não mostra', async () => {
    // O preenchimento inicial confere marca por marca. Uma versão inexistente
    // não pode aparecer só porque está escrita na lista.
    expect(await registradas()).not.toContain('0099_inexistente.sql')
  })

  it('é legível sem sessão, e nunca gravável pelo cliente', async () => {
    // A sonda de saúde lê com a chave pública, antes de qualquer login.
    const lido = await asUser<{ total: number }>(
      client,
      null,
      'select count(*)::int as total from schema_migrations',
    )
    expect(lido[0].total).toBeGreaterThan(5)

    await expect(
      asUser(client, null, `insert into schema_migrations (version) values ('0099_falsa.sql')`),
    ).rejects.toThrow()
  })
})
