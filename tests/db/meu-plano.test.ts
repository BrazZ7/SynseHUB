import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Meu plano (0070).
 *
 * O que estes testes protegem, em ordem de importância:
 *
 *  1. **A academia não vê.** Horário de trabalho, hora de dormir e de comer
 *     são retrato da vida privada, e a política daqui não tem ramo para staff.
 *     Metade dos testes é sobre isso, e é de propósito.
 *  2. **O agendador não é alcançável por quem está logado.** A leitura que
 *     atravessa pessoas existe para a rotina do servidor, e só.
 *  3. **O dia da semana é o de cada um.** Às 23h50 de segunda em Brasília já é
 *     terça em UTC: um bloco de terça dispararia um dia antes.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ANA = '70000000-0000-0000-0000-00000000000a'
const AUTH_BIA = '70000000-0000-0000-0000-00000000000b'
let perfilAna: string
let perfilBia: string
let alunoAna: string

async function conta(studentId: string, authId: string, email: string) {
  const { rows } = await client.query(
    `select user_profile_id, organization_id from students where id = $1`,
    [studentId],
  )
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role)
     values ($1,$2,'STUDENT') on conflict do nothing`,
    [rows[0].organization_id, rows[0].user_profile_id],
  )
  return rows[0].user_profile_id as string
}

const bloco = (
  campos: {
    id?: string | null
    kind?: string
    at?: string
    title?: string | null
    days?: number[]
    remind?: boolean
  } = {},
  quem = AUTH_ANA,
) =>
  asUser<{ upsert_routine_block: string }>(
    client,
    quem,
    `select upsert_routine_block($1,$2,$3,$4,$5,$6) as upsert_routine_block`,
    [
      campos.id ?? null,
      campos.kind ?? 'AGUA',
      campos.at ?? '10:00',
      campos.title ?? null,
      campos.days ?? [1, 2, 3, 4, 5, 6, 7],
      campos.remind ?? true,
    ],
  ).then((r) => r[0].upsert_routine_block)

const meusBlocos = (quem = AUTH_ANA) =>
  asUser<{ id: string; kind: string; at_time: string; title: string | null; remind: boolean }>(
    client,
    quem,
    `select id, kind, at_time::text as at_time, title, remind from routine_blocks order by at_time`,
  )

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [ALPHA.orgId],
  )
  alunoAna = rows[0].id
  perfilAna = await conta(alunoAna, AUTH_ANA, 'ana@plano.test')
  perfilBia = await conta(rows[1].id, AUTH_BIA, 'bia@plano.test')
}, 60_000)

beforeEach(async () => {
  if (temBanco) await client.query('delete from routine_blocks; delete from routine_plans;')
})

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('a meta e as âncoras', () => {
  it('gravar de novo é corrigir, não duplicar', async () => {
    await asUser(client, AUTH_ANA, `select set_routine_plan($1,$2,$3)`, [
      'Emagrecer 6 kg até março',
      '06:00',
      '23:00',
    ])
    await asUser(client, AUTH_ANA, `select set_routine_plan($1,$2,$3)`, [
      'Emagrecer 6 kg até abril',
      '06:30',
      '23:00',
    ])

    const linhas = await asUser<{ goal: string; wake_at: string }>(
      client,
      AUTH_ANA,
      `select goal, wake_at::text as wake_at from routine_plans`,
    )
    expect(linhas).toHaveLength(1)
    expect(linhas[0].goal).toBe('Emagrecer 6 kg até abril')
    expect(linhas[0].wake_at).toBe('06:30:00')
  })

  it('meta vazia vira nulo, e não uma linha em branco', async () => {
    await asUser(client, AUTH_ANA, `select set_routine_plan($1,null,null)`, ['   '])
    const [linha] = await asUser<{ goal: string | null }>(
      client,
      AUTH_ANA,
      `select goal from routine_plans`,
    )
    expect(linha.goal).toBeNull()
  })

  it('meta de uma letra não passa', async () => {
    // O que não cabe numa frase não vira lembrete de nada; o que cabe em uma
    // letra não é meta.
    await expect(
      asUser(client, AUTH_ANA, `select set_routine_plan($1,null,null)`, ['x']),
    ).rejects.toThrow(/routine_plans_goal_check|violates check/i)
  })
})

describe.skipIf(!temBanco)('os blocos', () => {
  it('cria, edita e apaga', async () => {
    const id = await bloco({ kind: 'AGUA', at: '10:00', title: 'Beber água' })
    expect((await meusBlocos())[0].title).toBe('Beber água')

    await bloco({ id, kind: 'AGUA', at: '11:00', title: 'Beber água' })
    expect((await meusBlocos())[0].at_time).toBe('11:00:00')

    await asUser(client, AUTH_ANA, `select delete_routine_block($1)`, [id])
    expect(await meusBlocos()).toHaveLength(0)
  })

  it('tipo fora do vocabulário é recusado', async () => {
    // Sem `REMEDIO`: medicação é dado de saúde com regra própria, e não entra
    // por um campo que nasceu para "almoço".
    await expect(bloco({ kind: 'REMEDIO' })).rejects.toThrow(
      /routine_blocks_kind_check|violates check/i,
    )
  })

  it('dia da semana fora de 1..7 é recusado', async () => {
    await expect(bloco({ days: [0, 1] })).rejects.toThrow(/dias_validos|violates check/i)
    await expect(bloco({ days: [8] })).rejects.toThrow(/dias_validos|violates check/i)
    await expect(bloco({ days: [] })).rejects.toThrow(/dias_validos|violates check/i)
  })

  it('o plano tem teto de trinta blocos', async () => {
    for (let i = 0; i < 30; i += 1) {
      await bloco({ at: `${String(i % 24).padStart(2, '0')}:${i < 10 ? '00' : '30'}` })
    }
    await expect(bloco()).rejects.toThrow(/30 blocos/i)
  })

  it('editar não escapa do teto', async () => {
    // O teto é sobre criar; editar os que já existem continua valendo.
    const id = await bloco({ at: '07:00' })
    await expect(bloco({ id, at: '08:00' })).resolves.toBe(id)
  })
})

describe.skipIf(!temBanco)('a rotina é da pessoa, e de mais ninguém', () => {
  it('a dona da academia não lê o plano do aluno', async () => {
    /*
     * ── O teste central desta migration ───────────────────────────────────
     *
     * Horário de trabalho, hora de dormir e de comer não são dado de academia.
     * A política não tem ramo para staff, e se alguém acrescentar um, este
     * teste cai.
     */
    await asUser(client, AUTH_ANA, `select set_routine_plan($1,'06:00','23:00')`, [
      'Dormir 8 horas',
    ])
    await bloco({ kind: 'TRABALHO', at: '09:00', title: 'Expediente' })

    expect(await asUser(client, ALPHA.authId, 'select * from routine_plans')).toHaveLength(0)
    expect(await asUser(client, ALPHA.authId, 'select * from routine_blocks')).toHaveLength(0)
  })

  it('outro aluno da mesma academia também não', async () => {
    await bloco({ kind: 'SONO', at: '23:00' }, AUTH_ANA)
    expect(await meusBlocos(AUTH_BIA)).toHaveLength(0)
  })

  it('ninguém edita nem apaga o bloco de outra pessoa', async () => {
    const id = await bloco({}, AUTH_ANA)

    await expect(bloco({ id, at: '05:00' }, AUTH_BIA)).rejects.toThrow(/não é seu/i)
    await expect(
      asUser(client, AUTH_BIA, `select delete_routine_block($1)`, [id]),
    ).rejects.toThrow(/não é seu/i)

    // E o bloco continua como era.
    expect((await meusBlocos(AUTH_ANA))[0].at_time).toBe('10:00:00')
  })

  it('ninguém grava em nome de outra pessoa', async () => {
    await expect(
      asUser(
        client,
        AUTH_ANA,
        `insert into routine_blocks (user_profile_id, kind, at_time) values ($1,'AGUA','10:00')`,
        [perfilBia],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('anônimo não lê nem grava', async () => {
    /*
     * A leitura não estoura: ela devolve zero linha, porque quem barra é a
     * RLS e não a falta de privilégio — mesma postura do resto do projeto.
     * A escrita estoura, porque a função é revogada de `anon`.
     */
    expect(await asUser(client, null, 'select * from routine_blocks')).toHaveLength(0)
    expect(await asUser(client, null, 'select * from routine_plans')).toHaveLength(0)

    await expect(
      asUser(client, null, `select set_routine_plan('Uma meta qualquer','06:00','23:00')`),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser(client, null, `select upsert_routine_block(null,'AGUA','10:00',null,'{1}',true)`),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe.skipIf(!temBanco)('o que o agendador enxerga', () => {
  const vencendo = (minutos = 15) =>
    client
      .query(`select * from routine_reminders_due($1)`, [minutos])
      .then((r) => r.rows as Array<{ user_profile_id: string; kind: string; fuso: string }>)

  /** Um bloco marcado para `minutos` atrás, no relógio de São Paulo. */
  const blocoAtrasado = async (minutos: number, extras: { remind?: boolean } = {}) => {
    const { rows } = await client.query(
      `select ((now() at time zone 'America/Sao_Paulo') - make_interval(mins => $1))::time::text as t,
              extract(isodow from (now() at time zone 'America/Sao_Paulo')
                      - make_interval(mins => $1))::smallint as dia`,
      [minutos],
    )
    await client.query(
      `insert into routine_blocks (user_profile_id, kind, at_time, days, remind)
       values ($1,'AGUA',$2,array[$3]::smallint[],$4)`,
      [perfilAna, rows[0].t, rows[0].dia, extras.remind ?? true],
    )
  }

  it('o que venceu na janela aparece; o que venceu antes, não', async () => {
    await blocoAtrasado(5)
    expect(await vencendo(15)).toHaveLength(1)

    await client.query('delete from routine_blocks')
    await blocoAtrasado(40)
    expect(await vencendo(15)).toHaveLength(0)
  })

  it('bloco sem lembrete nunca aparece', async () => {
    // `remind` é o pedido da pessoa. Sem ele, o bloco existe na tela e não
    // vira aviso no celular de ninguém.
    await blocoAtrasado(5, { remind: false })
    expect(await vencendo(15)).toHaveLength(0)
  })

  it('o dia da semana é o de cada um, no fuso dela', async () => {
    /*
     * ── O defeito que isto impede ─────────────────────────────────────────
     *
     * Às 23h50 de segunda em Brasília já é terça em UTC. Com o dia calculado
     * em UTC, um bloco de terça dispararia na noite de segunda — e um de
     * segunda deixaria de disparar.
     */
    const { rows } = await client.query(
      `select ((now() at time zone 'America/Sao_Paulo') - interval '5 minutes')::time::text as t,
              extract(isodow from (now() at time zone 'America/Sao_Paulo'))::smallint as hoje,
              extract(isodow from (now() at time zone 'America/Sao_Paulo') + interval '1 day')::smallint as amanha`,
    )
    // Marcado só para amanhã: não pode aparecer hoje.
    await client.query(
      `insert into routine_blocks (user_profile_id, kind, at_time, days)
       values ($1,'AGUA',$2,array[$3]::smallint[])`,
      [perfilAna, rows[0].t, rows[0].amanha],
    )
    expect(await vencendo(15)).toHaveLength(0)

    // E marcado para hoje, aparece.
    await client.query(
      `insert into routine_blocks (user_profile_id, kind, at_time, days)
       values ($1,'REFEICAO',$2,array[$3]::smallint[])`,
      [perfilAna, rows[0].t, rows[0].hoje],
    )
    const lista = await vencendo(15)
    expect(lista.map((l) => l.kind)).toEqual(['REFEICAO'])
    expect(lista[0].fuso).toBe('America/Sao_Paulo')
  })

  it('o dia errado não dispara, num fuso que discorda de UTC agora', async () => {
    /*
     * ── Por que um fuso exótico, e não o de Brasília ──────────────────────
     *
     * O teste acima só pega o defeito **à noite**: das 21h à meia-noite em
     * Brasília, UTC já está no dia seguinte. De dia os dois concordam, e uma
     * mutação que trocasse o fuso da pessoa por UTC passaria despercebida —
     * foi o que aconteceu na primeira rodada de mutação.
     *
     * Aqui o fuso é escolhido pela hora UTC do momento, de forma que o dia
     * local e o dia UTC **sempre** discordem:
     *
     *   * Kiritimati é UTC+14: o dia local vira antes, a partir das 10h UTC;
     *   * Niue é UTC−11: o dia local ainda é o anterior, até as 11h UTC.
     *
     * Os dois intervalos cobrem as 24 horas.
     */
    const { rows: escolha } = await client.query(
      `select case when extract(hour from now() at time zone 'UTC') >= 10
                   then 'Pacific/Kiritimati' else 'Pacific/Niue' end as tz`,
    )
    const tz = escolha[0].tz as string

    const { rows: antes } = await client.query(
      `select timezone from organizations where id = $1`,
      [ALPHA.orgId],
    )
    await client.query(`update organizations set timezone = $1 where id = $2`, [tz, ALPHA.orgId])

    try {
      const { rows } = await client.query(
        `select ((now() at time zone $1) - interval '5 minutes')::time::text as t,
                extract(isodow from (now() at time zone $1))::smallint as dia_local,
                extract(isodow from now() at time zone 'UTC')::smallint as dia_utc`,
        [tz],
      )
      // A premissa do teste, conferida em vez de suposta.
      expect(rows[0].dia_local).not.toBe(rows[0].dia_utc)

      await client.query(
        `insert into routine_blocks (user_profile_id, kind, at_time, days)
         values ($1,'TRABALHO',$2,array[$3]::smallint[])`,
        [perfilAna, rows[0].t, rows[0].dia_utc],
      )
      expect(await vencendo(15)).toHaveLength(0)

      await client.query(
        `insert into routine_blocks (user_profile_id, kind, at_time, days)
         values ($1,'PAUSA',$2,array[$3]::smallint[])`,
        [perfilAna, rows[0].t, rows[0].dia_local],
      )
      const lista = await vencendo(15)
      expect(lista.map((l) => l.kind)).toEqual(['PAUSA'])
      expect(lista[0].fuso).toBe(tz)
    } finally {
      await client.query(`update organizations set timezone = $1 where id = $2`, [
        antes[0].timezone,
        ALPHA.orgId,
      ])
    }
  })

  it('quem está logado não alcança a leitura do agendador', async () => {
    /*
     * É a única leitura do projeto que atravessa pessoas. Ela existe para a
     * rotina do servidor, e nenhum caminho da API autenticada leva aqui — nem
     * para ler a própria rotina, que tem leitura própria pela tabela.
     */
    await expect(
      asUser(client, AUTH_ANA, 'select * from routine_reminders_due(15)'),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser(client, ALPHA.authId, 'select * from routine_reminders_due(15)'),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser(client, null, 'select * from routine_reminders_due(15)'),
    ).rejects.toThrow(/permission denied/i)
  })
})
