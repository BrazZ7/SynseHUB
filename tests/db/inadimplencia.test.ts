import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ALPHA,
  BETA,
  applyMigrations,
  asUser,
  connect,
  databaseAvailable,
  seedTwoGyms,
} from './helpers'
import { CORTES_DAS_FAIXAS, FAIXAS, faixaDeDias } from '@/features/payments/faixas-de-atraso'

/**
 * ── O resumo de inadimplência (0051) ────────────────────────────────────────
 *
 * A tela de inadimplentes somava cinco números sobre uma leitura sem teto das
 * cobranças vencidas — e o PostgREST corta a resposta sem dar erro. Todos os
 * cinco vinham **menores** que a realidade, que é a direção que custa dinheiro.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * 1. **A régua das faixas é uma só.** Os cortes saem de
 *    `faixas-de-atraso.ts` e viram argumento da função; o teste confere, de
 *    dia em dia ao redor de cada corte, que o banco classifica igual ao
 *    `faixaDeDias` da aplicação. Mudar um lado sem o outro falha aqui.
 * 2. **O total não é a soma das faixas.** Aluno com duas cobranças em faixas
 *    diferentes conta duas vezes em "cobranças" e uma só em "alunos".
 * 3. **Sem nada, uma linha zerada** — e não resposta vazia.
 * 4. **Uma academia não soma a outra**, nem passando o id dela.
 */

let client: Client
const temBanco = await databaseAvailable()

/** Dias de atraso de cada cobrança semeada na Alpha. */
const ATRASOS = [0, 1, 5, 6, 15, 16, 30, 31, 90]

/** Um aluno com duas cobranças, em faixas diferentes de propósito. */
const DEVEDOR_DUPLO = [2, 40]

let alunoDuplo = ''

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  const { rows: alunos } = await client.query(
    `select id from students where organization_id = $1`,
    [ALPHA.orgId],
  )
  const semeado = alunos[0].id

  /*
   * Uma cobrança vencida por atraso, cada uma de um aluno diferente, com
   * valores distintos: valores iguais deixariam uma soma errada passar por
   * coincidência.
   */
  for (const [i, dias] of ATRASOS.entries()) {
    const { rows: perfil } = await client.query(
      `insert into user_profiles (name, email) values ($1,$2) returning id`,
      [`Devedor ${i}`, `d${i}@inadimplencia.test`],
    )
    const { rows: aluno } = await client.query(
      `insert into students (organization_id, user_profile_id) values ($1,$2) returning id`,
      [ALPHA.orgId, perfil[0].id],
    )
    await client.query(
      `insert into charges (organization_id, student_id, description, amount, due_date, status)
       values ($1,$2,'Mensalidade',$3, current_date - $4::int, 'OVERDUE')`,
      [ALPHA.orgId, aluno[0].id, 100 + i, dias],
    )
  }

  const { rows: perfilDuplo } = await client.query(
    `insert into user_profiles (name, email) values ('Devedor duplo','duplo@inadimplencia.test')
     returning id`,
  )
  const { rows: duplo } = await client.query(
    `insert into students (organization_id, user_profile_id) values ($1,$2) returning id`,
    [ALPHA.orgId, perfilDuplo[0].id],
  )
  alunoDuplo = duplo[0].id
  for (const dias of DEVEDOR_DUPLO) {
    await client.query(
      `insert into charges (organization_id, student_id, description, amount, due_date, status)
       values ($1,$2,'Mensalidade',50, current_date - $3::int, 'OVERDUE')`,
      [ALPHA.orgId, alunoDuplo, dias],
    )
  }

  /* Uma vencida na Beta, para o isolamento ter o que separar. */
  const { rows: beta } = await client.query(`select id from students where organization_id = $1`, [
    BETA.orgId,
  ])
  await client.query(
    `insert into charges (organization_id, student_id, description, amount, due_date, status)
     values ($1,$2,'Mensalidade',999, current_date - 10, 'OVERDUE')`,
    [BETA.orgId, beta[0].id],
  )

  /* E uma **paga** com atraso enorme: situação é o filtro, não a data. */
  await client.query(
    `insert into charges (organization_id, student_id, description, amount, due_date, status, paid_at)
     values ($1,$2,'Mensalidade',777, current_date - 400, 'PAID', now())`,
    [ALPHA.orgId, semeado],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

type Linha = {
  faixa: number
  cobrancas: string
  alunos: string
  valor: string
  dias_total: string
}

const resumo = (authId: string | null = ALPHA.authId, orgId = ALPHA.orgId) =>
  asUser<Linha>(
    client,
    authId,
    `select * from resumo_de_inadimplencia($1, current_date, $2::int[]) order by faixa`,
    [orgId, [...CORTES_DAS_FAIXAS]],
  )

describe.skipIf(!temBanco)('resumo_de_inadimplencia', () => {
  it('classifica cada dia na mesma faixa que a aplicação', async () => {
    const linhas = await resumo()
    const porFaixa = new Map(linhas.map((l) => [l.faixa, l]))

    /*
     * A conta de referência é feita aqui com `faixaDeDias`, a função que a
     * tela usa. Os dois lados partem da mesma lista de atrasos semeados, então
     * uma divergência de régua aparece como contagem diferente — não como um
     * número mágico escrito no teste.
     */
    const esperado = new Map<string, number>()
    for (const dias of [...ATRASOS, ...DEVEDOR_DUPLO]) {
      const faixa = faixaDeDias(dias)
      esperado.set(faixa, (esperado.get(faixa) ?? 0) + 1)
    }

    for (const [i, nome] of FAIXAS.entries()) {
      const doBanco = Number(porFaixa.get(i + 1)?.cobrancas ?? 0)
      expect(doBanco, `faixa ${nome}`).toBe(esperado.get(nome) ?? 0)
    }
  })

  it('põe os dias de corte exatamente onde a régua da aplicação põe', async () => {
    const linhas = await resumo()
    const porFaixa = new Map(linhas.map((l) => [l.faixa, l]))

    /*
     * A borda é onde régua duplicada quebra primeiro: 5 e 6 moram em faixas
     * diferentes, e um `<` no lugar de um `<=` move os dois sem quebrar
     * nenhuma contagem total.
     */
    for (const corte of CORTES_DAS_FAIXAS) {
      for (const dias of [corte, corte + 1]) {
        if (!ATRASOS.includes(dias)) continue
        const faixaEsperada = FAIXAS.indexOf(faixaDeDias(dias)) + 1
        const cobrancasNaFaixa = Number(porFaixa.get(faixaEsperada)?.cobrancas ?? 0)
        expect(cobrancasNaFaixa, `${dias} dias`).toBeGreaterThan(0)
      }
    }
  })

  it('conta vencimento futuro como zero dia, na primeira faixa', async () => {
    const antes = await resumo()
    const naPrimeira = (linhas: Linha[]) =>
      Number(linhas.find((l) => l.faixa === 1)?.cobrancas ?? 0)

    const { rows: perfil } = await client.query(
      `insert into user_profiles (name, email) values ('Adiantado','frente@inadimplencia.test')
       returning id`,
    )
    const { rows: aluno } = await client.query(
      `insert into students (organization_id, user_profile_id) values ($1,$2) returning id`,
      [ALPHA.orgId, perfil[0].id],
    )

    /*
     * A limpeza vai no `finally`: sem ela, uma falha aqui deixaria a cobrança
     * no banco e **os testes seguintes** falhariam por um a mais, apontando
     * para o lugar errado. Foi o que aconteceu na primeira versão deste
     * arquivo.
     */
    try {
      await client.query(
        `insert into charges (organization_id, student_id, description, amount, due_date, status)
         values ($1,$2,'Mensalidade',1, current_date + 3, 'OVERDUE')`,
        [ALPHA.orgId, aluno[0].id],
      )

      const depois = await resumo()

      /*
       * O número não é escrito à mão: é o de antes mais um. Escrever "4" aqui
       * obrigaria a mexer no teste a cada cobrança nova no cenário, e é o tipo
       * de ajuste que se faz no automático sem conferir o que mudou.
       */
      expect(naPrimeira(depois)).toBe(naPrimeira(antes) + 1)

      /*
       * E a soma dos dias **não** se mexe, que é onde o piso em zero importa
       * de verdade. Sem ele esta cobrança entraria com −3 e puxaria o atraso
       * médio da academia para baixo — e a contagem da faixa nem perceberia,
       * porque −3 continua sendo "no máximo 5 dias". Esta foi a mutação que
       * passou quando o teste olhava só a contagem.
       */
      const diasDe = (linhas: Linha[]) => Number(linhas.find((l) => l.faixa === 0)!.dias_total)
      expect(diasDe(depois)).toBe(diasDe(antes))
    } finally {
      await client.query(`delete from charges where student_id = $1`, [aluno[0].id])
    }
  })

  it('separa cobranças de alunos: o devedor duplo conta duas e uma', async () => {
    const linhas = await resumo()
    const total = linhas.find((l) => l.faixa === 0)!

    /* 9 atrasos de 9 alunos + 2 cobranças de 1 aluno = 11 cobranças, 10 alunos. */
    expect(Number(total.cobrancas)).toBe(ATRASOS.length + DEVEDOR_DUPLO.length)
    expect(Number(total.alunos)).toBe(ATRASOS.length + 1)
  })

  it('soma o valor e os dias de todas as vencidas, e só delas', async () => {
    const linhas = await resumo()
    const total = linhas.find((l) => l.faixa === 0)!

    const valorEsperado = ATRASOS.reduce((soma, _, i) => soma + 100 + i, 0) + 50 * 2
    const diasEsperados = [...ATRASOS, ...DEVEDOR_DUPLO].reduce((soma, d) => soma + d, 0)

    /* A paga de 400 dias e R$ 777 não entra em nenhum dos dois. */
    expect(Number(total.valor)).toBe(valorEsperado)
    expect(Number(total.dias_total)).toBe(diasEsperados)
  })

  it('devolve uma linha zerada quando não há nenhuma vencida', async () => {
    const linhas = await asUser<Linha>(
      client,
      BETA.authId,
      `select * from resumo_de_inadimplencia($1, current_date, $2::int[])`,
      [BETA.orgId, [...CORTES_DAS_FAIXAS]],
    )
    /* A Beta tem uma; apagá-la deixa o caso vazio sem mexer na Alpha. */
    await client.query(`delete from charges where organization_id = $1 and status = 'OVERDUE'`, [
      BETA.orgId,
    ])

    const vazio = await asUser<Linha>(
      client,
      BETA.authId,
      `select * from resumo_de_inadimplencia($1, current_date, $2::int[])`,
      [BETA.orgId, [...CORTES_DAS_FAIXAS]],
    )

    expect(linhas.length).toBeGreaterThan(1)
    expect(vazio).toHaveLength(1)
    expect(vazio[0]).toMatchObject({ faixa: 0, cobrancas: '0', alunos: '0' })
    expect(Number(vazio[0].valor)).toBe(0)
    expect(Number(vazio[0].dias_total)).toBe(0)
  })

  it('não deixa uma academia somar a inadimplência da outra', async () => {
    /* A dona da Beta pedindo o resumo da Alpha: a RLS zera tudo. */
    const deFora = await asUser<Linha>(
      client,
      BETA.authId,
      `select * from resumo_de_inadimplencia($1, current_date, $2::int[])`,
      [ALPHA.orgId, [...CORTES_DAS_FAIXAS]],
    )
    expect(deFora).toHaveLength(1)
    expect(Number(deFora[0].cobrancas)).toBe(0)
  })

  it('não existe para quem não entrou', async () => {
    /*
     * Aqui o `revoke` do `anon` vem antes da RLS: sem sessão a função nem
     * executa. É mais forte que devolver zero, e é o mesmo comportamento das
     * funções da 0050.
     */
    await expect(resumo(null)).rejects.toThrow(/permission denied|permissão/i)
  })
})
