import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { casaTermo } from '@/features/content/busca'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Favoritos e busca de conteúdos (0067).
 *
 * O que estes testes protegem:
 *
 *  - **O cadeado do Synse+ vale também para o favorito.** Nenhuma função daqui
 *    é `security definer` justamente para que a RLS continue sendo o único
 *    lugar da regra; o teste confere que ela está mesmo valendo.
 *  - **Um dos dois, nunca os dois.** Conteúdo ou receita, e o banco recusa o
 *    par vazio e o par cheio.
 *  - **Alternância, e não "favoritar duas vezes".** Tocar de novo desguarda.
 *  - **A busca sem acento, palavra por palavra.** Quem digita "acai" acha
 *    "Açaí", e "treino casa" acha "Treino em casa" — que é o motivo de cada
 *    palavra casar em separado em vez do termo inteiro.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_A = '66666666-0067-0000-0000-000000000001'
const AUTH_B = '66666666-0067-0000-0000-000000000002'
let alunoA: string
let perfilA: string
let alunoB: string
let perfilB: string

let livre: string // conteúdo da academia ALPHA, publicado
let doSynse: string // acervo da plataforma, FREE
let doPlus: string // acervo da plataforma, SYNSE_PLUS — trancado
let daBeta: string // conteúdo da academia concorrente
let rascunho: string // da ALPHA, sem published_at
let receitaLivre: string
let receitaDoPlus: string

async function darConta(studentId: string, authId: string, email: string) {
  const { rows } = await client.query(
    `select user_profile_id, organization_id from students where id = $1`,
    [studentId],
  )
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [authId, email])
  await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
    authId,
    rows[0].user_profile_id,
  ])
  /*
   * O aluno também é membro, com papel STUDENT.
   *
   * `content_read` (0039) exige `is_org_member` para conteúdo de visibilidade
   * ORGANIZATION, e `is_org_member` olha `organization_members` — matrícula em
   * `students` não basta. É a mesma pegadinha que a 0011 documentou para
   * `organizations_read`, e `tests/db/conteudos.test.ts` monta o aluno do
   * mesmo jeito. Em produção, 534 dos 538 alunos têm essa linha.
   */
  await client.query(
    `insert into organization_members (organization_id, user_profile_id, role)
     values ($1,$2,'STUDENT') on conflict do nothing`,
    [rows[0].organization_id, rows[0].user_profile_id],
  )
  return rows[0].user_profile_id as string
}

const conteudo = async (campos: {
  org: string | null
  titulo: string
  resumo?: string | null
  corpo?: string | null
  visibilidade?: string
  publicado?: boolean
}) =>
  (
    await client.query(
      `insert into content_library (organization_id, type, title, summary, body, visibility, published_at)
       values ($1, 'ARTICLE', $2, $3, $4, $5, case when $6 then now() - interval '1 day' else null end)
       returning id`,
      [
        campos.org,
        campos.titulo,
        campos.resumo ?? null,
        campos.corpo ?? null,
        campos.visibilidade ?? (campos.org ? 'ORGANIZATION' : 'FREE'),
        campos.publicado ?? true,
      ],
    )
  ).rows[0].id as string

const receita = async (campos: {
  titulo: string
  descricao?: string | null
  ingredientes?: string[]
  tags?: string[]
  categoria?: string
  visibilidade?: string
}) =>
  (
    await client.query(
      `insert into recipes (title, description, ingredients, tags, category, visibility)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [
        campos.titulo,
        campos.descricao ?? null,
        campos.ingredientes ?? [],
        campos.tags ?? [],
        campos.categoria ?? 'ALMOCO',
        campos.visibilidade ?? 'FREE',
      ],
    )
  ).rows[0].id as string

const guardar = (
  { conteudo: c = null, receita: r = null }: { conteudo?: string | null; receita?: string | null },
  auth = AUTH_A,
) =>
  asUser<{ toggle_content_favorite: boolean }>(
    client,
    auth,
    `select toggle_content_favorite($1, $2) as toggle_content_favorite`,
    [c, r],
  ).then((linhas) => linhas[0].toggle_content_favorite)

type Favorito = {
  kind: string
  ref_id: string
  title: string
  subtitle: string | null
  badge: string
  favorited_at: Date
}

const favoritos = (auth = AUTH_A) =>
  asUser<Favorito>(client, auth, 'select * from student_favorites()')

const buscarConteudo = (termo: string, auth = AUTH_A, org = ALPHA.orgId) =>
  asUser<{ id: string; titulo: string }>(
    client,
    auth,
    `select id, titulo from search_published_content($1, $2, 50)`,
    [org, termo],
  )

const buscarReceitas = (termo: string, auth = AUTH_A) =>
  asUser<{ id: string; title: string }>(client, auth, `select id, title from search_recipes($1, 50)`, [
    termo,
  ])

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [ALPHA.orgId],
  )
  alunoA = rows[0].id
  alunoB = rows[1].id
  perfilA = await darConta(alunoA, AUTH_A, 'fav1@alpha.test')
  perfilB = await darConta(alunoB, AUTH_B, 'fav2@alpha.test')

  livre = await conteudo({
    org: ALPHA.orgId,
    titulo: 'Treino em casa sem equipamento',
    resumo: 'Para a semana em que a academia fecha.',
    corpo: 'Agachamento, flexão e prancha bastam.',
  })
  doSynse = await conteudo({
    org: null,
    titulo: 'Suplementação para iniciantes',
    resumo: 'O básico, sem promessa.',
    corpo: 'Whey e creatina são os dois com mais evidência.',
  })
  doPlus = await conteudo({
    org: null,
    titulo: 'Periodização avançada',
    visibilidade: 'SYNSE_PLUS',
  })
  daBeta = await conteudo({ org: BETA.orgId, titulo: 'Aviso da concorrente' })
  rascunho = await conteudo({ org: ALPHA.orgId, titulo: 'Rascunho da recepção', publicado: false })

  receitaLivre = await receita({
    titulo: 'Açaí na tigela',
    descricao: 'Depois do treino.',
    ingredientes: ['polpa de açaí', 'banana', 'granola'],
    tags: ['pos-treino'],
    categoria: 'LANCHE',
  })
  receitaDoPlus = await receita({
    titulo: 'Risoto de abobrinha',
    ingredientes: ['abobrinha', 'arroz arbóreo'],
    visibilidade: 'SYNSE_PLUS',
  })
}, 60_000)

beforeEach(async () => {
  if (temBanco) await client.query('delete from content_favorites')
})

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('favoritos', () => {
  it('guardar devolve true, e tocar de novo desguarda', async () => {
    /*
     * Uma função só, alternando. Duas funções fariam a tela escolher qual
     * chamar a partir de um estado lido antes — e entre a leitura e o toque a
     * verdade pode ter mudado noutra aba.
     */
    expect(await guardar({ conteudo: livre })).toBe(true)
    expect(await favoritos()).toHaveLength(1)

    expect(await guardar({ conteudo: livre })).toBe(false)
    expect(await favoritos()).toHaveLength(0)
  })

  it('conteúdo e receita cabem na mesma lista, mais recente primeiro', async () => {
    await guardar({ conteudo: livre })
    await guardar({ receita: receitaLivre })

    const lista = await favoritos()
    expect(lista.map((f) => f.kind)).toEqual(['RECEITA', 'CONTEUDO'])
    expect(lista[0].title).toBe('Açaí na tigela')
    expect(lista[0].badge).toBe('LANCHE')
    expect(lista[1].badge).toBe('ARTICLE')
  })

  it('um dos dois: nem nenhum, nem os dois', async () => {
    await expect(guardar({})).rejects.toThrow(/um conteúdo ou uma receita/i)
    await expect(guardar({ conteudo: livre, receita: receitaLivre })).rejects.toThrow(
      /um conteúdo ou uma receita/i,
    )
  })

  it('o `check` da tabela também recusa, não só a função', async () => {
    /*
     * A política deixa a pessoa gravar direto pela API — ver o comentário da
     * 0067. Então a trava não pode viver só na função.
     */
    await expect(
      client.query(
        `insert into content_favorites (user_profile_id, content_id, recipe_id) values ($1,$2,$3)`,
        [perfilA, livre, receitaLivre],
      ),
    ).rejects.toThrow(/content_favorites_um_so/)

    await expect(
      client.query(`insert into content_favorites (user_profile_id) values ($1)`, [perfilA]),
    ).rejects.toThrow(/content_favorites_um_so/)
  })

  it('a mesma coisa duas vezes não vira duas linhas', async () => {
    await client.query(
      `insert into content_favorites (user_profile_id, content_id) values ($1,$2)`,
      [perfilA, livre],
    )
    await expect(
      client.query(`insert into content_favorites (user_profile_id, content_id) values ($1,$2)`, [
        perfilA,
        livre,
      ]),
    ).rejects.toThrow(/content_favorites_conteudo/)
  })

  it('não guarda o que a pessoa não enxerga', async () => {
    /*
     * ── O teste que paga pelo `security invoker` ──────────────────────────
     *
     * O item do Synse+ e o da academia concorrente não aparecem para este
     * aluno, e o favorito não pode ser a porta dos fundos: o `exists` da
     * função passa pela RLS, e por isso ela não tem uma linha sequer sobre
     * cadeado ou academia.
     */
    await expect(guardar({ conteudo: doPlus })).rejects.toThrow(/não encontrado/i)
    await expect(guardar({ conteudo: daBeta })).rejects.toThrow(/não encontrado/i)
    await expect(guardar({ receita: receitaDoPlus })).rejects.toThrow(/não encontrada/i)
  })

  it('o favorito de um não é o do outro', async () => {
    await guardar({ conteudo: livre }, AUTH_A)
    await guardar({ receita: receitaLivre }, AUTH_B)

    expect((await favoritos(AUTH_A)).map((f) => f.kind)).toEqual(['CONTEUDO'])
    expect((await favoritos(AUTH_B)).map((f) => f.kind)).toEqual(['RECEITA'])
  })

  it('despublicar some da lista, e a linha continua', async () => {
    /*
     * A academia tira o aviso do ar: ele sai dos favoritos de quem guardou,
     * porque a lista é `inner join` com a RLS valendo. A linha fica — se
     * republicarem, a pessoa reencontra o que guardou. É a mesma razão de o
     * item do Synse+ sumir de quem deixa de assinar, em vez de ser apagado.
     */
    await guardar({ conteudo: livre })
    expect(await favoritos()).toHaveLength(1)

    await client.query(`update content_library set published_at = null where id = $1`, [livre])
    expect(await favoritos()).toHaveLength(0)
    expect(
      (await client.query(`select count(*)::int as n from content_favorites`)).rows[0].n,
    ).toBe(1)

    await client.query(
      `update content_library set published_at = now() - interval '1 day' where id = $1`,
      [livre],
    )
    expect(await favoritos()).toHaveLength(1)
  })

  it('rascunho nunca entra, nem para quem o favoritasse', async () => {
    await client.query(
      `insert into content_favorites (user_profile_id, content_id) values ($1,$2)`,
      [perfilA, rascunho],
    )
    expect(await favoritos()).toHaveLength(0)
  })

  it('nem para a equipe, que enxerga o rascunho pela RLS', async () => {
    /*
     * ── O teste que faz o filtro de `published_at` valer alguma coisa ─────
     *
     * Para o aluno, a RLS já esconde rascunho: o filtro em `student_favorites`
     * é redundante e uma mutação que o removesse passaria despercebida — foi o
     * que aconteceu na primeira rodada de mutação.
     *
     * Quem enxerga rascunho é a **equipe**, por `is_org_staff`. A dona pode
     * guardar o próprio rascunho, e aí o filtro é o que impede uma lista de
     * leitura de aluno de mostrar texto meio escrito.
     */
    await guardar({ conteudo: rascunho }, ALPHA.authId)
    expect(
      (await client.query(`select count(*)::int as n from content_favorites`)).rows[0].n,
    ).toBe(1)
    expect(await favoritos(ALPHA.authId)).toHaveLength(0)

    // E o que está publicado continua chegando para ela.
    await guardar({ conteudo: livre }, ALPHA.authId)
    expect((await favoritos(ALPHA.authId)).map((f) => f.ref_id)).toEqual([livre])
  })

  it('apagar a receita leva o favorito junto', async () => {
    const descartavel = await receita({ titulo: 'Receita que vai sumir' })
    await guardar({ receita: descartavel })
    expect(await favoritos()).toHaveLength(1)

    await client.query(`delete from recipes where id = $1`, [descartavel])
    expect(
      (await client.query(`select count(*)::int as n from content_favorites`)).rows[0].n,
    ).toBe(0)
  })

  it('os ids saem numa leitura própria, para o coração da lista', async () => {
    await guardar({ conteudo: livre })
    await guardar({ receita: receitaLivre })

    const ids = await asUser<{ content_id: string | null; recipe_id: string | null }>(
      client,
      AUTH_A,
      'select * from student_favorite_ids()',
    )
    expect(ids.filter((i) => i.content_id).map((i) => i.content_id)).toEqual([livre])
    expect(ids.filter((i) => i.recipe_id).map((i) => i.recipe_id)).toEqual([receitaLivre])
  })

  it('ninguém guarda em nome de outra pessoa', async () => {
    /*
     * A política deixa a escrita direta aberta — é a troca que mantém a
     * visibilidade num lugar só. O `with check` é o que impede essa abertura
     * de virar "favoritar pela conta alheia", que encheria a tela de outro.
     */
    await expect(
      asUser(
        client,
        AUTH_A,
        `insert into content_favorites (user_profile_id, content_id) values ($1,$2)`,
        [perfilB, livre],
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('ninguém lê o favorito de outra pessoa pela tabela', async () => {
    await guardar({ conteudo: livre }, AUTH_B)
    const vistoPorA = await asUser(client, AUTH_A, 'select * from content_favorites')
    expect(vistoPorA).toHaveLength(0)
  })

  it('ninguém apaga o favorito de outra pessoa', async () => {
    await guardar({ conteudo: livre }, AUTH_B)
    await asUser(client, AUTH_A, 'delete from content_favorites')
    // `delete` sem alcance não é erro: a RLS some com as linhas, e nada apaga.
    expect(await favoritos(AUTH_B)).toHaveLength(1)
  })

  it('ninguém atualiza um favorito', async () => {
    // Favorito não tem o que atualizar; permitir seria deixar movê-lo de item.
    await guardar({ conteudo: livre })
    await expect(
      asUser(client, AUTH_A, `update content_favorites set content_id = $1`, [doSynse]),
    ).rejects.toThrow(/permission denied/i)
  })

  it('anônimo não guarda nem lê', async () => {
    await expect(
      asUser(client, null, `select toggle_content_favorite($1, null)`, [livre]),
    ).rejects.toThrow(/permission denied/i)
    await expect(asUser(client, null, 'select * from student_favorites()')).rejects.toThrow(
      /permission denied/i,
    )
  })
})

describe.skipIf(!temBanco)('a busca', () => {
  it('o dono do item vem junto, e é o que distingue o acervo do Synse', async () => {
    /*
     * `published_content` não devolve o dono, e o mapeamento carimbava todos
     * com a academia de quem pediu — o selo "Acervo Synse" nunca aparecia em
     * produção, e o e-book da plataforma lia-se como publicação da academia.
     */
    const linhas = await asUser<{ id: string; organizacao_id: string | null }>(
      client,
      AUTH_A,
      `select id, organizacao_id from search_published_content($1, '', 50)`,
      [ALPHA.orgId],
    )
    const porId = new Map(linhas.map((l) => [l.id, l.organizacao_id]))
    expect(porId.get(doSynse)).toBeNull()
    expect(porId.get(livre)).toBe(ALPHA.orgId)
  })

  it('sem termo devolve tudo o que a pessoa pode ver', async () => {
    const tudo = await buscarConteudo('')
    expect(tudo.map((c) => c.id).sort()).toEqual([livre, doSynse].sort())
    // Nem o do Synse+, nem o da concorrente, nem o rascunho.
    expect(tudo.map((c) => c.id)).not.toContain(doPlus)
    expect(tudo.map((c) => c.id)).not.toContain(daBeta)
    expect(tudo.map((c) => c.id)).not.toContain(rascunho)
  })

  it('acento não conta', async () => {
    expect((await buscarReceitas('acai')).map((r) => r.title)).toEqual(['Açaí na tigela'])
    expect((await buscarReceitas('AÇAÍ')).map((r) => r.title)).toEqual(['Açaí na tigela'])
  })

  it('cada palavra casa em separado, em qualquer ordem', async () => {
    /*
     * "treino casa" acha "Treino em casa sem equipamento". Com o termo inteiro
     * de uma vez, só acharia quem digitasse as palavras grudadas e na ordem —
     * que não é como ninguém procura.
     */
    expect((await buscarConteudo('treino casa')).map((c) => c.id)).toEqual([livre])
    expect((await buscarConteudo('casa treino')).map((c) => c.id)).toEqual([livre])
    expect(await buscarConteudo('treino piscina')).toHaveLength(0)
  })

  it('o corpo do texto entra na busca', async () => {
    // Quem procura "creatina" quer o artigo que fala dela, não o que se chama assim.
    const achados = await buscarConteudo('creatina')
    expect(achados.map((c) => c.id)).toEqual([doSynse])
  })

  it('o ingrediente entra na busca da receita', async () => {
    // "o que eu faço com granola" é a pergunta de quem abre o armário.
    expect((await buscarReceitas('granola')).map((r) => r.title)).toEqual(['Açaí na tigela'])
  })

  it('a busca não fura o cadeado', async () => {
    /*
     * A receita do Synse+ tem "abobrinha" nos ingredientes e não pode aparecer
     * para quem não assina — nem como título. A RLS é quem barra; a função não
     * sabe o que é cadeado.
     */
    expect(await buscarReceitas('abobrinha')).toHaveLength(0)
    expect(await buscarConteudo('periodização')).toHaveLength(0)
  })

  it('espaço a mais não muda o resultado', async () => {
    expect((await buscarConteudo('  treino   casa  ')).map((c) => c.id)).toEqual([livre])
    expect((await buscarConteudo('   ')).length).toBeGreaterThan(0)
  })

  it('as duas buscas têm teto', async () => {
    const [{ n: conteudos }] = await asUser<{ n: number }>(
      client,
      AUTH_A,
      `select count(*)::int as n from search_published_content($1, '', 10000)`,
      [ALPHA.orgId],
    )
    // Com dois itens visíveis o teto não aparece no número; o que se confere é
    // que o pedido absurdo não vira varredura — o `limit` é calculado, não o cru.
    expect(conteudos).toBe(2)

    const [{ n: zero }] = await asUser<{ n: number }>(
      client,
      AUTH_A,
      `select count(*)::int as n from search_published_content($1, '', 0)`,
      [ALPHA.orgId],
    )
    // Piso de um: pedido de zero não devolve lista vazia por acidente.
    expect(zero).toBe(1)
  })

  it('a conta da demonstração casa igual ao SQL', async () => {
    /*
     * ── A duplicação necessária, com teste ────────────────────────────────
     *
     * A demonstração não tem banco e repete a regra em JavaScript
     * (`casaTermo`). Os pares abaixo são as bordas: acento dos dois lados,
     * duas palavras fora de ordem, palavra que não casa, termo vazio, espaço
     * a mais, e casamento no meio da palavra.
     */
    const pares: Array<[string, string]> = [
      ['Treino em casa sem equipamento', 'treino casa'],
      ['Treino em casa sem equipamento', 'casa treino'],
      ['Treino em casa sem equipamento', 'treino piscina'],
      ['Açaí na tigela', 'acai'],
      ['Acai na tigela', 'açaí'],
      ['Periodização avançada', 'perio'],
      ['Qualquer coisa', ''],
      ['Qualquer coisa', '   '],
      ['Treino em casa', '  treino   casa  '],
      ['', 'treino'],
      ['Pão de queijo fit', 'pao queijo'],
      ['Coração e corrida', 'coracao'],
    ]

    const { rows } = await client.query(
      `select t.texto, t.termo, casa_termo(t.texto, t.termo) as sql
       from unnest($1::text[], $2::text[]) as t(texto, termo)`,
      [pares.map(([texto]) => texto), pares.map(([, termo]) => termo)],
    )

    expect(rows).toHaveLength(pares.length)
    for (const linha of rows) {
      const daDemonstracao = casaTermo(linha.texto as string, linha.termo as string)
      expect(`${linha.texto} ~ "${linha.termo}" => ${linha.sql}`).toBe(
        `${linha.texto} ~ "${linha.termo}" => ${daDemonstracao}`,
      )
    }
  })

  it('anônimo não busca', async () => {
    await expect(
      asUser(client, null, `select * from search_published_content($1, '', 10)`, [ALPHA.orgId]),
    ).rejects.toThrow(/permission denied/i)
    await expect(asUser(client, null, `select * from search_recipes('', 10)`)).rejects.toThrow(
      /permission denied/i,
    )
  })
})
