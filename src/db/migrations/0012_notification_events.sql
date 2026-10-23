-- =============================================================================
-- SynseHub · 0012 — O sino passa a tocar
--
-- A tabela `notifications` existe desde a 0003 e nunca recebeu uma linha: nada
-- no sistema escrevia nela. O sino do painel era desenho.
--
-- Quem escreve é o banco, por gatilho, e não a aplicação. A razão é a mesma
-- que vale para o resto do projeto: o aviso não pode depender de quem chamou.
-- Um aluno confirmado pela tela, pelo script de importação ou por um SQL de
-- suporte tem de gerar o mesmo aviso. Notificação emitida na camada de
-- aplicação só existe no caminho que alguém lembrou de instrumentar.
--
-- `security definer` em todos os gatilhos: a política `notifications_self`
-- deixa cada pessoa escrever apenas para si mesma, e é exatamente disso que
-- um aviso precisa fugir — quem entra na academia gera aviso para a recepção,
-- não para si.
-- =============================================================================

-- ── Destinatários ────────────────────────────────────────────────────────────
/*
 * Equipe que deve saber de movimentação de aluno.
 *
 * Professor e nutricionista ficam de fora: recebem aviso do que é deles
 * (treino, avaliação), não da fila de matrícula. Sino que avisa tudo para todo
 * mundo é sino que ninguém abre.
 */
create or replace function org_admin_profile_ids(p_org_id uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_profile_id
  from organization_members
  where organization_id = p_org_id
    and status = 'ACTIVE'
    and role in ('OWNER', 'MANAGER', 'RECEPTIONIST')
$$;

revoke all on function org_admin_profile_ids(uuid) from public, anon;
grant execute on function org_admin_profile_ids(uuid) to authenticated, service_role;

create or replace function notify_profiles(
  p_profile_ids uuid[],
  p_org_id      uuid,
  p_category    text,
  p_title       text,
  p_body        text,
  p_action_url  text
) returns void
language sql volatile security definer set search_path = public as $$
  insert into notifications (organization_id, user_profile_id, category, title, body, action_url)
  select p_org_id, id, p_category, p_title, p_body, p_action_url
  from unnest(p_profile_ids) as id
  where id is not null
$$;

revoke all on function notify_profiles(uuid[], uuid, text, text, text, text) from public, anon, authenticated;

-- ── Dinheiro em texto ────────────────────────────────────────────────────────
/*
 * `to_char` com G e D depende de lc_numeric do servidor, que num Postgres
 * gerenciado é 'C' — sairia "1,234.56" no aviso de uma academia brasileira.
 * Vírgula fixa, sem depender de localidade.
 */
create or replace function brl(p_amount numeric) returns text
language sql immutable as $$
  select 'R$ ' || replace(to_char(p_amount, 'FM9999990.00'), '.', ',')
$$;

-- ── Aluno entrou pelo código e aguarda confirmação ───────────────────────────
create or replace function notify_student_enrolled() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select name into v_name from user_profiles where id = new.user_profile_id;

  if new.status = 'PENDING' then
    perform notify_profiles(
      array(select org_admin_profile_ids(new.organization_id)),
      new.organization_id,
      'GYM',
      coalesce(v_name, 'Alguém') || ' entrou pelo código de convite',
      'A matrícula está aguardando a confirmação da academia.',
      '/students?status=PENDING'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists students_notify_enrolled on students;
create trigger students_notify_enrolled
  after insert on students
  for each row execute function notify_student_enrolled();

-- ── A academia confirmou (ou encerrou) a matrícula ───────────────────────────
create or replace function notify_student_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select name into v_org_name from organizations where id = new.organization_id;

  if new.status = 'ACTIVE' and old.status = 'PENDING' then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula confirmada',
      coalesce(v_org_name, 'A academia') || ' confirmou sua entrada. Bons treinos.',
      '/app'
    );
  elsif new.status = 'CANCELLED' then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula encerrada',
      'Sua matrícula em ' || coalesce(v_org_name, 'na academia') || ' foi encerrada.',
      '/app'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists students_notify_status on students;
create trigger students_notify_status
  after update of status on students
  for each row execute function notify_student_status_change();

-- ── Treino atribuído ─────────────────────────────────────────────────────────
create or replace function notify_workout_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  v_plan_name  text;
begin
  select user_profile_id into v_profile_id from students where id = new.student_id;
  select name into v_plan_name from workout_plans where id = new.workout_plan_id;

  perform notify_profiles(
    array[v_profile_id],
    new.organization_id,
    'WORKOUT',
    'Novo treino disponível',
    coalesce(v_plan_name, 'Um treino') || ' foi atribuído a você.',
    '/app/workout'
  );

  return new;
end;
$$;

drop trigger if exists workout_assignments_notify on workout_assignments;
create trigger workout_assignments_notify
  after insert on workout_assignments
  for each row execute function notify_workout_assigned();

-- ── Cobranças ────────────────────────────────────────────────────────────────
/*
 * Aviso de cobrança criada vai para o aluno; aviso de pagamento confirmado vai
 * para os dois lados. A academia precisa do segundo porque é dinheiro que
 * entrou sem ninguém dar baixa na mão — é a única forma de a recepção saber.
 */
create or replace function notify_charge_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
begin
  if new.status <> 'PENDING' then
    return new;
  end if;

  select user_profile_id into v_profile_id from students where id = new.student_id;

  perform notify_profiles(
    array[v_profile_id],
    new.organization_id,
    'PAYMENT',
    'Nova cobrança de ' || brl(new.amount),
    new.description || ' · vence em ' || to_char(new.due_date, 'DD/MM/YYYY'),
    '/app/finance'
  );

  return new;
end;
$$;

drop trigger if exists charges_notify_created on charges;
create trigger charges_notify_created
  after insert on charges
  for each row execute function notify_charge_created();

create or replace function notify_charge_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  v_name       text;
begin
  if new.status <> 'PAID' or old.status = 'PAID' then
    return new;
  end if;

  select s.user_profile_id, p.name into v_profile_id, v_name
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where s.id = new.student_id;

  perform notify_profiles(
    array[v_profile_id],
    new.organization_id,
    'PAYMENT',
    'Pagamento confirmado',
    new.description || ' · ' || brl(new.amount),
    '/app/finance'
  );

  perform notify_profiles(
    array(select org_admin_profile_ids(new.organization_id)),
    new.organization_id,
    'PAYMENT',
    'Pagamento recebido de ' || coalesce(v_name, 'aluno'),
    new.description || ' · ' || brl(new.amount),
    '/finance'
  );

  return new;
end;
$$;

drop trigger if exists charges_notify_paid on charges;
create trigger charges_notify_paid
  after update of status on charges
  for each row execute function notify_charge_paid();

-- ── Leitura ──────────────────────────────────────────────────────────────────
/*
 * A política `notifications_self` já permite o UPDATE, mas passar pelo cliente
 * exigiria enviar a lista de ids. Marcar tudo de uma vez é o gesto que a tela
 * oferece, e uma linha só de SQL faz melhor.
 */
create or replace function mark_notifications_read() returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_count      integer;
begin
  if v_profile_id is null then
    return 0;
  end if;

  update notifications
  set read_at = now()
  where user_profile_id = v_profile_id and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function mark_notifications_read() from public, anon;
grant execute on function mark_notifications_read() to authenticated;

-- Índice do contador do sino: quantos não lidos tem esta pessoa.
create index if not exists notifications_unread_idx
  on notifications (user_profile_id) where read_at is null;
