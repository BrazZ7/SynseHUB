import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A biblioteca de receitas (0044).
 *
 * `recipes` nasceu na 0003 e foi a última tabela daquela leva a continuar sem
 * uma leitura de aplicação. A RLS dela existe desde a 0004 e a visibilidade
 * foi corrigida na 0038 — o que faltava era a porta de autoria e a vitrine.
 *
 * O que estes testes protegem, em ordem de gravidade:
 *
 * 1. **O conteúdo pago não vaza.** Ingredientes e preparo são a receita; a
 *    vitrine anuncia e não entrega.
 * 2. **Só a conta de plataforma publica**, e a trilha registra.
 * 3. **Nada disto depende de academia** — `recipes` não tem dono, e uma
 *    receita marcada como de organização ficaria invisível para todos.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ASSINA = 'cccc1111-1111-1111-1111-111111111111'
const AUTH_GRATIS = 'cccc2222-2222-2222-2222-222222222222'

let perfilAssina: string
let plusId: string
let freeId: string

const INGREDIENTES = ['3 ovos', '1 xícara de aveia']
const PREPARO = 'Misture tudo.\n\nLeve ao fogo por 5 minutos.'

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 2`,
    [ALPHA.orgId],
  )
  perfilAssina = rows[0].user_profile_id

  for (const [auth, perfil, email] of [
    [AUTH_ASSINA, rows[0].user_profile_id, 'assina@rec.test'],
    [AUTH_GRATIS, rows[1].user_profile_id, 'gratis@rec.test'],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    await client.query(`update user_profiles set auth_user_id = $1, email = $2 where id = $3`, [
      auth,
      email,
      perfil,
    ])
  }

  const plus = await client.query(
    `insert into recipes (title, category, ingredients, instructions, visibility,
                          prep_minutes, servings, image_url, nutrition_facts)
     values ('Salmão do Synse+', 'JANTAR', $1, $2, 'SYNSE_PLUS', 30, 2, 'https://x/y.jpg',
             '{"kcal": 460}'::jsonb)
     returning id`,
    [INGREDIENTES, PREPARO],
  )
  plusId = plus.rows[0].id

  const free = await client.query(
    `insert into recipes (title, category, ingredients, instructions, visibility)
     values ('Ovos abertos', 'CAFE', $1, $2, 'FREE') returning id`,
    [INGREDIENTES, PREPARO],
  )
  freeId = free.rows[0].id
}, 60_000)

afterAll(async () => {
  await client?.end()
})

async function darPlus(estado: string, ate: string) {
  await client.query(`select set_plus_subscription($1, $2, ${ate})`, [perfilAssina, estado])
}

const titulos = async (authId: string | null) =>
  (await asUser<{ title: string }>(client, authId, `select title from recipes order by title`)).map(
    (r) => r.title,
  )

describe.skipIf(!temBanco)('o cadeado das receitas', () => {
  it('quem não assina lê a receita aberta', async () => {
    expect(await titulos(AUTH_GRATIS)).toEqual(['Ovos abertos'])
  })

  it('e não lê a do Synse+', async () => {
    expect(await titulos(AUTH_GRATIS)).not.toContain('Salmão do Synse+')
  })

  it('quem assina lê as duas', async () => {
    await darPlus('ACTIVE', 'current_date + 30')
    expect(await titulos(AUTH_ASSINA)).toEqual(['Ovos abertos', 'Salmão do Synse+'])
  })

  it('o anônimo lê só a aberta', async () => {
    expect(await titulos(null)).toEqual(['Ovos abertos'])
  })

  it('assinatura vencida volta a trancar', async () => {
    await darPlus('ACTIVE', 'current_date - 1')
    expect(await titulos(AUTH_ASSINA)).toEqual(['Ovos abertos'])
    await darPlus('ACTIVE', 'current_date + 30')
  })
})

describe.skipIf(!temBanco)('a vitrine das receitas', () => {
  it('quem não assina vê o anúncio, com prato e tempo', async () => {
    // Sem isto a tela de receitas abriria em branco para o plano grátis — a
    // mesma prateleira vazia que a 0041 corrigiu no acervo.
    const r = await asUser<{
      id: string
      titulo: string
      categoria: string
      minutos: number
      porcoes: number
      imagem: string
    }>(client, AUTH_GRATIS, `select * from receitas_trancadas()`)

    expect(r).toHaveLength(1)
    expect(r[0].id).toBe(plusId)
    expect(r[0].titulo).toBe('Salmão do Synse+')
    expect(r[0].categoria).toBe('JANTAR')
    expect(r[0].minutos).toBe(30)
    expect(r[0].porcoes).toBe(2)
    expect(r[0].imagem).toBe('https://x/y.jpg')
  })

  it('e a vitrine não entrega a receita', async () => {
    /*
     * O teste que importa. A projeção da função é a única coisa entre o
     * anúncio e o conteúdo: uma coluna a mais aqui e o Synse+ passa a ser
     * legível de graça pela própria vitrine que deveria vendê-lo.
     */
    /*
     * A assinatura da função, e não `information_schema.columns`.
     *
     * A primeira versão deste teste perguntava as colunas de
     * `receitas_trancadas` ao `information_schema`, que só conhece tabelas e
     * visões: a consulta devolvia **zero linhas**, e os `not.toContain`
     * passavam sobre uma lista vazia. Verde sem testar nada. `pg_proc` sabe o
     * que a função devolve, e `expect(assinatura)` abaixo prova que a leitura
     * trouxe alguma coisa antes de afirmar o que não está lá.
     */
    const [{ r: assinatura }] = await asUser<{ r: string }>(
      client,
      AUTH_GRATIS,
      `select pg_get_function_result(oid) as r from pg_proc where proname = 'receitas_trancadas'`,
    )
    expect(assinatura).toContain('titulo text')

    for (const proibida of ['ingredients', 'instructions', 'nutrition_facts', 'tags']) {
      expect(assinatura).not.toContain(proibida)
    }

    // E o conteúdo de verdade, pelo valor e não só pelo nome da coluna.
    const texto = JSON.stringify(
      await asUser(client, AUTH_GRATIS, `select * from receitas_trancadas()`),
    )
    expect(texto).not.toContain('aveia')
    expect(texto).not.toContain('Misture tudo')
    expect(texto).not.toContain('460')
  })

  it('quem já assina não recebe anúncio nenhum', async () => {
    await darPlus('ACTIVE', 'current_date + 30')
    const r = await asUser(client, AUTH_ASSINA, `select * from receitas_trancadas()`)
    expect(r).toHaveLength(0)
  })

  it('e a conta de plataforma também não — ela lê tudo', async () => {
    // Mesma razão da 0042 no acervo: quem já lê não precisa de anúncio, e a
    // conta de plataforma via o próprio item duas vezes.
    await client.query(`select grant_super_admin('gratis@rec.test')`)
    const r = await asUser(client, AUTH_GRATIS, `select * from receitas_trancadas()`)
    expect(r).toHaveLength(0)
    await client.query(`select revoke_super_admin('gratis@rec.test')`)
  })
})

describe.skipIf(!temBanco)('a autoria das receitas', () => {
  it('aluno comum não grava', async () => {
    await expect(
      asUser(
        client,
        AUTH_GRATIS,
        `select save_recipe(null, 'Invadida', null, 'CAFE', '{}'::text[], null,
                            null, null, null, '{}'::text[], null, 'FREE')`,
      ),
    ).rejects.toThrow()
  })

  it('nem apaga', async () => {
    await expect(
      asUser(client, AUTH_GRATIS, `select delete_recipe($1)`, [freeId]),
    ).rejects.toThrow()
  })

  it('a conta de plataforma publica, e a trilha registra', async () => {
    await client.query(`select grant_super_admin('assina@rec.test')`)

    const { rows: antes } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'RECEITA'`,
    )

    const r = await asUser<{ save_recipe: string }>(
      client,
      AUTH_ASSINA,
      `select save_recipe(null, 'Nova receita', 'Descrição', 'LANCHE',
                          array['1 banana'], 'Amasse.', 10::smallint, 1::smallint,
                          null, array['rápido'], '{"kcal": 120}'::jsonb, 'SYNSE_PLUS')`,
    )
    expect(r[0].save_recipe).toBeTruthy()

    const { rows: depois } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'RECEITA'`,
    )
    expect(depois[0].n).toBe(antes[0].n + 1)

    await client.query(`select revoke_super_admin('assina@rec.test')`)
  })

  it('e recusa visibilidade de academia, que ficaria invisível para todos', async () => {
    /*
     * `recipes` não tem `organization_id`. Marcada assim, a linha não casa
     * nenhum ramo da política — nem o autor a releria.
     */
    await client.query(`select grant_super_admin('assina@rec.test')`)
    await expect(
      asUser(
        client,
        AUTH_ASSINA,
        `select save_recipe(null, 'Órfã', null, 'CAFE', '{}'::text[], null,
                            null, null, null, '{}'::text[], null, 'ORGANIZATION')`,
      ),
    ).rejects.toThrow(/FREE ou SYNSE_PLUS/i)
    await client.query(`select revoke_super_admin('assina@rec.test')`)
  })

  it('e recusa receita sem título', async () => {
    await client.query(`select grant_super_admin('assina@rec.test')`)
    await expect(
      asUser(
        client,
        AUTH_ASSINA,
        `select save_recipe(null, '   ', null, 'CAFE', '{}'::text[], null,
                            null, null, null, '{}'::text[], null, 'FREE')`,
      ),
    ).rejects.toThrow(/título/i)
    await client.query(`select revoke_super_admin('assina@rec.test')`)
  })

  it('e recusa tempo de preparo absurdo', async () => {
    await client.query(`select grant_super_admin('assina@rec.test')`)
    await expect(
      asUser(
        client,
        AUTH_ASSINA,
        `select save_recipe(null, 'Eterna', null, 'CAFE', '{}'::text[], null,
                            9999::smallint, null, null, '{}'::text[], null, 'FREE')`,
      ),
    ).rejects.toThrow(/preparo/i)
    await client.query(`select revoke_super_admin('assina@rec.test')`)
  })

  it('a conta de plataforma relê o que acabou de publicar', async () => {
    /*
     * O `or is_super_admin()` da 0044. Sem ele a tela de edição abriria 404
     * logo depois de salvar uma receita do Synse+ — a mesma falta que a 0039
     * corrigiu no acervo e a 0043 nos programas.
     */
    await client.query(`select grant_super_admin('gratis@rec.test')`)
    expect(await titulos(AUTH_GRATIS)).toContain('Salmão do Synse+')
    await client.query(`select revoke_super_admin('gratis@rec.test')`)
  })

  it('e apagar tira da biblioteca', async () => {
    await client.query(`select grant_super_admin('assina@rec.test')`)
    const novo = await asUser<{ save_recipe: string }>(
      client,
      AUTH_ASSINA,
      `select save_recipe(null, 'Para apagar', null, 'CAFE', '{}'::text[], null,
                          null, null, null, '{}'::text[], null, 'FREE')`,
    )
    await asUser(client, AUTH_ASSINA, `select delete_recipe($1)`, [novo[0].save_recipe])

    const { rows } = await client.query(`select count(*)::int as n from recipes where id = $1`, [
      novo[0].save_recipe,
    ])
    expect(rows[0].n).toBe(0)
    await client.query(`select revoke_super_admin('assina@rec.test')`)
  })
})

describe.skipIf(!temBanco)('a receita não é de academia nenhuma', () => {
  it('as duas academias enxergam a mesma biblioteca', async () => {
    /*
     * O contrário do que se testa no resto do sistema, e de propósito:
     * `recipes` não tem dono. O risco aqui não é vazar entre academias — é
     * alguém acrescentar um `organization_id` e partir o catálogo sem
     * perceber, deixando a academia Beta sem as receitas que a Alpha vê.
     */
    const daAlpha = await titulos(ALPHA.authId)
    const daBeta = await titulos(
      (
        await client.query(`select auth_user_id from user_profiles where email = $1`, [
          'dono@beta.test',
        ])
      ).rows[0].auth_user_id,
    )
    expect(daBeta).toEqual(daAlpha)
  })

  it('e a tabela segue sem coluna de dono', async () => {
    const { rows } = await client.query(
      `select column_name from information_schema.columns
        where table_name = 'recipes' and column_name = 'organization_id'`,
    )
    expect(rows).toHaveLength(0)
  })
})
