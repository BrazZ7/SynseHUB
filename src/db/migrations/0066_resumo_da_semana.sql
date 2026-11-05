-- =============================================================================
-- SynseHub · 0066 — O resumo da semana
--
-- A home tem um anel que diz "3 de 5 dias treinados". O 5 está **cravado no
-- código** (`WEEKLY_TARGET` em `app-service.ts`), e desde a 0063 o aluno diz na
-- entrada guiada quantos dias por semana quer treinar. Quem declarou três e
-- treinou três vê 60% e um anel pela metade — a tela chama de fracasso a semana
-- que a pessoa cumpriu.
--
-- Esta função é o resumo que faltava, e a meta dele é a que a pessoa declarou.
--
-- ── Por que no banco ────────────────────────────────────────────────────────
--
-- "Número derivado é calculado pelo banco, não recebido do cliente" é regra do
-- projeto, e aqui ela tem um motivo concreto além da regra: a semana civil
-- depende do fuso da academia. Em UTC, o treino de sexta às 21h cai no sábado,
-- e o de domingo às 22h cai na segunda — isto é, na semana seguinte. Metade dos
-- treinos de quem treina à noite mudaria de semana.
--
-- `org_timezone` (0024) já resolve o fuso, e `at time zone` faz a conta no
-- lugar certo. A aplicação faria o mesmo em JavaScript, com uma segunda
-- implementação das mesmas regras — que é o defeito que `janelas.ts` existe
-- para documentar: duas contas da mesma semana discordando na mesma tela.
--
-- ── Semana de segunda a domingo ─────────────────────────────────────────────
--
-- `date_trunc('week', ...)` no Postgres começa na **segunda**, que é a semana
-- de academia: quem treina sábado e domingo fecha o ciclo, não começa outro.
--
-- ── Vem uma linha por semana, mesmo na semana vazia ─────────────────────────
--
-- As semanas saem de `generate_series`, e os números entram por `left join`.
-- Sem isso, quem não treinou nesta semana não receberia linha nenhuma — e a
-- tela mostraria a semana passada como se fosse esta, que é o pior erro
-- possível num resumo: dizer que a pessoa treinou quando ela não treinou.
--
-- ── Dias treinados conta a academia; a corrida tem linha própria ────────────
--
-- `days_trained` são dias distintos com **treino concluído ou check-in**, e
-- não inclui corrida. Não é esquecimento, são as duas chaves da 0016: treino e
-- presença pendem de `student_id`, que é a matrícula; corrida pende de
-- `user_profile_id`, que é a pessoa. Somar as três num número só misturaria as
-- duas chaves, e o número deixaria de bater com o anel da home — duas contas
-- da mesma semana discordando, de novo.
--
-- A corrida aparece inteira, em `runs` e `distance_meters`. Ela não desaparece;
-- ela é contada pelo que é.
--
-- ── O peso é o último da semana, e pode faltar ──────────────────────────────
--
-- `weight_kg` é a última pesagem **daquela** semana, ou nulo. Quem não se pesou
-- não ganha um número inventado: a tela compara duas semanas só quando as duas
-- têm pesagem. Repetir o peso da semana anterior desenharia uma linha reta que
-- a pessoa leria como "não mudei nada".
--
-- ── Só o próprio aluno ──────────────────────────────────────────────────────
--
-- Mesma regra da 0064, pelo mesmo motivo: a função lê peso, que tem
-- consentimento próprio (`body_shares`, 0032), e corrida, que tem privacidade
-- por atividade (0016). Sem parâmetro de aluno — a identidade sai de
-- `auth.uid()` —, então não há porta para ler a semana de outra pessoa.
-- =============================================================================

/**
 * O resumo semanal de quem está autenticado, uma linha por semana.
 *
 * Mais recente primeiro: a linha 0 é esta semana, a linha 1 é a passada. A
 * tela compara as duas; `p_weeks` maior serve para a série.
 */
create or replace function student_week_summary(p_weeks int default 2)
returns table (
  week_start       date,
  days_trained     int,
  workouts         int,
  workout_seconds  int,
  volume_kg        numeric,
  sets_count       int,
  runs             int,
  run_seconds      int,
  distance_meters  numeric,
  check_ins        int,
  avg_effort       numeric,
  weight_kg        numeric,
  target_days      smallint
)
language sql stable security definer set search_path = public as $$
  with eu as (
    select s.id as student_id, s.user_profile_id, s.organization_id
    from students s
    join user_profiles p on p.id = s.user_profile_id
    where p.auth_user_id = auth.uid()
    order by s.created_at desc
    limit 1
  ),
  fuso as (
    select org_timezone((select organization_id from eu)) as tz
  ),
  /*
   * Teto de doze semanas. A tela pede duas; um pedido absurdo não vira
   * varredura de anos, e doze é um trimestre — o maior recorte que um resumo
   * semanal ainda ajuda a ler.
   */
  semanas as (
    select (
      date_trunc('week', (now() at time zone (select tz from fuso)))
      - make_interval(weeks => g)
    )::date as week_start
    from generate_series(0, least(greatest(coalesce(p_weeks, 2), 1), 12) - 1) as g
  ),
  /*
   * O piso da janela, de volta em instante com fuso: é o que limita cada
   * origem. Sem ele, cada agregado varreria o histórico inteiro do aluno para
   * o join final descartar tudo fora das semanas pedidas.
   */
  janela as (
    select ((select min(week_start) from semanas)::timestamp
            at time zone (select tz from fuso)) as desde
  ),
  dias as (
    select date_trunc('week', d)::date as week_start,
           count(distinct d::date)::int as days_trained
    from (
      select (ws.completed_at at time zone f.tz) as d
      from workout_sessions ws
      join eu on eu.student_id = ws.student_id
      cross join fuso f
      where ws.status = 'COMPLETED'
        and ws.completed_at >= (select desde from janela)

      union all

      select (c.checked_in_at at time zone f.tz)
      from check_ins c
      join eu on eu.student_id = c.student_id
      cross join fuso f
      where c.checked_in_at >= (select desde from janela)
    ) t
    group by 1
  ),
  treinos as (
    select date_trunc('week', ws.completed_at at time zone f.tz)::date as week_start,
           count(*)::int as workouts,
           coalesce(sum(ws.duration_seconds), 0)::int as workout_seconds,
           round(avg(fb.effort), 1) as avg_effort
    from workout_sessions ws
    join eu on eu.student_id = ws.student_id
    cross join fuso f
    -- `left join`: o esforço é opcional, e um treino sem relato continua treino.
    left join workout_session_feedback fb on fb.session_id = ws.id
    where ws.status = 'COMPLETED'
      and ws.completed_at >= (select desde from janela)
    group by 1
  ),
  /*
   * O volume sai em agregado próprio, e não no de cima: juntar as séries e o
   * relato na mesma consulta multiplicaria as linhas do `left join` do
   * feedback pelas séries, e o esforço médio sairia pesado pelo número de
   * séries de cada treino.
   */
  volume as (
    select date_trunc('week', ws.completed_at at time zone f.tz)::date as week_start,
           coalesce(sum(l.weight * l.reps_completed), 0) as volume_kg,
           count(l.id)::int as sets_count
    from workout_sessions ws
    join eu on eu.student_id = ws.student_id
    cross join fuso f
    join workout_set_logs l on l.session_id = ws.id
    where ws.status = 'COMPLETED'
      and ws.completed_at >= (select desde from janela)
    group by 1
  ),
  corridas as (
    select date_trunc('week', a.started_at at time zone f.tz)::date as week_start,
           count(*)::int as runs,
           -- `moving_seconds`, como na 0064: parado no semáforo não é corrida.
           coalesce(sum(nullif(a.moving_seconds, 0)), 0)::int as run_seconds,
           coalesce(sum(a.distance_meters), 0) as distance_meters
    from activities a
    join eu on eu.user_profile_id = a.user_profile_id
    cross join fuso f
    where a.status = 'COMPLETED'
      and a.started_at >= (select desde from janela)
    group by 1
  ),
  presencas as (
    select date_trunc('week', c.checked_in_at at time zone f.tz)::date as week_start,
           count(*)::int as check_ins
    from check_ins c
    join eu on eu.student_id = c.student_id
    cross join fuso f
    where c.checked_in_at >= (select desde from janela)
    group by 1
  ),
  peso as (
    select distinct on (date_trunc('week', b.measured_at at time zone f.tz))
           date_trunc('week', b.measured_at at time zone f.tz)::date as week_start,
           b.weight_kg
    from body_measurements b
    join eu on eu.user_profile_id = b.user_profile_id
    cross join fuso f
    where b.weight_kg is not null
      and b.measured_at >= (select desde from janela)
    order by date_trunc('week', b.measured_at at time zone f.tz), b.measured_at desc
  ),
  meta as (
    select i.days_per_week
    from student_intake i
    join eu on eu.student_id = i.student_id
  )
  select
    s.week_start,
    coalesce(d.days_trained, 0),
    coalesce(t.workouts, 0),
    coalesce(t.workout_seconds, 0),
    coalesce(v.volume_kg, 0),
    coalesce(v.sets_count, 0),
    coalesce(c.runs, 0),
    coalesce(c.run_seconds, 0),
    coalesce(c.distance_meters, 0),
    coalesce(p.check_ins, 0),
    -- Esforço e peso ficam nulos de propósito: ausência não é zero.
    t.avg_effort,
    w.weight_kg,
    (select days_per_week from meta)
  from semanas s
  left join dias      d on d.week_start = s.week_start
  left join treinos   t on t.week_start = s.week_start
  left join volume    v on v.week_start = s.week_start
  left join corridas  c on c.week_start = s.week_start
  left join presencas p on p.week_start = s.week_start
  left join peso      w on w.week_start = s.week_start
  order by s.week_start desc;
$$;

revoke all on function student_week_summary(int) from public, anon;
grant execute on function student_week_summary(int) to authenticated, service_role;

insert into schema_migrations (version) values ('0066_resumo_da_semana.sql') on conflict do nothing;
