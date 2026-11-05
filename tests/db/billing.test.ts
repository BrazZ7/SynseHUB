import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { applyMigrations, asUser, connect, databaseAvailable } from './helpers'

/**
 * Geração automática de mensalidade.
 *
 * O que se protege aqui é dinheiro cobrado de alguém. Três erros seriam caros e
 * silenciosos: cobrar duas vezes, cobrar quem saiu, e reajustar sem avisar
 * quem já estava matriculado.
 */

let client: Client
const temBanco = await databaseAvailable()

const DONA = '77777777-7777-7777-7777-777777777777'
const ORG = 'dddddddd-0000-0000-0000-000000000004'

let planoMensal: string
let planoTrimestral: string
let planoSemCobranca: string

async function criarAluno(nome: string, status = 'ACTIVE') {
  const perfil = await client.query(
    `insert into user_profiles (name, email) values ($1,$2) returning id`,
    [nome, `${nome.toLowerCase().replace(/\s/g, '')}@cob.test`],
  )
  const aluno = await client.query(
    `insert into students (organization_id, user_profile_id, status) values ($1,$2,$3) returning id`,
    [ORG, perfil.rows[0].id, status],
  )
  return aluno.rows[0].id as string
}

async function matricular(
  studentId: string,
  planId: string,
  price: number,
  billingDay: number,
  startedAt: string,
  extras: { endsAt?: string; status?: string } = {},
) {
  const { rows } = await client.query(
    `insert into memberships (organization_id, student_id, plan_id, price, billing_day, started_at, ends_at, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [
      ORG,
      studentId,
      planId,
      price,
      billingDay,
      startedAt,
      extras.endsAt ?? null,
      extras.status ?? 'ACTIVE',
    ],
  )
  return rows[0].id as string
}

const gerar = (referencia: string, janela = 5) =>
  client
    .query('select generate_due_charges($1::date, $2) as total', [referencia, janela])
    .then((r) => r.rows[0].total as number)

const cobrancas = (studentId: string) =>
  client
    .query(
      `select description, amount::float8 as amount, due_date, status, billing_reference
       from charges where student_id = $1 order by due_date`,
      [studentId],
    )
    .then((r) => r.rows)

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)

  await client.query(`insert into auth.users (id, email) values ($1,'dona@cob.test')`, [DONA])
  await client.query(
    `insert into organizations (id, name, slug) values ($1,'Academia Cobrança','cobranca')`,
    [ORG],
  )
  const dona = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Dona','dona@cob.test') returning id`,
    [DONA],
  )
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role) values ($1,$2,'OWNER')`,
    [ORG, dona.rows[0].id],
  )

  const mensal = await client.query(
    `insert into membership_plans (organization_id, name, price, billing_cycle, auto_charge)
     values ($1,'Mensal',150,'MONTHLY',true) returning id`,
    [ORG],
  )
  planoMensal = mensal.rows[0].id

  const trimestral = await client.query(
    `insert into membership_plans (organization_id, name, price, billing_cycle, auto_charge)
     values ($1,'Trimestral',400,'QUARTERLY',true) returning id`,
    [ORG],
  )
  planoTrimestral = trimestral.rows[0].id

  const manual = await client.query(
    `insert into membership_plans (organization_id, name, price, billing_cycle, auto_charge)
     values ($1,'Combinado por fora',99,'MONTHLY',false) returning id`,
    [ORG],
  )
  planoSemCobranca = manual.rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('geração de mensalidade', () => {
  it('cria a cobrança do mês com o valor combinado, não o do plano', async () => {
    const aluno = await criarAluno('Ana Mensal')
    // Entrou pagando 120 num plano que hoje custa 150: o reajuste da tela de
    // planos não pode alcançar quem já estava matriculado.
    await matricular(aluno, planoMensal, 120, 10, '2026-01-10')

    expect(await gerar('2026-05-06')).toBeGreaterThan(0)

    const lista = await cobrancas(aluno)
    expect(lista).toHaveLength(1)
    expect(lista[0].amount).toBe(120)
    expect(lista[0].due_date.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(lista[0].status).toBe('PENDING')
    expect(lista[0].description).toMatch(/Mensalidade de \w+ de 2026/)
  })

  it('rodar de novo no mesmo mês não cobra duas vezes', async () => {
    const aluno = await criarAluno('Bia Repetida')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')

    await gerar('2026-05-06')
    await gerar('2026-05-07')
    await gerar('2026-05-08')

    expect(await cobrancas(aluno)).toHaveLength(1)
  })

  it('fora da janela não gera nada', async () => {
    const aluno = await criarAluno('Caio Cedo')
    await matricular(aluno, planoMensal, 150, 28, '2026-01-05')

    // Vencimento dia 28, referência dia 1º, janela de 5 dias.
    await gerar('2026-05-01')
    expect(await cobrancas(aluno)).toHaveLength(0)

    await gerar('2026-05-24')
    expect(await cobrancas(aluno)).toHaveLength(1)
  })

  it('aluno encerrado ou suspenso não é cobrado', async () => {
    const encerrado = await criarAluno('Dora Saiu', 'CANCELLED')
    const suspenso = await criarAluno('Elo Pausa', 'INACTIVE')
    const pendente = await criarAluno('Fabio Espera', 'PENDING')

    for (const aluno of [encerrado, suspenso, pendente]) {
      await matricular(aluno, planoMensal, 150, 10, '2026-01-10')
    }

    await gerar('2026-05-06')

    expect(await cobrancas(encerrado)).toHaveLength(0)
    expect(await cobrancas(suspenso)).toHaveLength(0)
    expect(await cobrancas(pendente)).toHaveLength(0)
  })

  it('inadimplente continua sendo cobrado', async () => {
    // Parar de cobrar quem está devendo é a forma mais rápida de a dívida
    // congelar e ninguém mais saber quanto é.
    const aluno = await criarAluno('Gil Atrasado', 'OVERDUE')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')

    await gerar('2026-05-06')
    expect(await cobrancas(aluno)).toHaveLength(1)
  })

  it('plano sem cobrança automática fica de fora', async () => {
    const aluno = await criarAluno('Hugo Porfora')
    await matricular(aluno, planoSemCobranca, 99, 10, '2026-01-10')

    await gerar('2026-05-06')
    expect(await cobrancas(aluno)).toHaveLength(0)
  })

  it('matrícula encerrada por data não gera cobrança nova', async () => {
    const aluno = await criarAluno('Ivo Terminou')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10', { endsAt: '2026-03-31' })

    await gerar('2026-05-06')
    expect(await cobrancas(aluno)).toHaveLength(0)
  })

  it('trimestral cobra a cada três meses, contando da entrada', async () => {
    const aluno = await criarAluno('Julia Trimestre')
    await matricular(aluno, planoTrimestral, 400, 10, '2026-02-10')

    await gerar('2026-03-06')
    expect(await cobrancas(aluno)).toHaveLength(0)

    await gerar('2026-05-06') // fevereiro + 3
    expect(await cobrancas(aluno)).toHaveLength(1)

    await gerar('2026-06-06')
    expect(await cobrancas(aluno)).toHaveLength(1)

    await gerar('2026-08-06') // maio + 3
    expect(await cobrancas(aluno)).toHaveLength(2)
  })

  it('vencimento depois da entrada, no mesmo mês, é cobrado', async () => {
    const aluno = await criarAluno('Lia Nova')
    await matricular(aluno, planoMensal, 150, 25, '2026-06-20')

    await gerar('2026-06-21')
    const lista = await cobrancas(aluno)
    expect(lista).toHaveLength(1)
    expect(lista[0].due_date.toISOString().slice(0, 10)).toBe('2026-06-25')
  })

  it('vencimento anterior à entrada não é cobrado', async () => {
    /*
     * Entrou dia 20, vencimento dia 10: a primeira cobrança é a de julho.
     * Cobrar a de junho seria cobrar por um período em que a pessoa nem era
     * aluna — erro que a academia só descobre pela reclamação.
     */
    const aluno = await criarAluno('Nina Meio')
    await matricular(aluno, planoMensal, 150, 10, '2026-06-20')

    await gerar('2026-06-20')
    expect(await cobrancas(aluno)).toHaveLength(0)

    await gerar('2026-07-06')
    const lista = await cobrancas(aluno)
    expect(lista).toHaveLength(1)
    expect(lista[0].due_date.toISOString().slice(0, 10)).toBe('2026-07-10')
  })

  it('a cobrança gerada avisa o aluno', async () => {
    const aluno = await criarAluno('Marco Avisado')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')

    await gerar('2026-05-06')

    const { rows } = await client.query(
      `select n.title from notifications n
       join students s on s.user_profile_id = n.user_profile_id
       where s.id = $1 and n.category = 'PAYMENT'`,
      [aluno],
    )
    expect(rows.map((linha) => linha.title)).toContain('Nova cobrança de R$ 150,00')
  })

  it('janela absurda é recusada em vez de gerar o ano inteiro', async () => {
    await expect(gerar('2026-05-06', 400)).rejects.toThrow(/fora do razoável/)
  })
})

const vencer = (referencia: string) =>
  client
    .query('select mark_overdue_charges($1::date) as total', [referencia])
    .then((r) => r.rows[0].total as number)

const situacao = (studentId: string) =>
  client
    .query('select status from students where id = $1', [studentId])
    .then((r) => r.rows[0].status as string)

describe.skipIf(!temBanco)('cobrança vencida', () => {
  it('PENDING com vencimento passado vira OVERDUE, e o aluno também', async () => {
    /*
     * Antes desta função, `charge_status` tinha 'OVERDUE' desde a 0002 e nada
     * jamais escrevia esse valor: a lista de inadimplentes do painel estava
     * permanentemente vazia — não por falta de inadimplente, mas por falta de
     * quem marcasse.
     */
    const aluno = await criarAluno('Otto Devendo')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')
    await gerar('2026-05-06')

    expect(await vencer('2026-05-11')).toBeGreaterThan(0)

    const lista = await cobrancas(aluno)
    expect(lista[0].status).toBe('OVERDUE')
    expect(await situacao(aluno)).toBe('OVERDUE')
  })

  it('avisa uma vez, e não repete a cada dia do job', async () => {
    const aluno = await criarAluno('Paula Avisada')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')
    await gerar('2026-05-06')

    await vencer('2026-05-11')
    await vencer('2026-05-12')
    await vencer('2026-05-30')

    const { rows } = await client.query(
      `select count(*)::int as total from notifications n
       join students s on s.user_profile_id = n.user_profile_id
       where s.id = $1 and n.title = 'Cobrança em atraso'`,
      [aluno],
    )
    // Repetir o aviso todo dia é o caminho mais curto para a pessoa silenciar
    // as notificações do aplicativo.
    expect(rows[0].total).toBe(1)
  })

  it('não vence cobrança que ainda não venceu', async () => {
    const aluno = await criarAluno('Quim Emdia')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')
    await gerar('2026-05-06')

    await vencer('2026-05-09')
    expect((await cobrancas(aluno))[0].status).toBe('PENDING')
    expect(await situacao(aluno)).toBe('ACTIVE')
  })

  it('pagar devolve o aluno para ativo na hora, sem esperar o job', async () => {
    const aluno = await criarAluno('Rui Pagou')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')
    await gerar('2026-05-06')
    await vencer('2026-05-11')
    expect(await situacao(aluno)).toBe('OVERDUE')

    await client.query(
      `update charges set status = 'PAID', paid_at = now() where student_id = $1`,
      [aluno],
    )

    expect(await situacao(aluno)).toBe('ACTIVE')
  })

  it('pagar uma de duas dívidas não limpa a situação', async () => {
    const aluno = await criarAluno('Sara Duas')
    await matricular(aluno, planoMensal, 150, 10, '2026-01-10')
    await gerar('2026-05-06')
    await gerar('2026-06-06')
    await vencer('2026-06-11')

    const pendentes = await cobrancas(aluno)
    expect(pendentes).toHaveLength(2)

    await client.query(
      `update charges set status = 'PAID', paid_at = now() where id = $1`,
      [
        (
          await client.query(
            `select id from charges where student_id = $1 order by due_date limit 1`,
            [aluno],
          )
        ).rows[0].id,
      ],
    )

    expect(await situacao(aluno)).toBe('OVERDUE')
  })
})

describe.skipIf(!temBanco)('quem pode gerar cobrança', () => {
  it('nem o anônimo nem o autenticado geram', async () => {
    // Esta é a função pela qual dinheiro passa a ser devido por alguém.
    await expect(asUser(client, null, `select generate_due_charges()`)).rejects.toThrow()
    await expect(asUser(client, DONA, `select generate_due_charges()`)).rejects.toThrow()
    await expect(asUser(client, DONA, `select mark_overdue_charges()`)).rejects.toThrow()
  })
})
