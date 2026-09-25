import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O cadeado do Synse+ (0038).
 *
 * ── O defeito que estes testes prendem ───────────────────────────────────────
 *
 * A liberação de conteúdo `SYNSE_PLUS` conferia `consumer_subscriptions`, uma
 * tabela da 0002 em que **nada nunca escreveu**. A assinatura mora em
 * `user_profiles.plus_status` desde a 0036. O cadeado não estava frouxo:
 * estava trancado para todo mundo, e o sintoma teria sido o assinante em dia
 * reclamando que não vê o que pagou.
 *
 * ── Por que CANCELED tem teste próprio ──────────────────────────────────────
 *
 * Porque é o caso em que o errado parece certo. Quem cancela hoje pagou até o
 * fim do ciclo, e os Termos prometem o período em curso. Cortar na hora do
 * cancelamento seria o tipo de engano que ninguém percebe olhando o código —
 * "cancelou, não tem mais" soa razoável — e que o usuário percebe na hora.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ASSINANTE = 'dddddddd-1111-1111-1111-111111111111'
const AUTH_GRATIS = 'dddddddd-2222-2222-2222-222222222222'

let perfilAssinante: string

const DAQUI_A_30 = "now() + interval '30 days'"
const ONTEM = "now() - interval '1 day'"

/**
 * Põe a assinatura pela porta certa.
 *
 * A primeira versão deste arquivo fazia `update user_profiles set plus_status`
 * direto, e a 0036 recusou: "A assinatura da conta não é editável pelo
 * cliente." O gatilho `guard_paid_columns` fez o trabalho dele — e o teste
 * passa a usar `set_plus_subscription`, que é a única porta, exatamente como o
 * webhook de pagamento usará.
 */
async function assinaturaSql(status: string, expressao: string) {
  await client.query(`select set_plus_subscription($1, $2, ${expressao})`, [
    perfilAssinante,
    status,
  ])
}

const titulosPara = async (authId: string | null, tabela: string) =>
  (await asUser<{ title: string }>(client, authId, `select title from ${tabela} order by title`)).map(
    (r) => r.title,
  )

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 2`,
    [ALPHA.orgId],
  )
  perfilAssinante = rows[0].user_profile_id

  for (const [auth, perfil, email] of [
    [AUTH_ASSINANTE, rows[0].user_profile_id, 'assina@alpha.test'],
    [AUTH_GRATIS, rows[1].user_profile_id, 'gratis@alpha.test'],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [auth, perfil])
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role)
       values ($1,$2,'STUDENT') on conflict do nothing`,
      [ALPHA.orgId, perfil],
    )
  }

  // O acervo da plataforma: sem dono, um item aberto e um do Synse+.
  await client.query(
    `insert into content_library (organization_id, type, title, visibility, published_at)
     values (null,'EBOOK','E-book aberto','FREE', now()),
            (null,'EBOOK','E-book do Synse+','SYNSE_PLUS', now())`,
  )
  await client.query(
    `insert into recipes (title, category, visibility)
     values ('Receita aberta','CAFE','FREE'), ('Receita Synse+','CAFE','SYNSE_PLUS')`,
  )
  await client.query(
    `insert into programs (code, title, duration_days, visibility)
     values ('LIVRE','Programa aberto',21,'FREE'), ('SYNSE_30','Programa Synse+',30,'SYNSE_PLUS')`,
  )
  await client.query(
    `insert into program_steps (program_id, day_number, title)
     select id, 1, 'Dia 1 de ' || title from programs`,
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('quem tem Synse+ vigente enxerga o acervo', () => {
  it('em teste (TRIAL), sim — o primeiro mês é grátis e vale igual', async () => {
    await assinaturaSql('TRIAL', DAQUI_A_30)
    expect(await titulosPara(AUTH_ASSINANTE, 'content_library')).toContain('E-book do Synse+')
  })

  it('ativa (ACTIVE), sim', async () => {
    await assinaturaSql('ACTIVE', DAQUI_A_30)
    expect(await titulosPara(AUTH_ASSINANTE, 'content_library')).toContain('E-book do Synse+')
  })

  it('cancelada mas dentro do período pago, sim', async () => {
    /*
     * O caso em que o errado parece certo. Cancelar interrompe a renovação
     * seguinte, não o que já foi pago — e é o que os Termos prometem.
     */
    await assinaturaSql('CANCELED', DAQUI_A_30)
    expect(await titulosPara(AUTH_ASSINANTE, 'content_library')).toContain('E-book do Synse+')
  })
})

describe.skipIf(!temBanco)('quem não tem, não enxerga', () => {
  it('conta sem assinatura nenhuma', async () => {
    expect(await titulosPara(AUTH_GRATIS, 'content_library')).not.toContain('E-book do Synse+')
  })

  it('assinatura vencida ontem, ainda marcada como ativa', async () => {
    /*
     * A data manda, não o rótulo. O `tier` e o `plus_status` envelhecem: um
     * ciclo vencido continua ACTIVE até a rotina de expiração rodar, e o
     * acesso não pode esperar por uma rotina.
     */
    await assinaturaSql('ACTIVE', ONTEM)
    expect(await titulosPara(AUTH_ASSINANTE, 'content_library')).not.toContain('E-book do Synse+')
  })

  it('EXPIRED — e a data nem chega a ser gravada', async () => {
    /*
     * `set_plus_subscription` zera `plus_until` em NONE e EXPIRED, então o
     * estado sozinho já bastaria. A lista de estados em `tem_synse_plus` é
     * cinto e suspensório: se alguém um dia gravar a data por outro caminho,
     * EXPIRED continua fora.
     */
    await assinaturaSql('EXPIRED', DAQUI_A_30)

    const { rows } = await client.query(
      `select plus_until from user_profiles where id = $1`,
      [perfilAssinante],
    )
    expect(rows[0].plus_until).toBeNull()
    expect(await titulosPara(AUTH_ASSINANTE, 'content_library')).not.toContain('E-book do Synse+')
  })

  it('o visitante anônimo', async () => {
    expect(await titulosPara(null, 'content_library')).not.toContain('E-book do Synse+')
  })
})

describe.skipIf(!temBanco)('o que é aberto continua aberto', () => {
  it('o e-book FREE da plataforma chega a quem não assina', async () => {
    // O cadeado novo não pode ter fechado o que era para ficar aberto.
    expect(await titulosPara(AUTH_GRATIS, 'content_library')).toContain('E-book aberto')
  })

  it('e não explode para o anônimo', async () => {
    /*
     * `tem_synse_plus` é concedida ao anônimo de propósito: revogar
     * transformaria "nenhuma linha" em `permission denied for function`, que
     * foi a pegadinha encontrada na 0037 com `is_friendship_party`.
     */
    await expect(titulosPara(null, 'content_library')).resolves.toBeInstanceOf(Array)
  })
})

describe.skipIf(!temBanco)('receitas e programas guiados', () => {
  it('eram legíveis por qualquer um — a política era `using (true)`', async () => {
    await assinaturaSql('NONE', 'null')

    expect(await titulosPara(AUTH_GRATIS, 'recipes')).not.toContain('Receita Synse+')
    expect(await titulosPara(AUTH_GRATIS, 'programs')).not.toContain('Programa Synse+')
  })

  it('e o assinante lê as duas coisas', async () => {
    await assinaturaSql('ACTIVE', DAQUI_A_30)
    expect(await titulosPara(AUTH_ASSINANTE, 'recipes')).toContain('Receita Synse+')
    expect(await titulosPara(AUTH_ASSINANTE, 'programs')).toContain('Programa Synse+')
  })

  it('o passo do programa herda a tranca do programa', async () => {
    /*
     * É onde está o conteúdo de verdade — as tarefas do dia. Trancar o
     * programa e deixar os passos abertos protegeria a capa e entregaria o
     * miolo.
     */
    await assinaturaSql('NONE', 'null')

    const passos = await titulosPara(AUTH_GRATIS, 'program_steps')
    expect(passos).toContain('Dia 1 de Programa aberto')
    expect(passos).not.toContain('Dia 1 de Programa Synse+')
  })
})

describe.skipIf(!temBanco)('a tabela morta não manda mais', () => {
  it('uma linha em consumer_subscriptions não abre nada', async () => {
    /*
     * Era o cadeado antigo. Se alguém voltar a conferi-la por engano, este
     * teste cai: a assinatura mora em `user_profiles` desde a 0036, e ter as
     * duas fontes é como não ter nenhuma.
     */
    await assinaturaSql('NONE', 'null')
    await client.query(
      `insert into consumer_subscriptions (user_profile_id, price, status, current_period_end)
       values ($1, 29, 'ACTIVE', current_date + 30)`,
      [perfilAssinante],
    )

    expect(await titulosPara(AUTH_ASSINANTE, 'content_library')).not.toContain('E-book do Synse+')
  })
})
