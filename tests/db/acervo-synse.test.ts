import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O acervo Synse (0039).
 *
 * A 0038 consertou o cadeado e a 0039 abre a porta: conteúdo **sem dono**, que
 * a política de escrita da 0004 não deixava ninguém criar.
 *
 * Porta nova em produto multi-inquilino é onde vazamento entra, então metade
 * destes testes é sobre quem **não** passa: a dona de academia não publica no
 * acervo de todo mundo, e a porta do acervo não serve para editar o conteúdo
 * de uma academia.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ADMIN = '77777777-0000-0000-0000-000000000001'
const AUTH_ALUNO = '77777777-0000-0000-0000-000000000002'
let perfilAdmin: string
let perfilAluno: string

const comoAdmin = <T = unknown>(sql: string, params: unknown[] = []) =>
  asUser<T>(client, AUTH_ADMIN, sql, params)

const SALVAR =
  `select save_synse_content(null, $1::content_type, $2, null, null, null, null,
                             $3::content_visibility, $4) as id`

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  await client.query(`insert into auth.users (id, email) values ($1,'admin@synse.com.br')`, [
    AUTH_ADMIN,
  ])
  const perfil = await client.query(
    `insert into user_profiles (auth_user_id, name, email)
     values ($1,'Plataforma','admin@synse.com.br') returning id`,
    [AUTH_ADMIN],
  )
  perfilAdmin = perfil.rows[0].id
  await client.query(`select grant_super_admin('admin@synse.com.br')`)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 limit 1`,
    [ALPHA.orgId],
  )
  perfilAluno = rows[0].user_profile_id
  await client.query(`insert into auth.users (id, email) values ($1,'aluno@alpha.test')`, [
    AUTH_ALUNO,
  ])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    perfilAluno,
  ])
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('a conta de plataforma publica', () => {
  it('cria um e-book do Synse+ e recebe o id', async () => {
    const linhas = await comoAdmin<{ id: string }>(SALVAR, [
      'EBOOK',
      'Guia de hipertrofia',
      'SYNSE_PLUS',
      new Date(),
    ])
    expect(linhas[0].id).toMatch(/^[0-9a-f-]{36}$/)

    const { rows } = await client.query(
      `select organization_id, visibility from content_library where id = $1`,
      [linhas[0].id],
    )
    // Sem dono: é isso que faz dele acervo, e não conteúdo de academia.
    expect(rows[0].organization_id).toBeNull()
    expect(rows[0].visibility).toBe('SYNSE_PLUS')
  })

  it('enxerga o próprio rascunho, que ainda não foi publicado', async () => {
    /*
     * Sem este ramo na política, quem escreve o acervo escreveria às cegas: o
     * rascunho sem dono não cai em nenhum dos outros ramos.
     */
    await comoAdmin(SALVAR, ['ARTICLE', 'Rascunho do acervo', 'FREE', null])

    const titulos = await comoAdmin<{ title: string }>(
      `select title from content_library where organization_id is null`,
    )
    expect(titulos.map((r) => r.title)).toContain('Rascunho do acervo')
  })

  it('apaga o que publicou', async () => {
    const [{ id }] = await comoAdmin<{ id: string }>(SALVAR, ['GUIDE', 'Para apagar', 'FREE', null])
    await comoAdmin(`select delete_synse_content($1)`, [id])

    const { rows } = await client.query(`select 1 from content_library where id = $1`, [id])
    expect(rows).toHaveLength(0)
  })

  it('toda escrita cai na trilha', async () => {
    /*
     * "Quem pôs esse e-book no ar, e quando" precisa ter resposta. A conta de
     * plataforma é a que enxerga tudo, e publicar para toda a base é ato da
     * mesma natureza que trocar de contexto — que a 0034 já registra.
     */
    const conta = async () =>
      (
        await client.query<{ n: number }>(
          `select count(*)::int as n from platform_access_log
           where context = 'ACERVO' and user_profile_id = $1`,
          [perfilAdmin],
        )
      ).rows[0].n

    /*
     * Exatamente uma linha a mais, e não "pelo menos as de antes". A primeira
     * versão comparava com `antes - 1`, que é `>= antes` — passava com a
     * gravação da trilha removida, porque outra chamada já havia deixado
     * rastro. Foi a mutação que mostrou; a leitura não.
     */
    const antes = await conta()
    await comoAdmin(SALVAR, ['ARTICLE', 'Deixa rastro', 'FREE', null])
    expect(await conta()).toBe(antes + 1)
  })

  it('e o apagar também deixa rastro', async () => {
    const [{ id }] = await comoAdmin<{ id: string }>(SALVAR, ['ARTICLE', 'Rastro ao sair', 'FREE', null])

    const { rows: antes } = await client.query<{ n: number }>(
      `select count(*)::int as n from platform_access_log
       where context = 'ACERVO' and user_profile_id = $1`,
      [perfilAdmin],
    )
    await comoAdmin(`select delete_synse_content($1)`, [id])
    const { rows: depois } = await client.query<{ n: number }>(
      `select count(*)::int as n from platform_access_log
       where context = 'ACERVO' and user_profile_id = $1`,
      [perfilAdmin],
    )
    expect(depois[0].n).toBe(antes[0].n + 1)
  })
})

describe.skipIf(!temBanco)('quem não é plataforma não passa', () => {
  it('a dona da academia não publica no acervo de todo mundo', async () => {
    await expect(
      asUser(client, ALPHA.authId, SALVAR, ['EBOOK', 'Invadindo o acervo', 'SYNSE_PLUS', new Date()]),
    ).rejects.toThrow(/Somente contas de plataforma/)
  })

  it('o aluno também não', async () => {
    await expect(
      asUser(client, AUTH_ALUNO, SALVAR, ['EBOOK', 'Do aluno', 'FREE', new Date()]),
    ).rejects.toThrow(/Somente contas de plataforma/)
  })

  it('e o anônimo nem chega a executar a função', async () => {
    await expect(
      asUser(client, null, SALVAR, ['EBOOK', 'Do nada', 'FREE', new Date()]),
    ).rejects.toThrow(/permission denied|Somente contas de plataforma/)
  })

  it('a dona da academia não apaga item do acervo', async () => {
    const [{ id }] = await comoAdmin<{ id: string }>(SALVAR, ['ARTICLE', 'Protegido', 'FREE', null])

    await expect(asUser(client, ALPHA.authId, `select delete_synse_content($1)`, [id])).rejects.toThrow(
      /Somente contas de plataforma/,
    )
    const { rows } = await client.query(`select 1 from content_library where id = $1`, [id])
    expect(rows).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('a porta do acervo não abre a da academia', () => {
  it('não edita conteúdo que tem dono', async () => {
    /*
     * O ponto mais importante do arquivo. A conta de plataforma já alcança
     * conteúdo de academia por outro caminho, com a trilha da 0034 — o que
     * não pode é **esta** porta servir de atalho, sem dono e sem contexto.
     */
    const { rows } = await client.query(
      `insert into content_library (organization_id, type, title, visibility, published_at)
       values ($1,'ARTICLE','Artigo da Alpha','ORGANIZATION', now()) returning id`,
      [ALPHA.orgId],
    )
    const alheio = rows[0].id

    await expect(
      comoAdmin(
        `select save_synse_content($1, 'ARTICLE'::content_type, 'Sequestrado', null, null, null,
                                   null, 'FREE'::content_visibility, now())`,
        [alheio],
      ),
    ).rejects.toThrow(/não encontrado/)

    const depois = await client.query(
      `select title, organization_id from content_library where id = $1`,
      [alheio],
    )
    expect(depois.rows[0].title).toBe('Artigo da Alpha')
    expect(depois.rows[0].organization_id).toBe(ALPHA.orgId)
  })

  it('não apaga conteúdo que tem dono', async () => {
    const { rows } = await client.query(
      `insert into content_library (organization_id, type, title, visibility, published_at)
       values ($1,'ARTICLE','Outro da Alpha','ORGANIZATION', now()) returning id`,
      [ALPHA.orgId],
    )
    await expect(comoAdmin(`select delete_synse_content($1)`, [rows[0].id])).rejects.toThrow(
      /não encontrado/,
    )
  })
})

describe.skipIf(!temBanco)('a visibilidade é entre duas coisas, não três', () => {
  it('recusa ORGANIZATION sem academia', async () => {
    /*
     * O `check` da 0031 já recusaria, mas com erro de constraint. A função
     * recusa antes, em português, e deixa claro que a escolha é binária.
     */
    await expect(
      comoAdmin(SALVAR, ['ARTICLE', 'Sem dono e da academia', 'ORGANIZATION', new Date()]),
    ).rejects.toThrow(/aberto \(FREE\) ou do Synse\+/)
  })

  it('recusa título em branco', async () => {
    await expect(comoAdmin(SALVAR, ['ARTICLE', '   ', 'FREE', new Date()])).rejects.toThrow(
      /Dê um título/,
    )
  })
})

describe.skipIf(!temBanco)('o cadeado da 0038 continua valendo no acervo', () => {
  it('o e-book Synse+ do acervo não chega a quem não assina', async () => {
    await comoAdmin(SALVAR, ['EBOOK', 'Só para assinante', 'SYNSE_PLUS', new Date()])

    const doAluno = await asUser<{ title: string }>(
      client,
      AUTH_ALUNO,
      `select title from content_library where organization_id is null`,
    )
    expect(doAluno.map((r) => r.title)).not.toContain('Só para assinante')
  })

  it('e chega a quem assina', async () => {
    await client.query(
      `select set_plus_subscription($1, 'ACTIVE', now() + interval '30 days')`,
      [perfilAluno],
    )
    const doAluno = await asUser<{ title: string }>(
      client,
      AUTH_ALUNO,
      `select title from content_library where organization_id is null`,
    )
    expect(doAluno.map((r) => r.title)).toContain('Só para assinante')
  })
})
