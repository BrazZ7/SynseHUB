-- =============================================================================
-- SynseHub · 0016 — SynseRun: atividades, rota, parciais e recordes
--
-- O que distingue este módulo de um cronômetro com GPS é o que fica gravado:
-- cada ponto da rota, cada parcial, cada recorde. Sem isso não há gráfico de
-- pace, não há mapa depois da corrida, não há "seu melhor 5 km", e não há como
-- a academia enxergar o esforço do aluno.
--
-- Três decisões que valem explicar:
--
--   1. A atividade pertence à PESSOA, não à academia. `organization_id` existe
--      e é opcional: serve para ranking e para o treinador enxergar, nunca para
--      decidir de quem é a corrida. Quem troca de academia leva o histórico.
--
--   2. Localização é dado sensível. A rota tem política própria, mais fechada
--      que a atividade: dá para ver que alguém correu 7 km sem poder refazer o
--      caminho de casa dele.
--
--   3. Recorde é derivado, e mesmo assim é gravado. Recalcular "melhor 5 km"
--      varrendo todas as atividades a cada abertura de tela fica caro rápido —
--      e o recorde precisa ser reconhecido no instante em que acontece, para a
--      tela poder comemorar.
-- =============================================================================

create type sport_type as enum ('RUN', 'WALK', 'RIDE');

create type activity_status as enum ('IN_PROGRESS', 'COMPLETED', 'DISCARDED');

/*
 * Privacidade por atividade, não por conta: a corrida de domingo no parque
 * pode ser pública e a de terça, saindo de casa, não.
 */
create type activity_privacy as enum ('PUBLIC', 'GYM', 'PRIVATE');

-- ── Atividade ────────────────────────────────────────────────────────────────
create table activities (
  id                uuid primary key default gen_random_uuid(),
  user_profile_id   uuid not null references user_profiles(id) on delete cascade,
  /** Academia no momento da atividade. Nulo para quem treina por conta própria. */
  organization_id   uuid references organizations(id) on delete set null,
  sport             sport_type not null default 'RUN',
  status            activity_status not null default 'IN_PROGRESS',
  title             text,

  started_at        timestamptz not null,
  ended_at          timestamptz,
  /** Segundos. Elapsed inclui pausa; moving desconta. */
  elapsed_seconds   integer not null default 0 check (elapsed_seconds >= 0),
  moving_seconds    integer not null default 0 check (moving_seconds >= 0),

  /** Metros. A unidade é única em todo o módulo — ver engine/types.ts. */
  distance_meters   numeric(10,2) not null default 0 check (distance_meters >= 0),

  /** Segundos por quilômetro. Nulo enquanto não houver distância. */
  average_pace      numeric(8,2),
  best_pace         numeric(8,2),
  /** Metros por segundo. */
  average_speed     numeric(6,3) not null default 0,
  max_speed         numeric(6,3) not null default 0,

  elevation_gain    numeric(8,2) not null default 0,
  elevation_loss    numeric(8,2) not null default 0,
  min_altitude      numeric(8,2),
  max_altitude      numeric(8,2),

  calories          integer not null default 0,

  start_latitude    numeric(10,7),
  start_longitude   numeric(10,7),
  end_latitude      numeric(10,7),
  end_longitude     numeric(10,7),

  privacy           activity_privacy not null default 'GYM',
  /** Metros do começo e do fim escondidos no mapa público. */
  privacy_zone_meters integer not null default 0 check (privacy_zone_meters >= 0),

  /*
   * Idempotência da sincronização: o aparelho gera o id antes de haver rede, e
   * reenvia até confirmar. Sem esta chave, uma corrida enviada duas vezes
   * viraria duas corridas.
   */
  client_id         text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (user_profile_id, client_id)
);

create index activities_person_idx on activities (user_profile_id, started_at desc);
create index activities_org_idx on activities (organization_id, started_at desc)
  where organization_id is not null;
create index activities_completed_idx on activities (user_profile_id, sport, started_at desc)
  where status = 'COMPLETED';

-- ── Rota ─────────────────────────────────────────────────────────────────────
/*
 * Um ponto por segundo, e uma corrida de uma hora tem 3.600 linhas. É muito, e
 * é o preço de poder desenhar o mapa e o gráfico depois. O que reduz de
 * verdade é gravar só o ponto que o filtro aceitou — o motor já descarta a
 * maior parte do ruído antes de chegar aqui.
 */
create table activity_points (
  id              bigint generated always as identity primary key,
  activity_id     uuid not null references activities(id) on delete cascade,
  latitude        numeric(10,7) not null,
  longitude       numeric(10,7) not null,
  altitude        numeric(8,2),
  /** m/s, como o aparelho informou. */
  speed           numeric(6,3),
  accuracy        numeric(6,2),
  heading         numeric(6,2),
  recorded_at     timestamptz not null,
  distance_from_previous numeric(8,2) not null default 0,
  total_distance  numeric(10,2) not null default 0
);

create index activity_points_route_idx on activity_points (activity_id, recorded_at);

-- ── Parciais ─────────────────────────────────────────────────────────────────
create table activity_splits (
  id              uuid primary key default gen_random_uuid(),
  activity_id     uuid not null references activities(id) on delete cascade,
  kilometer       smallint not null check (kilometer > 0),
  split_seconds   numeric(8,2) not null,
  pace_seconds    numeric(8,2) not null,
  elevation_gain  numeric(8,2) not null default 0,
  unique (activity_id, kilometer)
);

-- ── Recordes ─────────────────────────────────────────────────────────────────
/*
 * Distâncias clássicas em metros, e não em texto: 21097 é meia maratona, 42195
 * é maratona. Guardar "meia" como rótulo obrigaria a traduzir em todo lugar e
 * impediria comparar 5 km com 10 km na mesma consulta.
 */
create table personal_records (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  sport           sport_type not null default 'RUN',
  distance_meters integer not null,
  seconds         numeric(8,2) not null,
  pace_seconds    numeric(8,2) not null,
  activity_id     uuid not null references activities(id) on delete cascade,
  achieved_at     timestamptz not null default now(),
  unique (user_profile_id, sport, distance_meters)
);

create index personal_records_person_idx on personal_records (user_profile_id, sport);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table activities enable row level security;
alter table activity_points enable row level security;
alter table activity_splits enable row level security;
alter table personal_records enable row level security;

/** Atividades da própria pessoa, para as políticas abaixo não repetirem o join. */
create or replace function own_activity_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id
  from activities a
  join user_profiles p on p.id = a.user_profile_id
  where p.auth_user_id = auth.uid()
$$;

revoke all on function own_activity_ids from public;
grant execute on function own_activity_ids to anon, authenticated, service_role;

/*
 * A pessoa manda na própria atividade — inclusive para apagar. Corrida é dado
 * pessoal: quem correu decide se aquilo continua existindo.
 */
create policy activities_self on activities
  for all
  using (user_profile_id = (select auth_profile_id()))
  with check (user_profile_id = (select auth_profile_id()));

/*
 * A academia lê as atividades de quem é aluno dela e escolheu compartilhar.
 * É o que permite ranking e acompanhamento do treinador — e é opt-in por
 * atividade: "nunca publicar métricas pessoais do usuário sem consentimento".
 */
create policy activities_gym on activities
  for select
  using (
    privacy in ('PUBLIC', 'GYM')
    and organization_id is not null
    and organization_id in (select staff_organization_ids())
  );

/*
 * A rota é mais fechada que a atividade: nem a academia refaz o caminho de
 * casa do aluno. Saber que ele correu 7 km é uma coisa; saber por onde é outra.
 */
create policy activity_points_self on activity_points
  for all
  using (activity_id in (select own_activity_ids()))
  with check (activity_id in (select own_activity_ids()));

create policy activity_splits_self on activity_splits
  for all
  using (activity_id in (select own_activity_ids()))
  with check (activity_id in (select own_activity_ids()));

create policy activity_splits_gym on activity_splits
  for select
  using (
    activity_id in (
      select id from activities
      where privacy in ('PUBLIC', 'GYM')
        and organization_id in (select staff_organization_ids())
    )
  );

create policy personal_records_self on personal_records
  for select using (user_profile_id = (select auth_profile_id()));

-- ── Recordes reconhecidos pelo banco ─────────────────────────────────────────
/*
 * Roda ao concluir a atividade, e não na aplicação, pela mesma razão dos
 * gatilhos de notificação: importação, correção manual e app antigo têm de
 * produzir o mesmo recorde. Recorde reconhecido só no caminho instrumentado é
 * recorde que some quando o dado entra por outra porta.
 *
 * O tempo de cada distância é interpolado da rota — a marca dos 5 km quase
 * nunca cai em cima de um ponto de GPS.
 */
create or replace function claim_personal_records(p_activity_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_atividade  activities%rowtype;
  v_distancia  integer;
  v_segundos   numeric;
  v_novos      integer := 0;
  v_distancias constant integer[] := array[400, 1000, 1609, 5000, 10000, 15000, 21097, 42195];
begin
  select * into v_atividade from activities where id = p_activity_id;
  if v_atividade.id is null or v_atividade.status <> 'COMPLETED' then
    return 0;
  end if;

  foreach v_distancia in array v_distancias loop
    continue when v_atividade.distance_meters < v_distancia;

    -- Instante em que a rota cruzou a marca, interpolado entre dois pontos.
    /*
     * `coalesce(..., 0)` cobre a marca que cai exatamente em cima de um ponto:
     * ali o trecho tem comprimento zero, a fração seria divisão por zero, e o
     * recorde sumia inteiro. Com fração zero, o instante é o do próprio ponto.
     */
    select
      extract(epoch from (
        anterior.recorded_at
        + (atual.recorded_at - anterior.recorded_at)
          * coalesce(
              (v_distancia - anterior.total_distance) /
              nullif(atual.total_distance - anterior.total_distance, 0),
              0
            )
      ) - v_atividade.started_at)
    into v_segundos
    from activity_points atual
    join lateral (
      select * from activity_points anteriores
      where anteriores.activity_id = p_activity_id
        and anteriores.total_distance <= v_distancia
      order by anteriores.total_distance desc
      limit 1
    ) anterior on true
    where atual.activity_id = p_activity_id
      and atual.total_distance >= v_distancia
    order by atual.total_distance
    limit 1;

    continue when v_segundos is null or v_segundos <= 0;

    insert into personal_records
      (user_profile_id, sport, distance_meters, seconds, pace_seconds, activity_id)
    values (
      v_atividade.user_profile_id, v_atividade.sport, v_distancia,
      v_segundos, v_segundos / (v_distancia / 1000.0), p_activity_id
    )
    on conflict (user_profile_id, sport, distance_meters) do update
      set seconds = excluded.seconds,
          pace_seconds = excluded.pace_seconds,
          activity_id = excluded.activity_id,
          achieved_at = now()
      -- Só substitui quando é melhor. Sem isto, a última corrida viraria
      -- "recorde" mesmo sendo a mais lenta.
      where personal_records.seconds > excluded.seconds;

    if found then v_novos := v_novos + 1; end if;
  end loop;

  return v_novos;
end;
$$;

revoke all on function claim_personal_records(uuid) from public, anon;
grant execute on function claim_personal_records(uuid) to authenticated, service_role;

comment on function claim_personal_records is
  'Reconhece recordes de uma atividade concluída. Idempotente: só grava quando o tempo é melhor que o guardado.';
