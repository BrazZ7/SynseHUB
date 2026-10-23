import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * Os programas guiados (0043).
 *
 * ── O furo que a migration fecha ─────────────────────────────────────────────
 *
 * A 0004 deu ao aluno `for all` em `program_enrollments` com
 * `user_profile_id = auth_profile_id()`, e nada ali conferia se ele pode
 * **ler** o programa. Quem não assina conseguia se matricular num programa
 * `SYNSE_PLUS`: os passos continuavam trancados pela 0038, mas o estado
 * vazava — a tela diria "você está no programa de 90 dias" para quem nunca
 * pagou.
 *
 * ── E a coerência do progresso ──────────────────────────────────────────────
 *
 * `current_day` e `completed_days` precisam andar juntos. Escrita solta
 * deixava os dois discordarem, e discordância de estado aparece depois como
 * defeito de tela que ninguém sabe de onde veio.
 */

let client: Client
const temBanco = await databaseAvailable()

const AUTH_ASSINA = 'bbbb1111-1111-1111-1111-111111111111'
const AUTH_GRATIS = 'bbbb2222-2222-2222-2222-222222222222'

let perfilAssina: string
let plusId: string
let freeId: string

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
    [AUTH_ASSINA, rows[0].user_profile_id, 'assina@prog.test'],
    [AUTH_GRATIS, rows[1].user_profile_id, 'gratis@prog.test'],
  ] as const) {
    await client.query(`insert into auth.users (id, email) values ($1,$2)`, [auth, email])
    await client.query(`update user_profiles set auth_user_id = $1, email = $2 where id = $3`, [
      auth,
      email,
      perfil,
    ])
  }

  const plus = await client.query(
    `insert into programs (code, title, duration_days, visibility)
     values ('SYNSE_21','Programa 21 dias', 21, 'SYNSE_PLUS') returning id`,
  )
  plusId = plus.rows[0].id

  const free = await client.query(
    `insert into programs (code, title, duration_days, visibility)
     values ('LIVRE','Programa aberto', 5, 'FREE') returning id`,
  )
  freeId = free.rows[0].id

  await client.query(
    `insert into program_steps (program_id, day_number, title)
     select $1, g, 'Dia ' || g from generate_series(1, 21) g`,
    [plusId],
  )
}, 60_000)

afterAll(async () => {
  await client?.end()
})

const assinar = (estado: string) =>
  client.query(`select set_plus_subscription($1, $2, now() + interval '30 days')`, [
    perfilAssina,
    estado,
  ])

describe.skipIf(!temBanco)('quem pode entrar num programa', () => {
  it('o assinante entra no programa do Synse+', async () => {
    await assinar('ACTIVE')
    const r = await asUser<{ iniciar_programa: string }>(
      client,
      AUTH_ASSINA,
      `select iniciar_programa($1)`,
      [plusId],
    )
    expect(r[0].iniciar_programa).toBeTruthy()
  })

  it('quem não assina é recusado — e não por falta de linha, por falta de plano', async () => {
    /*
     * O furo da 0004: antes disto, o insert passava. O conteúdo seguia
     * trancado, mas o estado vazava para a tela.
     */
    await expect(
      asUser(client, AUTH_GRATIS, `select iniciar_programa($1)`, [plusId]),
    ).rejects.toThrow(/indispon/i)
  })

  it('e o programa aberto aceita qualquer um', async () => {
    const r = await asUser(client, AUTH_GRATIS, `select iniciar_programa($1)`, [freeId])
    expect(r).toHaveLength(1)
  })

  it('o anônimo não entra em nada', async () => {
    await expect(asUser(client, null, `select iniciar_programa($1)`, [freeId])).rejects.toThrow()
  })

  it('escrever direto na tabela não é mais possível', async () => {
    // A política virou só leitura, e o grant de escrita saiu.
    await expect(
      asUser(
        client,
        AUTH_GRATIS,
        `insert into program_enrollments (program_id, user_profile_id)
         select $1, id from user_profiles where auth_user_id = $2`,
        [plusId, AUTH_GRATIS],
      ),
    ).rejects.toThrow()
  })
})

describe.skipIf(!temBanco)('o progresso', () => {
  const matricula = () =>
    asUser<{ current_day: number; completed_days: number[]; status: string }>(
      client,
      AUTH_ASSINA,
      `select current_day, completed_days, status from program_enrollments
        where program_id = $1`,
      [plusId],
    )

  it('começa no dia 1, sem nada concluído', async () => {
    await assinar('ACTIVE')
    await asUser(client, AUTH_ASSINA, `select iniciar_programa($1)`, [plusId])

    const [m] = await matricula()
    expect(m).toMatchObject({ current_day: 1, completed_days: [], status: 'ACTIVE' })
  })

  it('concluir o dia 1 move para o 2', async () => {
    await asUser(client, AUTH_ASSINA, `select concluir_dia($1, 1::smallint)`, [plusId])
    const [m] = await matricula()
    expect(m.completed_days).toEqual([1])
    expect(m.current_day).toBe(2)
  })

  it('pular um dia aponta de volta para o que ficou devendo', async () => {
    /*
     * `current_day` é o menor dia que falta, não "o último mais um". Quem
     * pula o 2 e faz o 3 continua devendo o 2, e a tela precisa apontar
     * para lá — senão o dia pulado some para sempre.
     */
    await asUser(client, AUTH_ASSINA, `select concluir_dia($1, 3::smallint)`, [plusId])
    const [m] = await matricula()
    expect(m.completed_days).toEqual([1, 3])
    expect(m.current_day).toBe(2)
  })

  it('marcar o mesmo dia duas vezes não conta duas vezes', async () => {
    await asUser(client, AUTH_ASSINA, `select concluir_dia($1, 3::smallint)`, [plusId])
    const [m] = await matricula()
    expect(m.completed_days).toEqual([1, 3])
  })

  it('desfazer devolve o dia e reabre o programa', async () => {
    await asUser(client, AUTH_ASSINA, `select desfazer_dia($1, 3::smallint)`, [plusId])
    const [m] = await matricula()
    expect(m.completed_days).toEqual([1])
    expect(m.status).toBe('ACTIVE')
  })

  it('dia fora da duração é recusado', async () => {
    await expect(
      asUser(client, AUTH_ASSINA, `select concluir_dia($1, 99::smallint)`, [plusId]),
    ).rejects.toThrow(/não existe/i)
    await expect(
      asUser(client, AUTH_ASSINA, `select concluir_dia($1, 0::smallint)`, [plusId]),
    ).rejects.toThrow(/não existe/i)
  })

  it('terminar todos fecha o programa', async () => {
    for (let d = 1; d <= 21; d += 1) {
      await asUser(client, AUTH_ASSINA, `select concluir_dia($1, $2::smallint)`, [plusId, d])
    }
    const [m] = await matricula()
    expect(m.status).toBe('COMPLETED')
    expect(m.completed_days).toHaveLength(21)
  })

  it('recomeçar zera o progresso', async () => {
    // Quem abandonou e volta meses depois não está no dia 14 de nada.
    await asUser(client, AUTH_ASSINA, `select iniciar_programa($1)`, [plusId])
    const [m] = await matricula()
    expect(m).toMatchObject({ current_day: 1, completed_days: [], status: 'ACTIVE' })
  })

  it('perder a assinatura trava o progresso do programa pago', async () => {
    /*
     * A conferência de visibilidade está em `concluir_dia` também, e não só
     * na entrada: assinatura vencida no meio do programa não pode continuar
     * rendendo progresso.
     */
    await assinar('EXPIRED')
    await expect(
      asUser(client, AUTH_ASSINA, `select concluir_dia($1, 1::smallint)`, [plusId]),
    ).rejects.toThrow(/indispon/i)
    await assinar('ACTIVE')
  })
})

describe.skipIf(!temBanco)('a porta de autoria', () => {
  it('o aluno não publica programa', async () => {
    await expect(
      asUser(
        client,
        AUTH_ASSINA,
        `select save_program(null, 'X', 'Meu', null, 10::smallint, null, 'FREE')`,
      ),
    ).rejects.toThrow()
  })

  it('nem grava passo', async () => {
    await expect(
      asUser(client, AUTH_ASSINA, `select save_program_step($1, 1::smallint, 'X', '[]'::jsonb)`, [
        plusId,
      ]),
    ).rejects.toThrow()
  })

  it('a conta de plataforma publica, e a trilha registra', async () => {
    await client.query(`select grant_super_admin('assina@prog.test')`)

    const { rows: antes } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'PROGRAMA'`,
    )

    const r = await asUser<{ save_program: string }>(
      client,
      AUTH_ASSINA,
      `select save_program(null, 'NOVO_30', 'Trinta dias', 'Descrição', 30::smallint, null, 'SYNSE_PLUS')`,
    )
    expect(r[0].save_program).toBeTruthy()

    const { rows: depois } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'PROGRAMA'`,
    )
    expect(depois[0].n).toBe(antes[0].n + 1)

    await client.query(`select revoke_super_admin('assina@prog.test')`)
  })

  it('e recusa passo fora da duração, que ficaria gravado e invisível', async () => {
    await client.query(`select grant_super_admin('assina@prog.test')`)
    await expect(
      asUser(client, AUTH_ASSINA, `select save_program_step($1, 99::smallint, 'X', '[]'::jsonb)`, [
        freeId,
      ]),
    ).rejects.toThrow(/fora da duração/i)
    await client.query(`select revoke_super_admin('assina@prog.test')`)
  })

  it('e recusa visibilidade de academia num programa de plataforma', async () => {
    await client.query(`select grant_super_admin('assina@prog.test')`)
    await expect(
      asUser(
        client,
        AUTH_ASSINA,
        `select save_program(null, 'ORG', 'X', null, 10::smallint, null, 'ORGANIZATION')`,
      ),
    ).rejects.toThrow(/FREE ou SYNSE_PLUS/i)
    await client.query(`select revoke_super_admin('assina@prog.test')`)
  })
})

describe.skipIf(!temBanco)('a vitrine dos programas', () => {
  it('quem não assina vê o anúncio, com nome e duração', async () => {
    // Sem isto a tela de programas abriria em branco para o plano grátis — a
    // mesma prateleira vazia que a 0041 corrigiu no acervo.
    const r = await asUser<{ titulo: string; dias: number }>(
      client,
      AUTH_GRATIS,
      `select titulo, dias from programas_trancados()`,
    )
    expect(r.map((p) => p.titulo)).toContain('Programa 21 dias')
    expect(r[0].dias).toBeGreaterThan(0)
  })

  it('e nunca os dias, que são o conteúdo', async () => {
    const colunas = await asUser<Record<string, unknown>>(
      client,
      AUTH_GRATIS,
      `select * from programas_trancados() limit 1`,
    )
    expect(Object.keys(colunas[0])).toEqual(['id', 'titulo', 'descricao', 'dias'])
  })

  it('o assinante não recebe vitrine — ele já lê o programa', async () => {
    await assinar('ACTIVE')
    expect(await asUser(client, AUTH_ASSINA, `select * from programas_trancados()`)).toHaveLength(0)
  })

  it('nem a conta de plataforma', async () => {
    await assinar('NONE')
    await client.query(`select grant_super_admin('assina@prog.test')`)
    expect(await asUser(client, AUTH_ASSINA, `select * from programas_trancados()`)).toHaveLength(0)
    await client.query(`select revoke_super_admin('assina@prog.test')`)
  })
})

describe.skipIf(!temBanco)('o que cada um enxerga', () => {
  it('quem não assina não vê o programa pago nem os passos dele', async () => {
    const programas = await asUser<{ title: string }>(
      client,
      AUTH_GRATIS,
      `select title from programs order by title`,
    )
    expect(programas.map((p) => p.title)).not.toContain('Programa 21 dias')

    const passos = await asUser(client, AUTH_GRATIS, `select title from program_steps`)
    expect(passos).toHaveLength(0)
  })

  it('o assinante vê os dois', async () => {
    await assinar('ACTIVE')
    const programas = await asUser<{ title: string }>(
      client,
      AUTH_ASSINA,
      `select title from programs order by title`,
    )
    expect(programas.map((p) => p.title)).toContain('Programa 21 dias')
    expect(programas.map((p) => p.title)).toContain('Programa aberto')
  })

  it('a conta de plataforma relê o que publicou, mesmo sem assinar', async () => {
    /*
     * A falta que a 0039 já tinha corrigido no acervo: as políticas da 0038
     * falam de FREE e de assinatura, e a conta de plataforma não cai em
     * nenhum dos dois ramos — publicaria programas que não consegue reler.
     */
    await assinar('NONE')
    await client.query(`select grant_super_admin('assina@prog.test')`)

    const programas = await asUser<{ title: string }>(
      client,
      AUTH_ASSINA,
      `select title from programs where visibility = 'SYNSE_PLUS'`,
    )
    expect(programas.length).toBeGreaterThan(0)

    await client.query(`select revoke_super_admin('assina@prog.test')`)
  })
})

/**
 * ── Apagar o programa ───────────────────────────────────────────────────────
 *
 * `delete_program` existe desde a 0043 e não tinha um teste sequer — pelo
 * mesmo motivo que `apagarProgramaAction` não tinha tela: ninguém a
 * alcançava, então ninguém sentiu falta. Agora que a tela liga o botão, o que
 * ele faz precisa estar escrito.
 *
 * A cascata é o que importa aqui. A 0003 pendura `program_steps` **e**
 * `program_enrollments` em `programs` com `on delete cascade`: um clique na
 * conta de plataforma apaga o progresso de gente que não participou da
 * decisão. Isso tem que ser verdade de propósito, e não por acidente de
 * schema que a próxima migration desfaz sem perceber.
 */
describe.skipIf(!temBanco)('apagar o programa', () => {
  /*
   * Um código por chamada: `programs.code` é único desde a 0003, e os três
   * testes abaixo criam o seu. Reaproveitar o mesmo nome fazia o segundo
   * falhar com "duplicate key" — e um teste que cai por colisão de dado não
   * diz nada sobre o que ele deveria estar provando.
   */
  let sequencia = 0

  async function programaComAluno() {
    sequencia += 1
    const codigo = `PARA_APAGAR_${sequencia}`

    await client.query(`select grant_super_admin('assina@prog.test')`)
    const criado = await asUser<{ save_program: string }>(
      client,
      AUTH_ASSINA,
      `select save_program(null, $1, 'Para apagar', null, 3::smallint, null, 'FREE')`,
      [codigo],
    )
    const id = criado[0].save_program
    await asUser(
      client,
      AUTH_ASSINA,
      `select save_program_step($1, 1::smallint, 'Dia 1', '[]'::jsonb)`,
      [id],
    )
    await client.query(`select revoke_super_admin('assina@prog.test')`)

    // Um aluno de verdade, com progresso de verdade.
    await asUser(client, AUTH_GRATIS, `select iniciar_programa($1)`, [id])
    await asUser(client, AUTH_GRATIS, `select concluir_dia($1, 1::smallint)`, [id])
    return id
  }

  it('aluno comum não apaga', async () => {
    const id = await programaComAluno()
    await expect(asUser(client, AUTH_GRATIS, `select delete_program($1)`, [id])).rejects.toThrow()

    const { rows } = await client.query(`select count(*)::int as n from programs where id = $1`, [
      id,
    ])
    expect(rows[0].n).toBe(1)
  })

  it('a conta de plataforma apaga, e a trilha registra', async () => {
    const id = await programaComAluno()
    await client.query(`select grant_super_admin('assina@prog.test')`)

    const { rows: antes } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'PROGRAMA'`,
    )
    await asUser(client, AUTH_ASSINA, `select delete_program($1)`, [id])
    const { rows: depois } = await client.query(
      `select count(*)::int as n from platform_access_log where context = 'PROGRAMA'`,
    )

    const { rows } = await client.query(`select count(*)::int as n from programs where id = $1`, [
      id,
    ])
    expect(rows[0].n).toBe(0)
    expect(depois[0].n).toBe(antes[0].n + 1)

    await client.query(`select revoke_super_admin('assina@prog.test')`)
  })

  it('e leva junto os dias e o progresso de quem estava fazendo', async () => {
    /*
     * O aviso que a tela dá ao clicar — "o progresso de quem estiver fazendo
     * some junto" — é esta asserção. Se a cascata sumir numa migration
     * futura, o aviso vira mentira e o teste cai antes de alguém ler.
     */
    const id = await programaComAluno()

    const { rows: comAluno } = await client.query(
      `select count(*)::int as n from program_enrollments where program_id = $1`,
      [id],
    )
    expect(comAluno[0].n).toBe(1) // o controle: havia progresso para perder

    await client.query(`select grant_super_admin('assina@prog.test')`)
    await asUser(client, AUTH_ASSINA, `select delete_program($1)`, [id])
    await client.query(`select revoke_super_admin('assina@prog.test')`)

    const { rows: passos } = await client.query(
      `select count(*)::int as n from program_steps where program_id = $1`,
      [id],
    )
    const { rows: matriculas } = await client.query(
      `select count(*)::int as n from program_enrollments where program_id = $1`,
      [id],
    )
    expect(passos[0].n).toBe(0)
    expect(matriculas[0].n).toBe(0)
  })
})
