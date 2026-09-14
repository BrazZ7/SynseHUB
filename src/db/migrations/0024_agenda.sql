-- =============================================================================
-- SynseHub · 0024 — A agenda de aulas
--
-- Três tabelas, e a distinção entre elas é a parte que importa:
--
--   class_schedules  a regra   — "spinning, segunda e quarta, 19h, 20 vagas"
--   class_sessions   o dia     — a aula de quarta que vem, que pode ser
--                                cancelada sem derrubar a série
--   class_bookings   a pessoa  — quem reservou, quem está na espera
--
-- Modelar só a regra faria o cancelamento de um feriado apagar a aula de todas
-- as quartas. Modelar só o dia obrigaria a recepção a cadastrar uma linha por
-- semana para sempre.
--
-- ── O problema de verdade: duas pessoas na última vaga ───────────────────────
--
-- Contar reservas e depois inserir é uma corrida clássica. Dois alunos tocando
-- "reservar" no mesmo instante leem 19 de 20, os dois inserem, e a sala recebe
-- 21 pessoas. Não é hipótese: é o que acontece quando a aula popular abre.
--
-- A trava fica no banco, num `select ... for update` sobre a linha da aula
-- dentro do gatilho de capacidade. O segundo inserir espera o primeiro
-- terminar, relê, e vai para a lista de espera. Vale para qualquer caminho de
-- escrita — a tela, o SQL de suporte, a importação —, não só para quem se
-- lembrou de chamar a função certa.
-- =============================================================================

create type class_session_status as enum ('SCHEDULED','CANCELLED');
create type class_booking_status as enum
  ('BOOKED','WAITLIST','CANCELLED','ATTENDED','NO_SHOW');

-- ── A regra ──────────────────────────────────────────────────────────────────
create table class_schedules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  description      text,
  -- Professor sai da equipe: a aula continua, sem responsável, até alguém assumir.
  staff_id         uuid references staff(id) on delete set null,
  /*
   * 0 = domingo, como `extract(dow)` do Postgres e o `getDay()` do JavaScript.
   * Escolher a convenção do ISO (1 = segunda) obrigaria a converter nos dois
   * lados, e é exatamente aí que nasce a aula que aparece um dia deslocada.
   */
  weekday          smallint not null check (weekday between 0 and 6),
  start_time       time not null,
  duration_minutes smallint not null default 60 check (duration_minutes between 5 and 480),
  capacity         smallint not null check (capacity between 1 and 500),
  room             text,
  starts_on        date not null default current_date,
  ends_on          date,
  status           text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index class_schedules_org_idx on class_schedules (organization_id, status);

-- ── O dia ────────────────────────────────────────────────────────────────────
create table class_sessions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  /*
   * Nulo é aula avulsa. `on delete set null` e não cascade: apagar a série não
   * pode apagar a presença de quem já foi à aula do mês passado.
   */
  schedule_id      uuid references class_schedules(id) on delete set null,
  name             text not null,
  staff_id         uuid references staff(id) on delete set null,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  capacity         smallint not null check (capacity between 1 and 500),
  room             text,
  status           class_session_status not null default 'SCHEDULED',
  cancellation_reason text,
  /*
   * Derivado, mantido por gatilho. Existe para a tela listar cinquenta aulas
   * sem cinquenta subconsultas de contagem — quem manda na lotação é a
   * contagem real, feita sob trava no momento da reserva.
   */
  booked_count     smallint not null default 0 check (booked_count >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Idempotência da materialização: rodar duas vezes não duplica a aula.
  unique (schedule_id, starts_at)
);
create index class_sessions_org_start_idx on class_sessions (organization_id, starts_at);
create index class_sessions_staff_idx on class_sessions (staff_id, starts_at);

-- ── A pessoa ─────────────────────────────────────────────────────────────────
create table class_bookings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  session_id       uuid not null references class_sessions(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  status           class_booking_status not null default 'BOOKED',
  -- Ordem da fila de espera: quem pediu primeiro sobe primeiro.
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  attended_at      timestamptz
);
create index class_bookings_session_idx on class_bookings (session_id, status);
create index class_bookings_student_idx on class_bookings (student_id, created_at desc);

/*
 * Uma reserva viva por aluno por aula. Parcial de propósito: quem cancelou
 * pode reservar de novo, e o histórico das duas tentativas fica.
 */
create unique index class_bookings_uma_viva_idx
  on class_bookings (session_id, student_id)
  where status in ('BOOKED','WAITLIST');

-- ── A trava ──────────────────────────────────────────────────────────────────
/**
 * Capacidade, conferida sob trava.
 *
 * `for update` na linha da aula é o que serializa: duas reservas simultâneas
 * viram duas em fila, e a segunda enxerga a primeira. Sem isso, as duas leem a
 * mesma contagem e a sala estoura.
 */
create or replace function class_booking_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_capacity smallint;
  v_status   class_session_status;
  v_starts   timestamptz;
  v_org      uuid;
  v_ocupadas integer;
begin
  select capacity, status, starts_at, organization_id
    into v_capacity, v_status, v_starts, v_org
  from class_sessions where id = new.session_id
  for update;

  if not found then
    raise exception 'Aula não encontrada.' using errcode = '23503';
  end if;

  -- A organização da reserva é a da aula, sempre. Sem isto, uma reserva com
  -- `organization_id` de outra academia passaria pela RLS da própria.
  new.organization_id := v_org;

  if new.status not in ('BOOKED','WAITLIST') then
    return new;
  end if;

  if v_status = 'CANCELLED' then
    raise exception 'Esta aula foi cancelada.' using errcode = '23514';
  end if;

  if v_starts < now() then
    raise exception 'Esta aula já começou.' using errcode = '23514';
  end if;

  if new.status = 'BOOKED' then
    select count(*) into v_ocupadas
    from class_bookings
    where session_id = new.session_id
      and status = 'BOOKED'
      and id is distinct from new.id;

    if v_ocupadas >= v_capacity then
      raise exception 'Turma lotada: % de % vagas.', v_ocupadas, v_capacity
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger class_bookings_guard
  before insert or update on class_bookings
  for each row execute function class_booking_guard();

/** Mantém `booked_count` igual à contagem real. */
create or replace function class_session_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_session uuid := coalesce(new.session_id, old.session_id);
begin
  update class_sessions
  set booked_count = (
        select count(*) from class_bookings
        where session_id = v_session and status in ('BOOKED','ATTENDED')
      ),
      updated_at = now()
  where id = v_session;
  return null;
end;
$$;

create trigger class_bookings_count
  after insert or update or delete on class_bookings
  for each row execute function class_session_count();

-- ── A fila anda sozinha ──────────────────────────────────────────────────────
/**
 * Vaga que abre chama quem está esperando.
 *
 * No gatilho, e não na função de cancelar, porque o cancelamento chega por mais
 * de um caminho: o aluno pelo app, a recepção pela tela, a aula remarcada por
 * SQL. Lista de espera que só anda quando alguém lembra de chamar a função é
 * lista de espera que um dia para.
 */
create or replace function class_booking_promote() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_proxima class_bookings;
  v_aula    class_sessions;
  v_perfil  uuid;
begin
  select * into v_aula from class_sessions where id = old.session_id;
  if v_aula.status = 'CANCELLED' or v_aula.starts_at < now() then
    return null;
  end if;

  select * into v_proxima
  from class_bookings
  where session_id = old.session_id and status = 'WAITLIST'
  order by created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update class_bookings set status = 'BOOKED' where id = v_proxima.id;

  select user_profile_id into v_perfil from students where id = v_proxima.student_id;
  perform notify_profiles(
    array[v_perfil],
    v_aula.organization_id,
    'GYM',
    'Vaga liberada em ' || v_aula.name,
    'Você saiu da lista de espera e está confirmado para ' ||
      to_char(v_aula.starts_at at time zone org_timezone(v_aula.organization_id), 'DD/MM à\s HH24h MI') || '.',
    '/app/schedule'
  );

  return null;
end;
$$;

/** Fuso da academia. A agenda é local: "quarta 19h" é 19h em São Paulo. */
create or replace function org_timezone(p_org_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(timezone, 'America/Sao_Paulo') from organizations where id = p_org_id
$$;

create trigger class_bookings_promote
  after update on class_bookings
  for each row
  when (old.status = 'BOOKED' and new.status in ('CANCELLED','NO_SHOW'))
  execute function class_booking_promote();

-- ── Aula cancelada avisa quem ia ─────────────────────────────────────────────
create or replace function class_session_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_profiles(
    array(
      select s.user_profile_id
      from class_bookings b
      join students s on s.id = b.student_id
      where b.session_id = new.id and b.status in ('BOOKED','WAITLIST')
    ),
    new.organization_id,
    'GYM',
    new.name || ' foi cancelada',
    'A aula de ' ||
      to_char(new.starts_at at time zone org_timezone(new.organization_id), 'DD/MM à\s HH24h MI') ||
      ' não vai acontecer.' ||
      coalesce(' Motivo: ' || new.cancellation_reason, ''),
    '/app/schedule'
  );

  -- A reserva não é apagada: ela vira cancelada, e o aluno enxerga o que houve
  -- com a aula que tinha marcado.
  update class_bookings
  set status = 'CANCELLED', cancelled_at = now()
  where session_id = new.id and status in ('BOOKED','WAITLIST');

  return null;
end;
$$;

create trigger class_sessions_cancelled
  after update on class_sessions
  for each row
  when (old.status = 'SCHEDULED' and new.status = 'CANCELLED')
  execute function class_session_cancelled();

-- ── Materialização da grade ──────────────────────────────────────────────────
/**
 * Cria as aulas dos próximos dias a partir das regras ativas.
 *
 * Idempotente pelo `unique (schedule_id, starts_at)`: rodar de novo — ou dois
 * processos ao mesmo tempo, que é o que um agendamento repetido faz — não
 * duplica nada. Devolve quantas criou.
 */
create or replace function generate_class_sessions(
  p_days_ahead integer default 21,
  p_reference  date default current_date
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_criadas integer;
begin
  if p_days_ahead < 0 or p_days_ahead > 120 then
    raise exception 'Janela de geração fora do razoável: % dias', p_days_ahead
      using errcode = '22023';
  end if;

  with dias as (
    select generate_series(p_reference, p_reference + p_days_ahead, interval '1 day')::date as dia
  ),
  novas as (
    insert into class_sessions
      (organization_id, schedule_id, name, staff_id, starts_at, ends_at, capacity, room)
    select
      g.organization_id,
      g.id,
      g.name,
      g.staff_id,
      ((d.dia + g.start_time) at time zone org_timezone(g.organization_id)),
      ((d.dia + g.start_time) at time zone org_timezone(g.organization_id))
        + make_interval(mins => g.duration_minutes),
      g.capacity,
      g.room
    from class_schedules g
    join dias d on extract(dow from d.dia) = g.weekday
    where g.status = 'ACTIVE'
      and d.dia >= g.starts_on
      and (g.ends_on is null or d.dia <= g.ends_on)
    on conflict (schedule_id, starts_at) do nothing
    returning 1
  )
  select count(*)::integer into v_criadas from novas;

  return v_criadas;
end;
$$;

revoke all on function generate_class_sessions(integer, date) from public, anon;
grant execute on function generate_class_sessions(integer, date) to service_role;

-- ── Reservar ─────────────────────────────────────────────────────────────────
/**
 * Reserva a vaga e devolve o que aconteceu: 'BOOKED' ou 'WAITLIST'.
 *
 * Sem `p_student_id`, reserva para quem chamou — é o aluno no app. Com, é a
 * recepção marcando por telefone, e aí exige ser da equipe: sem essa checagem,
 * qualquer aluno reservaria em nome de outro.
 */
create or replace function book_class(
  p_session_id uuid,
  p_student_id uuid default null
)
returns class_booking_status
language plpgsql volatile security definer set search_path = public as $$
declare
  v_aula     class_sessions;
  v_student  students;
  v_ocupadas integer;
  v_status   class_booking_status;
begin
  select * into v_aula from class_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Aula não encontrada.' using errcode = 'P0002';
  end if;

  if p_student_id is null then
    select s.* into v_student
    from students s
    join user_profiles p on p.id = s.user_profile_id
    where p.auth_user_id = auth.uid() and s.organization_id = v_aula.organization_id;

    if not found then
      raise exception 'Você não é aluno desta academia.' using errcode = '42501';
    end if;
  else
    if not is_org_staff(v_aula.organization_id) then
      raise exception 'Só a equipe reserva em nome de outra pessoa.' using errcode = '42501';
    end if;
    select * into v_student from students
    where id = p_student_id and organization_id = v_aula.organization_id;
    if not found then
      raise exception 'Aluno não encontrado nesta academia.' using errcode = 'P0002';
    end if;
  end if;

  /*
   * Quem cancelou a matrícula ou ainda não foi confirmado não ocupa vaga.
   * Inadimplente ocupa: bloquear a aula por atraso é decisão da academia, e o
   * banco recusando em silêncio não é o lugar de tomá-la.
   */
  if v_student.status not in ('ACTIVE','OVERDUE') then
    raise exception 'Matrícula sem acesso às aulas.' using errcode = '42501';
  end if;

  -- Já tem reserva viva: devolve a que existe em vez de estourar constraint.
  select status into v_status from class_bookings
  where session_id = p_session_id and student_id = v_student.id
    and status in ('BOOKED','WAITLIST');
  if found then
    return v_status;
  end if;

  select count(*) into v_ocupadas from class_bookings
  where session_id = p_session_id and status = 'BOOKED';

  v_status := case when v_ocupadas >= v_aula.capacity then 'WAITLIST' else 'BOOKED' end;

  insert into class_bookings (organization_id, session_id, student_id, status)
  values (v_aula.organization_id, p_session_id, v_student.id, v_status);

  return v_status;
end;
$$;

revoke all on function book_class(uuid, uuid) from public, anon;
grant execute on function book_class(uuid, uuid) to authenticated, service_role;

/**
 * Desmarca. O gatilho de promoção chama a próxima da fila.
 */
create or replace function cancel_class_booking(p_booking_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_reserva class_bookings;
begin
  select * into v_reserva from class_bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva não encontrada.' using errcode = 'P0002';
  end if;

  if not (owns_student(v_reserva.student_id) or is_org_staff(v_reserva.organization_id)) then
    raise exception 'Esta reserva não é sua.' using errcode = '42501';
  end if;

  if v_reserva.status not in ('BOOKED','WAITLIST') then
    return;
  end if;

  update class_bookings
  set status = 'CANCELLED', cancelled_at = now()
  where id = p_booking_id;
end;
$$;

revoke all on function cancel_class_booking(uuid) from public, anon;
grant execute on function cancel_class_booking(uuid) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table class_schedules enable row level security;
alter table class_sessions  enable row level security;
alter table class_bookings  enable row level security;

/*
 * A grade é pública para dentro da academia: o aluno precisa ver o que existe
 * antes de reservar. Escrita é da equipe.
 */
create policy class_schedules_read on class_schedules
  for select using (is_org_member(organization_id));
create policy class_schedules_write on class_schedules
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy class_sessions_read on class_sessions
  for select using (is_org_member(organization_id));
create policy class_sessions_write on class_sessions
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

/*
 * O aluno enxerga as próprias reservas; a equipe, as da academia. Quem está na
 * aula não é da conta dos outros alunos — turma de aula é dado de frequência,
 * e frequência diz onde a pessoa estava numa terça à noite.
 */
create policy class_bookings_self on class_bookings
  for select using (owns_student(student_id));
create policy class_bookings_staff on class_bookings
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

/*
 * O aluno não escreve direto: reserva e cancelamento passam por `book_class` e
 * `cancel_class_booking`, que são quem confere vaga, matrícula e dono. Sem este
 * `revoke`, um insert cru pularia a fila de espera.
 */
revoke insert, update, delete on class_bookings from authenticated, anon;

insert into schema_migrations (version) values ('0024_agenda.sql') on conflict do nothing;
