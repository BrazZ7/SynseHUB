-- =============================================================================
-- SynseHub · 0008 — RLS avaliada uma vez por consulta, não uma vez por linha
--
-- Com a academia de demonstração populada (534 alunos, 2.761 cobranças, 3.432
-- check-ins), o Supabase passou a responder 57014 — statement timeout — em
-- `user_profiles`, `charges` e `check_ins`. As tabelas menores escapavam.
--
-- A causa está na forma das políticas, não no volume. `is_org_staff(
-- organization_id)` recebe uma coluna como argumento, então o Postgres precisa
-- chamar a função para cada linha, e cada chamada faz um join contra
-- organization_members e user_profiles. Três mil linhas viram três mil joins.
--
-- Medido em PostgreSQL 16 com 3.006 cobranças:
--
--   antes   Seq Scan, Filter: is_org_staff(organization_id) OR ...   997 ms
--   depois  Seq Scan, Filter: $0 OR (hashed SubPlan 2) OR ...         23 ms
--
-- O que muda é a forma: `coluna in (select funcao_que_devolve_conjunto())` é
-- avaliada uma vez e vira InitPlan; `is_org_staff(coluna)` não tem como ser.
-- A regra de negócio é idêntica — quem enxerga o quê não muda em nada.
--
-- Também removemos políticas redundantes: onde havia uma FOR ALL e uma FOR
-- SELECT com o mesmo `using`, a segunda só duplicava o trabalho, porque FOR ALL
-- já cobre SELECT.
-- =============================================================================

-- ── Conjuntos, calculados uma vez ───────────────────────────────────────────

/** Organizações em que a pessoa autenticada trabalha. */
create or replace function staff_organization_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id
  from organization_members m
  join user_profiles p on p.id = m.user_profile_id
  where p.auth_user_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','MANAGER','RECEPTIONIST','TRAINER','NUTRITIONIST','PROFESSIONAL','SUPER_ADMIN')
$$;

/** Organizações em que a pessoa é admin — usada onde a exigência é maior. */
create or replace function admin_organization_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id
  from organization_members m
  join user_profiles p on p.id = m.user_profile_id
  where p.auth_user_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','MANAGER','SUPER_ADMIN')
$$;

/** Matrículas da própria pessoa. Um Synse ID pode ter matrícula em mais de uma academia. */
create or replace function current_student_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
$$;

/** Fichas visíveis: a própria, a da equipe da casa e a de quem tem matrícula. */
create or replace function visible_profile_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from user_profiles where auth_user_id = auth.uid()
  union
  select m.user_profile_id from organization_members m
  where m.organization_id in (select staff_organization_ids())
  union
  select s.user_profile_id from students s
  where s.organization_id in (select staff_organization_ids())
$$;

/*
 * `anon` também executa, de propósito.
 *
 * Quem protege não é o grant, é o retorno: sem `auth.uid()` os conjuntos vêm
 * vazios e a política não libera linha nenhuma. Negar a execução faria o
 * Postgres abortar a consulta com "permission denied" em vez de devolver lista
 * vazia — o visitante anônimo receberia erro 500 onde deveria ver nada.
 */
revoke all on function staff_organization_ids, admin_organization_ids,
  current_student_ids, visible_profile_ids from public;
grant execute on function staff_organization_ids, admin_organization_ids,
  current_student_ids, visible_profile_ids to anon, authenticated, service_role;

-- ── user_profiles ───────────────────────────────────────────────────────────
drop policy if exists user_profiles_self on user_profiles;
drop policy if exists user_profiles_org_visible on user_profiles;
drop policy if exists user_profiles_student_visible on user_profiles;

drop policy if exists user_profiles_visible on user_profiles;
create policy user_profiles_visible on user_profiles
  for select using ((select is_super_admin()) or id in (select visible_profile_ids()));

-- ── students ────────────────────────────────────────────────────────────────
drop policy if exists students_staff_write on students;
drop policy if exists students_staff_read on students;
drop policy if exists students_self_read on students;

drop policy if exists students_staff on students;
create policy students_staff on students for all
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select staff_organization_ids()));
create policy students_self_read on students for select
  using (user_profile_id = (select auth_profile_id()));

-- ── memberships ─────────────────────────────────────────────────────────────
drop policy if exists memberships_write on memberships;
drop policy if exists memberships_staff_read on memberships;
drop policy if exists memberships_self_read on memberships;

drop policy if exists memberships_admin on memberships;
create policy memberships_admin on memberships for all
  using ((select is_super_admin()) or organization_id in (select admin_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select admin_organization_ids()));
create policy memberships_staff_read on memberships for select
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()));
create policy memberships_self_read on memberships for select
  using (student_id in (select current_student_ids()));

-- ── charges ─────────────────────────────────────────────────────────────────
drop policy if exists charges_staff_read on charges;
drop policy if exists charges_staff_write on charges;
drop policy if exists charges_self_read on charges;

drop policy if exists charges_staff on charges;
create policy charges_staff on charges for all
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select staff_organization_ids()));
create policy charges_self_read on charges for select
  using (student_id in (select current_student_ids()));

-- ── check_ins ───────────────────────────────────────────────────────────────
drop policy if exists check_ins_staff_read on check_ins;
drop policy if exists check_ins_staff_write on check_ins;
drop policy if exists check_ins_self_read on check_ins;
drop policy if exists check_ins_self_write on check_ins;

drop policy if exists check_ins_staff on check_ins;
create policy check_ins_staff on check_ins for all
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select staff_organization_ids()));
create policy check_ins_self_read on check_ins for select
  using (student_id in (select current_student_ids()));
create policy check_ins_self_write on check_ins for insert
  with check (student_id in (select current_student_ids()));

-- ── payments ────────────────────────────────────────────────────────────────
drop policy if exists payments_staff_read on payments;
drop policy if exists payments_self_read on payments;

create policy payments_staff_read on payments for select
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()));
create policy payments_self_read on payments for select
  using (charge_id in (select id from charges where student_id in (select current_student_ids())));

-- ── workout_logs ────────────────────────────────────────────────────────────
drop policy if exists workout_logs_self on workout_logs;
drop policy if exists workout_logs_staff on workout_logs;

create policy workout_logs_self on workout_logs for all
  using (student_id in (select current_student_ids()))
  with check (student_id in (select current_student_ids()));
create policy workout_logs_staff on workout_logs for select
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()));

-- ── assessments ─────────────────────────────────────────────────────────────
drop policy if exists assessments_professional on assessments;
drop policy if exists assessments_self on assessments;

create policy assessments_professional on assessments for all
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select staff_organization_ids()));
create policy assessments_self on assessments for select
  using (student_id in (select current_student_ids()));
