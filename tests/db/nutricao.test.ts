import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Nutrição.
 *
 * Plano alimentar é dado de saúde, e o teste que mais importa aqui é o do
 * vazamento: a RLS da 0004 escapa de `meals` por uma dependência sutil — a
 * subconsulta do `using` é avaliada sob a RLS de `nutrition_plans`. Funciona, e
 * é frágil demais para depender de alguém reparar nisso mais tarde. Estes
 * testes fixam o comportamento.
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = '88888888-8888-8888-8888-888888888888'
let alunoAlpha: string
let nutriAlpha: string

const AUTH_NUTRI_A = '99999999-9999-9999-9999-999999999999'
const AUTH_NUTRI_B = 'aaaaaaaa-9999-9999-9999-999999999999'

async function nutricionista(org: string, authId: string, email: string) {
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  const { rows } = await client.query(
    `insert into user_profiles (auth_user_id, name, email) values ($1,'Nutri',$2) returning id`,
    [authId, email],
  )
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role)
     values ($1,$2,'NUTRITIONIST')`,
    [org, rows[0].id],
  )
  const staff = await client.query(
    `insert into staff (organization_id, user_profile_id, role) values ($1,$2,'NUTRITIONIST')
     returning id`,
    [org, rows[0].id],
  )
  return staff.rows[0].id as string
}

async function criarPlano(titulo: string, versao: number, status = 'DRAFT') {
  const { rows } = await client.query(
    `insert into nutrition_plans
       (organization_id, student_id, author_staff_id, title, version, status, target_calories)
     values ($1,$2,$3,$4,$5,$6,2200) returning id`,
    [ALPHA.orgId, alunoAlpha, nutriAlpha, titulo, versao, status],
  )
  const plano = rows[0].id as string

  const refeicao = await client.query(
    `insert into meals (nutrition_plan_id, name, position) values ($1,'Café da manhã',1)
     returning id`,
    [plano],
  )
  await client.query(
    `insert into meal_items (meal_id, description, quantity, calories, protein_g, carbs_g, fat_g, position)
     values ($1,'Ovos mexidos','3 unidades',220,19,2,15,1),
            ($1,'Aveia','40 g',150,5,27,3,2)`,
    [refeicao.rows[0].id],
  )
  return plano
}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  const { rows } = await client.query(
    `select id, user_profile_id from students where organization_id = $1 limit 1`,
    [ALPHA.orgId],
  )
  alunoAlpha = rows[0].id
  await client.query(`insert into auth.users (id, email) values ($1,'nut@alpha.test')`, [AUTH_ALUNO])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    rows[0].user_profile_id,
  ])

  nutriAlpha = await nutricionista(ALPHA.orgId, AUTH_NUTRI_A, 'na@alpha.test')
  // A Beta precisa de nutricionista para o teste de isolamento ter quem consultar.
  await nutricionista(BETA.orgId, AUTH_NUTRI_B, 'nb@beta.test')
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('somas do plano', () => {
  it('soma calorias e macros dos itens', async () => {
    const plano = await criarPlano('Plano base', 1)
    const { rows } = await client.query(
      `select calories::float8 as kcal, protein_g::float8 as prot,
              carbs_g::float8 as carb, fat_g::float8 as gord, itens
       from nutrition_plan_totals($1)`,
      [plano],
    )
    expect(rows[0]).toMatchObject({ kcal: 370, prot: 24, carb: 29, gord: 18, itens: 2 })
  })

  it('plano vazio soma zero, não nulo', async () => {
    // A tela mostra um número; nulo viraria "—" e o nutricionista não saberia
    // se é zero ou se a conta quebrou.
    const { rows: vazio } = await client.query(
      `insert into nutrition_plans (organization_id, student_id, author_staff_id, title, version)
       values ($1,$2,$3,'Vazio',90) returning id`,
      [ALPHA.orgId, alunoAlpha, nutriAlpha],
    )
    const { rows } = await client.query(
      `select calories::float8 as kcal, itens from nutrition_plan_totals($1)`,
      [vazio[0].id],
    )
    expect(rows[0]).toMatchObject({ kcal: 0, itens: 0 })
  })
})

describe.skipIf(!temBanco)('publicação', () => {
  it('publica e avisa o aluno', async () => {
    const plano = await criarPlano('Plano de outubro', 10)
    await asUser(client, AUTH_NUTRI_A, `select publish_nutrition_plan($1)`, [plano])

    const { rows } = await client.query(
      `select status, published_at from nutrition_plans where id = $1`,
      [plano],
    )
    expect(rows[0].status).toBe('PUBLISHED')
    expect(rows[0].published_at).not.toBeNull()

    const aviso = await client.query(
      `select count(*)::int as total from notifications n
       join students s on s.user_profile_id = n.user_profile_id
       where s.id = $1 and n.title like '%plano alimentar%'`,
      [alunoAlpha],
    )
    expect(aviso.rows[0].total).toBe(1)
  })

  it('publicar a nova arquiva a anterior: só um plano vale por vez', async () => {
    /*
     * Dois publicados é o aluno abrindo o app e seguindo o antigo. O índice
     * parcial garante; a função arquiva antes de esbarrar nele, para o erro não
     * chegar como falha de constraint.
     */
    const nova = await criarPlano('Plano de novembro', 11)
    await asUser(client, AUTH_NUTRI_A, `select publish_nutrition_plan($1)`, [nova])

    const { rows } = await client.query(
      `select count(*)::int as total from nutrition_plans
       where student_id = $1 and status = 'PUBLISHED'`,
      [alunoAlpha],
    )
    expect(rows[0].total).toBe(1)

    const anterior = await client.query(
      `select status from nutrition_plans where title = 'Plano de outubro'`,
    )
    expect(anterior.rows[0].status).toBe('ARCHIVED')
  })

  it('plano sem refeição não é publicado', async () => {
    const { rows } = await client.query(
      `insert into nutrition_plans (organization_id, student_id, author_staff_id, title, version)
       values ($1,$2,$3,'Só o título',20) returning id`,
      [ALPHA.orgId, alunoAlpha, nutriAlpha],
    )
    await expect(
      asUser(client, AUTH_NUTRI_A, `select publish_nutrition_plan($1)`, [rows[0].id]),
    ).rejects.toThrow(/sem refeições/i)
  })

  it('a nutricionista da outra academia não publica aqui', async () => {
    const plano = await criarPlano('Alheio', 30)
    await expect(
      asUser(client, AUTH_NUTRI_B, `select publish_nutrition_plan($1)`, [plano]),
    ).rejects.toThrow(/só o nutricionista responsável/i)
  })

  it('o próprio aluno não publica o plano dele', async () => {
    const plano = await criarPlano('Auto-publicado', 31)
    await expect(
      asUser(client, AUTH_ALUNO, `select publish_nutrition_plan($1)`, [plano]),
    ).rejects.toThrow(/só o nutricionista responsável/i)
  })

  it('publicar duas vezes não duplica aviso nem muda a data', async () => {
    const plano = await criarPlano('Idempotente', 40)
    await asUser(client, AUTH_NUTRI_A, `select publish_nutrition_plan($1)`, [plano])
    const primeira = await client.query(
      `select published_at from nutrition_plans where id = $1`,
      [plano],
    )
    await asUser(client, AUTH_NUTRI_A, `select publish_nutrition_plan($1)`, [plano])

    const depois = await client.query(`select published_at from nutrition_plans where id = $1`, [
      plano,
    ])
    expect(depois.rows[0].published_at).toEqual(primeira.rows[0].published_at)
  })
})

describe.skipIf(!temBanco)('nova versão', () => {
  it('copia refeições e itens, e nasce como rascunho', async () => {
    const { rows: atual } = await client.query(
      `select id from nutrition_plans where student_id = $1 and status = 'PUBLISHED'`,
      [alunoAlpha],
    )
    const nova = await asUser<{ id: string }>(
      client,
      AUTH_NUTRI_A,
      `select new_nutrition_plan_version($1) as id`,
      [atual[0].id],
    )

    const { rows } = await client.query(
      `select p.status, p.version,
              (select count(*)::int from meals where nutrition_plan_id = p.id) as refeicoes,
              (select calories::float8 from nutrition_plan_totals(p.id)) as kcal
       from nutrition_plans p where p.id = $1`,
      [nova[0].id],
    )
    expect(rows[0].status).toBe('DRAFT')
    expect(rows[0].refeicoes).toBe(1)
    expect(rows[0].kcal).toBe(370)
  })

  it('o plano publicado continua intacto: o aluno segue o que foi prescrito', async () => {
    /*
     * Reescrever o publicado mudaria debaixo do aluno o que ele está seguindo
     * hoje — e apagaria o registro do que foi prescrito antes, que num dado de
     * saúde é o que importa quando alguém pergunta o que ele comia em agosto.
     */
    const { rows } = await client.query(
      `select count(*)::int as total from nutrition_plans
       where student_id = $1 and status = 'PUBLISHED'`,
      [alunoAlpha],
    )
    expect(rows[0].total).toBe(1)
  })
})

describe.skipIf(!temBanco)('quem enxerga dado de saúde', () => {
  it('o aluno lê o plano publicado, e não o rascunho', async () => {
    // Rascunho é trabalho em andamento: plano meio escrito no app é pior que
    // nenhum.
    const meus = await asUser<{ status: string }>(
      client,
      AUTH_ALUNO,
      `select status from nutrition_plans`,
    )
    expect(meus.length).toBeGreaterThan(0)
    for (const linha of meus) expect(linha.status).toBe('PUBLISHED')
  })

  it('a academia vizinha não lê plano, refeição nem item', async () => {
    /*
     * O teste que fixa a dependência sutil: `meals_scoped` só confere que o
     * plano existe, e é a RLS de `nutrition_plans` avaliada dentro da
     * subconsulta que faz o escopo. Se alguém alargar a leitura de
     * `nutrition_plans` um dia, este teste cai antes de o vazamento chegar em
     * produção.
     */
    const daBeta = await asUser<{ planos: number; refeicoes: number; itens: number }>(
      client,
      AUTH_NUTRI_B,
      `select (select count(*) from nutrition_plans)::int as planos,
              (select count(*) from meals)::int as refeicoes,
              (select count(*) from meal_items)::int as itens`,
    )
    expect(daBeta[0]).toMatchObject({ planos: 0, refeicoes: 0, itens: 0 })
  })

  it('o aluno não enxerga a refeição de plano que não é dele', async () => {
    const perfil = await client.query(
      `insert into user_profiles (name, email) values ('Outro','o@alpha.test') returning id`,
    )
    const outro = await client.query(
      `insert into students (organization_id, user_profile_id) values ($1,$2) returning id`,
      [ALPHA.orgId, perfil.rows[0].id],
    )
    const plano = await client.query(
      `insert into nutrition_plans (organization_id, student_id, author_staff_id, title, status)
       values ($1,$2,$3,'Do outro','PUBLISHED') returning id`,
      [ALPHA.orgId, outro.rows[0].id, nutriAlpha],
    )
    await client.query(`insert into meals (nutrition_plan_id, name) values ($1,'Almoço alheio')`, [
      plano.rows[0].id,
    ])

    const vistas = await asUser<{ name: string }>(client, AUTH_ALUNO, `select name from meals`)
    expect(vistas.map((r) => r.name)).not.toContain('Almoço alheio')
  })

  it('o aluno não escreve no próprio plano', async () => {
    // Plano alimentar tem autor responsável — é o que a coluna `author_staff_id`
    // não-nula diz desde a 0003.
    const { rows } = await client.query(
      `select id from nutrition_plans where student_id = $1 and status = 'PUBLISHED'`,
      [alunoAlpha],
    )
    await expect(
      asUser(
        client,
        AUTH_ALUNO,
        `insert into meals (nutrition_plan_id, name) values ($1,'Sorvete')`,
        [rows[0].id],
      ),
    ).rejects.toThrow(/violates row-level security|permission denied/i)
  })
})
