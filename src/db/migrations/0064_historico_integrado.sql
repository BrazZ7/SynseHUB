-- =============================================================================
-- SynseHub · 0064 — O histórico integrado
--
-- O que a pessoa fez está em quatro lugares e nunca se encontra: o treino em
-- `workout_sessions`, a corrida em `activities`, a presença em `check_ins`, a
-- pesagem em `body_measurements`. Cada um tem a própria tela, e nenhuma
-- responde a pergunta mais simples que existe — **o que eu fiz na semana
-- passada?**
--
-- Esta função é a resposta: uma consulta, ordenada no tempo, com as quatro
-- origens juntas.
--
-- ── Por que no banco, e não juntando quatro leituras na aplicação ───────────
--
-- Por causa da paginação. Trazer vinte de cada origem, misturar e cortar nos
-- vinte primeiros dá o resultado certo na primeira página e errado em todas as
-- seguintes: quem correu trinta vezes num mês some do fim da lista, porque os
-- vinte que vieram não alcançam o período das outras origens. Fazer certo na
-- aplicação exigiria buscar tudo e paginar em memória.
--
-- E são quatro idas à rede em vez de uma, na tela que a pessoa rola.
--
-- ── Duas chaves, e isso não é detalhe ───────────────────────────────────────
--
-- Treino e check-in pendem de `student_id`, que é a **matrícula**. Corrida e
-- pesagem pendem de `user_profile_id`, que é a **pessoa** — a 0016 decidiu
-- assim de propósito: "a atividade pertence à pessoa, não à academia; quem
-- troca de academia leva o histórico junto".
--
-- A consequência aparece aqui: esta linha do tempo mostra as corridas e as
-- pesagens da pessoa inteira, e os treinos e presenças **desta** matrícula.
-- Quem treinou em outra academia antes vê as corridas daquela época e não vê
-- os treinos. Está certo assim — o treino é da academia que o prescreveu —,
-- mas precisa estar escrito, senão parece falta de dado.
--
-- ── O cursor é o par, não só a data ─────────────────────────────────────────
--
-- `(happened_at, ref_id)` e não `happened_at` sozinho. Com quatro origens,
-- dois eventos no mesmo instante são possíveis — a pesagem logo depois do
-- check-in da catraca, gravadas no mesmo segundo pelo mesmo aparelho —, e um
-- cursor só de data **pula** o segundo deles na página seguinte. Com o par, a
-- ordem é total e nada se perde entre páginas.
--
-- ── O esforço do treino vem junto ───────────────────────────────────────────
--
-- `workout_session_feedback` (0062) entra por `left join`: o cartão do treino
-- mostra "esforço 9, com desconforto" sem uma segunda consulta. É o que
-- transforma quatro listas coladas numa linha do tempo que vale ler.
-- =============================================================================

/**
 * A linha do tempo de quem está autenticado.
 *
 * Não recebe `student_id`: ele sai de `auth.uid()`, como em
 * `set_student_intake` (0063). Aqui isso é segurança e não só conveniência —
 * a função é `security definer` e lê saúde (peso) e localização indireta
 * (corrida), então um parâmetro de aluno seria uma porta para ler o histórico
 * alheio.
 *
 * **Só o próprio aluno.** A academia não entra: o peso tem consentimento
 * próprio (`body_shares`, 0032) e a corrida tem privacidade por atividade
 * (0016). Juntar tudo numa função que o staff pudesse chamar passaria por
 * cima das duas regras de uma vez.
 */
create or replace function student_timeline(
  p_limit     int default 20,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  kind             text,
  ref_id           uuid,
  happened_at      timestamptz,
  title            text,
  duration_seconds int,
  distance_meters  numeric,
  volume_kg        numeric,
  sets_count       int,
  weight_kg        numeric,
  effort           smallint,
  discomfort       boolean
)
language sql stable security definer set search_path = public as $$
  with eu as (
    select s.id as student_id, s.user_profile_id
    from students s
    join user_profiles p on p.id = s.user_profile_id
    where p.auth_user_id = auth.uid()
    order by s.created_at desc
    limit 1
  ),
  tudo as (
    -- Treino concluído, com o relato quando houver.
    select
      'TREINO'::text                       as kind,
      ws.id                                as ref_id,
      coalesce(ws.completed_at, ws.started_at) as happened_at,
      wp.name                              as title,
      ws.duration_seconds                  as duration_seconds,
      null::numeric                        as distance_meters,
      coalesce(sum(wsl.weight * wsl.reps_completed), 0) as volume_kg,
      count(wsl.id)::int                   as sets_count,
      null::numeric                        as weight_kg,
      f.effort                             as effort,
      f.discomfort                         as discomfort
    from workout_sessions ws
    join eu on eu.student_id = ws.student_id
    left join workout_plans wp on wp.id = ws.workout_plan_id
    left join workout_set_logs wsl on wsl.session_id = ws.id
    left join workout_session_feedback f on f.session_id = ws.id
    where ws.status = 'COMPLETED'
    group by ws.id, wp.name, f.effort, f.discomfort

    union all

    -- Corrida e demais esportes do SynseRun.
    select
      'CORRIDA',
      a.id,
      a.started_at,
      a.title,
      /*
       * `moving_seconds` e não `elapsed_seconds`: o histórico conta o tempo em
       * movimento, que é o que a tela da corrida já mostra. Quem parou vinte
       * minutos no semáforo não correu vinte minutos a mais.
       */
      nullif(a.moving_seconds, 0),
      a.distance_meters,
      null::numeric,
      null::int,
      null::numeric,
      null::smallint,
      null::boolean
    from activities a
    join eu on eu.user_profile_id = a.user_profile_id
    where a.status = 'COMPLETED'

    union all

    -- Presença na academia.
    select
      'CHECKIN',
      c.id,
      c.checked_in_at,
      null::text,
      null::int,
      null::numeric,
      null::numeric,
      null::int,
      null::numeric,
      null::smallint,
      null::boolean
    from check_ins c
    join eu on eu.student_id = c.student_id

    union all

    -- Pesagem. Só o peso: o resto da composição corporal tem tela própria.
    select
      'PESAGEM',
      b.id,
      b.measured_at,
      null::text,
      null::int,
      null::numeric,
      null::numeric,
      null::int,
      b.weight_kg,
      null::smallint,
      null::boolean
    from body_measurements b
    join eu on eu.user_profile_id = b.user_profile_id
    where b.weight_kg is not null
  )
  select
    t.kind,
    t.ref_id,
    t.happened_at,
    t.title,
    t.duration_seconds,
    t.distance_meters,
    t.volume_kg,
    t.sets_count,
    t.weight_kg,
    t.effort,
    t.discomfort
  from tudo t
  where
    p_before_at is null
    or p_before_id is null
    -- Comparação de par: ordem total, sem pular evento no mesmo instante.
    or (t.happened_at, t.ref_id) < (p_before_at, p_before_id)
  order by t.happened_at desc, t.ref_id desc
  -- Teto de cem: a tela pede vinte, e um pedido absurdo não vira varredura.
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke all on function student_timeline(int, timestamptz, uuid) from public, anon;
grant execute on function student_timeline(int, timestamptz, uuid) to authenticated, service_role;

insert into schema_migrations (version) values ('0064_historico_integrado.sql') on conflict do nothing;
