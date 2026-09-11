-- =============================================================================
-- SynseHub · 0014 — O que todo mundo recebe no primeiro minuto
--
-- Até aqui, quem entrava via tela vazia até a academia atribuir alguma coisa —
-- e quem entrou sem academia (0013) não tinha nem essa espera para esperar.
--
-- Três coisas passam a existir para todo mundo, de graça:
--
--   treino base          conteúdo fixo, no código (src/lib/baseline)
--   plano alimentar base conteúdo fixo, no código, sem prescrição individual
--   desafio do mês       este arquivo
--
-- Treino e alimentação base são conteúdo idêntico para todos: uma linha por
-- pessoa no banco seria multiplicar milhares de cópias do mesmo texto, e ainda
-- criaria a dúvida de qual cópia é a boa quando o texto mudar. Desafio é
-- diferente — tem escolha, progresso e medalha, e isso é dado de cada um.
--
-- O plano gratuito dá direito a UM desafio por ciclo. Não é limitação
-- artificial: um desafio por mês é o que uma pessoa consegue perseguir. O que
-- o Pro abre é a escolha entre mais desafios e o acúmulo de vários no mesmo
-- mês, além dos desafios marcados como PRO.
-- =============================================================================

-- ── Plano da pessoa ──────────────────────────────────────────────────────────
alter table user_profiles
  add column if not exists tier text not null default 'FREE'
    check (tier in ('FREE', 'PRO'));

/*
 * `user_profiles_update_self` deixa cada pessoa editar a própria ficha — nome,
 * telefone, foto. Sem a trava abaixo, deixaria também editar `tier`: bastaria
 * um PATCH em user_profiles para virar Pro sem pagar.
 *
 * A trava é por sinalizador de transação, não por papel. Papel se acerta com
 * grant, e grant de coluna não vale nada quando o papel já tem UPDATE na
 * tabela inteira — o privilégio de tabela cobre toda coluna, inclusive as
 * criadas depois. O sinalizador só é ligado por `set_user_tier`, que é a única
 * porta, e não há como ligá-lo pelo PostgREST.
 */
create or replace function guard_user_tier() returns trigger
language plpgsql as $$
begin
  if new.tier is distinct from old.tier
     and coalesce(current_setting('synse.allow_tier_change', true), '') <> '1'
  then
    raise exception 'O plano da conta não é editável pelo cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_guard_tier on user_profiles;
create trigger user_profiles_guard_tier
  before update on user_profiles
  for each row execute function guard_user_tier();

create or replace function set_user_tier(p_profile_id uuid, p_tier text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_tier not in ('FREE', 'PRO') then
    raise exception 'Plano inválido: %', p_tier using errcode = '22023';
  end if;

  perform set_config('synse.allow_tier_change', '1', true);
  update user_profiles set tier = p_tier where id = p_profile_id;
  perform set_config('synse.allow_tier_change', '', true);
end;
$$;

comment on function set_user_tier is
  'Única porta para mudar o plano da conta. Quem chama é a confirmação de pagamento, nunca a tela.';

revoke all on function set_user_tier(uuid, text) from public, anon, authenticated;
grant execute on function set_user_tier(uuid, text) to service_role;

-- ── Catálogo de desafios base ────────────────────────────────────────────────
create table if not exists baseline_challenges (
  code          text primary key,
  title         text not null,
  description   text not null,
  /** Como o progresso é contado. CHECKINS é o único que conta sozinho. */
  metric        text not null check (metric in
                  ('DISTANCE_KM', 'SESSIONS', 'LOAD_PERCENT', 'CHECKINS', 'MINUTES')),
  unit          text not null,
  target_value  numeric(10,2) not null check (target_value > 0),
  min_tier      text not null default 'FREE' check (min_tier in ('FREE', 'PRO')),
  position      smallint not null default 0,
  active        boolean not null default true
);

insert into baseline_challenges (code, title, description, metric, unit, target_value, min_tier, position)
values
  ('CORRIDA_20KM', 'Meta de corrida',
   'Somar 20 km de corrida ou caminhada no mês. Vale esteira, rua e parque.',
   'DISTANCE_KM', 'km', 20, 'FREE', 1),
  ('CARDIO_POS_TREINO', 'Cardio pós-treino',
   'Fazer 12 sessões de 15 minutos de cardio depois do treino de força.',
   'SESSIONS', 'sessões', 12, 'FREE', 2),
  ('CARGA_PROGRESSIVA', 'Aumento de carga',
   'Subir 10% na carga total dos seus principais exercícios até o fim do mês.',
   'LOAD_PERCENT', '%', 10, 'FREE', 3),
  ('CONSTANCIA_12', 'Constância',
   'Treinar 12 vezes no mês. Conta sozinho, pelos seus check-ins.',
   'CHECKINS', 'treinos', 12, 'FREE', 4),
  ('MOBILIDADE_300', 'Mobilidade diária',
   '300 minutos de mobilidade e alongamento no mês, 10 por dia.',
   'MINUTES', 'min', 300, 'PRO', 5),
  ('CONSTANCIA_20', 'Constância Pro',
   'Treinar 20 vezes no mês. Para quem já tem o hábito e quer subir a régua.',
   'CHECKINS', 'treinos', 20, 'PRO', 6)
on conflict (code) do nothing;

-- ── Escolha e progresso ──────────────────────────────────────────────────────
/** Primeiro dia do mês corrente. Todo desafio vive dentro de um ciclo. */
create or replace function current_cycle() returns date
language sql stable as $$
  select date_trunc('month', current_date)::date
$$;

create table if not exists challenge_entries (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  challenge_code  text not null references baseline_challenges(code) on delete restrict,
  cycle           date not null,
  /** Congelado na escolha: mudar a meta do catálogo não reescreve o passado. */
  target_value    numeric(10,2) not null,
  progress_value  numeric(10,2) not null default 0 check (progress_value >= 0),
  chosen_at       timestamptz not null default now(),
  closed_at       timestamptz,
  unique (user_profile_id, cycle, challenge_code)
);
create index if not exists challenge_entries_person_idx
  on challenge_entries (user_profile_id, cycle desc);

create table if not exists challenge_medals (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  challenge_code  text not null references baseline_challenges(code) on delete restrict,
  cycle           date not null,
  level           text not null check (level in ('PARTICIPACAO', 'BRONZE', 'PRATA', 'OURO')),
  progress_value  numeric(10,2) not null,
  target_value    numeric(10,2) not null,
  awarded_at      timestamptz not null default now(),
  unique (user_profile_id, cycle, challenge_code)
);
create index if not exists challenge_medals_person_idx
  on challenge_medals (user_profile_id, cycle desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
/*
 * O catálogo é público para quem está autenticado — é conteúdo, não dado
 * pessoal. Escolha, progresso e medalha são só de quem os viveu, nem a
 * academia lê: "nunca publicar métricas pessoais do usuário sem consentimento"
 * vale aqui inteiro. Quando a academia precisar ver, será por opt-in explícito,
 * como já é o ranking de `challenge_participants`.
 */
alter table baseline_challenges enable row level security;
alter table challenge_entries   enable row level security;
alter table challenge_medals    enable row level security;

drop policy if exists baseline_challenges_read on baseline_challenges;
create policy baseline_challenges_read on baseline_challenges
  for select using (active);

drop policy if exists challenge_entries_self on challenge_entries;
create policy challenge_entries_self on challenge_entries
  for select using (user_profile_id = (select auth_profile_id()));

drop policy if exists challenge_medals_self on challenge_medals;
create policy challenge_medals_self on challenge_medals
  for select using (user_profile_id = (select auth_profile_id()));

/*
 * Nenhuma política de escrita, de propósito: entrada e medalha nascem pelas
 * funções abaixo. Se o cliente pudesse inserir em `challenge_medals`, a
 * medalha de ouro seria um POST.
 */

-- ── Escolher o desafio do mês ────────────────────────────────────────────────
create or replace function choose_baseline_challenge(p_code text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_tier       text;
  v_cycle      date := current_cycle();
  v_challenge  baseline_challenges%rowtype;
  v_escolhidos integer;
  v_entry_id   uuid;
begin
  if v_profile_id is null then
    raise exception 'É preciso estar autenticado para escolher um desafio.'
      using errcode = '42501';
  end if;

  select tier into v_tier from user_profiles where id = v_profile_id;

  select * into v_challenge from baseline_challenges where code = p_code and active;
  if v_challenge.code is null then
    raise exception 'Desafio não encontrado.' using errcode = '22023';
  end if;

  if v_challenge.min_tier = 'PRO' and v_tier <> 'PRO' then
    raise exception 'Este desafio é do plano Pro.' using errcode = '42501';
  end if;

  select count(*) into v_escolhidos
  from challenge_entries
  where user_profile_id = v_profile_id and cycle = v_cycle;

  /*
   * O limite do plano gratuito é verificado aqui e não por índice único: o
   * índice não sabe o plano da pessoa, e um limite que muda de 1 para vários
   * conforme o plano não cabe numa restrição de tabela.
   */
  if v_tier <> 'PRO' and v_escolhidos >= 1
     and not exists (
       select 1 from challenge_entries
       where user_profile_id = v_profile_id and cycle = v_cycle and challenge_code = p_code
     )
  then
    raise exception 'No plano gratuito você escolhe um desafio por mês.'
      using errcode = '42501';
  end if;

  insert into challenge_entries (user_profile_id, challenge_code, cycle, target_value)
  values (v_profile_id, p_code, v_cycle, v_challenge.target_value)
  on conflict (user_profile_id, cycle, challenge_code) do nothing;

  select id into v_entry_id
  from challenge_entries
  where user_profile_id = v_profile_id and cycle = v_cycle and challenge_code = p_code;

  /*
   * Constância já tem os dados: os check-ins do mês contam sozinhos, inclusive
   * os de antes da escolha. Fazer a pessoa começar do zero num desafio que o
   * sistema já sabe medir seria pedir para ela refazer o que já fez.
   */
  if v_challenge.metric = 'CHECKINS' then
    update challenge_entries e
    set progress_value = (
      select count(*)
      from check_ins c
      join students s on s.id = c.student_id
      where s.user_profile_id = v_profile_id
        and c.checked_in_at >= v_cycle
        and c.checked_in_at < (v_cycle + interval '1 month')
    )
    where e.id = v_entry_id;
  end if;

  insert into notifications (user_profile_id, category, title, body, action_url)
  values (
    v_profile_id,
    'PROGRAM',
    'Desafio do mês escolhido',
    v_challenge.title || ' · meta de ' || trim(to_char(v_challenge.target_value, 'FM999990.99'))
      || ' ' || v_challenge.unit,
    '/app/challenges'
  );

  return v_entry_id;
end;
$$;

revoke all on function choose_baseline_challenge(text) from public, anon;
grant execute on function choose_baseline_challenge(text) to authenticated;

-- ── Registrar progresso ──────────────────────────────────────────────────────
create or replace function record_challenge_progress(p_code text, p_delta numeric)
returns numeric
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_cycle      date := current_cycle();
  v_total      numeric;
begin
  if v_profile_id is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;

  -- Um lançamento absurdo é erro de digitação, não recorde: 10 mil km num
  -- toque só encerraria o desafio por engano.
  if p_delta is null or p_delta <= 0 or p_delta > 1000 then
    raise exception 'Informe um valor entre 0 e 1000.' using errcode = '22023';
  end if;

  update challenge_entries
  set progress_value = progress_value + p_delta
  where user_profile_id = v_profile_id
    and cycle = v_cycle
    and challenge_code = p_code
    and closed_at is null
  returning progress_value into v_total;

  if v_total is null then
    raise exception 'Você não tem este desafio em andamento.' using errcode = '22023';
  end if;

  return v_total;
end;
$$;

revoke all on function record_challenge_progress(text, numeric) from public, anon;
grant execute on function record_challenge_progress(text, numeric) to authenticated;

-- ── Check-in conta sozinho ───────────────────────────────────────────────────
create or replace function count_checkin_towards_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
begin
  select user_profile_id into v_profile_id from students where id = new.student_id;
  if v_profile_id is null then
    return new;
  end if;

  update challenge_entries e
  set progress_value = e.progress_value + 1
  from baseline_challenges c
  where c.code = e.challenge_code
    and c.metric = 'CHECKINS'
    and e.user_profile_id = v_profile_id
    and e.cycle = date_trunc('month', new.checked_in_at)::date
    and e.closed_at is null;

  return new;
end;
$$;

drop trigger if exists check_ins_count_challenge on check_ins;
create trigger check_ins_count_challenge
  after insert on check_ins
  for each row execute function count_checkin_towards_challenge();

-- ── Fechamento do ciclo e medalha ────────────────────────────────────────────
/*
 * Fecha os ciclos passados de quem chamou, e só os dela.
 *
 * Sem agendador: a função é chamada quando a pessoa abre o app. Um cron
 * mensal daria o mesmo resultado e uma peça de infraestrutura a mais para
 * quebrar em silêncio — aqui, se ninguém abre o app, não há medalha para
 * entregar mesmo.
 *
 * Idempotente pelo `closed_at` e pela chave única da medalha: chamar dez vezes
 * no mesmo dia entrega uma medalha só.
 */
create or replace function close_own_challenge_cycles() returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_entry      record;
  v_percent    numeric;
  v_level      text;
  v_total      integer := 0;
begin
  if v_profile_id is null then
    return 0;
  end if;

  for v_entry in
    select e.*, c.title, c.unit
    from challenge_entries e
    join baseline_challenges c on c.code = e.challenge_code
    where e.user_profile_id = v_profile_id
      and e.cycle < current_cycle()
      and e.closed_at is null
  loop
    v_percent := case
      when v_entry.target_value > 0 then (v_entry.progress_value / v_entry.target_value) * 100
      else 0
    end;

    v_level := case
      when v_percent >= 100 then 'OURO'
      when v_percent >= 75  then 'PRATA'
      when v_percent >= 50  then 'BRONZE'
      else 'PARTICIPACAO'
    end;

    insert into challenge_medals
      (user_profile_id, challenge_code, cycle, level, progress_value, target_value)
    values
      (v_profile_id, v_entry.challenge_code, v_entry.cycle, v_level,
       v_entry.progress_value, v_entry.target_value)
    on conflict (user_profile_id, cycle, challenge_code) do nothing;

    update challenge_entries set closed_at = now() where id = v_entry.id;

    insert into notifications (user_profile_id, category, title, body, action_url)
    values (
      v_profile_id,
      'PROGRAM',
      case v_level
        when 'OURO' then 'Medalha de ouro: ' || v_entry.title
        when 'PRATA' then 'Medalha de prata: ' || v_entry.title
        when 'BRONZE' then 'Medalha de bronze: ' || v_entry.title
        else 'Fechamento do mês: ' || v_entry.title
      end,
      'Você somou ' || trim(to_char(v_entry.progress_value, 'FM999990.99')) || ' de '
        || trim(to_char(v_entry.target_value, 'FM999990.99')) || ' ' || v_entry.unit
        || ' (' || round(v_percent) || '%). Veja a análise do mês.',
      '/app/challenges'
    );

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke all on function close_own_challenge_cycles() from public, anon;
grant execute on function close_own_challenge_cycles() to authenticated;
