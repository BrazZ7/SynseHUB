-- =============================================================================
-- SynseHub · 0026 — Treino Ativo
--
-- `workout_logs` existe desde a 0003 e continua onde está: ela é um registro
-- achatado — uma linha por exercício, com carga e reps médias — e é o que as
-- telas de histórico já leem. Apagá-la para caber o novo formato quebraria o
-- que funciona.
--
-- O que falta é a série. Sem número de série, sem horário de início e fim, sem
-- descanso, não dá para responder "quanto ele levantou na terceira série de
-- ontem" — e é essa pergunta que sustenta evolução de carga, volume e recorde.
--
-- Três tabelas, na granularidade que o treino tem de verdade:
--
--   workout_sessions           o treino de hoje, do início ao fim
--   workout_session_exercises  a passagem por cada exercício
--   workout_set_logs           a série, que é onde o dado mora
--
-- ── Tocar duas vezes em "concluir série" ─────────────────────────────────────
--
-- Numa academia isso não é hipótese: a mão está suada, o celular escorrega, a
-- conexão demora e a pessoa toca de novo. Desabilitar o botão na tela ajuda e
-- não basta — a segunda requisição pode já estar em voo, e o React não é o
-- único caminho até a tabela.
--
-- A garantia é do banco, em dois níveis: `unique (session_id, client_id)`
-- absorve o reenvio exato da mesma ação, e
-- `unique (session_id, exercise_id, set_number)` impede duas "série 2" ainda
-- que venham com ids diferentes. A primeira é idempotência; a segunda é
-- integridade, e são coisas distintas.
-- =============================================================================

create type workout_session_status as enum
  ('IN_PROGRESS','PAUSED','COMPLETED','ABANDONED');

create table workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  -- Nulo é treino sem plano atribuído: o treino base do Synse, que vale desde
  -- o primeiro minuto, com ou sem academia.
  workout_plan_id  uuid references workout_plans(id) on delete set null,
  /*
   * Gerado no aparelho antes de existir rede. É ele que torna o reenvio
   * inofensivo — o mesmo padrão que a 0016 usa para a corrida.
   */
  client_id        text not null,
  status           workout_session_status not null default 'IN_PROGRESS',
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  /*
   * Duração efetiva, em segundos. Gravada em vez de calculada por
   * `completed_at - started_at` porque treino tem pausa: quem para quinze
   * minutos para atender o telefone não treinou quinze minutos a mais.
   */
  duration_seconds integer check (duration_seconds >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, client_id)
);
create index workout_sessions_student_idx on workout_sessions (student_id, started_at desc);
create index workout_sessions_org_idx on workout_sessions (organization_id, started_at desc);

/*
 * Um treino em andamento por aluno. Abrir o segundo sem fechar o primeiro
 * produziria dois cronômetros correndo e séries caindo na sessão errada.
 */
create unique index workout_sessions_um_ativo_idx
  on workout_sessions (student_id)
  where status in ('IN_PROGRESS','PAUSED');

create table workout_session_exercises (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references workout_sessions(id) on delete cascade,
  -- A linha da prescrição. Nula quando o exercício foi feito fora do plano.
  workout_exercise_id uuid references workout_exercises(id) on delete set null,
  exercise_id         uuid not null references exercises(id) on delete restrict,
  position            smallint not null,
  started_at          timestamptz,
  completed_at        timestamptz,
  unique (session_id, position)
);
create index workout_session_exercises_session_idx
  on workout_session_exercises (session_id, position);

create table workout_set_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  session_id       uuid not null references workout_sessions(id) on delete cascade,
  exercise_id      uuid not null references exercises(id) on delete restrict,
  set_number       smallint not null check (set_number between 1 and 50),
  /*
   * O planejado e o feito, lado a lado. Guardar só o feito perderia a
   * informação mais útil da evolução: a série em que a pessoa parou antes do
   * previsto, que é sinal de fadiga ou de carga alta demais.
   */
  reps_planned     smallint check (reps_planned >= 0),
  reps_completed   smallint not null check (reps_completed >= 0),
  weight           numeric(6,2) check (weight >= 0),
  rest_seconds     smallint check (rest_seconds >= 0),
  started_at       timestamptz,
  completed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  /** Gerado no aparelho. Absorve o toque duplo e o reenvio da fila offline. */
  client_id        text not null,
  unique (session_id, client_id),
  -- Duas "série 2" no mesmo exercício não é reenvio: é dado errado.
  unique (session_id, exercise_id, set_number)
);
create index workout_set_logs_session_idx on workout_set_logs (session_id, completed_at);
create index workout_set_logs_exercise_idx on workout_set_logs (exercise_id, completed_at desc);

/*
 * Preferências do treino.
 *
 * Som, vibração e manter a tela ligada dependem do aparelho, mas descanso
 * automático e avanço automático são hábito da pessoa — e hábito acompanha
 * quem troca de celular. Ficam no servidor, com cópia local para a tela não
 * esperar rede para desenhar.
 */
create table workout_preferences (
  user_profile_id      uuid primary key references user_profiles(id) on delete cascade,
  auto_rest            boolean not null default true,
  sound_enabled        boolean not null default true,
  vibration_enabled    boolean not null default true,
  auto_advance         boolean not null default false,
  keep_screen_awake    boolean not null default true,
  default_rest_seconds smallint not null default 90
                         check (default_rest_seconds between 0 and 900),
  updated_at           timestamptz not null default now()
);

-- ── Duração e progresso, mantidos pelo banco ─────────────────────────────────
/**
 * Marca o exercício como concluído quando a última série prevista entra.
 *
 * No gatilho, e não na aplicação, porque a série chega por mais de um caminho:
 * a tela, a fila offline que sincroniza depois, e um dia o relógio. Progresso
 * que só avança no caminho que alguém lembrou de instrumentar é progresso que
 * um dia trava.
 */
create or replace function workout_set_progress() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_previstas smallint;
  v_feitas    smallint;
begin
  select we.sets into v_previstas
  from workout_session_exercises se
  left join workout_exercises we on we.id = se.workout_exercise_id
  where se.session_id = new.session_id and se.exercise_id = new.exercise_id;

  select count(*) into v_feitas
  from workout_set_logs
  where session_id = new.session_id and exercise_id = new.exercise_id;

  update workout_session_exercises
  set completed_at = case
        when v_previstas is not null and v_feitas >= v_previstas then now()
        else completed_at
      end,
      started_at = coalesce(started_at, new.started_at, new.completed_at)
  where session_id = new.session_id and exercise_id = new.exercise_id;

  update workout_sessions set updated_at = now() where id = new.session_id;
  return null;
end;
$$;

create trigger workout_set_logs_progress
  after insert on workout_set_logs
  for each row execute function workout_set_progress();

-- ── Escrita ──────────────────────────────────────────────────────────────────
/**
 * Abre o treino, ou devolve o que já estava aberto.
 *
 * O aluno sai do `auth.uid()`, nunca do que o cliente mandou: aceitar
 * `student_id` do formulário deixaria qualquer conta gravar treino em nome de
 * outra pessoa.
 *
 * Idempotente por `unique (student_id, client_id)`. Reabrir com o mesmo
 * `client_id` — reenvio da fila, toque duplo no "começar" — devolve a mesma
 * sessão em vez de criar a segunda.
 */
create or replace function start_workout_session(
  p_client_id       text,
  p_workout_plan_id uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_student students;
  v_id      uuid;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador do treino ausente.' using errcode = '22023';
  end if;

  select s.* into v_student
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
  order by s.created_at desc
  limit 1;

  if not found then
    raise exception 'Nenhum aluno para esta conta.' using errcode = '42501';
  end if;

  if p_workout_plan_id is not null and not exists (
    select 1 from workout_plans
    where id = p_workout_plan_id and organization_id = v_student.organization_id
  ) then
    raise exception 'Este treino não é da sua academia.' using errcode = '42501';
  end if;

  /*
   * O treino já aberto vence o pedido novo. Sem isto, o índice de sessão única
   * recusaria com erro de constraint, e o aluno que voltou ao app veria falha
   * onde deveria ver o treino de volta.
   */
  select id into v_id from workout_sessions
  where student_id = v_student.id and status in ('IN_PROGRESS','PAUSED');
  if found then return v_id; end if;

  insert into workout_sessions (organization_id, student_id, workout_plan_id, client_id)
  values (v_student.organization_id, v_student.id, p_workout_plan_id, p_client_id)
  on conflict (student_id, client_id) do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function start_workout_session(text, uuid) from public, anon;
grant execute on function start_workout_session(text, uuid) to authenticated, service_role;

/**
 * Registra a série. É a escrita mais quente do produto.
 *
 * Devolve o id da série — o mesmo id no reenvio, que é o que permite à fila
 * local marcar como sincronizada sem duvidar.
 */
create or replace function log_workout_set(
  p_session_id     uuid,
  p_exercise_id    uuid,
  p_set_number     smallint,
  p_reps_completed smallint,
  p_client_id      text,
  p_weight         numeric default null,
  p_reps_planned   smallint default null,
  p_rest_seconds   smallint default null,
  p_started_at     timestamptz default null,
  p_completed_at   timestamptz default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sessao workout_sessions;
  v_id     uuid;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador da série ausente.' using errcode = '22023';
  end if;

  select * into v_sessao from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'Treino não encontrado.' using errcode = 'P0002';
  end if;

  -- `is not true`: `owns_student` e `is_org_staff` podem devolver NULL, e
  -- `if not null` não dispara. Ver a nota da 0025.
  if (owns_student(v_sessao.student_id) or is_org_staff(v_sessao.organization_id)) is not true then
    raise exception 'Este treino não é seu.' using errcode = '42501';
  end if;

  if v_sessao.status not in ('IN_PROGRESS','PAUSED') then
    raise exception 'Este treino já foi encerrado.' using errcode = '23514';
  end if;

  insert into workout_set_logs (
    organization_id, session_id, exercise_id, set_number,
    reps_planned, reps_completed, weight, rest_seconds,
    started_at, completed_at, client_id
  )
  values (
    v_sessao.organization_id, p_session_id, p_exercise_id, p_set_number,
    p_reps_planned, p_reps_completed, p_weight, p_rest_seconds,
    p_started_at, coalesce(p_completed_at, now()), p_client_id
  )
  /*
   * O toque duplo chega aqui como a mesma linha. `do update` em vez de
   * `do nothing` porque `returning` não devolve nada num `do nothing`, e a
   * fila local precisa do id de volta para parar de tentar.
   */
  on conflict (session_id, client_id) do update set reps_completed = excluded.reps_completed
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function log_workout_set(uuid, uuid, smallint, smallint, text, numeric, smallint, smallint, timestamptz, timestamptz) from public, anon;
grant execute on function log_workout_set(uuid, uuid, smallint, smallint, text, numeric, smallint, smallint, timestamptz, timestamptz) to authenticated, service_role;

/** Encerra o treino e guarda a duração efetiva, descontando as pausas. */
create or replace function finish_workout_session(
  p_session_id       uuid,
  p_duration_seconds integer default null,
  p_status           workout_session_status default 'COMPLETED'
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sessao workout_sessions;
begin
  select * into v_sessao from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'Treino não encontrado.' using errcode = 'P0002';
  end if;

  if (owns_student(v_sessao.student_id) or is_org_staff(v_sessao.organization_id)) is not true then
    raise exception 'Este treino não é seu.' using errcode = '42501';
  end if;

  if p_status not in ('COMPLETED','ABANDONED') then
    raise exception 'Encerramento inválido: %', p_status using errcode = '22023';
  end if;

  update workout_sessions
  set status = p_status,
      completed_at = coalesce(completed_at, now()),
      duration_seconds = coalesce(
        p_duration_seconds,
        greatest(extract(epoch from (now() - started_at))::integer, 0)
      ),
      updated_at = now()
  where id = p_session_id;
end;
$$;

revoke all on function finish_workout_session(uuid, integer, workout_session_status) from public, anon;
grant execute on function finish_workout_session(uuid, integer, workout_session_status) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table workout_sessions          enable row level security;
alter table workout_session_exercises enable row level security;
alter table workout_set_logs          enable row level security;
alter table workout_preferences       enable row level security;

/*
 * O aluno enxerga o próprio treino; a equipe, o da própria academia. O
 * professor precisa ver a execução para ajustar a carga — é o trabalho dele —,
 * e a academia vizinha não tem nada com isso.
 */
create policy workout_sessions_self on workout_sessions
  for select using (owns_student(student_id));
create policy workout_sessions_staff on workout_sessions
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy workout_session_exercises_read on workout_session_exercises
  for select using (exists (
    select 1 from workout_sessions s
    where s.id = workout_session_exercises.session_id
      and (owns_student(s.student_id) or is_org_staff(s.organization_id))
  ));
create policy workout_session_exercises_write on workout_session_exercises
  for all using (exists (
    select 1 from workout_sessions s
    where s.id = workout_session_exercises.session_id and is_org_staff(s.organization_id)
  ))
  with check (exists (
    select 1 from workout_sessions s
    where s.id = workout_session_exercises.session_id and is_org_staff(s.organization_id)
  ));

create policy workout_set_logs_self on workout_set_logs
  for select using (exists (
    select 1 from workout_sessions s
    where s.id = workout_set_logs.session_id and owns_student(s.student_id)
  ));
create policy workout_set_logs_staff on workout_set_logs
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy workout_preferences_self on workout_preferences
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

/*
 * O aluno não escreve série na mão: `log_workout_set` é quem confere a sessão,
 * o dono e o encerramento. Sem este `revoke`, um insert cru gravaria série em
 * treino já fechado — e pior, com `organization_id` escolhido pelo cliente.
 */
revoke insert, update, delete on workout_sessions from authenticated, anon;
revoke insert, update, delete on workout_set_logs from authenticated, anon;
revoke insert, update, delete on workout_session_exercises from authenticated, anon;

insert into schema_migrations (version) values ('0026_treino_ativo.sql') on conflict do nothing;
