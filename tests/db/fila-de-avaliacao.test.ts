import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * ── A fila de avaliação (0048) ──────────────────────────────────────────────
 *
 * `/avaliações` promete "uma linha por aluno ativo, da avaliação mais antiga
 * para a mais recente" — a fila de trabalho do professor. Ela era montada de
 * duas leituras que cortam em silêncio: `listStudents` para em 100, e
 * `listLatestAssessments` lê 500 avaliações e deduplica na aplicação.
 *
 * Numa academia com 478 ativos, a tela ordenava os 100 primeiros em ordem
 * alfabética e chamava aquilo de fila. Quem ficava de fora não aparecia **nem
 * nunca tendo sido avaliado** — exatamente quem a fila existe para achar.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * 1. **A ordem é sobre todos, não sobre a página.** É a asserção que impede o
 *    conserto de virar "paginar a lista alfabética", que é o defeito com
 *    outro nome.
 * 2. **A paginação não repete nem pula ninguém** — daí o desempate por nome.
 * 3. **Os números dos cartões contam a academia**, não a página.
 * 4. **Uma academia não enxerga a fila da outra**, e a recepção não lê dado de
 *    saúde (`assessments_professional`, 0046).
 */

let client: Client
const temBanco = await databaseAvailable()

/** Nomes fora de ordem alfabética de propósito: a fila não é o alfabeto. */
const ALUNOS: { nome: string; diasAtras: number | null }[] = [
  { nome: 'Zulmira Alves', diasAtras: null }, // nunca avaliada: encabeça
  { nome: 'Alice Souza', diasAtras: 10 }, // a mais recente: fica por último
  { nome: 'Mariana Lima', diasAtras: 200 }, // a mais antiga entre as avaliadas
  { nome: 'Bruno Dias', diasAtras: 90 },
  { nome: 'Carla Nunes', diasAtras: null }, // nunca avaliada também
]

const porId = new Map<string, string>()

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  for (const aluno of ALUNOS) {
    const { rows: perfil } = await client.query(
      `insert into user_profiles (name, email) values ($1,$2) returning id`,
      [aluno.nome, `${aluno.nome.replace(/\s/g, '.').toLowerCase()}@fila.test`],
    )
    const { rows: matricula } = await client.query(
      `insert into students (organization_id, user_profile_id, status)
       values ($1, $2, 'ACTIVE') returning id`,
      [ALPHA.orgId, perfil[0].id],
    )
    porId.set(aluno.nome, matricula[0].id)

    if (aluno.diasAtras !== null) {
      /*
       * Duas avaliações para quem foi avaliado: a função precisa pegar a mais
       * recente de cada um, e com uma só o `distinct on` passaria sem provar
       * nada.
       */
      await client.query(
        `insert into assessments (organization_id, student_id, assessed_at, weight, bmi)
         values ($1, $2, current_date - ($3::int + 60), 80, 25),
                ($1, $2, current_date - $3::int, 78, 24)`,
        [ALPHA.orgId, matricula[0].id, aluno.diasAtras],
      )
    }
  }
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const fila = (limite = 50, deslocamento = 0) =>
  asUser<{ student_name: string; dias_sem: number | null; total_geral: string }>(
    client,
    ALPHA.authId,
    `select * from fila_de_avaliacao($1, $2, $3)`,
    [ALPHA.orgId, limite, deslocamento],
  )

describe.skipIf(!temBanco)('a ordem da fila', () => {
  it('nunca avaliado encabeça, depois a avaliação mais antiga', async () => {
    const nomes = (await fila()).map((l) => l.student_name)

    /*
     * Três nunca avaliados — os dois do teste e o aluno da semente —, entre
     * si em ordem de nome. Depois, da avaliação mais antiga para a mais
     * recente. A ordem completa, e não só o começo: é ela que a tela promete.
     */
    expect(nomes).toEqual([
      'Aluno a1', // nunca avaliado
      'Carla Nunes', // nunca avaliada
      'Zulmira Alves', // nunca avaliada
      'Mariana Lima', // 200 dias
      'Bruno Dias', // 90
      'Alice Souza', // 10
    ])
  })

  it('pega a avaliação mais recente de cada um, não a primeira que achar', async () => {
    /*
     * Cada avaliado tem duas linhas, com 60 dias entre elas. Se o
     * `distinct on` pegasse a errada, Mariana apareceria com 260 dias.
     */
    const linhas = await fila()
    const mariana = linhas.find((l) => l.student_name === 'Mariana Lima')
    expect(mariana?.dias_sem).toBe(200)
  })

  it('a ordem é sobre todos, e não sobre a página', async () => {
    /*
     * A asserção central. Paginar a lista alfabética devolveria, na primeira
     * página de 2, "Alice Souza" e "Aluno a1" — o começo do alfabeto. A fila
     * devolve quem está há mais tempo sem avaliar.
     */
    const primeiraPagina = (await fila(2, 0)).map((l) => l.student_name)

    expect(primeiraPagina).toHaveLength(2)
    expect(primeiraPagina).not.toContain('Alice Souza')
    for (const nome of primeiraPagina) {
      const linha = (await fila()).find((l) => l.student_name === nome)
      expect(linha?.dias_sem).toBeNull()
    }
  })

  it('paginar não repete nem perde ninguém', async () => {
    const todos = (await fila()).map((l) => l.student_name)

    const pedaços: string[] = []
    for (let i = 0; i < todos.length; i += 2) {
      pedaços.push(...(await fila(2, i)).map((l) => l.student_name))
    }

    expect(pedaços).toEqual(todos)
    expect(new Set(pedaços).size).toBe(todos.length)
  })

  it('o total vem junto, e é o da academia inteira', async () => {
    const umaPagina = await fila(2, 0)
    const tudo = await fila()

    expect(Number(umaPagina[0].total_geral)).toBe(tudo.length)
  })
})

describe.skipIf(!temBanco)('os números dos cartões', () => {
  it('contam a academia, não a página', async () => {
    const [resumo] = await asUser<{ ativos: string; nunca_avaliados: string; vencidas: string }>(
      client,
      ALPHA.authId,
      `select * from resumo_das_avaliacoes($1, 90)`,
      [ALPHA.orgId],
    )

    const tudo = await fila()
    expect(Number(resumo.ativos)).toBe(tudo.length)
    // Zulmira, Carla e o aluno da semente.
    expect(Number(resumo.nunca_avaliados)).toBe(3)
    // Só Mariana passou de 90 dias; Bruno está em exatamente 90.
    expect(Number(resumo.vencidas)).toBe(1)
  })
})

describe.skipIf(!temBanco)('o isolamento', () => {
  it('a academia vizinha não aparece na fila', async () => {
    const nomes = (await fila()).map((l) => l.student_name)
    expect(nomes.some((n) => n.startsWith('Aluno b'))).toBe(false)
  })

  it('e pedir a fila da vizinha não devolve nada', async () => {
    /*
     * `security invoker`: quem filtra é a RLS de `students`, não um `where`
     * que alguém pode esquecer. Passar o id da outra academia não burla.
     */
    const alheia = await asUser(
      client,
      ALPHA.authId,
      `select * from fila_de_avaliacao($1, 50, 0)`,
      [BETA.orgId],
    )
    expect(alheia).toHaveLength(0)
  })

  it('o anônimo não executa a função', async () => {
    await expect(
      asUser(client, null, `select * from fila_de_avaliacao($1, 50, 0)`, [ALPHA.orgId]),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})
