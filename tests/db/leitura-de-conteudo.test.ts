import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * ── A tela de leitura, lida pelo id ──────────────────────────────────────────
 *
 * A lista de conteúdos nunca expôs o corpo nem os itens que a pessoa não pode
 * ver. A tela de leitura abre por `/app/content/<id>`, e um endereço é uma
 * porta que se pode chutar: quem tiver um id na mão pede aquela linha
 * diretamente, sem passar pela lista que o filtrou.
 *
 * Estes testes atacam exatamente por aí. `content_read` (0039) é quem responde
 * — a tela não tem `if` de permissão nenhum, de propósito: a autorização mora
 * no banco, e repetir a regra na aplicação cria um segundo lugar para ela
 * divergir.
 *
 * A consulta reproduzida aqui é a mesma de `getPublishedContent`: por chave
 * primária, com o recorte de publicado.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ALUNO_ALPHA = 'eeeeeeee-1111-1111-1111-111111111111'
const AUTH_ALUNO_BETA = 'eeeeeeee-2222-2222-2222-222222222222'

let perfilAlpha: string
const ids: Record<string, string> = {}

/** A leitura da tela de detalhe, tal como o data source a monta. */
const abrir = async (authId: string | null, contentId: string) =>
  asUser<{ id: string; body: string | null }>(
    client,
    authId,
    `select id, body from content_library
      where id = $1 and published_at is not null and published_at <= now()`,
    [contentId],
  )

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  perfilAlpha = rows[0].user_profile_id

  const { rows: outros } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 1`,
    [BETA.orgId],
  )

  for (const [auth, perfil, email, org] of [
    [AUTH_ALUNO_ALPHA, perfilAlpha, 'le@alpha.test', ALPHA.orgId],
    [AUTH_ALUNO_BETA, outros[0].user_profile_id, 'le@beta.test', BETA.orgId],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [auth, perfil])
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role)
       values ($1,$2,'STUDENT') on conflict do nothing`,
      [org, perfil],
    )
  }

  const criar = async (
    chave: string,
    sql: string,
    params: unknown[],
  ) => {
    const { rows } = await client.query(sql, params)
    ids[chave] = rows[0].id
  }

  await criar(
    'muralAlpha',
    `insert into content_library (organization_id, type, title, body, visibility, published_at)
     values ($1,'ARTICLE','Mural da Alpha','O texto do mural.','ORGANIZATION', now()) returning id`,
    [ALPHA.orgId],
  )
  await criar(
    'rascunhoAlpha',
    `insert into content_library (organization_id, type, title, body, visibility, published_at)
     values ($1,'ARTICLE','Rascunho da Alpha','Ainda não publicado.','ORGANIZATION', null) returning id`,
    [ALPHA.orgId],
  )
  await criar(
    'agendadoAlpha',
    `insert into content_library (organization_id, type, title, body, visibility, published_at)
     values ($1,'ARTICLE','Sai semana que vem','Texto agendado.','ORGANIZATION', now() + interval '7 days') returning id`,
    [ALPHA.orgId],
  )
  await criar(
    'acervoAberto',
    `insert into content_library (organization_id, type, title, body, visibility, published_at)
     values (null,'GUIDE','Guia aberto','O texto do guia.','FREE', now()) returning id`,
    [],
  )
  await criar(
    'acervoPlus',
    `insert into content_library (organization_id, type, title, body, visibility, published_at)
     values (null,'EBOOK','E-book do Synse+','O texto que se paga para ler.','SYNSE_PLUS', now()) returning id`,
    [],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('o que a tela de leitura entrega', () => {
  it('o aluno abre o mural da própria academia, com o corpo', async () => {
    const linhas = await abrir(AUTH_ALUNO_ALPHA, ids.muralAlpha)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].body).toBe('O texto do mural.')
  })

  it('e o acervo aberto da plataforma', async () => {
    const linhas = await abrir(AUTH_ALUNO_ALPHA, ids.acervoAberto)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].body).toBe('O texto do guia.')
  })
})

describe.skipIf(!temBanco)('e o que ela recusa, mesmo com o id na mão', () => {
  it('o mural da academia vizinha', async () => {
    /*
     * O vazamento entre inquilinos é o defeito mais caro deste produto, e uma
     * tela de detalhe é onde ele costuma entrar: a lista filtra, o id chutado
     * não passa por lista nenhuma.
     */
    expect(await abrir(AUTH_ALUNO_BETA, ids.muralAlpha)).toHaveLength(0)
  })

  it('o rascunho da própria academia', async () => {
    expect(await abrir(AUTH_ALUNO_ALPHA, ids.rascunhoAlpha)).toHaveLength(0)
  })

  it('o item agendado, antes da data', async () => {
    expect(await abrir(AUTH_ALUNO_ALPHA, ids.agendadoAlpha)).toHaveLength(0)
  })

  it('o rascunho **para quem é da equipe** — aqui quem barra é a consulta', async () => {
    /*
     * Este é o único caso em que o recorte de publicado da consulta faz
     * diferença, e eu só descobri isso quebrando o teste de propósito: tirei
     * o `published_at` da consulta e os dois testes acima continuaram verdes.
     * Eles nunca testaram a consulta — quem barra o aluno é a política, que
     * já exige publicação no ramo de quem é membro.
     *
     * A política é mais larga para a equipe: `is_org_staff` deixa ler o
     * rascunho da própria academia, e com razão, porque é assim que o painel
     * mostra o que ainda não saiu. Quem é professor numa academia e aluno
     * nela abriria pelo app um texto que ainda não foi publicado.
     *
     * A primeira asserção é o controle. Sem ela este teste passaria mesmo que
     * a política tivesse fechado para a equipe, e aí ele não estaria provando
     * o que diz provar.
     */
    const semRecorte = await asUser(
      client,
      ALPHA.authId,
      `select id from content_library where id = $1`,
      [ids.rascunhoAlpha],
    )
    expect(semRecorte).toHaveLength(1)

    expect(await abrir(ALPHA.authId, ids.rascunhoAlpha)).toHaveLength(0)
  })

  it('o e-book do Synse+ para quem não assina', async () => {
    expect(await abrir(AUTH_ALUNO_ALPHA, ids.acervoPlus)).toHaveLength(0)
  })

  it('e para o visitante anônimo — sem explodir', async () => {
    /*
     * Vazio, e não `permission denied for function`: `tem_synse_plus` é
     * concedida ao anônimo de propósito. Foi a pegadinha que a 0037 já
     * encontrou com `is_friendship_party`, e a tela de leitura é pública o
     * bastante para tropeçar nela de novo.
     */
    await expect(abrir(null, ids.acervoPlus)).resolves.toHaveLength(0)
    await expect(abrir(null, ids.acervoAberto)).resolves.toBeInstanceOf(Array)
  })
})

describe.skipIf(!temBanco)('e entrega ao assinante', () => {
  it('o mesmo e-book, depois da assinatura', async () => {
    await client.query(`select set_plus_subscription($1, 'ACTIVE', now() + interval '30 days')`, [
      perfilAlpha,
    ])

    const linhas = await abrir(AUTH_ALUNO_ALPHA, ids.acervoPlus)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].body).toBe('O texto que se paga para ler.')
  })
})
