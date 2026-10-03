-- =============================================================================
-- SynseHub · 0027 — Relatórios
--
-- O Treino Ativo começou a gravar série, carga e descanso. O dado existe e não
-- tem tela: evolução de carga, volume, recorde pessoal. Esta migration é a
-- camada que responde essas perguntas.
--
-- ── Por que no banco, e não em TypeScript ────────────────────────────────────
--
-- O painel já agrega receita em TypeScript, puxando as cobranças e somando em
-- memória. Funciona porque são centenas de linhas. Série de treino é outra
-- ordem de grandeza: uma academia com duzentos alunos treinando quatro vezes
-- por semana produz cerca de 20 mil séries por mês. Trazer isso pela rede para
-- somar no servidor da aplicação seria pagar transferência e memória para
-- descartar 99% do que chegou.
--
-- ── Por que SECURITY INVOKER ─────────────────────────────────────────────────
--
-- Todas as funções aqui rodam com os privilégios de quem chama — o padrão, sem
-- `security definer`. A consequência é a que interessa: a RLS das tabelas se
-- aplica normalmente, e a função só enxerga o que a pessoa já podia enxergar.
--
-- Isso é deliberado e é o oposto do que as migrations de escrita fazem. Lá o
-- `security definer` existe para o gatilho poder escrever onde o usuário não
-- pode. Aqui não há nada a escrever, então dar privilégio extra só criaria uma
-- superfície nova de vazamento entre academias — e nenhuma checagem de
-- `is_org_staff` que eu escrevesse seria mais confiável que a RLS que já está
-- lá e já é testada.
-- =============================================================================

/**
 * Evolução de um exercício, semana a semana.
 *
 * Carga máxima e volume por semana. Máxima porque é o número que a pessoa
 * lembra ("subi para 80"), volume porque é o que explica o progresso quando a
 * carga fica parada — mais séries na mesma carga também é evolução.
 */
create or replace function exercise_progress(
  p_student_id  uuid,
  p_exercise_id uuid,
  p_weeks       integer default 12
)
returns table (
  semana      date,
  carga_max   numeric,
  volume_kg   numeric,
  series      integer,
  reps        integer
)
language sql stable as $$
  select
    date_trunc('week', l.completed_at)::date as semana,
    max(l.weight)                            as carga_max,
    sum(coalesce(l.weight, 0) * l.reps_completed) as volume_kg,
    count(*)::integer                        as series,
    sum(l.reps_completed)::integer           as reps
  from workout_set_logs l
  join workout_sessions s on s.id = l.session_id
  where s.student_id = p_student_id
    and l.exercise_id = p_exercise_id
    and l.completed_at >= now() - make_interval(weeks => p_weeks)
  group by 1
  order by 1
$$;

/**
 * Recorde pessoal por exercício.
 *
 * A maior carga, e a data em que aconteceu. `distinct on` em vez de `max` com
 * subconsulta porque precisamos da linha inteira do recorde, não só do número —
 * "80 kg em 12 de agosto" diz mais que "80 kg".
 */
create or replace function personal_records(p_student_id uuid)
returns table (
  exercise_id   uuid,
  exercise_name text,
  carga_max     numeric,
  reps          smallint,
  alcancado_em  timestamptz
)
language sql stable as $$
  select distinct on (l.exercise_id)
    l.exercise_id,
    e.name,
    l.weight,
    l.reps_completed,
    l.completed_at
  from workout_set_logs l
  join workout_sessions s on s.id = l.session_id
  join exercises e on e.id = l.exercise_id
  where s.student_id = p_student_id and l.weight is not null
  -- Empate na carga: fica a série com mais repetições, que é a mais difícil.
  order by l.exercise_id, l.weight desc, l.reps_completed desc, l.completed_at
$$;

/** Os números do treino de um aluno numa janela. */
create or replace function workout_totals(
  p_student_id uuid,
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  treinos             integer,
  series              integer,
  reps                integer,
  volume_kg           numeric,
  duracao_media_seg   integer,
  descanso_medio_seg  integer,
  exercicios_distintos integer
)
language sql stable as $$
  with sessoes as (
    select * from workout_sessions
    where student_id = p_student_id
      and status = 'COMPLETED'
      and started_at >= p_from and started_at < p_to
  ),
  series as (
    select l.* from workout_set_logs l join sessoes s on s.id = l.session_id
  )
  select
    (select count(*) from sessoes)::integer,
    (select count(*) from series)::integer,
    (select coalesce(sum(reps_completed), 0) from series)::integer,
    (select coalesce(sum(coalesce(weight, 0) * reps_completed), 0) from series),
    (select avg(duration_seconds) from sessoes)::integer,
    (select avg(rest_seconds) from series)::integer,
    (select count(distinct exercise_id) from series)::integer
$$;

/**
 * O relatório de treino da academia.
 *
 * Alunos que treinaram, e não alunos matriculados: é a diferença entre quem
 * paga e quem aparece, e é a única das duas que antecipa cancelamento.
 */
create or replace function gym_training_report(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz
)
returns table (
  treinos           integer,
  alunos_treinando  integer,
  series            integer,
  volume_kg         numeric,
  duracao_media_seg integer
)
language sql stable as $$
  with sessoes as (
    select * from workout_sessions
    where organization_id = p_organization_id
      and status = 'COMPLETED'
      and started_at >= p_from and started_at < p_to
  )
  select
    (select count(*) from sessoes)::integer,
    (select count(distinct student_id) from sessoes)::integer,
    (select count(*) from workout_set_logs l join sessoes s on s.id = l.session_id)::integer,
    (select coalesce(sum(coalesce(l.weight, 0) * l.reps_completed), 0)
       from workout_set_logs l join sessoes s on s.id = l.session_id),
    (select avg(duration_seconds) from sessoes)::integer
$$;

/**
 * Quem está sumindo.
 *
 * Aluno ativo, pagando, sem check-in nem treino há N dias. É o relatório que
 * evita cancelamento, porque cancelamento avisa tarde: quando a pessoa pede
 * para sair, ela já parou de vir há semanas.
 */
create or replace function students_at_risk(
  p_organization_id uuid,
  p_dias            integer default 14
)
returns table (
  student_id     uuid,
  nome           text,
  ultima_visita  timestamptz,
  dias_ausente   integer
)
language sql stable as $$
  with atividade as (
    select s.id, s.user_profile_id, greatest(
      coalesce((select max(checked_in_at) from check_ins c where c.student_id = s.id), 'epoch'),
      coalesce((select max(started_at) from workout_sessions w where w.student_id = s.id), 'epoch')
    ) as ultima
    from students s
    where s.organization_id = p_organization_id and s.status in ('ACTIVE','OVERDUE')
  )
  select
    a.id,
    p.name,
    -- 'epoch' é quem nunca apareceu; devolver nulo diz isso sem inventar data.
    nullif(a.ultima, 'epoch'),
    extract(day from (now() - a.ultima))::integer
  from atividade a
  join user_profiles p on p.id = a.user_profile_id
  where a.ultima < now() - make_interval(days => p_dias)
  order by a.ultima
$$;

/** Ocupação das aulas: quantas vagas viraram presença. */
create or replace function class_occupancy_report(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz
)
returns table (
  aula            text,
  ocorrencias     integer,
  vagas_ofertadas integer,
  reservas        integer,
  presencas       integer,
  faltas          integer
)
language sql stable as $$
  with sessoes as (
    select * from class_sessions
    where organization_id = p_organization_id
      and status = 'SCHEDULED'
      and starts_at >= p_from and starts_at < p_to
  )
  select
    s.name,
    count(distinct s.id)::integer,
    sum(s.capacity)::integer,
    count(b.id) filter (where b.status in ('BOOKED','ATTENDED','NO_SHOW'))::integer,
    count(b.id) filter (where b.status = 'ATTENDED')::integer,
    count(b.id) filter (where b.status = 'NO_SHOW')::integer
  from sessoes s
  left join class_bookings b on b.session_id = s.id
  group by s.name
  order by count(distinct s.id) desc
$$;

/*
 * Sem `security definer`, então não há grant a conceder além do que o schema
 * público já dá. A RLS de cada tabela é quem filtra — e é por isso que estas
 * funções não precisam de nenhuma checagem de autorização própria.
 */

insert into schema_migrations (version) values ('0027_relatorios.sql') on conflict do nothing;
