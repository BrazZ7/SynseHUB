import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A 0054 no banco.
 *
 * O que ela resolve: `/synse-admin` lia todas as organizações e, para cada
 * uma, disparava duas consultas — sendo que uma delas trazia **vinte mil
 * cobranças** para somar quatro números num laço da aplicação. Com cinquenta
 * academias são 151 consultas e um milhão de linhas para produzir dez números,
 * e o `limit: 20000` é um corte silencioso: a academia que passar dele aparece
 * com GMV menor do que faturou.
 *
 * O que ela **não** faz, e metade destes testes existe para provar: calcular
 * comissão. O split tem taxa fixa por academia, três estratégias e padrões
 * vindos de variável de ambiente; ele fica em `src/lib/payments/split.ts`, em
 * um lugar só. A função devolve bruto.
 *
 * E o teste que mais importa: a função é `security invoker`, então a equipe de
 * uma academia não soma a de outra nem passando o id dela.
 */

let client: Client
const temBanco = await databaseAvailable()

type Linha = {
  organization_id: string
  alunos_ativos: string
  recebido: string
  previsto: string
  atrasado_valor: string
  atrasado_qtd: string
}

const num = (v: string) => Number(v)

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 3)

  // Alpha ganha uma cobrança vencida, uma a vencer e um aluno inativo.
  const { rows: alunos } = await client.query(
    `select id from students where organization_id = $1 order by created_at, id`,
    [ALPHA.orgId],
  )
  await client.query(
    `insert into charges (organization_id, student_id, description, amount, due_date, status)
     values ($1,$2,'Atrasada',50,current_date - 10,'OVERDUE'),
            ($1,$2,'A vencer',30,current_date + 10,'PENDING'),
            ($1,$2,'Cancelada',999,current_date,'CANCELLED')`,
    [ALPHA.orgId, alunos[0].id],
  )
  await client.query(`update students set status = 'INACTIVE' where id = $1`, [alunos[2].id])
}, 120_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('resumo_das_academias', () => {
  it('soma o dinheiro de cada academia, uma linha por academia', async () => {
    const linhas = await asUser<Linha>(
      client,
      ALPHA.authId,
      `select * from resumo_das_academias(array[$1]::uuid[], 500)`,
      [ALPHA.orgId],
    )

    expect(linhas).toHaveLength(1)
    const alpha = linhas[0]
    // Três mensalidades pagas de 109,90 na semente.
    expect(num(alpha.recebido)).toBeCloseTo(329.7, 2)
    expect(num(alpha.previsto)).toBeCloseTo(30, 2)
    expect(num(alpha.atrasado_valor)).toBeCloseTo(50, 2)
    expect(num(alpha.atrasado_qtd)).toBe(1)
  })

  it('cancelada não entra em lugar nenhum', async () => {
    /*
     * A de 999 é CANCELLED. Se ela entrasse em qualquer das somas, o número
     * saltaria — e o painel da plataforma mostraria faturamento que não houve.
     */
    const [alpha] = await asUser<Linha>(
      client,
      ALPHA.authId,
      `select * from resumo_das_academias(array[$1]::uuid[], 500)`,
      [ALPHA.orgId],
    )
    const soma = num(alpha.recebido) + num(alpha.previsto) + num(alpha.atrasado_valor)
    expect(soma).toBeLessThan(999)
  })

  it('conta só o aluno ativo', async () => {
    // Três alunos, um virou INACTIVE: a plataforma conta base ativa.
    const [alpha] = await asUser<Linha>(
      client,
      ALPHA.authId,
      `select * from resumo_das_academias(array[$1]::uuid[], 500)`,
      [ALPHA.orgId],
    )
    expect(num(alpha.alunos_ativos)).toBe(2)
  })

  it('a academia vizinha não soma a minha — nem passando o id dela', async () => {
    /*
     * O teste que justifica `security invoker`. Alpha pede o resumo de Beta;
     * as políticas de `charges` e `students` filtram antes de a função somar,
     * então o que volta é a linha zerada — ou nenhuma linha, se nem a
     * organização for visível. O que não pode é vir dinheiro de Beta.
     */
    /*
     * O controle vem primeiro: sem ele, uma lista vazia faria o laço abaixo
     * passar por omissão, e o teste provaria que Beta não tem dinheiro em vez
     * de provar que Alpha não o enxerga.
     */
    const comoDono = await client.query<Linha>(
      `select * from resumo_das_academias(array[$1]::uuid[], 500)`,
      [BETA.orgId],
    )
    expect(num(comoDono.rows[0].recebido)).toBeGreaterThan(0)

    const linhas = await asUser<Linha>(
      client,
      ALPHA.authId,
      `select * from resumo_das_academias(array[$1]::uuid[], 500)`,
      [BETA.orgId],
    )

    for (const linha of linhas) {
      expect(num(linha.recebido)).toBe(0)
      expect(num(linha.alunos_ativos)).toBe(0)
    }
  })

  it('sem lista, devolve as que eu posso ver', async () => {
    const minhas = await asUser<Linha>(
      client,
      ALPHA.authId,
      `select * from resumo_das_academias(null, 500)`,
    )
    const comDinheiro = minhas.filter((l) => num(l.recebido) > 0)
    expect(comDinheiro.map((l) => l.organization_id)).toEqual([ALPHA.orgId])
  })

  it('o teto é escrito e respeitado', async () => {
    const uma = await asUser<Linha>(client, ALPHA.authId, `select * from resumo_das_academias(null, 1)`)
    expect(uma.length).toBeLessThanOrEqual(1)
  })

  it('academia sem cobrança nenhuma ainda devolve linha, zerada', async () => {
    const { rows: nova } = await client.query(
      `insert into organizations (name, slug) values ('Academia Zero','zero-${Date.now()}') returning id`,
    )
    const linhas = await client.query<Linha>(
      `select * from resumo_das_academias(array[$1]::uuid[], 500)`,
      [nova[0].id],
    )
    expect(linhas.rows).toHaveLength(1)
    expect(num(linhas.rows[0].recebido)).toBe(0)
    expect(num(linhas.rows[0].atrasado_qtd)).toBe(0)
  })

  it('não devolve comissão nenhuma — o split é da aplicação', async () => {
    /*
     * Se alguém acrescentar uma coluna de comissão aqui, a regra do dinheiro
     * passa a existir em dois lugares e as duas divergem no primeiro ajuste.
     * Este teste é o que impede isso de entrar sem conversa.
     */
    const { rows } = await client.query<{ column_name: string }>(
      `select unnest(proargnames) as column_name from pg_proc where proname = 'resumo_das_academias'`,
    )
    const colunas = rows.map((r) => r.column_name)
    for (const proibida of ['comissao', 'platform_fee', 'taxa', 'split', 'liquido']) {
      expect(colunas.join(' '), `a função passou a calcular ${proibida}`).not.toContain(proibida)
    }
  })
})

describe.skipIf(!temBanco)('academias_por_plano', () => {
  it('conta por plano, só as ativas', async () => {
    await client.query(`update organizations set status = 'ACTIVE', hub_plan = 'PRO' where id = $1`, [
      ALPHA.orgId,
    ])
    await client.query(
      `update organizations set status = 'SUSPENDED', hub_plan = 'PREMIUM' where id = $1`,
      [BETA.orgId],
    )

    const { rows } = await client.query<{ hub_plan: string; academias: string }>(
      `select * from academias_por_plano()`,
    )
    const porPlano = new Map(rows.map((r) => [r.hub_plan, Number(r.academias)]))

    expect(porPlano.get('PRO')).toBe(1)
    // Beta está suspensa: não entra no MRR.
    expect(porPlano.get('PREMIUM') ?? 0).toBe(0)
  })

  it('não devolve preço — o catálogo é comercial e mora na aplicação', async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select unnest(proargnames) as column_name from pg_proc where proname = 'academias_por_plano'`,
    )
    expect(rows.map((r) => r.column_name).join(' ')).not.toMatch(/preco|price|valor|mrr/)
  })
})
