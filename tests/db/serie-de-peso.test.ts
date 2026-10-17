import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * ── A série do gráfico de peso (0052) ───────────────────────────────────────
 *
 * As pesagens eram lidas sem teto, em ordem decrescente — e o corte silencioso
 * do PostgREST descarta o fim da ordem, que aqui é o **mais antigo**. O
 * gráfico nascia no meio do caminho e a contagem vinha menor, enquanto o peso
 * de hoje continuava certo. O defeito ficava invisível justamente na parte que
 * a pessoa confere.
 *
 * ── O que estes testes protegem ─────────────────────────────────────────────
 *
 * 1. **Um ponto por balde**, e o escolhido é a **última** pesagem dele — não a
 *    média, que seria um número que ninguém viu na balança.
 * 2. **`medicoes` conta o balde inteiro**, para a tela poder dizer que resumiu.
 * 3. **A janela recorta**, e o balde muda o número de pontos sem mudar o dado.
 * 4. **Perfil nulo é o de quem chama**, e passar o de outra pessoa só funciona
 *    com autorização — quem decide é a RLS da 0032, não a função.
 * 5. **Sem pesagem, zero linhas** — gráfico que não existe, não um zero.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ALUNO = 'eeee1111-1111-1111-1111-111111111111'
const AUTH_PROF = 'eeee2222-2222-2222-2222-222222222222'
const AUTH_ESTRANHO = 'eeee3333-3333-3333-3333-333333333333'

let perfilAluno = ''
let perfilProf = ''

/**
 * Três pesagens no mesmo dia e três em dias diferentes, de propósito.
 *
 * Com uma por dia, agrupar por dia e não agrupar dariam o mesmo número de
 * pontos, e o teste passaria sem provar nada.
 */
const PESAGENS: Array<{ dias: number; hora: number; peso: number }> = [
  { dias: 0, hora: 7, peso: 80.0 },
  { dias: 0, hora: 13, peso: 80.6 },
  { dias: 0, hora: 21, peso: 81.2 },
  { dias: 1, hora: 7, peso: 80.4 },
  { dias: 9, hora: 7, peso: 82.0 },
  { dias: 40, hora: 7, peso: 84.5 },
  { dias: 200, hora: 7, peso: 88.0 },
]

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const { rows: alunos } = await client.query(
    `select user_profile_id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  perfilAluno = alunos[0].user_profile_id
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH_ALUNO,
    'aluno@serie.test',
  ])
  await client.query(`update user_profiles set auth_user_id = $1, email = $2 where id = $3`, [
    AUTH_ALUNO,
    'aluno@serie.test',
    perfilAluno,
  ])

  for (const [auth, email, nome] of [
    [AUTH_PROF, 'prof@serie.test', 'Professora'],
    [AUTH_ESTRANHO, 'estranho@serie.test', 'Estranho'],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    const { rows } = await client.query(
      `insert into user_profiles (name, email, auth_user_id) values ($1,$2,$3) returning id`,
      [nome, email, auth],
    )
    if (auth === AUTH_PROF) perfilProf = rows[0].id
  }

  /*
   * Inserção direta, e não por `record_body_measurement`: a função resolve o
   * dono pelo `auth.uid()` e não deixa escolher a data livremente, e o que
   * este arquivo precisa é de um histórico com datas controladas.
   */
  for (const [i, p] of PESAGENS.entries()) {
    await client.query(
      /*
       * Ancorado em `date_trunc('day', now())`, e não em `now()`: somar 21
       * horas ao relógio joga a pesagem para o dia seguinte quando o teste
       * roda de tarde, e aí as "três do mesmo dia" caem em dois. Foi o que
       * aconteceu na primeira versão deste arquivo — e o teste pegou.
       */
      `insert into body_measurements (user_profile_id, measured_at, weight_kg, client_id, source)
       values ($1,
               date_trunc('day', now()) - ($2::int * interval '1 day') + ($3::int * interval '1 hour'),
               $4, $5, 'MANUAL')`,
      [perfilAluno, p.dias, p.hora, p.peso, `serie-${i}`],
    )
  }

  /* A professora é autorizada; o estranho, não. */
  await client.query(
    `insert into body_measurement_shares (user_profile_id, shared_with_profile_id)
     values ($1, $2)`,
    [perfilAluno, perfilProf],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

type Ponto = { instante: string; peso: string; medicoes: string }

const serie = (authId: string | null, perfil: string | null, dias: number | null, balde: string) =>
  asUser<Ponto>(
    client,
    authId,
    `select * from serie_de_peso(
       $1::uuid,
       case when $2::int is null then null else now() - ($2::int * interval '1 day') end,
       $3::text
     )`,
    [perfil, dias, balde],
  )

describe.skipIf(!temBanco)('serie_de_peso', () => {
  it('devolve um ponto por dia, não um por pesagem', async () => {
    const pontos = await serie(AUTH_ALUNO, null, 365, 'day')

    /* Sete pesagens em cinco dias distintos. */
    const diasDistintos = new Set(PESAGENS.map((p) => p.dias)).size
    expect(PESAGENS.length).toBeGreaterThan(diasDistintos)
    expect(pontos).toHaveLength(diasDistintos)
  })

  it('escolhe a última pesagem do balde, e não a média', async () => {
    const pontos = await serie(AUTH_ALUNO, null, 365, 'day')
    const hoje = pontos[pontos.length - 1]

    /*
     * Hoje teve 80,0 às 7h, 80,6 às 13h e 81,2 às 21h. A média seria 80,6 —
     * um número que a balança nunca mostrou. O ponto é 81,2.
     */
    const deHoje = PESAGENS.filter((p) => p.dias === 0)
    const ultima = deHoje.reduce((a, b) => (b.hora > a.hora ? b : a))
    const media = deHoje.reduce((s, p) => s + p.peso, 0) / deHoje.length

    expect(Number(hoje.peso)).toBe(ultima.peso)
    expect(Number(hoje.peso)).not.toBe(media)
  })

  it('conta quantas pesagens entraram em cada ponto', async () => {
    const pontos = await serie(AUTH_ALUNO, null, 365, 'day')
    const hoje = pontos[pontos.length - 1]

    expect(Number(hoje.medicoes)).toBe(PESAGENS.filter((p) => p.dias === 0).length)
    /* Um dia com uma pesagem só conta um — a janela não infla o número. */
    const ontem = pontos[pontos.length - 2]
    expect(Number(ontem.medicoes)).toBe(1)
  })

  it('vem em ordem crescente, que é como o gráfico lê', async () => {
    const pontos = await serie(AUTH_ALUNO, null, 365, 'day')
    const instantes = pontos.map((p) => new Date(p.instante).getTime())
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b))
  })

  it('a janela recorta, e o balde muda o número de pontos sem mudar o dado', async () => {
    const umMes = await serie(AUTH_ALUNO, null, 30, 'day')
    const umAno = await serie(AUTH_ALUNO, null, 365, 'day')
    const porSemana = await serie(AUTH_ALUNO, null, 365, 'week')

    /* 30 dias deixam de fora as de 40 e 200 dias atrás. */
    expect(umMes.length).toBeLessThan(umAno.length)
    expect(umMes).toHaveLength(
      new Set(PESAGENS.filter((p) => p.dias <= 30).map((p) => p.dias)).size,
    )

    /* A semana agrupa hoje e ontem num ponto só; o peso mais novo continua o mesmo. */
    expect(porSemana.length).toBeLessThan(umAno.length)
    expect(Number(porSemana[porSemana.length - 1].peso)).toBe(Number(umAno[umAno.length - 1].peso))
  })

  it('sem janela, traz a vida inteira', async () => {
    const tudo = await serie(AUTH_ALUNO, null, null, 'month')
    /* 0, 1, 9 e 40 dias atrás podem cair em 2 ou 3 meses; 200 cai noutro. */
    expect(tudo.length).toBeGreaterThanOrEqual(2)
    expect(Number(tudo[0].peso)).toBe(88.0)
  })

  it('perfil nulo é o de quem chama', async () => {
    const implicito = await serie(AUTH_ALUNO, null, 365, 'day')
    const explicito = await serie(AUTH_ALUNO, perfilAluno, 365, 'day')
    expect(explicito).toEqual(implicito)
  })

  it('a professora autorizada enxerga; o estranho não', async () => {
    const autorizada = await serie(AUTH_PROF, perfilAluno, 365, 'day')
    expect(autorizada.length).toBeGreaterThan(0)

    /*
     * O estranho recebe zero linhas, e não erro: é a RLS filtrando, e é de
     * propósito que a resposta não distinga "não autorizado" de "nunca pesou".
     * Quem distingue é a tela, pela autorização — dizer "há 14 pesagens que
     * você não pode ver" já contaria parte do que a autorização guarda.
     */
    const negado = await serie(AUTH_ESTRANHO, perfilAluno, 365, 'day')
    expect(negado).toHaveLength(0)
  })

  it('revogar fecha a porta na hora', async () => {
    await client.query(
      `update body_measurement_shares set revoked_at = now()
        where user_profile_id = $1 and shared_with_profile_id = $2`,
      [perfilAluno, perfilProf],
    )
    try {
      expect(await serie(AUTH_PROF, perfilAluno, 365, 'day')).toHaveLength(0)
    } finally {
      await client.query(
        `update body_measurement_shares set revoked_at = null
          where user_profile_id = $1 and shared_with_profile_id = $2`,
        [perfilAluno, perfilProf],
      )
    }
  })

  it('sem pesagem nenhuma, zero linhas — e não uma linha zerada', async () => {
    const vazio = await serie(AUTH_PROF, perfilProf, 365, 'day')
    expect(vazio).toHaveLength(0)
  })

  it('não existe para quem não entrou', async () => {
    await expect(serie(null, perfilAluno, 365, 'day')).rejects.toThrow(
      /permission denied|permissão/i,
    )
  })
})
