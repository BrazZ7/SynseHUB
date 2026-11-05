import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ALPHA, BETA, applyMigrations, asUser, connect, databaseAvailable, seedTwoGyms } from './helpers'

/**
 * O reparo da 0025, contra o banco que realmente existe lá fora.
 *
 * A 0024 foi publicada, aplicada em produção e só então revisada. Testar a 0025
 * contra o schema já corrigido não prova nada — as definições seriam idênticas e
 * o teste passaria sem exercitar reparo nenhum.
 *
 * Então aqui o defeito é reinstalado de propósito: as funções voltam à versão
 * antiga, o furo é confirmado abrindo de verdade, a 0025 roda, e o furo é
 * confirmado fechado. É a única forma de saber que colar aquele arquivo no
 * Supabase resolve.
 */

let client: Client
const temBanco = await databaseAvailable()
let alunoAlpha: string
let alunoBeta: string
let aula: string

const migration = (nome: string) =>
  readFileSync(join(process.cwd(), 'src/db/migrations', nome), 'utf8')

/** As definições exatamente como foram para produção na primeira 0024. */
const VERSAO_ANTIGA = `
create or replace function book_class(p_session_id uuid, p_student_id uuid default null)
returns class_booking_status
language plpgsql volatile security definer set search_path = public as $$
declare
  v_aula class_sessions; v_student students; v_status class_booking_status;
begin
  select * into v_aula from class_sessions where id = p_session_id for update;
  if not found then raise exception 'Aula não encontrada.' using errcode = 'P0002'; end if;

  if p_student_id is null then
    select s.* into v_student from students s
    join user_profiles p on p.id = s.user_profile_id
    where p.auth_user_id = auth.uid() and s.organization_id = v_aula.organization_id;
    if not found then raise exception 'Você não é aluno desta academia.' using errcode = '42501'; end if;
  else
    -- O defeito: 'not NULL' não é verdadeiro, então quem não é da equipe passa.
    if not is_org_staff(v_aula.organization_id) then
      raise exception 'Só a equipe reserva em nome de outra pessoa.' using errcode = '42501';
    end if;
    select * into v_student from students
    where id = p_student_id and organization_id = v_aula.organization_id;
    if not found then raise exception 'Aluno não encontrado nesta academia.' using errcode = 'P0002'; end if;
  end if;

  if v_student.status not in ('ACTIVE','OVERDUE') then
    raise exception 'Matrícula sem acesso às aulas.' using errcode = '42501';
  end if;

  select status into v_status from class_bookings
  where session_id = p_session_id and student_id = v_student.id
    and status in ('BOOKED','WAITLIST');
  if found then return v_status; end if;

  v_status := case when (
    select count(*) from class_bookings where session_id = p_session_id and status = 'BOOKED'
  ) >= v_aula.capacity then 'WAITLIST' else 'BOOKED' end;

  insert into class_bookings (organization_id, session_id, student_id, status)
  values (v_aula.organization_id, p_session_id, v_student.id, v_status);
  return v_status;
end;
$$;
grant execute on function book_class(uuid, uuid) to authenticated, service_role;

drop function if exists ensure_org_class_sessions(uuid, integer);
drop function if exists generate_org_class_sessions(uuid, integer);
`

beforeAll(async () => {
  if (!temBanco) return
  client = await connect()
  await applyMigrations(client)
  await seedTwoGyms(client, 2)

  const alpha = await client.query(
    `select id from students where organization_id = $1 order by id limit 1`,
    [ALPHA.orgId],
  )
  alunoAlpha = alpha.rows[0].id

  const beta = await client.query(
    `select id from students where organization_id = $1 order by id limit 1`,
    [BETA.orgId],
  )
  alunoBeta = beta.rows[0].id

  // Uma aula na Beta: é nela que a dona da Alpha não pode mexer.
  const criada = await client.query(
    `insert into class_sessions (organization_id, name, starts_at, ends_at, capacity)
     values ($1, 'Aula da Beta', now() + interval '2 hours', now() + interval '3 hours', 20)
     returning id`,
    [BETA.orgId],
  )
  aula = criada.rows[0].id

  // Volta ao estado que foi para produção.
  await client.query(VERSAO_ANTIGA)
}, 60_000)

afterAll(async () => {
  await client?.end()
})

describe.skipIf(!temBanco)('o defeito que foi para produção', () => {
  it('a dona de uma academia reservava em nome de aluno de outra', async () => {
    /*
     * Este teste PASSA ao provocar o furo. Ele existe para provar que o problema
     * era real no banco que está no ar, e não uma preocupação teórica minha.
     */
    const resultado = await asUser<{ status: string }>(
      client,
      ALPHA.authId,
      `select book_class($1, $2) as status`,
      [aula, alunoBeta],
    )
    expect(resultado[0].status).toBe('BOOKED')

    const vazou = await client.query(
      `select count(*)::int as total from class_bookings
       where session_id = $1 and student_id = $2 and status = 'BOOKED'`,
      [aula, alunoBeta],
    )
    expect(vazou.rows[0].total).toBe(1)
  })

  it('e a reposição da grade nem existia', async () => {
    await expect(
      asUser(client, ALPHA.authId, `select ensure_org_class_sessions($1, 21)`, [ALPHA.orgId]),
    ).rejects.toThrow(/does not exist|não existe/i)
  })
})

describe.skipIf(!temBanco)('depois de colar a 0025', () => {
  beforeAll(async () => {
    if (!temBanco) return
    await client.query(`delete from class_bookings where session_id = $1`, [aula])
    await client.query(migration('0025_agenda_autorizacao.sql'))
  })

  it('a academia vizinha volta a ser intocável', async () => {
    await expect(
      asUser(client, ALPHA.authId, `select book_class($1, $2) as status`, [aula, alunoBeta]),
    ).rejects.toThrow(/só a equipe/i)
  })

  it('e a própria academia continua funcionando', async () => {
    const minha = await client.query(
      `insert into class_sessions (organization_id, name, starts_at, ends_at, capacity)
       values ($1, 'Aula da Alpha', now() + interval '2 hours', now() + interval '3 hours', 20)
       returning id`,
      [ALPHA.orgId],
    )
    const resultado = await asUser<{ status: string }>(
      client,
      ALPHA.authId,
      `select book_class($1, $2) as status`,
      [minha.rows[0].id, alunoAlpha],
    )
    expect(resultado[0].status).toBe('BOOKED')
  })

  it('a reposição da grade passa a existir, e é da própria academia', async () => {
    const reposta = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select ensure_org_class_sessions($1, 21)::int as total`,
      [ALPHA.orgId],
    )
    expect(reposta[0].total).toBe(0) // Sem regra ativa, sai barato.

    await expect(
      asUser(client, ALPHA.authId, `select ensure_org_class_sessions($1, 21)`, [BETA.orgId]),
    ).rejects.toThrow(/não é desta academia/i)
  })

  it('a equipe passa a conseguir materializar a própria grade', async () => {
    // O defeito nº 2: a tela salvava a aula e a grade continuava vazia.
    await client.query(
      `insert into class_schedules (organization_id, name, weekday, start_time, capacity)
       values ($1, 'Spinning', 3, '19:00', 20)`,
      [ALPHA.orgId],
    )
    const criadas = await asUser<{ total: number }>(
      client,
      ALPHA.authId,
      `select generate_org_class_sessions($1, 21)::int as total`,
      [ALPHA.orgId],
    )
    expect(criadas[0].total).toBeGreaterThan(0)
  })

  it('nenhuma reserva ou presença antiga se perdeu no reparo', async () => {
    /*
     * A 0025 é toda `create or replace`: nenhuma tabela é tocada. Este teste
     * existe porque é essa a pergunta que se faz antes de colar SQL num banco
     * com dados reais dentro.
     */
    const antiga = await client.query(
      `insert into class_sessions (organization_id, name, starts_at, ends_at, capacity)
       values ($1, 'Aula de julho', now() - interval '90 days', now() - interval '90 days' + interval '1 hour', 10)
       returning id`,
      [ALPHA.orgId],
    )
    await client.query(
      `insert into class_bookings (organization_id, session_id, student_id, status)
       values ($1, $2, $3, 'ATTENDED')`,
      [ALPHA.orgId, antiga.rows[0].id, alunoAlpha],
    )

    await client.query(migration('0025_agenda_autorizacao.sql'))

    const depois = await client.query(
      `select b.status from class_bookings b
       join class_sessions s on s.id = b.session_id
       where s.name = 'Aula de julho'`,
    )
    expect(depois.rows).toHaveLength(1)
    expect(depois.rows[0].status).toBe('ATTENDED')
  })
})
