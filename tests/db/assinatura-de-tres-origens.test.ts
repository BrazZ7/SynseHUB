import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A assinatura do Synse+ com três origens (0061).
 *
 * A 0036 tinha um escritor. Agora tem três — Mercado Pago na web, Apple e
 * Google dentro do app —, e os três escrevem na mesma linha de
 * `user_profiles`. O que estes testes protegem é a ordem de precedência entre
 * eles, porque cada falha aqui é dinheiro:
 *
 *   - notificação fora de ordem derrubando quem paga   → perde cliente
 *   - renovação velha reativando quem cancelou         → Synse+ de graça
 *   - compra recusada depois de a loja cobrar          → pagou e não recebeu
 *
 * O terceiro é o pior dos três e é o menos óbvio, porque parece correto negar
 * a segunda assinatura. Negar depois do débito não é rigor, é prejuízo de
 * quem comprou.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH = '88888888-8888-8888-8888-888888888888'
let perfil: string

const DIA = 86_400_000
const daquiA = (dias: number) => new Date(Date.now() + dias * DIA)
const haveraDias = (dias: number) => new Date(Date.now() - dias * DIA)

/** Chama a porta única como o servidor chama: por `service_role`. */
async function escrever(params: {
  status: string
  until?: Date | null
  provider?: string | null
  ref?: string | null
  eventAt?: Date | null
  takeover?: boolean
}): Promise<string> {
  const { rows } = await client.query(
    `select set_plus_subscription($1,$2,$3,$4,$5,$6,$7) as resultado`,
    [
      perfil,
      params.status,
      params.until ?? null,
      params.provider ?? null,
      params.ref ?? null,
      params.eventAt ?? null,
      params.takeover ?? false,
    ],
  )
  return rows[0].resultado
}

const leEstado = async () => {
  const { rows } = await client.query(
    `select tier, plus_status, plus_until, plus_provider, plus_provider_ref, plus_event_at
       from user_profiles where id = $1`,
    [perfil],
  )
  return rows[0]
}

const conflitos = async () => {
  const { rows } = await client.query(
    `select provider_atual, provider_novo, desfecho, status_pedido
       from plus_subscription_conflicts where profile_id = $1
      order by detectado_em`,
    [perfil],
  )
  return rows
}

/**
 * Volta a conta ao zero entre cenários, sem depender da ordem dos testes.
 *
 * Os três comandos vão num `query` só porque `set_config(..., true)` é local à
 * **transação**, e cada `client.query` é uma transação própria: separados, o
 * ajuste já não existia quando o `update` chegava, e a trava recusava tudo.
 */
async function zerar() {
  await client.query(`delete from plus_subscription_conflicts where profile_id = '${perfil}'`)
  await client.query(`
    select set_config('synse.allow_tier_change','1',true);
    update user_profiles
       set tier='FREE', plus_status='NONE', plus_until=null,
           plus_provider=null, plus_provider_ref=null, plus_event_at=null
     where id = '${perfil}';
    select set_config('synse.allow_tier_change','',true);
  `)
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
  await client.query(`insert into auth.users (id, email) values ($1,'tres@alpha.test')`, [AUTH])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [AUTH, perfil])
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('os nomes das origens', () => {
  it('aceita as três que existem', async () => {
    for (const origem of ['mercadopago', 'apple', 'google']) {
      await zerar()
      expect(await escrever({ status: 'ACTIVE', until: daquiA(30), provider: origem })).toBe(
        'APPLIED',
      )
      expect((await leEstado()).plus_provider).toBe(origem)
    }
  })

  it('recusa origem que a conciliação não conhece', async () => {
    await zerar()
    // Maiúsculas eram o que o comentário da 0036 previa, e não é o que o
    // código usa. Errar a caixa aqui produziria receita que ninguém acha.
    await expect(escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'APPLE' })).rejects.toThrow(
      /Provedor de assinatura desconhecido/,
    )
    await expect(
      escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'stripe' }),
    ).rejects.toThrow(/Provedor de assinatura desconhecido/)
  })

  it('e a coluna não aceita nome de fora nem por dentro', async () => {
    // A restrição da tabela, independente da função: defesa em profundidade,
    // porque um acerto à mão no SQL editor não passa pela função.
    await zerar()
    await expect(
      client.query(`
        select set_config('synse.allow_tier_change','1',true);
        update user_profiles set plus_provider = 'paypal' where id = '${perfil}';
      `),
    ).rejects.toThrow(/user_profiles_plus_provider_check/)
  })
})

describe.skipIf(!temBanco)('regra 1 — notificação fora de ordem não escreve', () => {
  it('a mais nova entra, a mais velha é descartada', async () => {
    await zerar()
    const agora = new Date()

    expect(
      await escrever({
        status: 'ACTIVE',
        until: daquiA(30),
        provider: 'apple',
        eventAt: agora,
      }),
    ).toBe('APPLIED')

    /*
     * O caso real: a Apple documenta que as notificações da App Store Server
     * podem chegar fora de ordem. Esta é a de um cancelamento de ontem,
     * chegando depois da renovação de hoje.
     */
    expect(
      await escrever({
        status: 'EXPIRED',
        provider: 'apple',
        eventAt: haveraDias(1),
      }),
    ).toBe('STALE')

    // Quem paga continua pagando e continua com acesso.
    expect(await leEstado()).toMatchObject({ tier: 'PRO', plus_status: 'ACTIVE' })
  })

  it('o mesmo horário também é descartado — reenvio não reaplica', async () => {
    await zerar()
    const quando = new Date()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'google', eventAt: quando })
    expect(await escrever({ status: 'EXPIRED', provider: 'google', eventAt: quando })).toBe('STALE')
  })

  it('sem horário na origem, a escrita passa — é o caso da 0036 e dos acertos à mão', async () => {
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple', eventAt: new Date() })
    expect(await escrever({ status: 'EXPIRED', provider: 'apple' })).toBe('APPLIED')
  })

  it('e uma escrita sem horário não apaga o horário guardado', async () => {
    /*
     * Se apagasse, a próxima notificação atrasada passaria: a regra 1 não tem
     * com o que comparar. `expire_plus_subscriptions` escreve sem horário, e
     * ela roda todo dia.
     */
    await zerar()
    const quando = new Date()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple', eventAt: quando })
    await escrever({ status: 'ACTIVE', until: daquiA(60), provider: 'apple' })

    const estado = await leEstado()
    expect(estado.plus_event_at).toEqual(quando)
    expect(await escrever({ status: 'EXPIRED', provider: 'apple', eventAt: haveraDias(1) })).toBe(
      'STALE',
    )
  })
})

describe.skipIf(!temBanco)('regra 2 — quem não é dono não mexe', () => {
  it('renovação velha de outro provedor não reativa quem cancelou na loja', async () => {
    await zerar()
    // A pessoa assinou pela App Store.
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple', ref: 'apple-1' })

    // E o Mercado Pago, de uma assinatura antiga, manda uma renovação.
    expect(
      await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago', ref: 'mp-9' }),
    ).toBe('CONFLICT')

    // Nada mudou: o dono continua sendo a Apple.
    expect(await leEstado()).toMatchObject({ plus_provider: 'apple', plus_provider_ref: 'apple-1' })
    expect(await conflitos()).toEqual([
      {
        provider_atual: 'apple',
        provider_novo: 'mercadopago',
        desfecho: 'RECUSADO',
        status_pedido: 'ACTIVE',
      },
    ])
  })

  it('tampouco derruba o acesso de quem paga', async () => {
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago' })
    expect(await escrever({ status: 'EXPIRED', provider: 'apple' })).toBe('CONFLICT')
    expect(await leEstado()).toMatchObject({ tier: 'PRO', plus_status: 'ACTIVE' })
  })

  it('o próprio dono escreve o que quiser', async () => {
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple' })
    expect(await escrever({ status: 'EXPIRED', provider: 'apple' })).toBe('APPLIED')
    expect(await leEstado()).toMatchObject({ tier: 'FREE', plus_status: 'EXPIRED' })
    expect(await conflitos()).toEqual([])
  })

  it('assinatura morta não tem dono: a vaga está livre', async () => {
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago' })
    await escrever({ status: 'EXPIRED', provider: 'mercadopago' })

    // Agora a pessoa assina pela loja. Não é conflito — não há o que conflitar.
    expect(await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple' })).toBe(
      'APPLIED',
    )
    expect(await conflitos()).toEqual([])
  })

  it('cancelado mas dentro do prazo ainda é dono', async () => {
    /*
     * CANCELED com prazo no futuro é acesso pago e vigente — os Termos
     * prometem o período em curso. Tratar como vaga livre deixaria outro
     * provedor assumir uma assinatura que ainda está valendo.
     */
    await zerar()
    await escrever({ status: 'CANCELED', until: daquiA(10), provider: 'apple' })
    expect(await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'google' })).toBe(
      'CONFLICT',
    )
    expect(await leEstado()).toMatchObject({ tier: 'PRO', plus_provider: 'apple' })
  })

  it('cancelado e fora do prazo, não', async () => {
    await zerar()
    await escrever({ status: 'CANCELED', until: haveraDias(1), provider: 'apple' })
    expect(await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'google' })).toBe(
      'APPLIED',
    )
  })
})

describe.skipIf(!temBanco)('regra 3 — compra nova é dona, e ganha', () => {
  it('a loja cobrou: o acesso segue a compra, e a duplicidade fica registrada', async () => {
    await zerar()
    // Assinou na web e esqueceu.
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago', ref: 'mp-1' })

    // Abriu o app e assinou de novo. A App Store já debitou.
    expect(
      await escrever({
        status: 'ACTIVE',
        until: daquiA(30),
        provider: 'apple',
        ref: 'apple-2',
        takeover: true,
      }),
    ).toBe('APPLIED')

    expect(await leEstado()).toMatchObject({
      tier: 'PRO',
      plus_provider: 'apple',
      plus_provider_ref: 'apple-2',
    })
    expect(await conflitos()).toEqual([
      {
        provider_atual: 'mercadopago',
        provider_novo: 'apple',
        desfecho: 'ASSUMIDO',
        status_pedido: 'ACTIVE',
      },
    ])
  })

  it('e depois de assumir, a origem antiga não volta a mandar', async () => {
    /*
     * O defeito que esta ordem de regras evita: se a regra 2 não valesse
     * depois da tomada, a renovação seguinte do Mercado Pago devolveria a
     * posse, a próxima da Apple tomaria de volta, e o estado ficaria piscando
     * entre as duas a cada ciclo.
     */
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago' })
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple', takeover: true })

    expect(await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago' })).toBe(
      'CONFLICT',
    )
    expect((await leEstado()).plus_provider).toBe('apple')
  })

  it('compra do próprio dono não é conflito', async () => {
    await zerar()
    await escrever({ status: 'TRIAL', until: daquiA(30), provider: 'apple' })
    expect(
      await escrever({ status: 'ACTIVE', until: daquiA(60), provider: 'apple', takeover: true }),
    ).toBe('APPLIED')
    expect(await conflitos()).toEqual([])
  })
})

describe.skipIf(!temBanco)('a trava, com a coluna nova', () => {
  it('o cliente não congela a própria assinatura pelo horário do evento', async () => {
    /*
     * A brecha mais discreta deste arquivo. `plus_event_at` no ano 2100 faria
     * **toda** notificação futura cair na regra 1 e ser descartada: a conta
     * congela no estado em que está, e se estiver em ACTIVE é Synse+ de graça
     * para sempre. A coluna nasce sob a trava por isso.
     */
    await zerar()
    await expect(
      asUser(client, AUTH, `update user_profiles set plus_event_at = $1 where id = $2`, [
        daquiA(36_500),
        perfil,
      ]),
    ).rejects.toThrow(/não é editável pelo cliente/)
  })

  it('e a trava continua cobrindo o que a 0036 cobria', async () => {
    // Controle: se a 0061 tivesse recriado a função esquecendo uma coluna, a
    // porta antiga reabriria sem erro nenhum no SQL.
    await zerar()
    for (const coluna of ['plus_status', 'plus_provider', 'plus_provider_ref']) {
      await expect(
        asUser(client, AUTH, `update user_profiles set ${coluna} = 'x' where id = $1`, [perfil]),
      ).rejects.toThrow(/não é editável pelo cliente/)
    }
    await expect(
      asUser(client, AUTH, `update user_profiles set tier = 'PRO' where id = $1`, [perfil]),
    ).rejects.toThrow(/não é editável pelo cliente/)
  })
})

describe.skipIf(!temBanco)('a tabela de conflitos', () => {
  it('tem RLS ligada, e isso é independente do `revoke`', async () => {
    /*
     * O teste abaixo — "não é legível pelo cliente" — passa com a RLS
     * desligada, porque quem recusa ali é o `revoke`. Descobri isso mutando a
     * migration: removi `enable row level security` e nada falhou.
     *
     * São duas trancas independentes, e esta é a que sobra no dia em que
     * alguém der `grant select` para montar a tela de conciliação. Então ela
     * tem de ser conferida direto no catálogo, não por consequência.
     */
    const { rows } = await client.query(
      `select relrowsecurity from pg_class where relname = 'plus_subscription_conflicts'`,
    )
    expect(rows[0]?.relrowsecurity, 'RLS desligada na tabela de conflitos').toBe(true)
  })

  it('e o cliente não tem privilégio de tabela nenhum', async () => {
    // A outra tranca, também no catálogo: `revoke` cobrindo os dois papéis.
    for (const papel of ['anon', 'authenticated']) {
      const { rows } = await client.query(
        `select count(*)::int as n from information_schema.role_table_grants
          where table_name = 'plus_subscription_conflicts' and grantee = $1`,
        [papel],
      )
      expect(rows[0].n, `${papel} ainda tem privilégio na tabela`).toBe(0)
    }
  })

  it('não é legível pelo cliente', async () => {
    /*
     * Cada linha diz que uma pessoa específica paga duas vezes. RLS ligada sem
     * policy nega tudo fora do `service_role` — e este teste é o que prova que
     * "ligada sem policy" é mesmo negar, e não esquecer.
     */
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago' })
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple', takeover: true })

    await expect(
      asUser(client, AUTH, `select * from plus_subscription_conflicts`),
    ).rejects.toThrow(/permission denied|row-level security/i)
  })

  it('e a fila de trabalho é o que ainda não foi resolvido', async () => {
    await zerar()
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'mercadopago' })
    await escrever({ status: 'ACTIVE', until: daquiA(30), provider: 'apple', takeover: true })

    const abertos = async () =>
      (
        await client.query(
          `select count(*)::int as n from plus_subscription_conflicts
            where profile_id = $1 and resolvido_em is null`,
          [perfil],
        )
      ).rows[0].n

    expect(await abertos()).toBe(1)
    await client.query(
      `update plus_subscription_conflicts
          set resolvido_em = now(), resolucao = 'assinatura do Mercado Pago cancelada'
        where profile_id = $1`,
      [perfil],
    )
    expect(await abertos()).toBe(0)
  })
})
