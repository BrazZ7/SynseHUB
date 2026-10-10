import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Conteúdos.
 *
 * Os dois primeiros blocos reproduzem os furos que a RLS da 0004 tinha e provam
 * que fecharam. O segundo é o que mais importa: conteúdo de academia marcado
 * "FREE" era entregue ao visitante anônimo, e o rótulo convida ao erro — para
 * quem opera a academia, "grátis" lê como "sem custo para os meus alunos".
 */

let client: Client
const temBanco = await databaseAvailable()
const AUTH_ALUNO = 'bbbbbbbb-1111-1111-1111-111111111111'

async function publicar(campos: {
  titulo: string
  org?: string | null
  visibilidade?: string
  quando?: string | null
}) {
  const { rows } = await client.query(
    `insert into content_library (organization_id, type, title, visibility, published_at)
     values ($1,'ARTICLE',$2,$3::content_visibility, $4) returning id`,
    [
      campos.org === undefined ? ALPHA.orgId : campos.org,
      campos.titulo,
      campos.visibilidade ?? 'ORGANIZATION',
      campos.quando === undefined ? new Date() : campos.quando,
    ],
  )
  return rows[0].id as string
}

const titulosPara = async (authId: string | null) =>
  (await asUser<{ title: string }>(client, authId, `select title from content_library order by title`))
    .map((r) => r.title)

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 1)

  const { rows } = await client.query(
    `select id, user_profile_id from students where organization_id = $1 limit 1`,
    [ALPHA.orgId],
  )
  await client.query(`insert into auth.users (id, email) values ($1,'c@alpha.test')`, [AUTH_ALUNO])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    AUTH_ALUNO,
    rows[0].user_profile_id,
  ])
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role)
     values ($1,$2,'STUDENT') on conflict do nothing`,
    [ALPHA.orgId, rows[0].user_profile_id],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('rascunho não é publicação', () => {
  it('o aluno não enxerga o que ainda não foi publicado', async () => {
    /*
     * A política da 0004 não olhava `published_at`, e entregava o rascunho a
     * qualquer membro da academia — o que inclui os alunos. Artigo meio escrito
     * no app é pior que artigo nenhum.
     */
    await publicar({ titulo: 'Rascunho do professor', quando: null })
    await publicar({ titulo: 'Artigo publicado' })

    const doAluno = await titulosPara(AUTH_ALUNO)
    expect(doAluno).toContain('Artigo publicado')
    expect(doAluno).not.toContain('Rascunho do professor')
  })

  it('a equipe enxerga o rascunho, porque é ela que escreve', async () => {
    const daEquipe = await titulosPara(ALPHA.authId)
    expect(daEquipe).toContain('Rascunho do professor')
  })

  it('publicação agendada para o futuro ainda não vale', async () => {
    // Escrever hoje e soltar na segunda é uso normal; entregar antes da hora
    // estraga o agendamento.
    await publicar({
      titulo: 'Sai na semana que vem',
      quando: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    expect(await titulosPara(AUTH_ALUNO)).not.toContain('Sai na semana que vem')
  })
})

describe.skipIf(!temBanco)('"FREE" não é da academia', () => {
  it('conteúdo de academia não pode ser marcado FREE', async () => {
    /*
     * A restrição fecha na origem. Sem ela, a academia escolheria "grátis"
     * achando que é "sem custo para os meus alunos" e publicaria para a
     * internet — o rótulo é a armadilha.
     */
    await expect(
      publicar({ titulo: 'Tentativa pública', visibilidade: 'FREE' }),
    ).rejects.toThrow(/content_library_escopo_coerente/i)
  })

  it('o que já estava marcado FREE deixa de vazar na leitura', async () => {
    /*
     * A restrição entra como `not valid` e não alcança linha antiga; quem fecha
     * a leitura do que já existe é a política. Aqui a linha entra por dentro,
     * como se fosse antiga.
     */
    await client.query(`alter table content_library drop constraint content_library_escopo_coerente`)
    await client.query(
      `insert into content_library (organization_id, type, title, visibility, published_at)
       values ($1,'ARTICLE','Legado marcado FREE','FREE', now())`,
      [ALPHA.orgId],
    )
    /*
     * Recolocada como `not valid`, exatamente como a migration faz: a linha
     * acima fica lá, inválida pela restrição e invisível pela política. É esse
     * o estado de um banco que já tinha conteúdo FREE de academia dentro.
     */
    await client.query(
      `alter table content_library add constraint content_library_escopo_coerente
       check (visibility <> 'FREE' or organization_id is null) not valid`,
    )

    expect(await titulosPara(BETA.authId)).not.toContain('Legado marcado FREE')
    expect(await titulosPara(null)).not.toContain('Legado marcado FREE')
  })

  it('a academia vizinha não lê o conteúdo desta', async () => {
    expect(await titulosPara(BETA.authId)).not.toContain('Artigo publicado')
  })

  it('o conteúdo da plataforma continua aberto', async () => {
    // Sem academia dona: é o que FREE sempre quis dizer.
    await publicar({ titulo: 'Guia do Synse', org: null, visibilidade: 'FREE' })

    expect(await titulosPara(null)).toContain('Guia do Synse')
    expect(await titulosPara(BETA.authId)).toContain('Guia do Synse')
    expect(await titulosPara(AUTH_ALUNO)).toContain('Guia do Synse')
  })

  it('conteúdo do Synse+ exige assinatura ativa', async () => {
    await publicar({ titulo: 'Exclusivo do Synse+', org: null, visibilidade: 'SYNSE_PLUS' })
    expect(await titulosPara(AUTH_ALUNO)).not.toContain('Exclusivo do Synse+')
  })
})

describe.skipIf(!temBanco)('a lista publicada', () => {
  it('traz o fixado primeiro, depois o mais recente', async () => {
    const fixado = await publicar({ titulo: 'Aviso fixado' })
    await client.query(
      `update content_library set pinned = true, published_at = now() - interval '30 days'
       where id = $1`,
      [fixado],
    )

    const lista = await asUser<{ titulo: string }>(
      client,
      AUTH_ALUNO,
      `select titulo from published_content($1, 50)`,
      [ALPHA.orgId],
    )
    // Fixado de trinta dias atrás vence o publicado hoje: aviso importante não
    // pode depender de ter sido escrito hoje para ser visto.
    expect(lista[0].titulo).toBe('Aviso fixado')
  })

  it('não traz rascunho nem agendado', async () => {
    const lista = await asUser<{ titulo: string }>(
      client,
      AUTH_ALUNO,
      `select titulo from published_content($1, 50)`,
      [ALPHA.orgId],
    )
    const titulos = lista.map((r) => r.titulo)
    expect(titulos).not.toContain('Rascunho do professor')
    expect(titulos).not.toContain('Sai na semana que vem')
  })

  it('a lista da academia vizinha não entrega o conteúdo desta', async () => {
    const daBeta = await asUser<{ titulo: string }>(
      client,
      BETA.authId,
      `select titulo from published_content($1, 50)`,
      [ALPHA.orgId],
    )
    expect(daBeta.map((r) => r.titulo)).not.toContain('Artigo publicado')
  })
})

describe.skipIf(!temBanco)('escrita', () => {
  it('o aluno não publica conteúdo na academia', async () => {
    await expect(
      asUser(
        client,
        AUTH_ALUNO,
        `insert into content_library (organization_id, type, title, visibility, published_at)
         values ($1,'ARTICLE','Escrito pelo aluno','ORGANIZATION', now())`,
        [ALPHA.orgId],
      ),
    ).rejects.toThrow(/violates row-level security|permission denied/i)
  })

  it('a equipe da vizinha não publica aqui', async () => {
    await expect(
      asUser(
        client,
        BETA.authId,
        `insert into content_library (organization_id, type, title, visibility)
         values ($1,'ARTICLE','Intruso','ORGANIZATION')`,
        [ALPHA.orgId],
      ),
    ).rejects.toThrow(/violates row-level security/i)
  })
})
