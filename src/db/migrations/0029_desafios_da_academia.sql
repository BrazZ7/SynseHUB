-- =============================================================================
-- SynseHub · 0029 — Desafios da academia
--
-- `challenges` e `challenge_participants` existem desde a 0003 e nunca tiveram
-- tela. A 0014 construiu o sistema de desafios *da plataforma* — catálogo fixo,
-- ciclo mensal, medalha — e ele funciona. O que falta é a academia poder criar
-- o desafio dela: "Outubro: 15 check-ins", "Quem levantar mais volume no mês".
--
-- ── O que mudou desde a 0003 ─────────────────────────────────────────────────
--
-- A tabela nasceu com `metric` em texto livre e um comentário dizendo
-- "CHECKINS, STEPS, HYDRATION…". Passos e hidratação nunca existiram no
-- produto: seriam número digitado pelo próprio aluno, e desafio com ranking
-- sobre valor auto-declarado é competição de quem mente melhor.
--
-- As métricas aqui são as que o sistema **mede sozinho**. Três delas só
-- passaram a ser possíveis com a 0026, que começou a gravar série e carga:
--
--   CHECKINS          entrada na academia
--   WORKOUTS          treinos concluídos
--   SETS              séries registradas
--   VOLUME_KG         carga × repetições somadas
--   CLASS_ATTENDANCE  presença confirmada em aula
--
-- ── Ranking é dois consentimentos, não um ────────────────────────────────────
--
-- A academia liga o ranking no desafio, e cada aluno decide se aparece nele.
-- Os dois campos já estavam na 0003 com o comentário certo — "métrica pessoal
-- nunca aparece sem consentimento" — e nunca foram exercidos. Frequência e
-- carga dizem muito sobre o corpo e a rotina de alguém; quem não marcou
-- participa do desafio e some do quadro.
-- =============================================================================

alter table challenges
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('DRAFT', 'ACTIVE', 'CLOSED')),
  add column if not exists unit text not null default 'pontos',
  add column if not exists created_by_staff_id uuid references staff(id) on delete set null,
  add column if not exists reward text;

/*
 * A métrica passa a ser fechada. `not valid` porque a coluna é texto livre
 * desde a 0003 e pode ter qualquer coisa gravada — validar retroativamente
 * faria a migration falhar num banco com dado antigo. A restrição vale para
 * toda linha nova, que é o que importa daqui para frente.
 */
alter table challenges drop constraint if exists challenges_metric_conhecida;
alter table challenges add constraint challenges_metric_conhecida
  check (metric in ('CHECKINS', 'WORKOUTS', 'SETS', 'VOLUME_KG', 'CLASS_ATTENDANCE'))
  not valid;

alter table challenges
  drop constraint if exists challenges_periodo_valido;
alter table challenges add constraint challenges_periodo_valido
  check (ends_at >= starts_at) not valid;

create index if not exists challenges_org_status_idx
  on challenges (organization_id, status, ends_at desc);

alter table challenge_participants
  add column if not exists completed_at timestamptz;

-- ── A contagem ───────────────────────────────────────────────────────────────
/**
 * Soma progresso em todo desafio aberto que mede aquilo.
 *
 * Uma função só para as cinco métricas, chamada por gatilhos pequenos. A
 * alternativa — um gatilho completo por métrica — repetiria cinco vezes a mesma
 * consulta de "quais desafios estão abertos para esta pessoa hoje", e é nesse
 * tipo de repetição que uma das cópias envelhece diferente das outras.
 *
 * `security definer`: o gatilho roda no contexto de quem inseriu o check-in ou
 * a série, e precisa escrever numa linha de participação que essa pessoa não
 * necessariamente pode atualizar.
 */
create or replace function bump_gym_challenge(
  p_profile_id uuid,
  p_org_id     uuid,
  p_metric     text,
  p_delta      numeric,
  p_quando     timestamptz
) returns void
language sql volatile security definer set search_path = public as $$
  update challenge_participants p
  set progress_value = p.progress_value + p_delta,
      /*
       * A data de conclusão é gravada na primeira vez que a meta é batida, e
       * não sobrescrita depois. Quem passa da meta continua somando — ninguém
       * para de treinar porque o desafio acabou — mas a data que fica é a da
       * conquista.
       */
      completed_at = case
        when p.completed_at is null and p.progress_value + p_delta >= c.target_value
          then p_quando
        else p.completed_at
      end
  from challenges c
  where c.id = p.challenge_id
    and c.organization_id = p_org_id
    and c.status = 'ACTIVE'
    and c.metric = p_metric
    and p_quando::date between c.starts_at and c.ends_at
    and p.user_profile_id = p_profile_id
$$;

revoke all on function bump_gym_challenge(uuid, uuid, text, numeric, timestamptz)
  from public, anon, authenticated;

/** Check-in conta para CHECKINS. */
create or replace function gym_challenge_on_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  select user_profile_id into v_profile from students where id = new.student_id;
  if v_profile is not null then
    perform bump_gym_challenge(
      v_profile, new.organization_id, 'CHECKINS', 1, new.checked_in_at
    );
  end if;
  return null;
end;
$$;

create trigger check_ins_gym_challenge
  after insert on check_ins
  for each row execute function gym_challenge_on_checkin();

/** Treino concluído conta para WORKOUTS. */
create or replace function gym_challenge_on_workout() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  -- Só na transição para concluído: sem isto, cada UPDATE da sessão somaria de
  -- novo, e o aluno bateria a meta editando a mesma linha.
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then
    return null;
  end if;

  select user_profile_id into v_profile from students where id = new.student_id;
  if v_profile is not null then
    perform bump_gym_challenge(
      v_profile, new.organization_id, 'WORKOUTS', 1,
      coalesce(new.completed_at, now())
    );
  end if;
  return null;
end;
$$;

create trigger workout_sessions_gym_challenge
  after update on workout_sessions
  for each row execute function gym_challenge_on_workout();

/** Série conta para SETS e para VOLUME_KG. */
create or replace function gym_challenge_on_set() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  select s.user_profile_id into v_profile
  from workout_sessions w join students s on s.id = w.student_id
  where w.id = new.session_id;

  if v_profile is null then
    return null;
  end if;

  perform bump_gym_challenge(
    v_profile, new.organization_id, 'SETS', 1, new.completed_at
  );
  -- Série sem carga registrada é peso corporal: soma zero de volume, e o
  -- `coalesce` evita que o nulo zere o total inteiro.
  perform bump_gym_challenge(
    v_profile, new.organization_id, 'VOLUME_KG',
    coalesce(new.weight, 0) * new.reps_completed, new.completed_at
  );
  return null;
end;
$$;

create trigger workout_set_logs_gym_challenge
  after insert on workout_set_logs
  for each row execute function gym_challenge_on_set();

/** Presença em aula conta para CLASS_ATTENDANCE. */
create or replace function gym_challenge_on_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  if new.status <> 'ATTENDED' or old.status = 'ATTENDED' then
    return null;
  end if;

  select user_profile_id into v_profile from students where id = new.student_id;
  if v_profile is not null then
    perform bump_gym_challenge(
      v_profile, new.organization_id, 'CLASS_ATTENDANCE', 1,
      coalesce(new.attended_at, now())
    );
  end if;
  return null;
end;
$$;

create trigger class_bookings_gym_challenge
  after update on class_bookings
  for each row execute function gym_challenge_on_attendance();

-- ── Entrar e sair ────────────────────────────────────────────────────────────
/**
 * O aluno entra no desafio da própria academia.
 *
 * `p_ranking_opt_in` é a segunda tranca: a academia liga o ranking no desafio,
 * e aqui cada pessoa decide se o nome dela aparece. Quem não marca participa e
 * some do quadro.
 *
 * Idempotente pelo `unique (challenge_id, user_profile_id)`: entrar de novo
 * atualiza a escolha de ranking sem zerar o progresso já somado.
 */
create or replace function join_gym_challenge(
  p_challenge_id   uuid,
  p_ranking_opt_in boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_desafio challenges;
  v_profile uuid;
  v_id      uuid;
begin
  select * into v_desafio from challenges where id = p_challenge_id;
  if not found or v_desafio.organization_id is null then
    raise exception 'Desafio não encontrado.' using errcode = 'P0002';
  end if;

  if v_desafio.status <> 'ACTIVE' then
    raise exception 'Este desafio não está aberto.' using errcode = '23514';
  end if;

  if current_date > v_desafio.ends_at then
    raise exception 'Este desafio já terminou.' using errcode = '23514';
  end if;

  -- A pessoa precisa ser aluno desta academia. Sem isto, qualquer conta
  -- entraria no desafio de qualquer academia e apareceria no ranking dela.
  select s.user_profile_id into v_profile
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
    and s.organization_id = v_desafio.organization_id
    and s.status in ('ACTIVE', 'OVERDUE');

  if v_profile is null then
    raise exception 'Você não é aluno desta academia.' using errcode = '42501';
  end if;

  insert into challenge_participants (challenge_id, user_profile_id, ranking_opt_in)
  values (p_challenge_id, v_profile, p_ranking_opt_in)
  on conflict (challenge_id, user_profile_id)
    do update set ranking_opt_in = excluded.ranking_opt_in
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function join_gym_challenge(uuid, boolean) from public, anon;
grant execute on function join_gym_challenge(uuid, boolean) to authenticated, service_role;

/**
 * O quadro do desafio.
 *
 * SECURITY INVOKER, como as funções de relatório: a RLS filtra e não há
 * autorização a duplicar. A tranca do consentimento é explícita na cláusula
 * — quem não marcou `ranking_opt_in` não sai daqui, nem para a equipe.
 */
create or replace function gym_challenge_ranking(p_challenge_id uuid)
returns table (
  posicao        integer,
  nome           text,
  progresso      numeric,
  concluido_em   timestamptz
)
language sql stable as $$
  select
    rank() over (order by p.progress_value desc, p.completed_at nulls last)::integer,
    u.name,
    p.progress_value,
    p.completed_at
  from challenge_participants p
  join challenges c on c.id = p.challenge_id
  join user_profiles u on u.id = p.user_profile_id
  where p.challenge_id = p_challenge_id
    and c.ranking_enabled
    and p.ranking_opt_in
  order by 1
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
/*
 * `challenges` e `challenge_participants` já tinham RLS habilitada pela 0004,
 * mas as políticas de lá cobriam o caso da plataforma. Estas são as da
 * academia — o aluno enxerga o desafio da academia dele; a equipe escreve.
 */
drop policy if exists challenges_gym_read on challenges;
create policy challenges_gym_read on challenges
  for select using (organization_id is null or is_org_member(organization_id));

drop policy if exists challenges_gym_write on challenges;
create policy challenges_gym_write on challenges
  for all using (organization_id is not null and is_org_staff(organization_id))
  with check (organization_id is not null and is_org_staff(organization_id));

/*
 * A participação é da pessoa. A equipe vê para acompanhar quem entrou — mas o
 * ranking passa por `gym_challenge_ranking`, que exige o consentimento.
 */
drop policy if exists challenge_participants_self on challenge_participants;
create policy challenge_participants_self on challenge_participants
  for select using (
    user_profile_id = auth_profile_id()
    or exists (
      select 1 from challenges c
      where c.id = challenge_participants.challenge_id
        and c.organization_id is not null
        and is_org_staff(c.organization_id)
    )
  );

/*
 * Entrar passa por `join_gym_challenge`, que confere academia, matrícula e
 * janela. Progresso é escrito pelos gatilhos. Um insert cru permitiria entrar
 * no desafio de outra academia e digitar o próprio progresso.
 */
revoke insert, update, delete on challenge_participants from authenticated, anon;

insert into schema_migrations (version) values ('0029_desafios_da_academia.sql') on conflict do nothing;
