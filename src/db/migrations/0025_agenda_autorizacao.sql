-- =============================================================================
-- SynseHub · 0025 — Conserta a agenda dos bancos que receberam a primeira 0024
--
-- A 0024 foi publicada, aplicada em produção, e só então revisada. Três coisas
-- estavam erradas nela, e esta migration existe porque banco já migrado não se
-- corrige reaplicando o arquivo antigo — se corrige com uma migration nova.
--
-- 1. **Furo de autorização entre academias.** `is_org_staff` devolve NULL — não
--    false — para quem não pertence à academia: `org_role` é nulo, e
--    `null in (...)` é nulo. Em política de RLS isso é seguro, porque o Postgres
--    trata nulo como negado. Dentro de plpgsql, `if not null` não dispara e a
--    execução segue. Na prática: a dona de uma academia conseguia reservar em
--    nome de aluno de outra e cancelar reserva alheia. A correção é `is not
--    true`, que trata nulo como negação.
--
-- 2. **A tela salvava a aula e não criava aula nenhuma.**
--    `generate_class_sessions` só tinha grant para `service_role`, e a tela a
--    chamava com a sessão de quem estava logado. A recepção cadastrava a aula de
--    amanhã e a grade continuava vazia até a rotina da madrugada.
--
-- 3. **A grade dependia de um agendamento externo.** Sem ele, o calendário ia
--    ficando sem futuro conforme os dias passavam. Nada era apagado — a
--    materialização só insere —, mas três semanas depois não havia mais aula à
--    frente para reservar.
--
-- Tudo aqui é `create or replace`: nenhuma tabela é tocada, nenhuma aula é
-- recriada, nenhuma reserva ou presença se perde. Rodar num banco que já tem a
-- 0024 corrigida é inofensivo — as definições são as mesmas.
-- =============================================================================

-- ── Materialização: separa a varredura global da que a academia dispara ──
/**
 * O trabalho em si. Sem grant: quem chama são as duas funções abaixo.
 *
 * `p_organization_id` nulo varre todas as academias — é o agendamento diário.
 * Preenchido, materializa só a de quem pediu.
 *
 * Idempotente pelo `unique (schedule_id, starts_at)`: rodar de novo — ou dois
 * processos ao mesmo tempo, que é o que um agendamento repetido faz — não
 * duplica nada. Devolve quantas criou.
 */
create or replace function materialize_class_sessions(
  p_organization_id uuid,
  p_days_ahead integer,
  p_reference  date
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
      and (p_organization_id is null or g.organization_id = p_organization_id)
      and d.dia >= g.starts_on
      and (g.ends_on is null or d.dia <= g.ends_on)
    on conflict (schedule_id, starts_at) do nothing
    returning 1
  )
  select count(*)::integer into v_criadas from novas;

  return v_criadas;
end;
$$;

revoke all on function materialize_class_sessions(uuid, integer, date) from public, anon, authenticated;

/** A varredura de todas as academias. Roda no agendamento diário. */
create or replace function generate_class_sessions(
  p_days_ahead integer default 21,
  p_reference  date default current_date
)
returns integer
language sql volatile security definer set search_path = public as $$
  select materialize_class_sessions(null, p_days_ahead, p_reference)
$$;

revoke all on function generate_class_sessions(integer, date) from public, anon, authenticated;
grant execute on function generate_class_sessions(integer, date) to service_role;

/**
 * A materialização que a própria academia dispara ao salvar a grade.
 *
 * Existe separada da varredura global por uma razão concreta: a recepção acaba
 * de cadastrar a aula de amanhã e precisa vê-la agora, sem esperar a rotina da
 * madrugada. Dar à equipe a função global resolveria — e deixaria qualquer
 * conta autenticada disparar a geração de todas as academias da plataforma.
 */
create or replace function generate_org_class_sessions(
  p_organization_id uuid,
  p_days_ahead integer default 21
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
begin
/*
 * `is not true` em vez de `not`, e não é preciosismo.
 *
 * `is_org_staff` é `is_super_admin() or org_role(target) in (...)`. Para quem
 * não pertence à academia, `org_role` devolve nulo, e `null in (...)` é nulo —
 * a função inteira devolve NULL, não false. Em política de RLS isso é seguro,
 * porque o Postgres trata nulo como negado. Dentro de plpgsql, `if not null`
 * não é verdadeiro: o `raise` não dispara e a execução segue. Foi assim que a
 * primeira versão desta migration deixou a dona da Alpha mandar materializar a
 * grade da Beta.
 */
  if is_org_staff(p_organization_id) is not true then
    raise exception 'Você não é da equipe desta academia.' using errcode = '42501';
  end if;
  return materialize_class_sessions(p_organization_id, p_days_ahead, current_date);
end;
$$;

revoke all on function generate_org_class_sessions(uuid, integer) from public, anon;
grant execute on function generate_org_class_sessions(uuid, integer) to authenticated, service_role;

/**
 * A grade se mantém sozinha, na leitura.
 *
 * A materialização precisa acontecer de tempos em tempos, senão o calendário
 * vai ficando sem futuro conforme os dias passam — nada some, mas três semanas
 * depois a academia abre a agenda e não vê mais nada à frente.
 *
 * Deixar isso só num agendamento externo amarra a agenda a um plano pago e a um
 * serviço que pode falhar calado. Aqui a própria leitura da tela garante o
 * horizonte: se já existe aula suficiente à frente, a função não faz nada e sai
 * barato; se o horizonte encolheu, ela repõe. É a mesma escolha que o
 * fechamento mensal dos desafios já fazia.
 */
create or replace function ensure_org_class_sessions(
  p_organization_id uuid,
  p_days_ahead integer default 21
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_horizonte timestamptz;
begin
  if is_org_member(p_organization_id) is not true then
    raise exception 'Você não é desta academia.' using errcode = '42501';
  end if;

  /*
   * A academia sem nenhuma regra ativa não tem o que materializar, e sem esta
   * saída a função varreria a tabela a cada abertura de tela para nada.
   */
  if not exists (
    select 1 from class_schedules
    where organization_id = p_organization_id and status = 'ACTIVE'
  ) then
    return 0;
  end if;

  select max(starts_at) into v_horizonte
  from class_sessions
  where organization_id = p_organization_id and schedule_id is not null;

  /*
   * A folga de uma semana evita reescrever a cada abertura de tela: só repõe
   * quando o futuro encolheu de verdade.
   */
  if v_horizonte is not null
     and v_horizonte >= now() + make_interval(days => p_days_ahead - 7)
  then
    return 0;
  end if;

  return materialize_class_sessions(p_organization_id, p_days_ahead, current_date);
end;
$$;

revoke all on function ensure_org_class_sessions(uuid, integer) from public, anon;
grant execute on function ensure_org_class_sessions(uuid, integer) to authenticated, service_role;

-- ── Autorização: `is not true`, porque `is_org_staff` pode devolver NULL ──
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
    -- `is not true`: ver a nota em generate_org_class_sessions.
    if is_org_staff(v_aula.organization_id) is not true then
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

  if (owns_student(v_reserva.student_id) or is_org_staff(v_reserva.organization_id)) is not true then
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

insert into schema_migrations (version) values ('0025_agenda_autorizacao.sql') on conflict do nothing;
