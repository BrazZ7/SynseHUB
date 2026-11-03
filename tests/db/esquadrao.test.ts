import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O esquadrão (0068).
 *
 * O que estes testes protegem:
 *
 *  - **A fronteira do grupo.** Todas as leituras do lobby são
 *    `security definer` — precisam ser, para somar treino de outra conta — e
 *    por isso a trava de "sou membro?" está escrita na cláusula, não delegada
 *    à RLS. Se ela furar, um id de esquadrão vira a lista de gente de outro
 *    grupo. Metade dos testes daqui é sobre isso.
 *  - **A presença que estraga.** Um "cheguei" vencido não pode aparecer. É o
 *    defeito clássico desta tela e não tem agendador para encobri-lo.
 *  - **O consentimento da 0037.** Entrar no grupo não publica o número de
 *    ninguém.
 *  - **O dono que sai.** Esquadrão sem dono fica sem quem renomeia e remove.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH = {
  ana: '68000000-0000-0000-0000-00000000000a',
  bia: '68000000-0000-0000-0000-00000000000b',
  caio: '68000000-0000-0000-0000-00000000000c',
  dudu: '68000000-0000-0000-0000-00000000000d',
  forasteiro: '68000000-0000-0000-0000-00000000000f',
}
const perfil: Record<keyof typeof AUTH, string> = {} as never
const aluno: Record<string, string> = {}

async function contaDeAluno(nome: keyof typeof AUTH, studentId: string) {
  const { rows } = await client.query(`select user_profile_id from students where id = $1`, [
    studentId,
  ])
  await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
    AUTH[nome],
    `${nome}@squad.test`,
  ])
  await client.query(`update user_profiles set auth_user_id = $1, name = $2 where id = $3`, [
    AUTH[nome],
    nome,
    rows[0].user_profile_id,
  ])
  perfil[nome] = rows[0].user_profile_id
  aluno[nome] = studentId
}

const criar = (nome: string, quem = AUTH.ana) =>
  asUser<{ create_squad: string }>(client, quem, `select create_squad($1) as create_squad`, [
    nome,
  ]).then((r) => r[0].create_squad)

const codigoDe = async (squadId: string) =>
  (await client.query(`select join_code from training_squads where id = $1`, [squadId])).rows[0]
    .join_code as string

const entrar = (codigo: string, quem: string) =>
  asUser<{ join_squad: string }>(client, quem, `select join_squad($1) as join_squad`, [
    codigo,
  ]).then((r) => r[0].join_squad)

type LinhaDoLobby = {
  perfil_id: string
  nome: string
  papel: string
  sou_eu: boolean
  presenca: string | null
  dias_na_semana: number | null
  no_ranking: boolean
}

const lobby = (squadId: string, quem: string) =>
  asUser<LinhaDoLobby>(client, quem, `select * from squad_lobby($1)`, [squadId])

const presenca = (estado: string | null, quem: string) =>
  asUser(client, quem, `select set_presence($1)`, [estado])

const marcar = (
  squadId: string,
  quando: string,
  quem: string,
  titulo: string | null = null,
  plano: string | null = null,
) =>
  asUser<{ schedule_squad_session: string }>(
    client,
    quem,
    `select schedule_squad_session($1,$2,$3,$4) as schedule_squad_session`,
    [squadId, quando, titulo, plano],
  ).then((r) => r[0].schedule_squad_session)

type Sessao = {
  id: string
  title: string | null
  plano_nome: string | null
  cancelado: boolean
  vou: number
  talvez: number
  nao_vou: number
  minha_resposta: string | null
}

const sessoes = (squadId: string, quem: string) =>
  asUser<Sessao>(client, quem, `select * from list_squad_sessions($1, 10)`, [squadId])

const avisosDe = (profileId: string) =>
  client
    .query(
      `select category, title, body from notifications where user_profile_id = $1
       order by created_at`,
      [profileId],
    )
    .then((r) => r.rows as Array<{ category: string; title: string; body: string }>)

const emHoras = (horas: number) => new Date(Date.now() + horas * 3_600_000).toISOString()

let planoAlpha: string
let planoBeta: string

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 5)

  const { rows: alfa } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [ALPHA.orgId],
  )
  const { rows: beta } = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [BETA.orgId],
  )

  await contaDeAluno('ana', alfa[0].id)
  await contaDeAluno('bia', alfa[1].id)
  await contaDeAluno('caio', alfa[2].id)
  // Dudu treina na academia concorrente: o esquadrão atravessa academia.
  await contaDeAluno('dudu', beta[0].id)
  await contaDeAluno('forasteiro', alfa[3].id)

  planoAlpha = (
    await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Treino B — Costas')
       returning id`,
      [ALPHA.orgId],
    )
  ).rows[0].id
  planoBeta = (
    await client.query(
      `insert into workout_plans (organization_id, name) values ($1,'Ficha da concorrente')
       returning id`,
      [BETA.orgId],
    )
  ).rows[0].id
}, 60_000)

beforeEach(async () => {
  if (!temBanco) return
  await client.query(`
    delete from squad_session_rsvp;
    delete from squad_sessions;
    delete from squad_members;
    delete from training_squads;
    delete from member_presence;
    delete from notifications;
    delete from consents;
    delete from workout_sessions;
    delete from check_ins;
    delete from notification_preferences;
  `)
})

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('formar o esquadrão', () => {
  it('quem cria entra como dono', async () => {
    const id = await criar('Os Quatro')
    const linhas = await lobby(id, AUTH.ana)

    expect(linhas).toHaveLength(1)
    expect(linhas[0].papel).toBe('OWNER')
    expect(linhas[0].sou_eu).toBe(true)
  })

  it('entra pelo código, e atravessa academia', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)

    await entrar(codigo, AUTH.bia)
    // Dudu é da academia concorrente — e isso não é exceção, é o desenho.
    await entrar(codigo, AUTH.dudu)

    const linhas = await lobby(id, AUTH.ana)
    expect(linhas.map((l) => l.nome).sort()).toEqual(['ana', 'bia', 'dudu'])
    expect(linhas.filter((l) => l.papel === 'OWNER')).toHaveLength(1)
  })

  it('código errado não entra em lugar nenhum', async () => {
    await criar('Os Quatro')
    await expect(entrar('XXXXXX', AUTH.bia)).rejects.toThrow(/não encontramos nenhum esquadrão/i)
  })

  it('o código não diferencia maiúscula nem espaço', async () => {
    // Quem digita o código ditado pelo amigo não deve ser punido pelo teclado.
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)
    expect(await entrar(` ${codigo.toLowerCase()} `, AUTH.bia)).toBe(id)
  })

  it('entrar duas vezes devolve o mesmo esquadrão', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)
    expect(await entrar(codigo, AUTH.bia)).toBe(id)
    expect(await entrar(codigo, AUTH.bia)).toBe(id)
    expect(await lobby(id, AUTH.ana)).toHaveLength(2)
  })

  it('oito é o teto', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)

    /** Uma conta nova, sem matrícula: para o teto, só o perfil importa. */
    const convidado = async (n: number) => {
      const authId = `68000000-0000-0000-0001-${String(n).padStart(12, '0')}`
      await client.query(`insert into auth.users (id, email) values ($1,$2)`, [
        authId,
        `teto${n}@squad.test`,
      ])
      await client.query(
        `insert into user_profiles (auth_user_id, name, email) values ($1,$2,$3)`,
        [authId, `Convidado ${n}`, `teto${n}@squad.test`],
      )
      return authId
    }

    // A dona e mais sete: oito, o teto cheio.
    for (let i = 0; i < 7; i += 1) await entrar(codigo, await convidado(i))
    expect(await lobby(id, AUTH.ana)).toHaveLength(8)

    // O nono não entra.
    await expect(entrar(codigo, await convidado(99))).rejects.toThrow(/cheio/i)
    expect(await lobby(id, AUTH.ana)).toHaveLength(8)
  })
})

describe.skipIf(!temBanco)('a fronteira do grupo', () => {
  it('quem não é do esquadrão não lê o lobby', async () => {
    /*
     * ── O teste central ───────────────────────────────────────────────────
     *
     * `squad_lobby` é `security definer`: ela enxerga tudo. A trava de "sou
     * membro?" está numa cláusula dentro dela, e se furar, qualquer id de
     * esquadrão vira a lista de gente de outro grupo.
     */
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)

    expect(await lobby(id, AUTH.forasteiro)).toHaveLength(0)
  })

  it('quem não é do esquadrão não lê os treinos marcados', async () => {
    const id = await criar('Os Quatro')
    await marcar(id, emHoras(24), AUTH.ana, 'Pernas')
    expect(await sessoes(id, AUTH.forasteiro)).toHaveLength(0)
  })

  it('as tabelas também não se leem de fora', async () => {
    const id = await criar('Os Quatro')
    await marcar(id, emHoras(24), AUTH.ana)

    const deFora = async (sql: string) => (await asUser(client, AUTH.forasteiro, sql)).length
    expect(await deFora('select * from training_squads')).toBe(0)
    expect(await deFora('select * from squad_members')).toBe(0)
    expect(await deFora('select * from squad_sessions')).toBe(0)
    expect(await deFora('select * from squad_session_rsvp')).toBe(0)
  })

  it('ninguém escreve direto nas tabelas', async () => {
    const id = await criar('Os Quatro')
    await expect(
      asUser(client, AUTH.forasteiro, `insert into squad_members (squad_id, user_profile_id)
        values ($1,$2)`, [id, perfil.forasteiro]),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asUser(client, AUTH.ana, `update training_squads set name = 'Outro' where id = $1`, [id]),
    ).rejects.toThrow(/permission denied/i)
  })

  it('anônimo não cria, não entra e não lê', async () => {
    await expect(asUser(client, null, `select create_squad('X')`)).rejects.toThrow(
      /permission denied/i,
    )
    await expect(asUser(client, null, `select join_squad('ABCDEF')`)).rejects.toThrow(
      /permission denied/i,
    )
    await expect(asUser(client, null, `select my_squads()`)).rejects.toThrow(/permission denied/i)
  })
})

describe.skipIf(!temBanco)('presença', () => {
  it('"cheguei" aparece para o esquadrão', async () => {
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)

    await presenca('CHEGUEI', AUTH.bia)

    const visto = await lobby(id, AUTH.ana)
    expect(visto.find((l) => l.nome === 'bia')?.presenca).toBe('CHEGUEI')
    expect(visto.find((l) => l.nome === 'ana')?.presenca).toBeNull()
  })

  it('presença vencida não é presença', async () => {
    /*
     * ── O defeito que isto impede ─────────────────────────────────────────
     *
     * Sem a validade, o "cheguei" das seis da tarde continua aceso às três da
     * manhã, e o lobby mostra o grupo inteiro na academia de madrugada. Não há
     * agendador limpando nada: quem filtra é a leitura.
     */
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)
    await presenca('CHEGUEI', AUTH.bia)

    await client.query(
      `update member_presence set expires_at = now() - interval '1 minute'
       where user_profile_id = $1`,
      [perfil.bia],
    )

    expect((await lobby(id, AUTH.ana)).find((l) => l.nome === 'bia')?.presenca).toBeNull()
  })

  it('trocar de estado renova o relógio', async () => {
    const id = await criar('Os Quatro')
    await presenca('A_CAMINHO', AUTH.ana)
    await client.query(
      `update member_presence set expires_at = now() + interval '1 minute'
       where user_profile_id = $1`,
      [perfil.ana],
    )

    await presenca('TREINANDO', AUTH.ana)
    const { rows } = await client.query(
      `select state, expires_at > now() + interval '3 hours' as renovou
       from member_presence where user_profile_id = $1`,
      [perfil.ana],
    )
    expect(rows[0].state).toBe('TREINANDO')
    expect(rows[0].renovou).toBe(true)
    expect((await lobby(id, AUTH.ana))[0].presenca).toBe('TREINANDO')
  })

  it('nulo apaga, e é o "já fui"', async () => {
    const id = await criar('Os Quatro')
    await presenca('CHEGUEI', AUTH.ana)
    await presenca(null, AUTH.ana)
    expect((await lobby(id, AUTH.ana))[0].presenca).toBeNull()
  })

  it('estado inventado é recusado', async () => {
    await expect(presenca('DORMINDO', AUTH.ana)).rejects.toThrow(/estado desconhecido/i)
  })

  it('a presença de quem não divide esquadrão não se lê', async () => {
    await presenca('CHEGUEI', AUTH.forasteiro)
    const visto = await asUser(client, AUTH.ana, 'select * from member_presence')
    expect(visto).toHaveLength(0)

    // E a própria sempre se lê, mesmo sem esquadrão nenhum.
    await presenca('CHEGUEI', AUTH.ana)
    expect(await asUser(client, AUTH.ana, 'select * from member_presence')).toHaveLength(1)
  })
})

describe.skipIf(!temBanco)('sair, renomear, remover', () => {
  it('o dono que sai passa a posse para quem entrou primeiro', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)
    await entrar(codigo, AUTH.bia)
    await entrar(codigo, AUTH.caio)

    await asUser(client, AUTH.ana, `select leave_squad($1)`, [id])

    const linhas = await lobby(id, AUTH.bia)
    expect(linhas.map((l) => l.nome).sort()).toEqual(['bia', 'caio'])
    expect(linhas.find((l) => l.papel === 'OWNER')?.nome).toBe('bia')
  })

  it('o último a sair apaga o esquadrão', async () => {
    const id = await criar('Os Quatro')
    await asUser(client, AUTH.ana, `select leave_squad($1)`, [id])

    const { rows } = await client.query(
      `select count(*)::int as n from training_squads where id = $1`,
      [id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('quem não está dentro não sai', async () => {
    const id = await criar('Os Quatro')
    await expect(
      asUser(client, AUTH.forasteiro, `select leave_squad($1)`, [id]),
    ).rejects.toThrow(/não está neste esquadrão/i)
  })

  it('só o dono renomeia', async () => {
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)

    await expect(
      asUser(client, AUTH.bia, `select rename_squad($1,$2)`, [id, 'Os Cinco']),
    ).rejects.toThrow(/só o dono/i)

    await asUser(client, AUTH.ana, `select rename_squad($1,$2)`, [id, 'Os Cinco'])
    const { rows } = await client.query(`select name from training_squads where id = $1`, [id])
    expect(rows[0].name).toBe('Os Cinco')
  })

  it('nome vazio não passa', async () => {
    const id = await criar('Os Quatro')
    await expect(
      asUser(client, AUTH.ana, `select rename_squad($1,$2)`, [id, ' x ']),
    ).rejects.toThrow(/training_squads_name_check|violates check/i)
  })

  it('só o dono remove, e nunca a si mesmo', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)
    await entrar(codigo, AUTH.bia)
    await entrar(codigo, AUTH.caio)

    await expect(
      asUser(client, AUTH.bia, `select remove_squad_member($1,$2)`, [id, perfil.caio]),
    ).rejects.toThrow(/só o dono/i)

    // Nem o dono se remove por aqui: sair tem a regra da sucessão.
    await expect(
      asUser(client, AUTH.ana, `select remove_squad_member($1,$2)`, [id, perfil.ana]),
    ).rejects.toThrow(/use sair/i)

    await asUser(client, AUTH.ana, `select remove_squad_member($1,$2)`, [id, perfil.caio])
    expect((await lobby(id, AUTH.ana)).map((l) => l.nome).sort()).toEqual(['ana', 'bia'])
  })
})

describe.skipIf(!temBanco)('marcar treino', () => {
  it('quem marca já vai, e os outros são avisados', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)
    await entrar(codigo, AUTH.bia)
    await client.query('delete from notifications')

    await marcar(id, emHoras(24), AUTH.ana, 'Pernas', planoAlpha)

    const lista = await sessoes(id, AUTH.ana)
    expect(lista).toHaveLength(1)
    expect(lista[0].title).toBe('Pernas')
    expect(lista[0].plano_nome).toBe('Treino B — Costas')
    expect(lista[0].vou).toBe(1)
    expect(lista[0].minha_resposta).toBe('VOU')

    // O aviso vai para quem não marcou, e na categoria nova.
    const daBia = await avisosDe(perfil.bia)
    expect(daBia).toHaveLength(1)
    expect(daBia[0].category).toBe('SQUAD')
    expect(daBia[0].title).toContain('Treino marcado')
    expect(await avisosDe(perfil.ana)).toHaveLength(0)
  })

  it('a preferência de aviso da 0065 vale para o esquadrão', async () => {
    /*
     * O aviso sai por `notify_profiles`, que é o ponto único — então a
     * categoria nova ganha o interruptor de graça. Este teste é o que prova
     * que "de graça" não é suposição.
     */
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)
    await asUser(client, AUTH.bia, `select set_notification_preference('SQUAD', false)`)
    await client.query('delete from notifications')

    await marcar(id, emHoras(24), AUTH.ana, 'Pernas')
    expect(await avisosDe(perfil.bia)).toHaveLength(0)
  })

  it('treino no passado não é combinado', async () => {
    const id = await criar('Os Quatro')
    await expect(marcar(id, emHoras(-5), AUTH.ana)).rejects.toThrow(/ainda não passou/i)
    // Uma hora de folga para trás: quem marca "agora" não é barrado.
    await expect(marcar(id, emHoras(-0.2), AUTH.ana)).resolves.toBeTruthy()
  })

  it('não dá para mandar ficha de academia alheia', async () => {
    /*
     * `schedule_squad_session` é definer e enxergaria qualquer ficha. A
     * conferência passa por uma função `invoker`, então quem manda o id de
     * uma ficha da concorrente é barrado pela RLS de `workout_plans`.
     */
    const id = await criar('Os Quatro')
    await expect(marcar(id, emHoras(24), AUTH.ana, 'Pernas', planoBeta)).rejects.toThrow(
      /ficha de treino não encontrada/i,
    )
  })

  it('quem não é do esquadrão não marca', async () => {
    const id = await criar('Os Quatro')
    await expect(marcar(id, emHoras(24), AUTH.forasteiro)).rejects.toThrow(
      /não está neste esquadrão/i,
    )
  })

  it('responder é trocar de ideia à vontade', async () => {
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)
    const sessao = await marcar(id, emHoras(24), AUTH.ana)

    await asUser(client, AUTH.bia, `select answer_squad_session($1,$2)`, [sessao, 'TALVEZ'])
    expect((await sessoes(id, AUTH.bia))[0].talvez).toBe(1)

    await asUser(client, AUTH.bia, `select answer_squad_session($1,$2)`, [sessao, 'VOU'])
    const lista = await sessoes(id, AUTH.bia)
    expect(lista[0].vou).toBe(2)
    expect(lista[0].talvez).toBe(0)
    expect(lista[0].minha_resposta).toBe('VOU')
  })

  it('quem é de fora não responde', async () => {
    const id = await criar('Os Quatro')
    const sessao = await marcar(id, emHoras(24), AUTH.ana)
    await expect(
      asUser(client, AUTH.forasteiro, `select answer_squad_session($1,$2)`, [sessao, 'VOU']),
    ).rejects.toThrow(/não é do seu esquadrão/i)
  })

  it('cancelar é de quem marcou ou do dono, e o cartão fica', async () => {
    const id = await criar('Os Quatro')
    const codigo = await codigoDe(id)
    await entrar(codigo, AUTH.bia)
    await entrar(codigo, AUTH.caio)
    const daBia = await marcar(id, emHoras(24), AUTH.bia)

    await expect(
      asUser(client, AUTH.caio, `select cancel_squad_session($1)`, [daBia]),
    ).rejects.toThrow(/só quem marcou ou o dono/i)

    // A dona do esquadrão pode, mesmo sem ter marcado.
    await asUser(client, AUTH.ana, `select cancel_squad_session($1)`, [daBia])
    const lista = await sessoes(id, AUTH.ana)
    expect(lista).toHaveLength(1)
    expect(lista[0].cancelado).toBe(true)
  })

  it('o treino de ontem some, o de hoje fica', async () => {
    const id = await criar('Os Quatro')
    await marcar(id, emHoras(-0.5), AUTH.ana, 'Agora')
    const antigo = await marcar(id, emHoras(24), AUTH.ana, 'Amanhã')
    await client.query(
      `update squad_sessions set starts_at = now() - interval '3 days' where id = $1`,
      [antigo],
    )

    expect((await sessoes(id, AUTH.ana)).map((s) => s.title)).toEqual(['Agora'])
  })
})

describe.skipIf(!temBanco)('a semana do esquadrão', () => {
  const treinou = async (nome: keyof typeof AUTH, quandoDiasAtras: number) => {
    const { rows } = await client.query(
      `select organization_id from students where id = $1`,
      [aluno[nome]],
    )
    await client.query(
      `insert into workout_sessions
         (organization_id, student_id, client_id, status, started_at, completed_at, duration_seconds)
       values ($1,$2,$3,'COMPLETED', $4, $4, 3600)`,
      [
        rows[0].organization_id,
        aluno[nome],
        `sq-${nome}-${quandoDiasAtras}-${Math.random()}`,
        new Date(Date.now() - quandoDiasAtras * 3_600_000).toISOString(),
      ],
    )
  }

  const consentir = (nome: keyof typeof AUTH) =>
    client.query(
      `insert into consents (user_profile_id, consent_type, accepted, version, accepted_at)
       values ($1,'RANKING_VISIBILITY', true, 'v1', now())`,
      [perfil[nome]],
    )

  it('sem consentimento, o número da outra pessoa não aparece', async () => {
    /*
     * A regra da 0037, aplicada aqui: entrar no grupo não é autorizar a
     * publicação do próprio desempenho. Nulo e não zero — zero seria uma
     * afirmação sobre a semana de quem não autorizou afirmação nenhuma.
     */
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)
    await treinou('bia', 2)

    const visto = await lobby(id, AUTH.ana)
    const linhaDaBia = visto.find((l) => l.nome === 'bia')
    expect(linhaDaBia?.dias_na_semana).toBeNull()
    expect(linhaDaBia?.no_ranking).toBe(false)
  })

  it('com consentimento, aparece', async () => {
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)
    await consentir('bia')
    await treinou('bia', 2)
    await treinou('bia', 3)

    const linhaDaBia = (await lobby(id, AUTH.ana)).find((l) => l.nome === 'bia')
    // Dois treinos no mesmo dia contam um dia.
    expect(linhaDaBia?.dias_na_semana).toBe(1)
    expect(linhaDaBia?.no_ranking).toBe(true)
  })

  it('o próprio número aparece sempre: ele não é publicação', async () => {
    const id = await criar('Os Quatro')
    await treinou('ana', 2)

    const minha = (await lobby(id, AUTH.ana))[0]
    expect(minha.sou_eu).toBe(true)
    expect(minha.dias_na_semana).toBe(1)
    expect(minha.no_ranking).toBe(false)
  })

  it('o check-in também conta como dia treinado', async () => {
    const id = await criar('Os Quatro')
    await client.query(
      `insert into check_ins (organization_id, student_id, checked_in_at) values ($1,$2, now())`,
      [ALPHA.orgId, aluno.ana],
    )
    expect((await lobby(id, AUTH.ana))[0].dias_na_semana).toBe(1)
  })
})

describe.skipIf(!temBanco)('a lista de esquadrões', () => {
  it('traz o que a lista precisa sem abrir cada um', async () => {
    const id = await criar('Os Quatro')
    await entrar(await codigoDe(id), AUTH.bia)
    await presenca('CHEGUEI', AUTH.bia)
    await marcar(id, emHoras(30), AUTH.ana)

    const [meu] = await asUser<{
      nome: string
      papel: string
      membros: number
      presentes: number
      proxima_em: Date | null
    }>(client, AUTH.ana, 'select * from my_squads()')

    expect(meu.nome).toBe('Os Quatro')
    expect(meu.papel).toBe('OWNER')
    expect(meu.membros).toBe(2)
    expect(meu.presentes).toBe(1)
    expect(meu.proxima_em).not.toBeNull()
  })

  it('não lista o esquadrão de quem não sou', async () => {
    await criar('Os Quatro', AUTH.ana)
    expect(await asUser(client, AUTH.forasteiro, 'select * from my_squads()')).toHaveLength(0)
  })

  it('treino cancelado não conta como próximo', async () => {
    const id = await criar('Os Quatro')
    const sessao = await marcar(id, emHoras(30), AUTH.ana)
    await asUser(client, AUTH.ana, `select cancel_squad_session($1)`, [sessao])

    const [meu] = await asUser<{ proxima_em: Date | null }>(
      client,
      AUTH.ana,
      'select * from my_squads()',
    )
    expect(meu.proxima_em).toBeNull()
  })
})
