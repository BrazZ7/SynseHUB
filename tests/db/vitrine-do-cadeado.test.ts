import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * A vitrine do cadeado (0041).
 *
 * ── O que ela resolve ────────────────────────────────────────────────────────
 *
 * A 0038 trancou o conteúdo do Synse+ e a 0039 abriu a porta para publicá-lo.
 * Quem não assina deixou de ver — e também deixou de **saber que existe**.
 * Item invisível não vende; o aluno do plano grátis conclui que o Synse+ não
 * tem acervo.
 *
 * ── O risco que estes testes guardam ─────────────────────────────────────────
 *
 * Vitrine que entrega o produto. A função é `security definer`, então ela
 * atravessa a RLS por desenho: se um dia alguém acrescentar `body` ou
 * `media_url` à projeção, o e-book pago passa a sair de graça pela mesma porta
 * que anuncia o e-book. Os dois primeiros testes do último bloco existem só
 * para isso, e falham em `create or replace` descuidado.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_GRATIS = 'ffffffff-1111-1111-1111-111111111111'
const AUTH_ASSINANTE = 'ffffffff-2222-2222-2222-222222222222'

let perfilAssinante: string

type Linha = {
  id: string
  tipo: string
  titulo: string
  resumo: string | null
  capa_url: string | null
  publicado_em: string
  fixado: boolean
}

const vitrine = (authId: string | null, p_id: string | null = null) =>
  asUser<Linha>(client, authId, `select * from acervo_trancado($1)`, [p_id])

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 2`,
    [ALPHA.orgId],
  )
  perfilAssinante = rows[1].user_profile_id

  for (const [auth, perfil, email] of [
    [AUTH_GRATIS, rows[0].user_profile_id, 'gratis@vitrine.test'],
    [AUTH_ASSINANTE, rows[1].user_profile_id, 'assina@vitrine.test'],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [auth, perfil])
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role)
       values ($1,$2,'STUDENT') on conflict do nothing`,
      [ALPHA.orgId, perfil],
    )
  }

  await client.query(
    `insert into content_library
       (organization_id, type, title, summary, body, media_url, cover_url, visibility, published_at, pinned)
     values
       (null,'EBOOK','E-book do Synse+','O resumo que pode aparecer.','O CORPO PAGO','https://arquivo.test/ebook.pdf','https://capa.test/e.jpg','SYNSE_PLUS', now(), true),
       (null,'RECIPE','Receita do Synse+',null,'OUTRO CORPO PAGO',null,null,'SYNSE_PLUS', now() - interval '1 day', false),
       (null,'GUIDE','Guia aberto','Este é grátis.','Corpo aberto',null,null,'FREE', now(), false),
       (null,'EBOOK','Ainda não publicado',null,'Rascunho',null,null,'SYNSE_PLUS', null, false),
       (null,'EBOOK','Sai semana que vem',null,'Agendado',null,null,'SYNSE_PLUS', now() + interval '7 days', false)`,
  )

  // Conteúdo de academia marcado como Synse+. Não deveria existir pela tela,
  // e é exatamente por isso que precisa estar aqui.
  await client.query(
    `insert into content_library (organization_id, type, title, body, visibility, published_at)
     values ($1,'EBOOK','E-book da academia Alpha','Corpo da academia','SYNSE_PLUS', now())`,
    [ALPHA.orgId],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('quem não assina vê a prateleira', () => {
  it('os dois itens trancados do acervo, e só eles', async () => {
    const linhas = await vitrine(AUTH_GRATIS)
    expect(linhas.map((l) => l.titulo)).toEqual(['E-book do Synse+', 'Receita do Synse+'])
  })

  it('fixado primeiro, depois o mais recente', async () => {
    const linhas = await vitrine(AUTH_GRATIS)
    expect(linhas[0].fixado).toBe(true)
  })

  it('o anônimo também — vitrine serve para ser vista antes de entrar', async () => {
    expect((await vitrine(null)).map((l) => l.titulo)).toContain('E-book do Synse+')
  })

  it('e por id, que é a tela de leitura perguntando se aquele está trancado', async () => {
    const [um] = await vitrine(AUTH_GRATIS)
    const porId = await vitrine(AUTH_GRATIS, um.id)
    expect(porId).toHaveLength(1)
    expect(porId[0].titulo).toBe(um.titulo)
  })
})

describe.skipIf(!temBanco)('o que a vitrine não mostra', () => {
  it('o corpo — é o produto, não o anúncio', async () => {
    /*
     * A função é `security definer` e por isso atravessa a RLS. A projeção é
     * a única coisa entre o anúncio e o conteúdo pago: se `body` entrar nela,
     * o e-book sai de graça pela porta que deveria vendê-lo.
     */
    const [linha] = await vitrine(AUTH_GRATIS)
    expect(Object.keys(linha)).not.toContain('body')
    expect(JSON.stringify(linha)).not.toContain('O CORPO PAGO')
  })

  it('nem o link do arquivo', async () => {
    const [linha] = await vitrine(AUTH_GRATIS)
    expect(Object.keys(linha)).not.toContain('media_url')
    expect(JSON.stringify(linha)).not.toContain('arquivo.test')
  })

  it('a capa, essa sim, porque capa é anúncio', async () => {
    const [linha] = await vitrine(AUTH_GRATIS)
    expect(linha.capa_url).toBe('https://capa.test/e.jpg')
  })

  it('o conteúdo aberto, que já aparece na lista normal', async () => {
    expect((await vitrine(AUTH_GRATIS)).map((l) => l.titulo)).not.toContain('Guia aberto')
  })

  it('o rascunho e o agendado', async () => {
    const titulos = (await vitrine(AUTH_GRATIS)).map((l) => l.titulo)
    expect(titulos).not.toContain('Ainda não publicado')
    expect(titulos).not.toContain('Sai semana que vem')
  })

  it('e o conteúdo de academia, nem marcado como Synse+', async () => {
    /*
     * A garantia multi-inquilino. `organization_id is null` não é detalhe de
     * implementação: sem ele, o que uma academia escreve viraria anúncio para
     * os alunos das concorrentes — e aqui o aluno é da própria Alpha, então
     * nem "é da minha academia" serve de desculpa: ele não assina, e o item
     * continua trancado para ele.
     */
    expect((await vitrine(AUTH_GRATIS)).map((l) => l.titulo)).not.toContain(
      'E-book da academia Alpha',
    )
  })
})

describe.skipIf(!temBanco)('quem assina não recebe vitrine nenhuma', () => {
  it('porque já vê os itens pela lista normal, com o corpo', async () => {
    await client.query(`select set_plus_subscription($1, 'ACTIVE', now() + interval '30 days')`, [
      perfilAssinante,
    ])

    expect(await vitrine(AUTH_ASSINANTE)).toHaveLength(0)

    // O controle: ele realmente lê o item pela porta normal.
    const lidos = await asUser<{ body: string }>(
      client,
      AUTH_ASSINANTE,
      `select body from content_library where title = 'E-book do Synse+'`,
    )
    expect(lidos[0].body).toBe('O CORPO PAGO')
  })

  it('e volta a receber quando a assinatura vence', async () => {
    /*
     * A data manda, não o rótulo — mesma regra do cadeado da 0038. Uma conta
     * cujo ciclo venceu ontem continua ACTIVE até a rotina de expiração
     * rodar, e a vitrine não pode esperar por uma rotina para voltar a
     * oferecer a renovação.
     */
    await client.query(`select set_plus_subscription($1, 'ACTIVE', now() - interval '1 day')`, [
      perfilAssinante,
    ])
    expect((await vitrine(AUTH_ASSINANTE)).length).toBeGreaterThan(0)
  })
})
