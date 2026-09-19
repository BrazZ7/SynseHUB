import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Synse Body no banco.
 *
 * O que estes testes protegem é a decisão central da 0032: bioimpedância diz
 * gordura visceral e água corporal de alguém, e pertencer à mesma academia
 * **não** é consentimento para ver isso. A abertura é nominal e revogável.
 *
 * O segundo eixo é a balança de família. O mesmo aparelho pesa quatro pessoas,
 * e o erro mais fácil de cometer é gravar a pesagem de uma no histórico de
 * outra. Por isso a pessoa sai do `auth.uid()` e o aparelho é conferido.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_DONA = '55555555-0000-0000-0000-000000000001'
const AUTH_COLEGA = '55555555-0000-0000-0000-000000000002'
const AUTH_PROFESSOR = '55555555-0000-0000-0000-000000000003'
const AUTH_ESTRANHO = '55555555-0000-0000-0000-000000000004'

let perfilDona: string
let perfilProfessor: string
let balancaDaDona: string

/** Dá conta a um aluno da semente, para exercitar a RLS de verdade. */
async function darConta(org: string, indice: number, authId: string, email: string) {
  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1
     order by created_at, id offset $2 limit 1`,
    [org, indice],
  )
  const perfil = rows[0].user_profile_id as string
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [authId, perfil])
  return perfil
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 3)

  // Dona e colega treinam na MESMA academia — que é justamente o ponto.
  perfilDona = await darConta(ALPHA.orgId, 0, AUTH_DONA, 'dona.do.corpo@alpha.test')
  await darConta(ALPHA.orgId, 1, AUTH_COLEGA, 'colega@alpha.test')
  await darConta(BETA.orgId, 0, AUTH_ESTRANHO, 'estranho@beta.test')

  // O professor é staff da academia da dona, com papel e tudo.
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_PROFESSOR,
    'professor@alpha.test',
  ])
  const prof = await client.query(
    `insert into user_profiles (auth_user_id, name, email)
     values ($1,'Professor','professor@alpha.test') returning id`,
    [AUTH_PROFESSOR],
  )
  perfilProfessor = prof.rows[0].id
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role)
     values ($1,$2,'TRAINER')`,
    [ALPHA.orgId, perfilProfessor],
  )
  await client.query(
    `insert into staff (organization_id, user_profile_id, role) values ($1,$2,'TRAINER')`,
    [ALPHA.orgId, perfilProfessor],
  )

  const balanca = await asUser<{ id: string }>(
    client,
    AUTH_DONA,
    `select pair_user_device($1,$2,$3,$4,$5,$6,$7::jsonb) as id`,
    [
      'ios-cb-uuid-da-dona',
      'Balança da sala',
      'standard_ble',
      'Fabricante',
      'XS-200',
      'BLE_WEIGHT_SCALE',
      JSON.stringify({ weight: true, bodyComposition: true }),
    ],
  )
  balancaDaDona = balanca[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const pesar = (
  authId: string,
  clientId: string,
  medidoEm: string,
  peso: number | null = 71.4,
  aparelho: string | null = null,
) =>
  asUser<{ id: string }>(
    client,
    authId,
    `select record_body_measurement(
       $1, $2::timestamptz, $3::body_measurement_source, $4::numeric, $5::uuid,
       null, null, null, null, null, null, null, null, null, null,
       '{"weightKg":"MEASURED"}'::jsonb
     ) as id`,
    [clientId, medidoEm, 'BLUETOOTH_SCALE', peso, aparelho],
  )

describe.skipIf(!temBanco)('de quem é a pesagem', () => {
  it('a pessoa sai do usuário autenticado, não do que o cliente mandou', async () => {
    const [{ id }] = await pesar(AUTH_DONA, 'm-1', '2026-09-01T07:00:00Z', 71.4, balancaDaDona)

    const { rows } = await client.query(
      `select user_profile_id, device_id, source, weight_kg, field_origin
       from body_measurements where id = $1`,
      [id],
    )
    expect(rows[0].user_profile_id).toBe(perfilDona)
    expect(rows[0].device_id).toBe(balancaDaDona)
    expect(rows[0].source).toBe('BLUETOOTH_SCALE')
    expect(Number(rows[0].weight_kg)).toBeCloseTo(71.4, 3)
    // A tela precisa poder dizer o que a balança mediu e o que o Synse calculou.
    expect(rows[0].field_origin).toEqual({ weightKg: 'MEASURED' })
  })

  it('a balança de outra pessoa não vira o aparelho da medição', async () => {
    /*
     * Numa balança de família cada pessoa tem o próprio vínculo com o mesmo
     * aparelho. Aceitar um `device_id` alheio ligaria a pesagem ao vínculo
     * errado — e o histórico do aparelho é o que diz de onde o número veio.
     */
    await expect(
      pesar(AUTH_COLEGA, 'm-alheia', '2026-09-01T07:05:00Z', 68, balancaDaDona),
    ).rejects.toThrow(/não é seu/i)
  })

  it('pesagem sem peso não é pesagem', async () => {
    await expect(pesar(AUTH_DONA, 'm-vazia', '2026-09-01T08:00:00Z', null)).rejects.toThrow(
      /sem peso/i,
    )
  })

  it('sem sessão identificada não grava', async () => {
    await expect(pesar(null as unknown as string, 'm-anon', '2026-09-01T08:00:00Z')).rejects.toThrow(
      /permission denied|permissão|não identificada/i,
    )
  })

  it('o aparelho registra que foi visto', async () => {
    const { rows } = await client.query(
      `select last_seen_at from user_devices where id = $1`,
      [balancaDaDona],
    )
    expect(rows[0].last_seen_at).not.toBeNull()
  })
})

describe.skipIf(!temBanco)('a balança repetindo a mesma leitura', () => {
  it('o mesmo envio duas vezes grava uma linha só', async () => {
    const primeira = await pesar(AUTH_DONA, 'm-repetida', '2026-09-02T07:00:00Z', 71.2)
    const segunda = await pesar(AUTH_DONA, 'm-repetida', '2026-09-02T07:00:00Z', 71.2)

    // Mesmo id de volta: a fila offline pode marcar como sincronizada sem duvidar.
    expect(segunda[0].id).toBe(primeira[0].id)

    const { rows } = await client.query(
      `select count(*)::int as total from body_measurements
       where user_profile_id = $1 and client_id = 'm-repetida'`,
      [perfilDona],
    )
    expect(rows[0].total).toBe(1)
  })

  it('a mesma pesagem com identificadores diferentes não entra duas vezes', async () => {
    /*
     * Várias balanças notificam a estabilização mais de uma vez, e o app gera
     * um `client_id` novo a cada notificação. O `client_id` não cobre esse
     * caso; o índice por aparelho e instante cobre.
     */
    await pesar(AUTH_DONA, 'm-estavel-1', '2026-09-03T07:00:00Z', 71.0, balancaDaDona)
    await expect(
      pesar(AUTH_DONA, 'm-estavel-2', '2026-09-03T07:00:00Z', 71.0, balancaDaDona),
    ).rejects.toThrow(/duplicate key|body_measurements_sem_repeticao_idx/i)
  })

  it('entrada manual no mesmo instante não colide com a da balança', async () => {
    // O índice é parcial de propósito: sem aparelho não há repetição de aparelho.
    await pesar(AUTH_DONA, 'm-manual-1', '2026-09-04T07:00:00Z', 70.9)
    const segunda = await pesar(AUTH_DONA, 'm-manual-2', '2026-09-04T07:00:00Z', 70.9)
    expect(segunda[0].id).toBeTruthy()
  })
})

describe.skipIf(!temBanco)('quem enxerga o corpo de alguém', () => {
  it('a dona enxerga o próprio histórico', async () => {
    const linhas = await asUser(
      client,
      AUTH_DONA,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas.length).toBeGreaterThan(0)
  })

  it('colega da MESMA academia não enxerga nada', async () => {
    const linhas = await asUser(
      client,
      AUTH_COLEGA,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas).toHaveLength(0)
  })

  it('professor da academia dela também não enxerga — ser staff não basta', async () => {
    const linhas = await asUser(
      client,
      AUTH_PROFESSOR,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas).toHaveLength(0)
  })

  it('o anônimo não enxerga nada', async () => {
    const linhas = await asUser(
      client,
      null,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas).toHaveLength(0)
  })

  it('com autorização dada por ela, o professor enxerga', async () => {
    await asUser(
      client,
      AUTH_DONA,
      `insert into body_measurement_shares (user_profile_id, shared_with_profile_id, organization_id)
       values ($1,$2,$3)`,
      [perfilDona, perfilProfessor, ALPHA.orgId],
    )

    const linhas = await asUser(
      client,
      AUTH_PROFESSOR,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas.length).toBeGreaterThan(0)
  })

  it('a autorização do professor não abre o histórico para o colega', async () => {
    const linhas = await asUser(
      client,
      AUTH_COLEGA,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas).toHaveLength(0)
  })

  it('revogada, a autorização para de valer na hora', async () => {
    await asUser(
      client,
      AUTH_DONA,
      `update body_measurement_shares set revoked_at = now()
       where user_profile_id = $1 and shared_with_profile_id = $2`,
      [perfilDona, perfilProfessor],
    )

    const linhas = await asUser(
      client,
      AUTH_PROFESSOR,
      `select id from body_measurements where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas).toHaveLength(0)
  })

  it('ninguém autoriza em nome de outra pessoa', async () => {
    /*
     * O `with check` recusa; se um dia ele cair, a linha entra e o teste
     * quebra aqui em vez de na notícia sobre vazamento.
     */
    await expect(
      asUser(
        client,
        AUTH_PROFESSOR,
        `insert into body_measurement_shares (user_profile_id, shared_with_profile_id)
         values ($1,$2)`,
        [perfilDona, perfilProfessor],
      ),
    ).rejects.toThrow(/row-level security|violates/i)
  })

  it('quem recebeu a autorização sabe que ela existe', async () => {
    const linhas = await asUser(
      client,
      AUTH_PROFESSOR,
      `select id, revoked_at from body_measurement_shares where shared_with_profile_id = $1`,
      [perfilProfessor],
    )
    expect(linhas).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('o caminho da escrita', () => {
  it('insert direto na tabela é recusado', async () => {
    /*
     * Sem o revoke, um insert cru gravaria peso em nome de outra pessoa da
     * mesma balança de família — a função é que resolve o dono pelo auth.uid().
     */
    await expect(
      asUser(
        client,
        AUTH_COLEGA,
        `insert into body_measurements (user_profile_id, measured_at, weight_kg, client_id)
         values ($1, now(), 71, 'cru')`,
        [perfilDona],
      ),
    ).rejects.toThrow(/permission denied|permissão/i)
  })

  it('update direto na tabela é recusado', async () => {
    await expect(
      asUser(client, AUTH_DONA, `update body_measurements set weight_kg = 60 where user_profile_id = $1`, [
        perfilDona,
      ]),
    ).rejects.toThrow(/permission denied|permissão/i)
  })

  it('a pessoa apaga a própria medição', async () => {
    const [{ id }] = await pesar(AUTH_DONA, 'm-apagavel', '2026-09-05T07:00:00Z', 70.5)
    await asUser(client, AUTH_DONA, `delete from body_measurements where id = $1`, [id])

    const { rows } = await client.query(`select count(*)::int as total from body_measurements where id = $1`, [
      id,
    ])
    expect(rows[0].total).toBe(0)
  })

  it('e não apaga a de outra pessoa', async () => {
    const [{ id }] = await pesar(AUTH_DONA, 'm-protegida', '2026-09-06T07:00:00Z', 70.6)
    await asUser(client, AUTH_COLEGA, `delete from body_measurements where id = $1`, [id])

    const { rows } = await client.query(`select count(*)::int as total from body_measurements where id = $1`, [
      id,
    ])
    expect(rows[0].total).toBe(1)
  })
})

describe.skipIf(!temBanco)('os aparelhos', () => {
  it('parear de novo atualiza em vez de duplicar', async () => {
    const [{ id }] = await asUser<{ id: string }>(
      client,
      AUTH_DONA,
      `select pair_user_device($1,$2,'standard_ble',null,null,null,'{"weight":true}'::jsonb,'1.4') as id`,
      ['ios-cb-uuid-da-dona', 'Balança do quarto'],
    )
    expect(id).toBe(balancaDaDona)

    const { rows } = await client.query(
      `select display_name, firmware_version, status from user_devices where id = $1`,
      [balancaDaDona],
    )
    expect(rows[0].display_name).toBe('Balança do quarto')
    expect(rows[0].firmware_version).toBe('1.4')
  })

  it('a mesma balança de família entra para cada pessoa da casa', async () => {
    /*
     * O identificador é único por pessoa, não global: o aparelho é um só e os
     * vínculos são quatro, um por morador.
     */
    const [{ id }] = await asUser<{ id: string }>(
      client,
      AUTH_COLEGA,
      `select pair_user_device($1,$2) as id`,
      ['ios-cb-uuid-da-dona', 'Balança de casa'],
    )
    expect(id).not.toBe(balancaDaDona)

    const { rows } = await client.query(
      `select count(*)::int as total from user_devices where platform_device_identifier = $1`,
      ['ios-cb-uuid-da-dona'],
    )
    expect(rows[0].total).toBe(2)
  })

  it('aparelho removido volta ao ser revinculado, em vez de recusar', async () => {
    await client.query(`update user_devices set status = 'REMOVED' where id = $1`, [balancaDaDona])
    await asUser(client, AUTH_DONA, `select pair_user_device($1,$2) as id`, [
      'ios-cb-uuid-da-dona',
      'Balança da sala',
    ])
    const { rows } = await client.query(`select status from user_devices where id = $1`, [
      balancaDaDona,
    ])
    expect(rows[0].status).toBe('ACTIVE')
  })

  it('a academia não vê que alguém tem balança em casa', async () => {
    const linhas = await asUser(
      client,
      AUTH_PROFESSOR,
      `select id from user_devices where user_profile_id = $1`,
      [perfilDona],
    )
    expect(linhas).toHaveLength(0)
  })

  it('e a academia concorrente muito menos', async () => {
    const linhas = await asUser(client, AUTH_ESTRANHO, `select id from user_devices`, [])
    expect(linhas).toHaveLength(0)
  })

  it('aparelho sem identificador da plataforma não pareia', async () => {
    await expect(
      asUser(client, AUTH_DONA, `select pair_user_device($1,$2) as id`, ['   ', 'Sem identidade']),
    ).rejects.toThrow(/sem identificador/i)
  })
})

describe.skipIf(!temBanco)('a medida é da pessoa, não da matrícula', () => {
  it('cancelar a matrícula não apaga o histórico do corpo', async () => {
    /*
     * A razão de `body_measurements` apontar para `user_profiles` e não para
     * `students`: quem troca de academia leva o próprio histórico.
     */
    const [{ id }] = await pesar(AUTH_DONA, 'm-persistente', '2026-09-07T07:00:00Z', 70.8)

    await client.query(`delete from students where user_profile_id = $1`, [perfilDona])

    const { rows } = await client.query(
      `select user_profile_id from body_measurements where id = $1`,
      [id],
    )
    expect(rows[0].user_profile_id).toBe(perfilDona)
  })
})
