-- =============================================================================
-- SynseHub · 0032 — Synse Body
--
-- Balança inteligente ligada ao app: o aparelho mede, o Synse guarda.
--
-- ── Por que não reusar `assessments` ─────────────────────────────────────────
--
-- `assessments` já tem peso, IMC e percentual de gordura, e a pergunta foi
-- feita antes de escrever uma linha. São coisas diferentes, e misturá-las
-- estragaria as duas.
--
-- A avaliação é um **documento profissional**: tem `assessed_by_staff_id` não
-- nulo, dobras cutâneas, protocolo declarado, e acontece três ou quatro vezes
-- por ano. A pesagem é uma **leitura de aparelho**: acontece toda semana, não
-- tem responsável técnico, e o número vem de bioimpedância — que é estimativa,
-- não medição direta.
--
-- Guardar as duas na mesma tabela faria o gráfico de evolução da avaliação
-- profissional ser inundado por cem pesagens, e faria uma leitura de balança
-- parecer ter a mesma autoridade de uma avaliação com adipômetro. São
-- confiabilidades diferentes, e a tela precisa poder dizer isso.
--
-- ── A quem a medida pertence ─────────────────────────────────────────────────
--
-- A `user_profiles`, não a `students`. O corpo é da pessoa: ela troca de
-- academia, cancela a matrícula, volta um ano depois — e o histórico dela
-- continua sendo dela. Amarrar a medida à matrícula significaria perder o
-- histórico no dia do cancelamento.
--
-- ── Quem mais pode ver ───────────────────────────────────────────────────────
--
-- Ninguém, por padrão. Pertencer à mesma academia **não** dá acesso: é dado de
-- bioimpedância, que diz gordura visceral e água corporal de alguém. A abertura
-- é explícita, por pessoa, e revogável — `body_measurement_shares`.
-- =============================================================================

create type body_measurement_source as enum (
  'BLUETOOTH_SCALE',
  'MANUAL',
  'APPLE_HEALTH',
  'HEALTH_CONNECT',
  'VENDOR_CLOUD'
);

create type device_status as enum ('ACTIVE', 'INACTIVE', 'REMOVED');

-- ── Dispositivos ─────────────────────────────────────────────────────────────
create table user_devices (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  device_type     text not null default 'SCALE' check (device_type in ('SCALE')),
  /*
   * Qual adaptador fala com este aparelho. `standard_ble` é o do padrão
   * Bluetooth SIG; os demais entram quando existir hardware para testar.
   * Texto e não enum: acrescentar fabricante não pode exigir migration.
   */
  provider        text not null default 'standard_ble',
  manufacturer    text,
  model           text,
  display_name    text not null,
  /*
   * O identificador que a plataforma dá — e não o MAC.
   *
   * Android e iOS aleatorizam o endereço por privacidade, e no iOS o
   * CoreBluetooth nem expõe MAC: devolve um UUID próprio, estável para aquele
   * aparelho naquele iPhone. Guardar MAC significaria perder o vínculo na
   * próxima rotação do endereço.
   */
  platform_device_identifier text not null,
  protocol        text,
  /*
   * O que este aparelho comprovadamente entrega, descoberto na comunicação —
   * não o que o fabricante promete. Preenchido no pareamento, depois de ler os
   * serviços de verdade.
   */
  capabilities    jsonb not null default '{}'::jsonb,
  firmware_version text,
  paired_at       timestamptz not null default now(),
  last_seen_at    timestamptz,
  status          device_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  /*
   * O mesmo aparelho não entra duas vezes para a mesma pessoa. Não é único
   * global de propósito: uma balança de família é o mesmo aparelho para várias
   * pessoas, cada uma com o próprio vínculo.
   */
  unique (user_profile_id, platform_device_identifier)
);
create index user_devices_person_idx on user_devices (user_profile_id, status);

-- ── Medições ─────────────────────────────────────────────────────────────────
create table body_measurements (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  -- Nulo em entrada manual e em origem externa.
  device_id       uuid references user_devices(id) on delete set null,
  measured_at     timestamptz not null,
  source          body_measurement_source not null default 'BLUETOOTH_SCALE',

  /*
   * Peso sempre em quilo. A balança que reporta libra é convertida no parser —
   * guardar a unidade junto faria toda leitura do histórico precisar converter,
   * e um dia alguém esqueceria.
   */
  weight_kg         numeric(6,3) check (weight_kg > 0 and weight_kg < 700),
  bmi               numeric(5,2) check (bmi >= 0),
  body_fat_percent  numeric(5,2) check (body_fat_percent between 0 and 100),
  muscle_mass_kg    numeric(6,3) check (muscle_mass_kg >= 0),
  lean_mass_kg      numeric(6,3) check (lean_mass_kg >= 0),
  body_water_percent numeric(5,2) check (body_water_percent between 0 and 100),
  visceral_fat      numeric(5,2) check (visceral_fat >= 0),
  bone_mass_kg      numeric(6,3) check (bone_mass_kg >= 0),
  bmr_kcal          integer check (bmr_kcal >= 0),
  /** Impedância bruta em ohms, quando a balança informa. */
  impedance_ohm     numeric(7,1) check (impedance_ohm >= 0),

  /*
   * O pacote como chegou. Serve para auditoria e para depurar uma balança nova
   * sem o hardware na mão — e é o que permite reprocessar quando um parser for
   * corrigido. Nunca substitui os campos acima.
   */
  raw_payload     jsonb,
  /*
   * Quais campos vieram do aparelho, quais o Synse calculou, quais não vieram.
   * Sem isto, a tela não consegue dizer "seu IMC o Synse calculou; a gordura a
   * balança estimou" — e apresentar estimativa de bioimpedância como medição
   * direta é o tipo de imprecisão que vira decisão sobre o próprio corpo.
   */
  field_origin    jsonb not null default '{}'::jsonb,

  /*
   * Gerado no aparelho antes de existir rede, como no Treino Ativo e no
   * SynseRun. É ele que absorve a balança mandando a mesma leitura três vezes e
   * o reenvio da fila offline.
   */
  client_id       text not null,
  created_at      timestamptz not null default now(),
  unique (user_profile_id, client_id)
);
create index body_measurements_person_idx
  on body_measurements (user_profile_id, measured_at desc);

/*
 * A mesma balança não grava duas leituras no mesmo segundo.
 *
 * O `client_id` cobre o reenvio idêntico; este índice cobre o caso em que o
 * aparelho notifica a mesma pesagem com identificadores diferentes — que é como
 * várias balanças se comportam ao confirmar a estabilização.
 */
create unique index body_measurements_sem_repeticao_idx
  on body_measurements (user_profile_id, device_id, measured_at)
  where device_id is not null;

-- ── Compartilhamento explícito ───────────────────────────────────────────────
/**
 * Quem a pessoa autorizou a ver o corpo dela.
 *
 * Existe porque pertencer à mesma academia não pode bastar. O professor que
 * acompanha alguém precisa ver a evolução — mas com autorização dada por quem é
 * medido, e revogável a qualquer momento.
 */
create table body_measurement_shares (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  /** Com quem: uma pessoa, não uma academia inteira. */
  shared_with_profile_id uuid not null references user_profiles(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  unique (user_profile_id, shared_with_profile_id)
);
create index body_shares_alvo_idx
  on body_measurement_shares (shared_with_profile_id) where revoked_at is null;

/** A autorização está de pé? */
create or replace function body_shared_with_me(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from body_measurement_shares s
    where s.user_profile_id = p_owner
      and s.shared_with_profile_id = auth_profile_id()
      and s.revoked_at is null
  )
$$;

-- ── Escrita ──────────────────────────────────────────────────────────────────
/**
 * Grava a medição.
 *
 * A pessoa sai do `auth.uid()`, nunca do que o cliente mandou: aceitar
 * `user_profile_id` do formulário deixaria qualquer conta gravar peso em nome
 * de outra — e num aparelho de família isso é o erro mais fácil de cometer.
 *
 * Idempotente por `unique (user_profile_id, client_id)`. Devolve o id, o mesmo
 * no reenvio, que é o que deixa a fila local parar de tentar.
 */
create or replace function record_body_measurement(
  p_client_id     text,
  p_measured_at   timestamptz,
  p_source        body_measurement_source,
  p_weight_kg     numeric default null,
  p_device_id     uuid default null,
  p_bmi           numeric default null,
  p_body_fat      numeric default null,
  p_muscle_mass   numeric default null,
  p_lean_mass     numeric default null,
  p_body_water    numeric default null,
  p_visceral_fat  numeric default null,
  p_bone_mass     numeric default null,
  p_bmr_kcal      integer default null,
  p_impedance     numeric default null,
  p_raw_payload   jsonb default null,
  p_field_origin  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid;
  v_id     uuid;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador da medição ausente.' using errcode = '22023';
  end if;

  v_perfil := auth_profile_id();
  if v_perfil is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  -- Uma pesagem sem peso não é pesagem.
  if p_weight_kg is null or p_weight_kg <= 0 then
    raise exception 'Medição sem peso não é gravada.' using errcode = '23514';
  end if;

  /*
   * O aparelho precisa ser desta pessoa. Sem esta checagem, um id de balança de
   * outra pessoa colado na chamada ligaria a medição ao aparelho errado — e o
   * histórico do aparelho é o que diz de onde o número veio.
   */
  if p_device_id is not null and not exists (
    select 1 from user_devices
    where id = p_device_id and user_profile_id = v_perfil and status <> 'REMOVED'
  ) then
    raise exception 'Este aparelho não é seu.' using errcode = '42501';
  end if;

  insert into body_measurements (
    user_profile_id, device_id, measured_at, source, weight_kg, bmi,
    body_fat_percent, muscle_mass_kg, lean_mass_kg, body_water_percent,
    visceral_fat, bone_mass_kg, bmr_kcal, impedance_ohm,
    raw_payload, field_origin, client_id
  )
  values (
    v_perfil, p_device_id, p_measured_at, p_source, p_weight_kg, p_bmi,
    p_body_fat, p_muscle_mass, p_lean_mass, p_body_water,
    p_visceral_fat, p_bone_mass, p_bmr_kcal, p_impedance,
    p_raw_payload, p_field_origin, p_client_id
  )
  on conflict (user_profile_id, client_id) do update set measured_at = excluded.measured_at
  returning id into v_id;

  if p_device_id is not null then
    update user_devices set last_seen_at = now(), updated_at = now() where id = p_device_id;
  end if;

  return v_id;
end;
$$;

revoke all on function record_body_measurement(text, timestamptz, body_measurement_source, numeric, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, jsonb, jsonb) from public, anon;
grant execute on function record_body_measurement(text, timestamptz, body_measurement_source, numeric, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, jsonb, jsonb) to authenticated, service_role;

/** Vincula o aparelho à pessoa autenticada. Idempotente pelo identificador. */
create or replace function pair_user_device(
  p_platform_identifier text,
  p_display_name        text,
  p_provider            text default 'standard_ble',
  p_manufacturer        text default null,
  p_model               text default null,
  p_protocol            text default null,
  p_capabilities        jsonb default '{}'::jsonb,
  p_firmware            text default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid;
  v_id     uuid;
begin
  v_perfil := auth_profile_id();
  if v_perfil is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  if coalesce(trim(p_platform_identifier), '') = '' then
    raise exception 'Aparelho sem identificador da plataforma.' using errcode = '22023';
  end if;

  insert into user_devices (
    user_profile_id, platform_device_identifier, display_name, provider,
    manufacturer, model, protocol, capabilities, firmware_version
  )
  values (
    v_perfil, p_platform_identifier, p_display_name, p_provider,
    p_manufacturer, p_model, p_protocol, p_capabilities, p_firmware
  )
  on conflict (user_profile_id, platform_device_identifier) do update
    set display_name = excluded.display_name,
        capabilities = excluded.capabilities,
        firmware_version = coalesce(excluded.firmware_version, user_devices.firmware_version),
        -- Revincular um aparelho removido o traz de volta em vez de recusar.
        status = 'ACTIVE',
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function pair_user_device(text, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function pair_user_device(text, text, text, text, text, text, jsonb, text) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table user_devices            enable row level security;
alter table body_measurements       enable row level security;
alter table body_measurement_shares enable row level security;

/*
 * O aparelho é de quem o vinculou. Nem a academia vê: saber que alguém tem
 * balança em casa não é da conta dela.
 */
create policy user_devices_self on user_devices
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

/*
 * A medição é da pessoa, e de quem ela autorizou — nominalmente, não por
 * academia. Gordura visceral e água corporal dizem muito sobre alguém, e
 * "trabalha na mesma academia" não é consentimento.
 */
create policy body_measurements_self on body_measurements
  for select using (
    user_profile_id = auth_profile_id() or body_shared_with_me(user_profile_id)
  );

/*
 * Apagar é da pessoa: dado corporal que não se apaga é dado que prende. A
 * escrita passa por `record_body_measurement`, que confere dono e aparelho.
 */
create policy body_measurements_delete_self on body_measurements
  for delete using (user_profile_id = auth_profile_id());

create policy body_shares_owner on body_measurement_shares
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());
/** Quem recebeu enxerga a própria autorização, para saber que ela existe. */
create policy body_shares_target_read on body_measurement_shares
  for select using (shared_with_profile_id = auth_profile_id());

/*
 * Insert cru bloqueado: `record_body_measurement` é quem resolve a pessoa pelo
 * `auth.uid()` e confere o aparelho. Sem o revoke, um insert direto gravaria
 * peso em nome de outra pessoa da mesma balança de família.
 */
revoke insert, update on body_measurements from authenticated, anon;

insert into schema_migrations (version) values ('0032_synse_body.sql') on conflict do nothing;
