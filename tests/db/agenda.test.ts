import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  ALPHA,
  BETA,
  applyMigrations,
  asUser,
  connect,
  databaseAvailable,
  seedTwoGyms,
} from './helpers'

/**
 * A agenda de aulas.
 *
 * O teste que justifica o arquivo é o da última vaga. Contar reservas e depois
 * inserir é uma corrida — dois alunos leem 19 de 20 e os dois entram —, e o
 * sintoma chega como sala com gente em pé, dias depois, sem nada no log.
 * Aqui ela é provocada de propósito, com duas conexões de verdade.
 */

let client: Client
const temBanco = await databaseAvailable()
let alunos: string[] = []
let alunosBeta: string[] = []
let perfis: Record<string, string> = {}

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 4)

  const { rows } = await client.query(
    `select s.id, s.user_profile_id from students s
     where s.organization_id = $1 order by s.id`,
    [ALPHA.orgId],
  )
  alunos = rows.map((r) => r.id)
  perfis = Object.fromEntries(rows.map((r) => [r.id, r.user_profile_id]))

  const beta = await client.query(
    `select id from students where organization_id = $1 order by id`,
    [BETA.orgId],
  )
  alunosBeta = beta.rows.map((r) => r.id)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

/** Uma aula avulsa, daqui a uma hora, com a capacidade pedida. */
async function criarAula(capacidade: number, org = ALPHA.orgId, daquiHoras = 1) {
  const { rows } = await client.query(
    `insert into class_sessions (organization_id, name, starts_at, ends_at, capacity)
     values ($1, 'Spinning', now() + make_interval(hours => $3), now() + make_interval(hours => $3 + 1), $2)
     returning id`,
    [org, capacidade, daquiHoras],
  )
  return rows[0].id as string
}

/**
 * Reserva como a recepção da Alpha reservaria: com sessão de gente da equipe.
 *
 * A primeira versão deste helper chamava `book_class` sem sessão nenhuma, como
 * superusuário, e passava — porque `is_org_staff` devolve NULL para quem não
 * tem sessão e o `not NULL` da função não disparava. Os testes ficavam verdes
 * sobre um furo de autorização. Sessão de verdade é o que os torna honestos.
 */
const reservar = async (aulaId: string, alunoId: string) => {
  const rows = await asUser<{ status: string }>(
    client,
    ALPHA.authId,
    `select book_class($1, $2) as status`,
    [aulaId, alunoId],
  )
  return rows[0].status
}

const reservasDa = async (aulaId: string) => {
  const { rows } = await client.query(
    `select status, count(*)::int as total from class_bookings
     where session_id = $1 group by status order by status`,
    [aulaId],
  )
  return Object.fromEntries(rows.map((r) => [r.status, r.total])) as Record<string, number>
}

describe.skipIf(!temBanco)('materialização da grade', () => {
  it('cria a aula no dia da semana e na hora local da academia', async () => {
    // Quarta-feira às 19h. A hora é local: "quarta 19h" é 19h em São Paulo,
    // não 19h UTC, que seria 16h para o aluno.
    await client.query(
      `insert into class_schedules (organization_id, name, weekday, start_time, capacity, starts_on)
       values ($1, 'Spinning', 3, '19:00', 20, current_date)`,
      [ALPHA.orgId],
    )

    const criadas = await client.query(`select generate_class_sessions(21) as total`)
    expect(criadas.rows[0].total).toBeGreaterThan(0)

    const { rows } = await client.query(
      `select
         extract(dow from starts_at at time zone 'America/Sao_Paulo')::int as dia,
         to_char(starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
         extract(epoch from (ends_at - starts_at))::int as duracao
       from class_sessions
       where organization_id = $1 and schedule_id is not null`,
      [ALPHA.orgId],
    )

    expect(rows.length).toBeGreaterThan(0)
    for (const aula of rows) {
      expect(aula.dia).toBe(3)
      expect(aula.hora).toBe('19:00')
      expect(aula.duracao).toBe(3600)
    }
  })

  it('rodar de novo não duplica: a janela é idempotente', async () => {
    const antes = await client.query(
      `select count(*)::int as total from class_sessions where schedule_id is not null`,
    )
    const criadas = await client.query(`select generate_class_sessions(21) as total`)
    const depois = await client.query(
      `select count(*)::int as total from class_sessions where schedule_id is not null`,
    )

    expect(criadas.rows[0].total).toBe(0)
    expect(depois.rows[0].total).toBe(antes.rows[0].total)
  })

  it('regra arquivada e regra vencida não geram aula', async () => {
    await client.query(
      `insert into class_schedules (organization_id, name, weekday, start_time, capacity, status)
       values ($1, 'Aula arquivada', 1, '07:00', 10, 'ARCHIVED')`,
      [ALPHA.orgId],
    )
    await client.query(
      `insert into class_schedules (organization_id, name, weekday, start_time, capacity, starts_on, ends_on)
       values ($1, 'Aula encerrada', 1, '08:00', 10, current_date - 60, current_date - 30)`,
      [ALPHA.orgId],
    )

    await client.query(`select generate_class_sessions(21)`)

    const { rows } = await client.query(
      `select count(*)::int as total from class_sessions
       where name in ('Aula arquivada','Aula encerrada')`,
    )
    expect(rows[0].total).toBe(0)
  })

  it('a janela não inventa aula antes do início da regra', async () => {
    await client.query(
      `insert into class_schedules (organization_id, name, weekday, start_time, capacity, starts_on)
       values ($1, 'Começa depois', 5, '06:00', 10, current_date + 90)`,
      [ALPHA.orgId],
    )
    await client.query(`select generate_class_sessions(21)`)

    const { rows } = await client.query(
      `select count(*)::int as total from class_sessions where name = 'Começa depois'`,
    )
    expect(rows[0].total).toBe(0)
  })
})

describe.skipIf(!temBanco)('quem pode mandar materializar', () => {
  it('a equipe gera as aulas da própria academia', async () => {
    /*
     * A recepção acabou de cadastrar a aula de amanhã e precisa vê-la agora,
     * sem esperar a rotina da madrugada. A primeira versão desta migration só
     * dava a função ao service_role, e a tela salvava a regra e não criava aula
     * nenhuma — a grade aparecia vazia até o dia seguinte.
     */
    await client.query(
      `insert into class_schedules (organization_id, name, weekday, start_time, capacity)
       values ($1, 'Pilates', 2, '10:00', 8)`,
      [ALPHA.orgId],
    )

    const criadas = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select generate_org_class_sessions($1, 14)::int as total`,
      [ALPHA.orgId],
    )
    expect(criadas[0].total).toBeGreaterThan(0)
  })

  it('e não as de outra academia', async () => {
    await expect(
      asUser(client, ALPHA.authId, `select generate_org_class_sessions($1, 14)`, [BETA.orgId]),
    ).rejects.toThrow(/não é da equipe/i)
  })

  it('a varredura global não é da conta de quem está logado', async () => {
    // Ela varre todas as academias da plataforma: é do agendamento diário, que
    // roda como service_role. Aberta ao autenticado, qualquer conta dispararia
    // a geração da base inteira.
    await expect(
      asUser(client, ALPHA.authId, `select generate_class_sessions(14)`),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})

describe.skipIf(!temBanco)('reserva e lista de espera', () => {
  it('enche até a capacidade e manda o excedente para a espera', async () => {
    const aula = await criarAula(2)

    expect(await reservar(aula, alunos[0])).toBe('BOOKED')
    expect(await reservar(aula, alunos[1])).toBe('BOOKED')
    expect(await reservar(aula, alunos[2])).toBe('WAITLIST')

    expect(await reservasDa(aula)).toEqual({ BOOKED: 2, WAITLIST: 1 })
  })

  it('booked_count acompanha a contagem real', async () => {
    const aula = await criarAula(3)
    await reservar(aula, alunos[0])
    await reservar(aula, alunos[1])

    const { rows } = await client.query(
      `select booked_count from class_sessions where id = $1`,
      [aula],
    )
    expect(rows[0].booked_count).toBe(2)
  })

  it('reservar duas vezes devolve a reserva que já existe, sem duplicar', async () => {
    const aula = await criarAula(5)
    expect(await reservar(aula, alunos[0])).toBe('BOOKED')
    expect(await reservar(aula, alunos[0])).toBe('BOOKED')

    expect(await reservasDa(aula)).toEqual({ BOOKED: 1 })
  })

  it('cancelar chama quem está esperando e avisa a pessoa', async () => {
    const aula = await criarAula(1)
    await reservar(aula, alunos[0])
    await reservar(aula, alunos[1])

    const { rows: reserva } = await client.query(
      `select id from class_bookings where session_id = $1 and student_id = $2`,
      [aula, alunos[0]],
    )
    await asUser(client, ALPHA.authId, `select cancel_class_booking($1)`, [reserva[0].id])

    const { rows } = await client.query(
      `select status from class_bookings where session_id = $1 and student_id = $2`,
      [aula, alunos[1]],
    )
    expect(rows[0].status).toBe('BOOKED')

    // E soube disso: promoção silenciosa é vaga que ninguém ocupa.
    const aviso = await client.query(
      `select count(*)::int as total from notifications
       where user_profile_id = $1 and title like 'Vaga liberada%'`,
      [perfis[alunos[1]]],
    )
    expect(aviso.rows[0].total).toBe(1)
  })

  it('a fila anda mesmo quando ninguém chama a função de cancelar', async () => {
    /*
     * O cancelamento também chega por UPDATE direto — a tela da recepção, um
     * SQL de suporte. Se a promoção morasse na função, a fila pararia nesses
     * caminhos e ninguém perceberia.
     */
    const aula = await criarAula(1)
    await reservar(aula, alunos[0])
    await reservar(aula, alunos[2])

    await client.query(
      `update class_bookings set status = 'CANCELLED'
       where session_id = $1 and student_id = $2`,
      [aula, alunos[0]],
    )

    const { rows } = await client.query(
      `select status from class_bookings where session_id = $1 and student_id = $2`,
      [aula, alunos[2]],
    )
    expect(rows[0].status).toBe('BOOKED')
  })
})

describe.skipIf(!temBanco)('a última vaga, com duas pessoas ao mesmo tempo', () => {
  it('serializa: uma entra, a outra vai para a espera', async () => {
    const aula = await criarAula(1)

    const primeira = await connect()
    const segunda = await connect()

    try {
      for (const conexao of [primeira, segunda]) {
        await conexao.query('begin')
        await conexao.query('select set_config($1, $2, true)', [
          'request.jwt.claim.sub',
          ALPHA.authId,
        ])
        await conexao.query('set local role authenticated')
      }

      // A primeira reserva e SEGURA a trava da aula, sem commitar.
      const r1 = await primeira.query(`select book_class($1, $2) as status`, [aula, alunos[0]])
      expect(r1.rows[0].status).toBe('BOOKED')

      /*
       * A segunda dispara enquanto a primeira ainda está aberta. Sem o
       * `for update` na linha da aula ela leria zero ocupadas e entraria
       * também — é exatamente esse o defeito que este teste provoca.
       */
      const corrida = segunda.query(`select book_class($1, $2) as status`, [aula, alunos[1]])

      await primeira.query('commit')
      const r2 = await corrida
      await segunda.query('commit')

      expect(r2.rows[0].status).toBe('WAITLIST')
      expect(await reservasDa(aula)).toEqual({ BOOKED: 1, WAITLIST: 1 })
    } finally {
      await primeira.end()
      await segunda.end()
    }
  }, 20_000)

  it('insert cru também respeita a lotação, não só a função', async () => {
    // A trava vive no gatilho, não na função: quem escrever por fora esbarra
    // nela do mesmo jeito.
    const aula = await criarAula(1)
    await reservar(aula, alunos[0])

    await expect(
      client.query(
        `insert into class_bookings (organization_id, session_id, student_id, status)
         values ($1, $2, $3, 'BOOKED')`,
        [ALPHA.orgId, aula, alunos[1]],
      ),
    ).rejects.toThrow(/lotada/i)
  })
})

describe.skipIf(!temBanco)('o que a reserva recusa', () => {
  it('aula cancelada não aceita reserva', async () => {
    const aula = await criarAula(10)
    await client.query(`update class_sessions set status = 'CANCELLED' where id = $1`, [aula])

    await expect(reservar(aula, alunos[0])).rejects.toThrow(/cancelada/i)
  })

  it('aula que já começou não aceita reserva', async () => {
    const { rows } = await client.query(
      `insert into class_sessions (organization_id, name, starts_at, ends_at, capacity)
       values ($1, 'Passada', now() - interval '2 hours', now() - interval '1 hour', 10)
       returning id`,
      [ALPHA.orgId],
    )
    await expect(reservar(rows[0].id, alunos[0])).rejects.toThrow(/já começou/i)
  })

  it('matrícula cancelada não ocupa vaga', async () => {
    const aula = await criarAula(10)
    await client.query(`update students set status = 'CANCELLED' where id = $1`, [alunos[3]])

    await expect(reservar(aula, alunos[3])).rejects.toThrow(/sem acesso/i)

    await client.query(`update students set status = 'ACTIVE' where id = $1`, [alunos[3]])
  })

  it('inadimplente continua entrando: bloquear por atraso é decisão da academia', async () => {
    const aula = await criarAula(10)
    await client.query(`update students set status = 'OVERDUE' where id = $1`, [alunos[3]])

    expect(await reservar(aula, alunos[3])).toBe('BOOKED')

    await client.query(`update students set status = 'ACTIVE' where id = $1`, [alunos[3]])
  })

  it('aluno de outra academia não entra na aula desta', async () => {
    const aula = await criarAula(10)
    await expect(reservar(aula, alunosBeta[0])).rejects.toThrow(/não encontrado/i)
  })
})

describe.skipIf(!temBanco)('aula cancelada', () => {
  it('avisa quem ia e desfaz as reservas, sem apagá-las', async () => {
    const aula = await criarAula(5)
    await reservar(aula, alunos[0])
    await reservar(aula, alunos[1])

    await client.query(
      `update class_sessions set status = 'CANCELLED', cancellation_reason = 'Professor doente'
       where id = $1`,
      [aula],
    )

    expect(await reservasDa(aula)).toEqual({ CANCELLED: 2 })

    const { rows } = await client.query(
      `select body from notifications
       where user_profile_id = $1 and title like '%foi cancelada%'`,
      [perfis[alunos[0]]],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toContain('Professor doente')
  })
})

describe.skipIf(!temBanco)('quem enxerga a agenda', () => {
  it('academia nenhuma lê a grade de outra', async () => {
    await criarAula(10, BETA.orgId)

    const daAlpha = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select count(*)::int as total from class_sessions where organization_id = $1`,
      [BETA.orgId],
    )
    expect(daAlpha[0].total).toBe(0)
  })

  it('o aluno vê a grade da própria academia', async () => {
    const { rows } = await client.query(
      `select p.auth_user_id, u.id as profile_id from students s
       join user_profiles u on u.id = s.user_profile_id
       join user_profiles p on p.id = u.id
       where s.id = $1`,
      [alunos[0]],
    )
    // O aluno da semente não tem conta de autenticação; damos uma a ele.
    const authId = '33333333-3333-3333-3333-333333333333'
    await client.query(`insert into auth.users (id, email) values ($1,'aluno@alpha.test')
                        on conflict do nothing`, [authId])
    await client.query(`update user_profiles set auth_user_id = $1 where id = $2`, [
      authId,
      rows[0].profile_id,
    ])
    await client.query(
      `insert into organization_members (organization_id, user_profile_id, role)
       values ($1, $2, 'STUDENT') on conflict do nothing`,
      [ALPHA.orgId, rows[0].profile_id],
    )

    const vistas = await asUser<{ total: number }>(
      client,
      authId,
      `select count(*)::int as total from class_sessions where organization_id = $1`,
      [ALPHA.orgId],
    )
    expect(vistas[0].total).toBeGreaterThan(0)
  })

  it('a reserva de um aluno não é da conta do outro', async () => {
    const authId = '33333333-3333-3333-3333-333333333333'
    const minhas = await asUser<{ student_id: string }>(
      client,
      authId,
      `select distinct student_id from class_bookings`,
    )
    for (const linha of minhas) expect(linha.student_id).toBe(alunos[0])
  })

  it('o aluno não escreve reserva na mão: a fila de espera seria pulada', async () => {
    const authId = '33333333-3333-3333-3333-333333333333'
    const aula = await criarAula(1)
    await reservar(aula, alunos[1])

    await expect(
      asUser(
        client,
        authId,
        `insert into class_bookings (organization_id, session_id, student_id, status)
         values ($1, $2, $3, 'BOOKED')`,
        [ALPHA.orgId, aula, alunos[0]],
      ),
    ).rejects.toThrow(/permission denied|permissão/i)
  })
})
