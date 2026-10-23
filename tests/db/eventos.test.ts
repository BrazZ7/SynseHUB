import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A 0056 no banco — eventos com inscrição paga.
 *
 * O primeiro é a corrida de inauguração: R$ 79,90, aberta a quem não é aluno.
 * Três coisas precisam estar travadas aqui, e nenhuma delas aparece na tela
 * quando quebra:
 *
 * 1. **A vaga é contada sob trava.** Duas inscrições no mesmo instante não
 *    podem estourar o teto.
 * 2. **O anônimo se inscreve e não lê mais nada.** A tabela guarda CPF e
 *    telefone de terceiro; `select` para o anônimo seria publicar a lista.
 * 3. **A academia vizinha não enxerga.** Multi-inquilino é do banco.
 */

let client: Client
const temBanco = await databaseAvailable()

const ANON = null
const CORRIDA = { preco: '79.90' }

let evento: string
let cinco: string
let dez: string
let eventoDaBeta: string

type Inscricao = { confirmation_code: string; status: string }

async function inscrever(
  cpf: string,
  opcoes: { eventId?: string; categoria?: string | null; nome?: string; comoAnon?: boolean } = {},
) {
  const sql = `select * from inscrever_no_evento($1,$2,$3,$4,$5,$6,$7)`
  const args = [
    opcoes.eventId ?? evento,
    opcoes.nome ?? `Corredor ${cpf.slice(-3)}`,
    `c${cpf.slice(-3)}@corrida.test`,
    '11999990000',
    cpf,
    'v1',
    opcoes.categoria === undefined ? cinco : opcoes.categoria,
  ]
  return opcoes.comoAnon === false
    ? (await client.query<Inscricao>(sql, args)).rows
    : asUser<Inscricao>(client, ANON, sql, args)
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `insert into events (organization_id, slug, title, starts_at, price, capacity,
                         status, pix_key, pix_holder_name)
     values ($1,'corrida-inauguracao','Corrida de Inauguração', now() + interval '30 days',
             $2, 2, 'PUBLISHED', 'pix@synse.test', 'Synse')
     returning id`,
    [ALPHA.orgId, CORRIDA.preco],
  )
  evento = rows[0].id

  const cats = await client.query(
    `insert into event_categories (event_id, name, position)
     values ($1,'5 km',1), ($1,'10 km',2) returning id, name`,
    [evento],
  )
  cinco = cats.rows.find((c) => c.name === '5 km').id
  dez = cats.rows.find((c) => c.name === '10 km').id

  const daBeta = await client.query(
    `insert into events (organization_id, slug, title, starts_at, price, status)
     values ($1,'treino-beta','Treinão Beta', now() + interval '10 days', 0, 'PUBLISHED')
     returning id`,
    [BETA.orgId],
  )
  eventoDaBeta = daBeta.rows[0].id
}, 120_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('inscrever_no_evento', () => {
  it('quem não tem conta se inscreve, e sai aguardando pagamento', async () => {
    const [r] = await inscrever('11111111111')
    expect(r.status).toBe('PENDING_PAYMENT')
    expect(r.confirmation_code).toMatch(/^[0-9a-f]{16}$/)
  })

  it('o valor é congelado na inscrição, não lido do evento depois', async () => {
    /*
     * Mudar o preço do evento não pode mudar o que já foi cobrado de quem
     * entrou antes — e é exatamente o tipo de coisa que ninguém percebe até
     * alguém pagar o valor errado.
     */
    await client.query(`update events set price = 120 where id = $1`, [evento])
    const { rows } = await client.query<{ amount: string }>(
      `select amount from event_registrations where tax_id = '11111111111'`,
    )
    expect(Number(rows[0].amount)).toBeCloseTo(79.9, 2)
    await client.query(`update events set price = $2 where id = $1`, [evento, CORRIDA.preco])
  })

  it('o teto vale: o terceiro vai para a fila', async () => {
    await inscrever('22222222222')
    const [terceiro] = await inscrever('33333333333')
    expect(terceiro.status).toBe('WAITLIST')
  })

  it('duas inscrições ao mesmo tempo não estouram o teto', async () => {
    /*
     * ── Como este teste chega a ser uma corrida de verdade ───────────────
     *
     * Duas tentativas anteriores não eram. A primeira usava `Promise.all`
     * sobre o **mesmo** cliente, e o `node-pg` enfileira as consultas de uma
     * conexão: rodavam em sequência. A segunda abriu dois clientes, mas cada
     * chamada abria e fechava a própria transação em microssegundos — elas
     * quase nunca se sobrepunham. As duas passavam **com e sem** o
     * `for update`, isto é, não mediam nada.
     *
     * O que força a sobreposição é segurar a primeira transação **aberta**
     * enquanto a segunda tenta. Aí o comportamento se separa:
     *
     *   com `for update`  → a segunda espera a primeira soltar, vê a linha
     *                       dela e vai para a fila;
     *   sem `for update`  → a segunda conta sem enxergar a inserção não
     *                       confirmada da primeira, e as duas saem com vaga.
     *
     * É a diferença entre um evento com uma vaga e um evento com duas
     * pessoas achando que têm a mesma.
     */
    const { rows } = await client.query(
      `insert into events (organization_id, slug, title, starts_at, price, capacity, status)
       values ($1,'corrida-trava','Trava', now() + interval '20 days', 10, 1, 'PUBLISHED')
       returning id`,
      [ALPHA.orgId],
    )
    const apertado = rows[0].id

    const abrirComoAnon = async () => {
      const c = await connect()
      await c.query('begin')
      await c.query('set local role anon')
      return c
    }
    const inscreverNaTransacao = (c: Client, cpf: string) =>
      c.query<Inscricao>(`select * from inscrever_no_evento($1,$2,$3,$4,$5,$6)`, [
        apertado,
        `Corredor ${cpf.slice(-3)}`,
        `c${cpf.slice(-3)}@corrida.test`,
        '11999990000',
        cpf,
        'v1',
      ])

    const [um, dois] = await Promise.all([abrirComoAnon(), abrirComoAnon()])
    try {
      const primeira = await inscreverNaTransacao(um, '44444444444')
      expect(primeira.rows[0].status).toBe('PENDING_PAYMENT')

      // A segunda sai **sem** esperar: com a trava ela fica pendurada aqui.
      const segunda = inscreverNaTransacao(dois, '55555555555')
      await new Promise((resolve) => setTimeout(resolve, 300))

      await um.query('commit')
      const resultado = await segunda
      await dois.query('commit')

      expect(resultado.rows[0].status).toBe('WAITLIST')
    } finally {
      await Promise.all([um.end(), dois.end()])
    }

    // E o teto é o teto: uma vaga ocupada, uma na fila. Nunca duas ocupadas.
    const ocupadas = await client.query<{ n: number }>(
      `select count(*)::int as n from event_registrations
        where event_id = $1 and status in ('PENDING_PAYMENT','CONFIRMED')`,
      [apertado],
    )
    expect(ocupadas.rows[0].n).toBe(1)
  })

  it('o mesmo CPF não se inscreve duas vezes', async () => {
    await expect(inscrever('11111111111')).rejects.toThrow()
  })

  it('CPF inválido não entra', async () => {
    await expect(inscrever('123')).rejects.toThrow(/CPF/i)
  })

  it('sem aceitar a política, não grava', async () => {
    // Dado pessoal de quem não é aluno sem base registrada é dado sem base.
    await expect(
      asUser(client, ANON, `select * from inscrever_no_evento($1,$2,$3,$4,$5,$6)`, [
        evento,
        'Sem Aceite',
        'sem@corrida.test',
        '11999990000',
        '66666666666',
        '   ',
      ]),
    ).rejects.toThrow(/privacidade/i)
  })

  it('categoria de outro evento é recusada', async () => {
    await expect(
      inscrever('77777777777', { eventId: eventoDaBeta, categoria: cinco }),
    ).rejects.toThrow(/[Cc]ategoria/)
  })

  it('evento em rascunho não aceita inscrição', async () => {
    const { rows } = await client.query(
      `insert into events (organization_id, slug, title, starts_at, status)
       values ($1,'rascunho','Rascunho', now() + interval '5 days', 'DRAFT') returning id`,
      [ALPHA.orgId],
    )
    await expect(
      inscrever('88888888888', { eventId: rows[0].id, categoria: null }),
    ).rejects.toThrow(/não estão abertas/i)
  })

  it('fora da janela não aceita', async () => {
    const { rows } = await client.query(
      `insert into events (organization_id, slug, title, starts_at, status,
                           registration_closes_at)
       values ($1,'fechado','Fechado', now() + interval '5 days', 'PUBLISHED', now() - interval '1 day')
       returning id`,
      [ALPHA.orgId],
    )
    await expect(
      inscrever('99999999999', { eventId: rows[0].id, categoria: null }),
    ).rejects.toThrow(/encerraram/i)
  })

  it('evento gratuito já nasce confirmado', async () => {
    // Não há o que esperar: pedir pagamento de zero seria tela parada.
    const [r] = await inscrever('10101010101', { eventId: eventoDaBeta, categoria: null })
    expect(r.status).toBe('CONFIRMED')
  })
})

describe.skipIf(!temBanco)('quem enxerga a inscrição', () => {
  it('o anônimo não lê a tabela — nem uma linha', async () => {
    /*
     * O teste que mais importa desta migration. São CPF, telefone e contato
     * de emergência de gente que não é cliente. Controle primeiro: as linhas
     * existem quando lidas sem RLS.
     */
    const semRls = await client.query(`select count(*)::int as n from event_registrations`)
    expect(semRls.rows[0].n).toBeGreaterThan(0)

    const comoAnon = await asUser(client, ANON, `select * from event_registrations`)
    expect(comoAnon).toHaveLength(0)
  })

  it('o anônimo lê o evento publicado, e não o rascunho', async () => {
    const publicados = await asUser<{ status: string }>(
      client,
      ANON,
      `select status from events`,
    )
    expect(publicados.length).toBeGreaterThan(0)
    expect(publicados.every((e) => e.status === 'PUBLISHED')).toBe(true)
  })

  it('com o código, a pessoa consulta a própria — e só ela', async () => {
    const [r] = await inscrever('12121212121', { categoria: dez })

    const achada = await asUser<{ full_name: string; status: string; pix_key: string }>(
      client,
      ANON,
      `select full_name, status, pix_key from consultar_inscricao($1)`,
      [r.confirmation_code],
    )
    expect(achada).toHaveLength(1)
    expect(achada[0].pix_key).toBe('pix@synse.test')

    const chute = await asUser(client, ANON, `select * from consultar_inscricao($1)`, [
      '0000000000000000',
    ])
    expect(chute).toHaveLength(0)
  })

  it('a academia vizinha não vê as inscrições da corrida', async () => {
    const comoBeta = await asUser(
      client,
      BETA.authId,
      `select * from event_registrations where event_id = $1`,
      [evento],
    )
    expect(comoBeta).toHaveLength(0)
  })

  it('a inscrição não pode apontar para o evento de outra academia', async () => {
    /*
     * `organization_id` é repetida na inscrição para a RLS responder sem
     * join — e dado repetido que ninguém guarda é dado que diverge. O gatilho
     * a preenche a partir do evento; sem ele, a dona da Alpha gravaria uma
     * inscrição **dela** apontando para a corrida da Beta, e a linha passaria
     * pela política da Alpha enquanto pertence ao evento da vizinha.
     *
     * Com o gatilho, a organização vira a da Beta e o `with check` da própria
     * política recusa. É a tranca conferindo a si mesma.
     */
    await expect(
      asUser(
        client,
        ALPHA.authId,
        `insert into event_registrations
           (organization_id, event_id, full_name, email, phone, tax_id, amount, privacy_version)
         values ($1, $2, 'Invasor', 'i@x.test', '11999990000', '13131313131', 0, 'v1')`,
        [ALPHA.orgId, eventoDaBeta],
      ),
    ).rejects.toThrow()

    const vazou = await client.query<{ n: number }>(
      `select count(*)::int as n from event_registrations where tax_id = '13131313131'`,
    )
    expect(vazou.rows[0].n).toBe(0)
  })

  it('a dona da Alpha vê as da corrida dela', async () => {
    // O controle do teste acima: sem ele, "vazio" provaria que não há linha.
    const comoAlpha = await asUser(
      client,
      ALPHA.authId,
      `select * from event_registrations where event_id = $1`,
      [evento],
    )
    expect(comoAlpha.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!temBanco)('confirmar_inscricao', () => {
  it('a academia dá baixa, e fica registrado quem deu', async () => {
    const { rows } = await client.query<{ id: string }>(
      `select id from event_registrations where tax_id = '22222222222'`,
    )
    const [situacao] = await asUser<{ confirmar_inscricao: string }>(
      client,
      ALPHA.authId,
      `select confirmar_inscricao($1, 'PIX')`,
      [rows[0].id],
    )
    expect(situacao.confirmar_inscricao).toBe('CONFIRMED')

    const depois = await client.query<{ paid_at: string; confirmed_by_staff_id: string }>(
      `select paid_at, confirmed_by_staff_id from event_registrations where id = $1`,
      [rows[0].id],
    )
    expect(depois.rows[0].paid_at).not.toBeNull()
  })

  it('confirmar de novo não mexe na data do pagamento', async () => {
    const { rows } = await client.query<{ id: string; paid_at: string }>(
      `select id, paid_at from event_registrations where tax_id = '22222222222'`,
    )
    await asUser(client, ALPHA.authId, `select confirmar_inscricao($1)`, [rows[0].id])
    const depois = await client.query<{ paid_at: string }>(
      `select paid_at from event_registrations where id = $1`,
      [rows[0].id],
    )
    expect(depois.rows[0].paid_at).toEqual(rows[0].paid_at)
  })

  it('a academia vizinha não dá baixa na corrida alheia', async () => {
    const { rows } = await client.query<{ id: string }>(
      `select id from event_registrations where tax_id = '33333333333'`,
    )
    await expect(
      asUser(client, BETA.authId, `select confirmar_inscricao($1)`, [rows[0].id]),
    ).rejects.toThrow()
  })

  it('o anônimo não dá baixa em nada', async () => {
    const { rows } = await client.query<{ id: string }>(
      `select id from event_registrations where tax_id = '33333333333'`,
    )
    await expect(
      asUser(client, ANON, `select confirmar_inscricao($1)`, [rows[0].id]),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('a inscrição não vira cobrança', () => {
  it('nenhuma linha em `charges` nasce de uma inscrição', async () => {
    /*
     * Enquanto não há provedor de pagamento, nada no Synse move dinheiro.
     * Lançar inscrição em `charges` encheria o GMV e a receita da plataforma
     * com valor que ninguém processou — e `/synse-pay` passaria a mentir.
     *
     * Quando houver provedor, é o adapter que cria a cobrança lá e o webhook
     * que confirma aqui. Este teste é o que impede alguém de atalhar isso.
     */
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from charges where description ilike '%inscri%'`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('a função de inscrição não cita `charges`', () => {
    // O guarda estrutural: a asserção acima passa enquanto ninguém rodar o
    // caminho; esta falha no instante em que o `insert` aparecer.
    return client
      .query<{ d: string }>(
        `select pg_get_functiondef(oid) as d from pg_proc where proname = 'inscrever_no_evento'`,
      )
      .then(({ rows }) => {
        expect(rows[0].d).not.toContain('charges')
      })
  })
})
