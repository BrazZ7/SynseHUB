-- =============================================================================
-- 0050 — Número derivado contado no banco, não sobre uma resposta cortada
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- Três números da tela eram calculados somando linhas na aplicação:
--
--   `countStudentsByPlan`  lia `memberships` e contava por plano
--   `countAssignments`     lia `workout_assignments` e contava por ficha
--   `summarizeActivities`  lia `activities` e somava distância, tempo, calorias
--
-- Nenhuma das três tinha teto, e o PostgREST corta a resposta no teto
-- configurado no servidor **sem dar erro**. Somar sobre uma resposta cortada
-- não devolve um número aproximado: devolve um número errado com cara de
-- certo. "34 alunos" num plano que tem 120, ou 180 km de corrida em quem
-- correu 400.
--
-- É a mesma família da 0049 — valor derivado de uma leitura que pode vir
-- incompleta —, e a regra do projeto já dizia o que fazer com número
-- derivado: quem calcula é o banco. Faltava valer também para contagem.
--
-- `countUnreadNotifications` já fazia certo, com
-- `select('id', { count: 'exact', head: true })`: nenhuma linha viaja, o
-- Postgres conta. Para contagem simples é isso que basta — mas estas três são
-- agrupadas ou somadas em várias colunas, e o PostgREST não agrupa.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- As três rodam com o privilégio de quem chama, então a RLS filtra sozinha:
-- `memberships_staff` e `workout_assignments_staff` (0001/0003) e
-- `activities_self` (0016). Em particular, `resumo_de_corridas` recebe um
-- perfil como argumento e **não** confere se é o de quem pediu: não precisa,
-- porque a RLS de `activities` só deixa a pessoa ver as próprias. Conferir
-- aqui também criaria uma segunda definição da mesma regra.
--
-- Nenhuma tabela nova, nenhuma política nova.
-- =============================================================================

/**
 * Quantos alunos ativos em cada plano.
 *
 * Só matrícula `ACTIVE` conta, como a aplicação fazia. Planos sem ninguém não
 * aparecem na resposta — a tela já trata ausência como zero, e devolver a
 * linha exigiria juntar com `membership_plans` para repetir o filtro de
 * academia que a RLS já aplica.
 */
create or replace function alunos_por_plano(p_organization_id uuid)
returns table (plan_id uuid, total bigint)
language sql stable security invoker set search_path = public as $$
  select m.plan_id, count(*) as total
    from memberships m
   where m.organization_id = p_organization_id
     and m.status = 'ACTIVE'
   group by m.plan_id
$$;

revoke all on function alunos_por_plano(uuid) from public, anon;
grant execute on function alunos_por_plano(uuid) to authenticated, service_role;

/**
 * Quantos alunos têm cada ficha de treino atribuída.
 *
 * Sem filtro de validade, como a aplicação fazia: a tela mostra quantos
 * receberam a ficha, não quantos ainda estão no prazo. `workout_assignments`
 * cresce sem apagar — uma academia antiga tem mais atribuições que alunos —, e
 * é por isso que esta era a mais perto de encostar no teto das três.
 */
create or replace function treinos_por_plano(p_organization_id uuid)
returns table (workout_plan_id uuid, total bigint)
language sql stable security invoker set search_path = public as $$
  select a.workout_plan_id, count(*) as total
    from workout_assignments a
   where a.organization_id = p_organization_id
   group by a.workout_plan_id
$$;

revoke all on function treinos_por_plano(uuid) from public, anon;
grant execute on function treinos_por_plano(uuid) to authenticated, service_role;

/**
 * O resumo de corridas de um perfil desde uma data.
 *
 * `coalesce(sum(...), 0)`: sem nenhuma atividade o `sum` é nulo, e a tela
 * espera zero. A função devolve sempre uma linha — `count(*)` garante isso —,
 * então quem chama não precisa tratar resposta vazia.
 *
 * Um dos dois chamadores passa `epoch` como data: é o total da vida da
 * pessoa, que cresce para sempre. Era o pior lugar possível para uma soma
 * feita sobre uma leitura sem teto.
 */
create or replace function resumo_de_corridas(
  p_user_profile_id uuid,
  p_desde           timestamptz
)
returns table (
  atividades bigint,
  metros     numeric,
  segundos   bigint,
  calorias   bigint,
  ganho      numeric
)
language sql stable security invoker set search_path = public as $$
  select count(*)                                   as atividades,
         coalesce(sum(a.distance_meters), 0)        as metros,
         coalesce(sum(a.moving_seconds), 0)::bigint as segundos,
         coalesce(sum(a.calories), 0)::bigint       as calorias,
         coalesce(sum(a.elevation_gain), 0)         as ganho
    from activities a
   where a.user_profile_id = p_user_profile_id
     and a.status = 'COMPLETED'
     and a.started_at >= p_desde
$$;

revoke all on function resumo_de_corridas(uuid, timestamptz) from public, anon;
grant execute on function resumo_de_corridas(uuid, timestamptz) to authenticated, service_role;

insert into schema_migrations (version) values ('0050_numero_derivado_no_banco.sql') on conflict do nothing;
