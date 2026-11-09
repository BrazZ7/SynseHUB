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

describe.skipIf(!temBanco)('a entrega, uma vez por ocorrência (0071)', () => {
  /**
   * Por que isto existe, em uma frase: o agendador atrasa.
   *
   * A 0070 pedia que a janela casasse com a frequência de quem chama, e nenhum
   * agendador gratuito cumpre isso — o GitHub Actions aceita cinco minutos de
   * intervalo e sai com atraso. Janela igual ao intervalo perdia avisos; janela
   * maior mandava o mesmo aviso três vezes. A 0071 reivindica em vez de só ler,
   * e estes testes são a prova de que ela reivindica **uma vez**.
   */

  const vencendo = (minutos = 15, teto?: number) =>
    client
      .query(`select * from routine_reminders_due($1, coalesce($2, 500))`, [minutos, teto ?? null])
      .then((r) => r.rows as Array<{ block_id: string; kind: string; at_time: string }>)

  /** Um bloco marcado para `minutos` atrás, no relógio de São Paulo. */
  const blocoAtrasado = async (minutos: number) => {
    const { rows } = await client.query(
      `select ((now() at time zone 'America/Sao_Paulo') - make_interval(mins => $1))::time::text as t,
              extract(isodow from (now() at time zone 'America/Sao_Paulo')
                      - make_interval(mins => $1))::smallint as dia`,
      [minutos],
    )
    const { rows: novo } = await client.query(
      `insert into routine_blocks (user_profile_id, kind, at_time, days, remind)
       values ($1,'AGUA',$2,array[$3]::smallint[],true) returning id`,
      [perfilAna, rows[0].t, rows[0].dia],
    )
    return novo[0].id as string
  }

  const marcados = () =>
    client
      .query(`select count(*)::int as n from routine_blocks where last_reminded_at is not null`)
      .then((r) => r.rows[0].n as number)

  it('chamar duas vezes entrega uma vez', async () => {
    /*
     * O defeito que isto impede é o que a pessoa sente: "Hora de beber água"
     * três vezes entre 10h00 e 10h15, porque o agendador roda de cinco em
     * cinco minutos e a janela olha quinze para trás.
     */
    await blocoAtrasado(5)

    expect(await vencendo(15)).toHaveLength(1)
    expect(await vencendo(15)).toHaveLength(0)
    expect(await vencendo(15)).toHaveLength(0)
  })

  it('o que foi entregue fica marcado, e só ele', async () => {
    await blocoAtrasado(5)
    await blocoAtrasado(90) // fora da janela
    await vencendo(15)
    expect(await marcados()).toBe(1)
  })

  it('a ocorrência seguinte volta a disparar', async () => {
    /*
     * O contrário do teste acima, e a razão de a comparação ser com a
     * **ocorrência** e não com "há menos de N minutos": amanhã às 10h o mesmo
     * bloco tem de avisar de novo. Aqui o ontem é simulado puxando a marca um
     * dia para trás, que é o que o relógio faria sozinho.
     */
    await blocoAtrasado(5)
    expect(await vencendo(15)).toHaveLength(1)

    await client.query(
      `update routine_blocks set last_reminded_at = last_reminded_at - interval '1 day'`,
    )
    expect(await vencendo(15)).toHaveLength(1)
  })

  it('a janela não passa de 60 minutos, mesmo pedindo mais', async () => {
    /*
     * O limite não é arredondamento: é ele que garante que a ocorrência de
     * ontem e a de hoje — as duas candidatas — nunca caiam na mesma janela, e
     * portanto que um bloco não apareça duas vezes na mesma resposta.
     */
    await blocoAtrasado(90)
    expect(await vencendo(10_000)).toHaveLength(0)

    await client.query('delete from routine_blocks')
    await blocoAtrasado(50)
    expect(await vencendo(10_000)).toHaveLength(1)
  })

  it('o teto corta sem reivindicar o que não entregou', async () => {
    /*
     * ── O defeito que isto impede ─────────────────────────────────────────
     *
     * A rota tinha o teto em memória: pedia tudo e cortava em 500. Com
     * reivindicação isso vira perda silenciosa — a linha 501 sairia marcada
     * como avisada sem ninguém avisar, e aquele lembrete nunca mais voltaria.
     * O teto precisa estar na mesma instrução que marca.
     */
    const antigo = await blocoAtrasado(7)
    await blocoAtrasado(6)
    await blocoAtrasado(5)

    const primeira = await vencendo(15, 1)
    expect(primeira).toHaveLength(1)
    // O mais atrasado primeiro: é o que ainda tem chance de significar algo.
    expect(primeira[0].block_id).toBe(antigo)
    expect(await marcados()).toBe(1)

    // E os outros dois continuam devendo, na execução seguinte.
    expect(await vencendo(15, 10)).toHaveLength(2)
    expect(await marcados()).toBe(3)
  })

  it('o teto não é gasto por quem já foi avisado', async () => {
    /*
     * ── O que a mutação encontrou ─────────────────────────────────────────
     *
     * A condição de "já avisei esta ocorrência?" aparece duas vezes: no CTE
     * que escolhe e no `update` que marca. Tirar a do CTE não duplicava aviso
     * nenhum — a do `update` segurava —, e por isso a mutação sobreviveu à
     * primeira rodada. Mas ela muda outra coisa, e esta importa: sem o filtro
     * no CTE, o bloco já avisado **ocupa uma vaga do teto**, é descartado
     * depois pelo `update`, e o bloco que ainda devia aviso fica para a
     * execução seguinte. Numa janela cheia, o lembrete some sem explicação.
     */
    const velho = await blocoAtrasado(9)
    await vencendo(15) // o velho sai e fica marcado
    expect(await marcados()).toBe(1)

    const novo = await blocoAtrasado(4)
    const lista = await vencendo(15, 1)
    expect(lista).toHaveLength(1)
    expect(lista[0].block_id).toBe(novo)
    void velho
  })

  it('quem não tem academia tem fuso de São Paulo', async () => {
    /*
     * A rotina é da vida, não da matrícula: quem nunca se matriculou em
     * academia nenhuma tem plano igual, e o fuso dele vem do padrão. Sem este
     * caso, trocar o padrão por UTC passava em branco — todas as outras
     * pessoas do teste são alunas de uma academia que já é de São Paulo.
     */
    const { rows: perfil } = await client.query(
      `insert into user_profiles (name, email) values ('Sem academia', $1) returning id`,
      [`solta-${Date.now()}@plano.test`],
    )
    const { rows } = await client.query(
      `select ((now() at time zone 'America/Sao_Paulo') - interval '5 minutes')::time::text as t,
              extract(isodow from (now() at time zone 'America/Sao_Paulo'))::smallint as dia`,
    )
    await client.query(
      `insert into routine_blocks (user_profile_id, kind, at_time, days)
       values ($1,'SONO',$2,array[$3]::smallint[])`,
      [perfil[0].id, rows[0].t, rows[0].dia],
    )

    const lista = await client.query<{ fuso: string; kind: string }>(
      'select * from routine_reminders_due(15, 500)',
    )
    expect(lista.rows.map((l) => l.kind)).toEqual(['SONO'])
    expect(lista.rows[0].fuso).toBe('America/Sao_Paulo')
  })

  it('o bloco das 23h55 dispara depois da meia-noite', async () => {
    /*
     * ── O defeito que isto impede, e por que ele era invisível ────────────
     *
     * A 0070 comparava `agora::time >= at_time`. À 00h05, 00h05 não é maior
     * que 23h55 — então o bloco de sono às 23h55 só tinha janela até a
     * meia-noite. Com agendador atrasado, ele nunca saía, e nada registrava
     * isso: o aviso simplesmente não chegava.
     *
     * Este caso só acontece nos minutos seguintes à meia-noite local, e não há
     * como pôr o relógio do servidor ali. É por isso que a aritmética mora em
     * `routine_block_due_at`, que recebe o instante como argumento — assim o
     * caso vira uma linha de teste em vez de uma esperança.
     *
     * 2026-11-03 é terça (isodow 2) e 2026-11-04 é quarta (3).
     */
    const venceEm = (agora: string, at: string, dias: number[], minutos = 15) =>
      client
        .query(
          /*
           * Lido de volta no relógio de São Paulo, e não em UTC: o que o teste
           * afirma é "venceu às 23h55 de terça **para a pessoa**", e em UTC
           * isso aparece como 02h55 de quarta — verdadeiro e ilegível.
           */
          `select (routine_block_due_at($1::timestamptz, 'America/Sao_Paulo', $2::time,
                                        $3::smallint[], $4)
                   at time zone 'America/Sao_Paulo')::text as quando`,
          [agora, at, dias, minutos],
        )
        .then((r) => r.rows[0].quando as string | null)

    // Terça 23h55, visto à 00h05 de quarta: venceu dez minutos atrás.
    expect(await venceEm('2026-11-04 00:05:00-03', '23:55', [2])).toMatch(
      /^2026-11-03 23:55:00/,
    )

    // O mesmo horário, marcado só para quarta: a ocorrência de quarta ainda
    // não chegou, e a de terça não é dia dele.
    expect(await venceEm('2026-11-04 00:05:00-03', '23:55', [3])).toBeNull()

    /*
     * E domingo é 7, não 0. A conferência precisa de uma data fixa: numa
     * quinta-feira, `extract(dow ...)` e `extract(isodow ...)` concordam, e
     * trocar um pelo outro passaria em branco seis dias por semana.
     * 2026-11-01 é domingo; 2026-11-02, segunda.
     */
    expect(await venceEm('2026-11-02 00:05:00-03', '23:55', [7])).toMatch(
      /^2026-11-01 23:55:00/,
    )

    // O caso comum, no meio do dia, continua valendo.
    expect(await venceEm('2026-11-04 10:05:00-03', '10:00', [3])).toMatch(
      /^2026-11-04 10:00:00/,
    )
    // E o que venceu antes da janela, não.
    expect(await venceEm('2026-11-04 10:05:00-03', '09:00', [3])).toBeNull()
  })

  it('nem o ajudante da conta é alcançável por quem está logado', async () => {
    // Ele não revela nada — é aritmética sobre os argumentos —, mas função nova
    // nasce com `execute` para `public`, e foi assim que a 0061 vazou.
    await expect(
      asUser(
        client,
        AUTH_ANA,
        `select routine_block_due_at(now(),'America/Sao_Paulo','10:00','{1}',15)`,
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('o agendador que escreve continua fora do alcance de quem está logado', async () => {
    await expect(
      asUser(client, AUTH_ANA, 'select * from routine_reminders_due(15, 500)'),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser(client, ALPHA.authId, 'select * from routine_reminders_due(15, 500)'),
    ).rejects.toThrow(/permission denied/i)
  })

  it('o lembrete de uma pessoa não marca o da outra', async () => {
    /*
     * A reivindicação é por linha, e a linha tem dono. Um `update` sem o `id`
     * certo marcaria a rotina alheia como avisada e a calaria pelo resto do
     * dia — e isso não apareceria em teste nenhum dos de cima.
     */
    const { rows } = await client.query(
      `select ((now() at time zone 'America/Sao_Paulo') - interval '5 minutes')::time::text as t,
              extract(isodow from (now() at time zone 'America/Sao_Paulo'))::smallint as dia`,
    )
    await client.query(
      `insert into routine_blocks (user_profile_id, kind, at_time, days)
       values ($1,'AGUA',$2,array[$3]::smallint[]), ($4,'REFEICAO',$2,array[$3]::smallint[])`,
      [perfilAna, rows[0].t, rows[0].dia, perfilBia],
    )

    const lista = await vencendo(15)
    expect(lista).toHaveLength(2)
    const { rows: donos } = await client.query(
      `select count(distinct user_profile_id)::int as n from routine_blocks
        where last_reminded_at is not null`,
    )
    expect(donos[0].n).toBe(2)
  })

  it('duas execuções ao mesmo tempo entregam uma vez', async () => {
    /*
     * ── A corrida, e por que ela acontece de verdade ──────────────────────
     *
     * Agendador atrasado mais agendador no horário são duas execuções ao mesmo
     * tempo, e isso não é hipótese: é o comportamento documentado de quem
     * agenda de cinco em cinco minutos e às vezes sai com dez de atraso.
     *
     * ── O que este teste pegou ────────────────────────────────────────────
     *
     * A primeira versão da 0071 filtrava `last_reminded_at` apenas no CTE e
     * marcava com `where b.id = d.id`. Parecia atômico e não era: em
     * `read committed`, quando um `update` tropeça numa linha travada e a
     * outra transação confirma, o Postgres reavalia **o `where` do `update`**
     * contra a versão nova — e aquele `where` só perguntava pelo id. A
     * segunda execução mandava o aviso de novo.
     *
     * Aqui a primeira transação fica aberta de propósito, segurando a trava, e
     * a segunda espera nela. Sem a condição repetida no `update`, a segunda
     * leva a linha e este teste falha.
     */
    await blocoAtrasado(5)

    const outro = await connect()
    try {
      await client.query('begin')
      const primeira = await client.query('select * from routine_reminders_due(15, 500)')
      expect(primeira.rows).toHaveLength(1)

      // Disparada sem esperar: ela vai travar na linha até o `commit` abaixo.
      await outro.query('begin')
      const segunda = outro.query('select * from routine_reminders_due(15, 500)')

      /*
       * ── Esperar a trava, e não confiar na ordem das mensagens ──────────
       *
       * Sem isto o teste passava sem testar nada, e a mutação provou: se o
       * `commit` chega ao servidor antes da segunda consulta, ela abre o
       * instantâneo **depois** da marca e devolve vazio por motivo nenhum.
       * Aqui o teste só segue quando o servidor confirma que alguém está
       * esperando uma trava.
       */
      const travou = async () => {
        for (let tentativa = 0; tentativa < 200; tentativa += 1) {
          const { rows } = await client.query(
            `select count(*)::int as n from pg_stat_activity
              where wait_event_type = 'Lock' and query like '%routine_reminders_due%'`,
          )
          if (rows[0].n > 0) return true
          await new Promise((pronto) => setTimeout(pronto, 25))
        }
        return false
      }
      expect(await travou()).toBe(true)

      await client.query('commit')
      expect((await segunda).rows).toHaveLength(0)
      await outro.query('commit')
    } finally {
      await client.query('rollback').catch(() => {})
      await outro.end()
    }
  })
})
