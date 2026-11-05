-- =============================================================================
-- 0048 — A fila de avaliação, ordenada no banco
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- `/avaliações` promete "uma linha por aluno ativo, da avaliação mais antiga
-- para a mais recente" — a fila de trabalho do professor. Ela era montada a
-- partir de duas leituras que **cortam em silêncio**:
--
--   `listStudents`          para em 100 (`Math.min(100, …)` nos data sources)
--   `listLatestAssessments` lê 500 avaliações e deduplica na aplicação
--
-- Numa academia com 478 ativos, a tela ordenava os 100 primeiros em ordem
-- alfabética e chamava aquilo de fila. Quem ficasse de fora não aparecia
-- **nem nunca tendo sido avaliado** — exatamente quem a fila existe para
-- encontrar. E o segundo corte é pior que o primeiro: as 500 avaliações mais
-- recentes deixam de fora justamente as antigas, que são as vencidas.
--
-- Paginar a lista alfabética não resolveria: a ordem por tempo sem avaliar só
-- existe sobre o conjunto inteiro. Ordenar depois de cortar é ordenar outra
-- coisa.
--
-- ── O que entra ─────────────────────────────────────────────────────────────
--
-- `fila_de_avaliacao(org, limite, deslocamento)` — a fila inteira ordenada no
-- banco, devolvida por página, com `total_geral` junto para a tela saber
-- quantos são sem uma segunda consulta.
--
-- `resumo_das_avaliacoes(org)` — os três números dos cartões, contados sobre
-- todos os ativos e não sobre a página. Eles diziam "100 alunos ativos" numa
-- academia de 478.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- As duas rodam com o privilégio de quem chama, então a RLS filtra sozinha:
-- `students_staff` (0001) e `assessments_professional` (0046, que exclui a
-- recepção do dado de saúde). Um `security definer` aqui teria que
-- reimplementar essas duas regras — e é assim que a terceira cópia de uma
-- regra de acesso diverge das outras duas.
--
-- Nenhuma tabela nova, nenhuma política nova.
-- =============================================================================

/**
 * A fila: aluno ativo, a última avaliação dele, e há quantos dias.
 *
 * `distinct on (a.student_id)` com `order by a.student_id, a.assessed_at desc`
 * é o jeito do Postgres de pegar "a mais recente de cada" numa passada só —
 * era isso que a aplicação fazia à mão, com um `Set`, depois de trazer 500
 * linhas pela rede.
 *
 * `nulls first` na ordenação é a regra de negócio: quem nunca foi avaliado
 * encabeça a fila. Depois vem a avaliação mais antiga. O desempate é pelo
 * nome, para a paginação não embaralhar quem tem a mesma data — sem ele, a
 * página 2 poderia repetir ou pular alguém que a 1 já mostrou.
 */
create or replace function fila_de_avaliacao(
  p_organization_id uuid,
  p_limit           int default 50,
  p_offset          int default 0
)
returns table (
  student_id      uuid,
  student_name    text,
  avatar_url      text,
  assessed_at     date,
  weight          numeric,
  bmi             numeric,
  body_fat        numeric,
  dias_sem        int,
  total_geral     bigint
)
language sql stable security invoker set search_path = public as $$
  with ultimas as (
    select distinct on (a.student_id)
           a.student_id,
           a.assessed_at,
           a.weight,
           a.bmi,
           a.body_fat_percentage
      from assessments a
     where a.organization_id = p_organization_id
     order by a.student_id, a.assessed_at desc
  ),
  fila as (
    select s.id                                   as student_id,
           p.name                                 as student_name,
           p.avatar_url                           as avatar_url,
           u.assessed_at                          as assessed_at,
           u.weight                               as weight,
           u.bmi                                  as bmi,
           u.body_fat_percentage                  as body_fat,
           (current_date - u.assessed_at)::int    as dias_sem
      from students s
      join user_profiles p on p.id = s.user_profile_id
      left join ultimas u on u.student_id = s.id
     where s.organization_id = p_organization_id
       and s.status = 'ACTIVE'
  )
  select f.student_id,
         f.student_name,
         f.avatar_url,
         f.assessed_at,
         f.weight,
         f.bmi,
         f.body_fat,
         f.dias_sem,
         count(*) over () as total_geral
    from fila f
   order by f.assessed_at asc nulls first, f.student_name asc
   limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0))
$$;

revoke all on function fila_de_avaliacao(uuid, int, int) from public, anon;
grant execute on function fila_de_avaliacao(uuid, int, int) to authenticated, service_role;

/**
 * Os três números dos cartões, sobre todos os ativos.
 *
 * Contados aqui porque contar na aplicação exigiria trazer a academia
 * inteira — que é o que a tela fazia, e por isso os números eram da página
 * em vez de serem da academia.
 */
create or replace function resumo_das_avaliacoes(
  p_organization_id uuid,
  p_dias_ate_reavaliar int default 90
)
returns table (ativos bigint, nunca_avaliados bigint, vencidas bigint)
language sql stable security invoker set search_path = public as $$
  with ultimas as (
    select distinct on (a.student_id) a.student_id, a.assessed_at
      from assessments a
     where a.organization_id = p_organization_id
     order by a.student_id, a.assessed_at desc
  ),
  ativos as (
    select s.id, u.assessed_at
      from students s
      left join ultimas u on u.student_id = s.id
     where s.organization_id = p_organization_id
       and s.status = 'ACTIVE'
  )
  select count(*)                                           as ativos,
         count(*) filter (where assessed_at is null)        as nunca_avaliados,
         count(*) filter (
           where assessed_at is not null
             and current_date - assessed_at > p_dias_ate_reavaliar
         )                                                  as vencidas
    from ativos
$$;

revoke all on function resumo_das_avaliacoes(uuid, int) from public, anon;
grant execute on function resumo_das_avaliacoes(uuid, int) to authenticated, service_role;

insert into schema_migrations (version) values ('0048_fila_de_avaliacao.sql') on conflict do nothing;
