-- =============================================================================
-- 0053 — a reimportação da plataforma de saúde atualiza a pesagem
--
-- ── O que estava errado ──────────────────────────────────────────────────────
--
-- `record_body_measurement` é idempotente por `(user_profile_id, client_id)`, e
-- no conflito atualizava **só** o `measured_at`. Para o Bluetooth isso está
-- certo: a balança manda a mesma leitura três vezes e nada deve mudar.
--
-- Para a importação do Apple Saúde e do Health Connect, não. O `client_id`
-- dessas pesagens deriva do identificador que a própria plataforma dá à
-- amostra, e o Health Connect **mantém esse identificador quando o registro é
-- corrigido**: alguém que conserta o peso em outro app gera uma atualização,
-- não uma amostra nova. Com o conflito ignorando os valores, a correção nunca
-- chegaria — o Synse guardaria o número errado para sempre, e a única saída
-- seria apagar a linha à mão.
--
-- O mesmo vale para enriquecimento: a pesagem que entrou só com peso, porque a
-- bioimpedância ainda não tinha sido escrita, ficava sem composição para
-- sempre.
--
-- ── O que muda, e o que deliberadamente não muda ─────────────────────────────
--
-- O conflito passa a atualizar os valores **apenas** quando a linha que já
-- existe e a que está chegando vêm da mesma plataforma de saúde. Em qualquer
-- outro caso o comportamento é exatamente o de antes.
--
-- Isso é o que impede dois estragos:
--
-- 1. Uma pesagem feita pelo Bluetooth, ou digitada à mão, não pode ser
--    reescrita por uma importação que reaproveitasse o mesmo `client_id`.
-- 2. A origem de uma linha nunca muda. Uma pesagem gravada como MANUAL
--    continua MANUAL — a tela diz de onde cada número veio, e deixar a origem
--    mudar por baixo transformaria essa frase em mentira.
--
-- A assinatura da função é a mesma, de propósito: `create or replace` preserva
-- as permissões e nada no aplicativo precisa mudar junto.
-- =============================================================================

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
  on conflict (user_profile_id, client_id) do nothing
  returning id into v_id;

  /*
   * `do nothing` não devolve linha no conflito, e é aí que a regra mora.
   *
   * A alternativa seria um `do update` com um `case` por coluna repetindo a
   * mesma condição catorze vezes. Em troca de uma instrução a menos, a regra
   * ficaria ilegível justamente numa função que grava dado de saúde — e a
   * condição teria de ser mantida idêntica em catorze lugares.
   */
  if v_id is null then
    /*
     * Atualiza os valores só quando as duas pontas são a mesma plataforma de
     * saúde. Pesagem de Bluetooth e pesagem digitada à mão continuam
     * intocadas: o `where` simplesmente não casa, e o `select` abaixo devolve
     * o id existente — que é o que a fila do aplicativo precisa para parar de
     * tentar.
     *
     * `source` fica de fora do `set` de propósito. A origem de uma linha nunca
     * muda: a tela diz de onde cada número veio, e deixar isso mudar por baixo
     * transformaria a frase em mentira.
     */
    update body_measurements set
      measured_at        = p_measured_at,
      weight_kg          = p_weight_kg,
      bmi                = p_bmi,
      body_fat_percent   = p_body_fat,
      muscle_mass_kg     = p_muscle_mass,
      lean_mass_kg       = p_lean_mass,
      body_water_percent = p_body_water,
      visceral_fat       = p_visceral_fat,
      bone_mass_kg       = p_bone_mass,
      bmr_kcal           = p_bmr_kcal,
      field_origin       = p_field_origin,
      raw_payload        = p_raw_payload
    where user_profile_id = v_perfil
      and client_id = p_client_id
      and source = p_source
      and p_source in ('APPLE_HEALTH', 'HEALTH_CONNECT')
    returning id into v_id;

    /*
     * Não era caso de atualizar — ou não era origem de saúde, ou a linha que
     * está lá veio de outro caminho. Continua valendo o que sempre valeu: o
     * reenvio só refresca o instante.
     */
    if v_id is null then
      update body_measurements set measured_at = p_measured_at
       where user_profile_id = v_perfil and client_id = p_client_id
      returning id into v_id;
    end if;
  end if;

  if p_device_id is not null then
    update user_devices set last_seen_at = now(), updated_at = now() where id = p_device_id;
  end if;

  return v_id;
end;
$$;

revoke all on function record_body_measurement(text, timestamptz, body_measurement_source, numeric, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, jsonb, jsonb) from public, anon;
grant execute on function record_body_measurement(text, timestamptz, body_measurement_source, numeric, uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, numeric, jsonb, jsonb) to authenticated, service_role;

insert into schema_migrations (version) values ('0053_reimportar_saude.sql') on conflict do nothing;
