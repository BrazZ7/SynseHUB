import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'
import { CONSENT_DOCUMENTS } from '../../src/lib/consents/catalog'

/**
 * Consentimento como prova, não como enfeite.
 *
 * O que estes testes protegem é o que a LGPD cobra do controlador: demonstrar
 * que houve consentimento, para qual texto, e desde quando. Três coisas
 * podem destruir isso sem quebrar tela nenhuma — o cliente escolher a versão,
 * o cliente apagar o registro, e o cliente ler o de outra pessoa.
 */

let client: Client
const temBanco = await databaseAvailable()

const ANA = 'cccccccc-3333-3333-3333-333333333333'
const BRUNO = 'dddddddd-4444-4444-4444-444444444444'

let perfilAna: string
let perfilBruno: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(`insert into auth.users (id, email) values ($1,'ana@c.test'), ($2,'bruno@c.test')`, [
    ANA,
    BRUNO,
  ])

  const a = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Ana','ana@c.test') returning id`,
    [ANA],
  )
  perfilAna = a.rows[0].id

  const b = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Bruno','bruno@c.test') returning id`,
    [BRUNO],
  )
  perfilBruno = b.rows[0].id
})

afterAll(async () => {
  if (client) await client.end()
})

describe.skipIf(!temBanco)('catálogo de consentimentos', () => {
  it('a cópia em TypeScript não envelheceu em relação ao SQL', async () => {
    const { rows } = await client.query(
      `select consent_type, version, title, description, url, required
       from consent_documents order by consent_type`,
    )

    const doBanco = rows.map((r) => ({
      consentType: r.consent_type,
      version: r.version,
      title: r.title,
      description: r.description,
      url: r.url,
      required: r.required,
    }))

    const daCopia = [...CONSENT_DOCUMENTS].sort((x, y) =>
      x.consentType.localeCompare(y.consentType),
    )

    expect(doBanco).toEqual(daCopia)
  })

  it('termos e privacidade são os únicos obrigatórios', async () => {
    const { rows } = await client.query(
      `select consent_type from consent_documents where required order by consent_type`,
    )
    expect(rows.map((r) => r.consent_type)).toEqual(['PRIVACY_POLICY', 'TERMS_OF_USE'])
  })

  it('o catálogo do SQL cobre todos os tipos que a tabela aceita', () => {
    // A restrição `check` de `consents` lista os tipos válidos; um tipo aceito
    // pela tabela e ausente do catálogo nunca poderia ser registrado — a
    // função não acha versão vigente e recusa.
    const sql = readFileSync(join(process.cwd(), 'src/db/migrations/0003_training_health_content.sql'), 'utf8')
    const bloco = sql.slice(sql.indexOf('create table consents'))
    for (const documento of CONSENT_DOCUMENTS) {
      expect(bloco).toContain(`'${documento.consentType}'`)
    }
  })
})

describe.skipIf(!temBanco)('registro do consentimento', () => {
  it('a versão vem do banco, não de quem chama', async () => {
    await asUser(client, ANA, `select record_consent('PROGRESS_PHOTOS', true)`)

    const { rows } = await client.query(
      `select version, accepted, accepted_at, revoked_at from consents
       where user_profile_id = $1 and consent_type = 'PROGRESS_PHOTOS'`,
      [perfilAna],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].version).toBe('v1')
    expect(rows[0].accepted).toBe(true)
    expect(rows[0].accepted_at).not.toBeNull()
    expect(rows[0].revoked_at).toBeNull()
  })

  it('revogar carimba a data e não apaga a linha', async () => {
    await asUser(client, ANA, `select record_consent('PROGRESS_PHOTOS', false)`)

    const { rows } = await client.query(
      `select accepted, accepted_at, revoked_at from consents
       where user_profile_id = $1 and consent_type = 'PROGRESS_PHOTOS'`,
      [perfilAna],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].accepted).toBe(false)
    expect(rows[0].revoked_at).not.toBeNull()
    // O histórico é o ponto: "o tratamento em março tinha base?" só se responde
    // se a data do aceite original sobreviver à revogação.
    expect(rows[0].accepted_at).not.toBeNull()
  })

  it('aceitar de novo limpa a revogação', async () => {
    await asUser(client, ANA, `select record_consent('PROGRESS_PHOTOS', true)`)

    const { rows } = await client.query(
      `select accepted, revoked_at from consents
       where user_profile_id = $1 and consent_type = 'PROGRESS_PHOTOS'`,
      [perfilAna],
    )
    expect(rows[0].accepted).toBe(true)
    expect(rows[0].revoked_at).toBeNull()
  })

  it('obrigatório não se revoga pela tela', async () => {
    await asUser(client, ANA, `select record_consent('TERMS_OF_USE', true)`)

    await expect(
      asUser(client, ANA, `select record_consent('TERMS_OF_USE', false)`),
    ).rejects.toThrow(/não pode ser revogado/)
  })

  it('tipo inventado é recusado', async () => {
    await expect(
      asUser(client, ANA, `select record_consent('VENDER_MEUS_DADOS', true)`),
    ).rejects.toThrow(/desconhecido/)
  })

  it('anônimo não registra consentimento por ninguém', async () => {
    await expect(
      asUser(client, null, `select record_consent('MARKETING_COMMUNICATION', true)`),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('o registro não é editável por quem ele documenta', () => {
  it('ninguém apaga o próprio consentimento por fora da função', async () => {
    await expect(
      asUser(client, ANA, `delete from consents where user_profile_id = $1`, [perfilAna]),
    ).rejects.toThrow()

    const { rows } = await client.query(`select count(*)::int as total from consents where user_profile_id = $1`, [
      perfilAna,
    ])
    expect(rows[0].total).toBeGreaterThan(0)
  })

  it('ninguém antecipa a própria data de aceite', async () => {
    await expect(
      asUser(
        client,
        ANA,
        `update consents set accepted_at = now() - interval '2 years' where user_profile_id = $1`,
        [perfilAna],
      ),
    ).rejects.toThrow()
  })

  it('ninguém insere um aceite direto, escolhendo versão e data', async () => {
    await expect(
      asUser(
        client,
        ANA,
        `insert into consents (user_profile_id, consent_type, accepted, version, accepted_at)
         values ($1,'RANKING_VISIBILITY',true,'v99',now())`,
        [perfilAna],
      ),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('isolamento entre pessoas', () => {
  it('cada um lê apenas o próprio consentimento', async () => {
    await asUser(client, BRUNO, `select record_consent('RANKING_VISIBILITY', true)`)

    const daAna = await asUser<{ consent_type: string }>(
      client,
      ANA,
      `select consent_type from consents`,
    )
    expect(daAna.some((linha) => linha.consent_type === 'RANKING_VISIBILITY')).toBe(false)

    const doBruno = await asUser<{ consent_type: string }>(
      client,
      BRUNO,
      `select consent_type from consents`,
    )
    expect(doBruno.map((l) => l.consent_type)).toEqual(['RANKING_VISIBILITY'])
    expect(perfilBruno).toBeTruthy()
  })

  it('o catálogo, esse sim, é público — a tela precisa dele antes do login', async () => {
    const rows = await asUser<{ total: number }>(
      client,
      null,
      `select count(*)::int as total from consent_documents`,
    )
    expect(rows[0].total).toBe(CONSENT_DOCUMENTS.length)
  })
})
