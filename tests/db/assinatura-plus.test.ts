import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A assinatura do Synse+ (0036).
 *
 * O teste que manda é o da trava. Sem ela, virar Synse+ de graça é um PATCH em
 * `user_profiles` — e a 0014 já tinha aprendido isso com `tier`. As colunas
 * novas nascem sob a mesma trava, e é isso que estes testes conferem.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH = '77777777-7777-7777-7777-777777777777'
let perfil: string

const DIA = 86_400_000
const daquiA = (dias: number) => new Date(Date.now() + dias * DIA)

const leEstado = async () => {
  const { rows } = await client.query(
    `select tier, plus_status, plus_until, plus_provider, plus_provider_ref
       from user_profiles where id = $1`,
    [perfil],
  )
  return rows[0]
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  perfil = rows[0].user_profile_id
  await client.query(`insert into auth.users (id, email) values ($1,'plus@alpha.test')`, [AUTH])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [AUTH, perfil])
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('a trava da assinatura', () => {
  it('a conta nasce sem assinatura', async () => {
    expect(await leEstado()).toMatchObject({ tier: 'FREE', plus_status: 'NONE', plus_until: null })
  })

  it('o cliente não estende o próprio acesso por PATCH', async () => {
    // O ataque que a trava existe para impedir: um update direto na tabela.
    await expect(
      asUser(
        client,
        AUTH,
        `update user_profiles set plus_until = $1, plus_status = 'ACTIVE' where id = $2`,
        [daquiA(3650), perfil],
      ),
    ).rejects.toThrow(/não é editável pelo cliente/)
  })

  it('o cliente tampouco muda o próprio tier — a trava da 0014 segue valendo', async () => {
    await expect(
      asUser(client, AUTH, `update user_profiles set tier = 'PRO' where id = $1`, [perfil]),
    ).rejects.toThrow(/não é editável pelo cliente/)
  })

  it('o cliente continua editando o que é dele', async () => {
    // A trava não pode ter pegado a ficha inteira: nome é da pessoa.
    await asUser(client, AUTH, `update user_profiles set name = 'Nome Novo' where id = $1`, [
      perfil,
    ])
    const { rows } = await client.query(`select name from user_profiles where id = $1`, [perfil])
    expect(rows[0].name).toBe('Nome Novo')
  })

  it('a função é negada ao cliente autenticado', async () => {
    await expect(
      asUser(client, AUTH, `select set_plus_subscription($1, 'ACTIVE', $2)`, [
        perfil,
        daquiA(30),
      ]),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('set_plus_subscription', () => {
  const aplicar = (status: string, until: Date | null = daquiA(30), prov = 'ASAAS', ref = 'sub_1') =>
    client.query(`select set_plus_subscription($1, $2, $3, $4, $5)`, [
      perfil,
      status,
      until,
      prov,
      ref,
    ])

  it('o teste grátis dá PRO', async () => {
    await aplicar('TRIAL')
    expect(await leEstado()).toMatchObject({
      tier: 'PRO',
      plus_status: 'TRIAL',
      plus_provider: 'ASAAS',
      plus_provider_ref: 'sub_1',
    })
  })

  it('a renovação mantém PRO e empurra a data', async () => {
    await aplicar('ACTIVE', daquiA(60))
    const estado = await leEstado()
    expect(estado.tier).toBe('PRO')
    expect(estado.plus_status).toBe('ACTIVE')
    expect(new Date(estado.plus_until).getTime()).toBeGreaterThan(Date.now() + 50 * DIA)
  })

  it('quem cancela continua PRO até o fim do que já pagou', async () => {
    // É o que os Termos prometem: cancelar interrompe a renovação seguinte,
    // não o período em curso.
    await aplicar('CANCELED', daquiA(10))
    expect(await leEstado()).toMatchObject({ tier: 'PRO', plus_status: 'CANCELED' })
  })

  it('cancelamento com data já passada não dá PRO', async () => {
    await aplicar('CANCELED', new Date(Date.now() - DIA))
    expect(await leEstado()).toMatchObject({ tier: 'FREE', plus_status: 'CANCELED' })
  })

  it('expirar volta para FREE e limpa a data', async () => {
    await aplicar('EXPIRED', null)
    expect(await leEstado()).toMatchObject({
      tier: 'FREE',
      plus_status: 'EXPIRED',
      plus_until: null,
    })
  })

  it('recusa estado com prazo sem prazo', async () => {
    // Acesso sem data seria acesso sem fim: a rotina de expiração não teria o
    // que comparar, e a conta ficaria PRO para sempre por omissão.
    for (const status of ['TRIAL', 'ACTIVE', 'CANCELED']) {
      await expect(aplicar(status, null)).rejects.toThrow(/exige data de fim de ciclo/)
    }
  })

  it('recusa estado inventado', async () => {
    await expect(aplicar('VITALICIO')).rejects.toThrow(/inválido/)
  })
})

describe.skipIf(!temBanco)('expire_plus_subscriptions', () => {
  it('derruba quem passou da data e não encosta em quem está em dia', async () => {
    /*
     * Existe porque o acesso não pode depender de o provedor avisar: webhook
     * se perde, e conta que ficou PRO porque a notificação não chegou é
     * recurso saindo de graça.
     */
    const outro = await client.query(
      `select user_profile_id from students where organization_id = $1 order by id offset 1 limit 1`,
      [ALPHA.orgId],
    )
    const emDia = outro.rows[0].user_profile_id

    await client.query(`select set_plus_subscription($1, 'ACTIVE', $2)`, [
      perfil,
      new Date(Date.now() - DIA),
    ])
    await client.query(`select set_plus_subscription($1, 'ACTIVE', $2)`, [emDia, daquiA(15)])

    const { rows } = await client.query(`select expire_plus_subscriptions() as quantas`)
    expect(rows[0].quantas).toBeGreaterThanOrEqual(1)

    expect(await leEstado()).toMatchObject({ tier: 'FREE', plus_status: 'EXPIRED' })

    const { rows: intacto } = await client.query(
      `select tier, plus_status from user_profiles where id = $1`,
      [emDia],
    )
    expect(intacto[0]).toMatchObject({ tier: 'PRO', plus_status: 'ACTIVE' })
  })

  it('é negada ao cliente autenticado', async () => {
    await expect(asUser(client, AUTH, `select expire_plus_subscriptions()`)).rejects.toThrow()
  })
})
