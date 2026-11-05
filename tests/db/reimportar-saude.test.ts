import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A 0053 no banco.
 *
 * O que ela resolve: o `client_id` de uma pesagem importada deriva do
 * identificador que a plataforma de saúde dá à amostra, e o Health Connect
 * **mantém esse identificador quando o registro é corrigido**. Com o conflito
 * ignorando os valores, a correção nunca chegava — o Synse guardaria o número
 * errado para sempre.
 *
 * O que ela não pode quebrar, e é metade dos testes daqui: pesagem de
 * Bluetooth e pesagem digitada à mão continuam imutáveis no reenvio, e a
 * origem de uma linha nunca muda.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH = '66666666-0000-0000-0000-000000000001'
let perfil: string
let balanca: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1
     order by created_at, id limit 1`,
    [ALPHA.orgId],
  )
  perfil = rows[0].user_profile_id as string
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH,
    'saude@alpha.test',
  ])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [AUTH, perfil])

  const criada = await asUser<{ id: string }>(
    client,
    AUTH,
    `select pair_user_device($1,$2,$3,$4,$5,$6,$7::jsonb) as id`,
    ['ios-uuid', 'Balança', 'standard_ble', 'Fab', 'X', 'BLE_WEIGHT_SCALE', '{}'],
  )
  balanca = criada[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

/** Grava uma pesagem como o aplicativo grava. */
const gravar = (
  clientId: string,
  origem: string,
  peso: number,
  opcoes: { gordura?: number | null; aparelho?: string | null; medidoEm?: string } = {},
) =>
  asUser<{ id: string }>(
    client,
    AUTH,
    `select record_body_measurement(
       $1, $2::timestamptz, $3::body_measurement_source, $4::numeric, $5::uuid,
       null, $6::numeric, null, null, null, null, null, null, null, null,
       '{"weightKg":"MEASURED"}'::jsonb
     ) as id`,
    [
      clientId,
      opcoes.medidoEm ?? '2026-10-01T07:00:00Z',
      origem,
      peso,
      opcoes.aparelho ?? null,
      opcoes.gordura ?? null,
    ],
  )

const ler = async (clientId: string) => {
  const { rows } = await client.query(
    `select weight_kg, body_fat_percent, source, measured_at
       from body_measurements where user_profile_id = $1 and client_id = $2`,
    [perfil, clientId],
  )
  return rows[0]
}

describe.skipIf(!temBanco)('a reimportação de saúde atualiza', () => {
  it('o peso corrigido na plataforma chega ao Synse', async () => {
    /*
     * O caso real: a pessoa conserta o peso em outro app, o Health Connect
     * mantém o `metadata.id`, e a próxima importação traz o mesmo `client_id`
     * com valor diferente. Antes da 0053 o número errado ficava para sempre.
     */
    const [{ id }] = await gravar('hc-corrigida', 'HEALTH_CONNECT', 80)
    const [{ id: mesmo }] = await gravar('hc-corrigida', 'HEALTH_CONNECT', 78.5)

    expect(mesmo).toBe(id)
    expect(Number((await ler('hc-corrigida')).weight_kg)).toBeCloseTo(78.5, 3)
  })

  it('a composição que chegou depois enriquece a pesagem', async () => {
    await gravar('ah-enriquece', 'APPLE_HEALTH', 80)
    expect((await ler('ah-enriquece')).body_fat_percent).toBeNull()

    await gravar('ah-enriquece', 'APPLE_HEALTH', 80, { gordura: 22 })
    expect(Number((await ler('ah-enriquece')).body_fat_percent)).toBeCloseTo(22, 2)
  })

  it('devolve sempre o mesmo id, que é o que faz a fila parar de tentar', async () => {
    const [{ id: primeiro }] = await gravar('hc-id-estavel', 'HEALTH_CONNECT', 70)
    const [{ id: segundo }] = await gravar('hc-id-estavel', 'HEALTH_CONNECT', 70)
    const [{ id: terceiro }] = await gravar('hc-id-estavel', 'HEALTH_CONNECT', 71)

    expect(segundo).toBe(primeiro)
    expect(terceiro).toBe(primeiro)
  })
})

describe.skipIf(!temBanco)('o que a 0053 não pode quebrar', () => {
  it('a pesagem de Bluetooth continua imutável no reenvio', async () => {
    /*
     * A balança notifica a mesma leitura várias vezes ao confirmar a
     * estabilização. Deixar o reenvio reescrever abriria caminho para a
     * terceira notificação, mais ruidosa, substituir a primeira.
     */
    await gravar('ble-fixa', 'BLUETOOTH_SCALE', 71.4, { aparelho: balanca })
    await gravar('ble-fixa', 'BLUETOOTH_SCALE', 99, { aparelho: balanca })

    expect(Number((await ler('ble-fixa')).weight_kg)).toBeCloseTo(71.4, 3)
  })

  it('a pesagem digitada à mão continua imutável no reenvio', async () => {
    await gravar('manual-fixa', 'MANUAL', 65)
    await gravar('manual-fixa', 'MANUAL', 95)

    expect(Number((await ler('manual-fixa')).weight_kg)).toBeCloseTo(65, 3)
  })

  it('uma importação não reescreve pesagem que veio por outro caminho', async () => {
    /*
     * Se um dia um `client_id` colidir entre caminhos, a importação não pode
     * passar por cima do que a balança mediu — e a origem não pode mudar.
     */
    /*
     * Instante próprio: `(pessoa, aparelho, instante)` é único na 0032, e
     * reaproveitar o do teste anterior esbarraria nesse índice antes de
     * chegar na regra que este teste quer exercitar.
     */
    await gravar('colisao', 'BLUETOOTH_SCALE', 71.4, {
      aparelho: balanca,
      medidoEm: '2026-10-02T07:00:00Z',
    })
    await gravar('colisao', 'APPLE_HEALTH', 50, { medidoEm: '2026-10-02T07:00:00Z' })

    const linha = await ler('colisao')
    expect(Number(linha.weight_kg)).toBeCloseTo(71.4, 3)
    expect(linha.source).toBe('BLUETOOTH_SCALE')
  })

  it('o instante continua sendo refrescado em qualquer origem', async () => {
    // Comportamento que já existia antes da 0053 e segue valendo.
    await gravar('manual-instante', 'MANUAL', 65, { medidoEm: '2026-10-01T07:00:00Z' })
    await gravar('manual-instante', 'MANUAL', 65, { medidoEm: '2026-10-01T08:30:00Z' })

    const linha = await ler('manual-instante')
    expect(new Date(linha.measured_at).toISOString()).toBe('2026-10-01T08:30:00.000Z')
  })

  it('continua recusando pesagem sem peso', async () => {
    await expect(gravar('sem-peso', 'HEALTH_CONNECT', 0)).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('a migration se registra', () => {
  it('a última linha do arquivo rodou, o que prova que o arquivo inteiro rodou', async () => {
    const { rows } = await client.query(
      `select 1 from schema_migrations where version = '0053_reimportar_saude.sql'`,
    )
    expect(rows).toHaveLength(1)
  })
})
