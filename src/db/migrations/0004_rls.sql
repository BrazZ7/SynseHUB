-- =============================================================================
-- SynseHub · 0004 — Row Level Security
--
-- Princípio: o isolamento entre academias é responsabilidade do banco, não da
-- aplicação. Mesmo que uma query esqueça o `organization_id`, o Postgres impede
-- que a Academia A veja dados da Academia B.
-- =============================================================================

-- ── Helpers (security definer para poder ler organization_members) ───────────

create or replace function auth_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from user_profiles where auth_user_id = auth.uid();
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    join user_profiles p on p.id = m.user_profile_id
    where p.auth_user_id = auth.uid()
      and m.role = 'SUPER_ADMIN'
      and m.status = 'ACTIVE'
  );
$$;

/** Organizações às quais o usuário autenticado pertence. */
create or replace function member_organization_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id
  from organization_members m
  join user_profiles p on p.id = m.user_profile_id
  where p.auth_user_id = auth.uid() and m.status = 'ACTIVE';
$$;

create or replace function is_org_member(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or target in (select member_organization_ids());
$$;

/** Papel do usuário dentro de uma organização. */
create or replace function org_role(target uuid) returns user_role
language sql stable security definer set search_path = public as $$
  select m.role
  from organization_members m
  join user_profiles p on p.id = m.user_profile_id
  where p.auth_user_id = auth.uid() and m.organization_id = target and m.status = 'ACTIVE'
  limit 1;
$$;

create or replace function is_org_staff(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or org_role(target) in
    ('OWNER','MANAGER','RECEPTIONIST','TRAINER','NUTRITIONIST','PROFESSIONAL');
$$;

create or replace function is_org_admin(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_super_admin() or org_role(target) in ('OWNER','MANAGER');
$$;

/** O `students.id` pertence ao usuário autenticado? */
create or replace function owns_student(target_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s
    join user_profiles p on p.id = s.user_profile_id
    where s.id = target_student and p.auth_user_id = auth.uid()
  );
$$;

-- ── Habilita RLS em tudo ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','organizations','organization_members','organization_settings',
    'organization_billing_settings','staff','membership_plans','students','memberships',
    'payment_accounts','charges','payments','payment_splits','webhook_events',
    'collection_rules','collection_attempts','hub_subscriptions','consumer_subscriptions',
    'check_ins','exercises','workout_plans','workout_exercises','workout_assignments',
    'workout_logs','assessments','nutrition_plans','meals','meal_items','nutrition_notes',
    'recipes','content_library','programs','program_steps','program_enrollments',
    'challenges','challenge_participants','leads','notifications','consents','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- ── Perfis ───────────────────────────────────────────────────────────────────
-- O Synse ID sobrevive ao vínculo com a academia: o perfil é do usuário.
create policy user_profiles_self on user_profiles
  for select using (auth_user_id = auth.uid() or is_super_admin());

-- A equipe enxerga apenas perfis de pessoas ligadas à sua organização.
create policy user_profiles_org_visible on user_profiles
  for select using (
    exists (
      select 1 from organization_members m
      where m.user_profile_id = user_profiles.id and is_org_staff(m.organization_id)
    )
  );

create policy user_profiles_update_self on user_profiles
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ── Organizações ─────────────────────────────────────────────────────────────
create policy organizations_read on organizations
  for select using (is_org_member(id));
create policy organizations_write on organizations
  for update using (is_org_admin(id)) with check (is_org_admin(id));

create policy organization_members_read on organization_members
  for select using (is_org_member(organization_id));
create policy organization_members_write on organization_members
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy organization_settings_read on organization_settings
  for select using (is_org_staff(organization_id));
create policy organization_settings_write on organization_settings
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy org_billing_read on organization_billing_settings
  for select using (is_org_admin(organization_id));
-- Comissão da plataforma só é alterável pela Synse.
create policy org_billing_write on organization_billing_settings
  for all using (is_super_admin()) with check (is_super_admin());

-- ── Equipe e planos ──────────────────────────────────────────────────────────
create policy staff_read on staff
  for select using (is_org_staff(organization_id));
create policy staff_write on staff
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy plans_read on membership_plans
  for select using (is_org_member(organization_id));
create policy plans_write on membership_plans
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

-- ── Alunos: equipe vê todos da org; aluno vê apenas a si mesmo ───────────────
create policy students_staff_read on students
  for select using (is_org_staff(organization_id));
create policy students_self_read on students
  for select using (user_profile_id = auth_profile_id());
create policy students_staff_write on students
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy memberships_staff_read on memberships
  for select using (is_org_staff(organization_id));
create policy memberships_self_read on memberships
  for select using (owns_student(student_id));
create policy memberships_write on memberships
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

-- ── Synse Pay ────────────────────────────────────────────────────────────────
create policy payment_accounts_rw on payment_accounts
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy charges_staff_read on charges
  for select using (is_org_staff(organization_id));
create policy charges_self_read on charges
  for select using (owns_student(student_id));
create policy charges_staff_write on charges
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy payments_staff_read on payments
  for select using (is_org_staff(organization_id));
create policy payments_self_read on payments
  for select using (
    exists (select 1 from charges c where c.id = payments.charge_id and owns_student(c.student_id))
  );
-- Confirmação de pagamento é escrita apenas pelo service role (webhook).
create policy payments_no_client_write on payments for insert with check (false);

create policy splits_read on payment_splits
  for select using (
    exists (select 1 from charges c where c.id = payment_splits.charge_id and is_org_admin(c.organization_id))
  );

-- webhook_events e audit_logs: nenhum acesso via chave anônima.
create policy webhook_events_super on webhook_events
  for select using (is_super_admin());

create policy collection_rules_rw on collection_rules
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));
create policy collection_attempts_rw on collection_attempts
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy hub_subscriptions_read on hub_subscriptions
  for select using (is_org_admin(organization_id));

create policy consumer_subscriptions_self on consumer_subscriptions
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

-- ── Check-in ─────────────────────────────────────────────────────────────────
create policy check_ins_staff_read on check_ins
  for select using (is_org_staff(organization_id));
create policy check_ins_self_read on check_ins
  for select using (owns_student(student_id));
create policy check_ins_staff_write on check_ins
  for insert with check (is_org_staff(organization_id));
-- Aluno registra o próprio check-in pelo Synse App.
create policy check_ins_self_write on check_ins
  for insert with check (owns_student(student_id) and is_org_member(organization_id));

-- ── Treinos ──────────────────────────────────────────────────────────────────
create policy exercises_read on exercises
  for select using (organization_id is null or is_org_member(organization_id));
create policy exercises_write on exercises
  for all using (organization_id is not null and is_org_staff(organization_id))
  with check (organization_id is not null and is_org_staff(organization_id));

create policy workout_plans_staff on workout_plans
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));
create policy workout_plans_student_read on workout_plans
  for select using (
    exists (
      select 1 from workout_assignments a
      where a.workout_plan_id = workout_plans.id and owns_student(a.student_id)
    )
  );

create policy workout_exercises_read on workout_exercises
  for select using (
    exists (select 1 from workout_plans p where p.id = workout_exercises.workout_plan_id)
  );
create policy workout_exercises_write on workout_exercises
  for all using (
    exists (select 1 from workout_plans p
            where p.id = workout_exercises.workout_plan_id and is_org_staff(p.organization_id))
  )
  with check (
    exists (select 1 from workout_plans p
            where p.id = workout_exercises.workout_plan_id and is_org_staff(p.organization_id))
  );

create policy workout_assignments_staff on workout_assignments
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));
create policy workout_assignments_self on workout_assignments
  for select using (owns_student(student_id));

create policy workout_logs_staff on workout_logs
  for select using (is_org_staff(organization_id));
create policy workout_logs_self on workout_logs
  for all using (owns_student(student_id)) with check (owns_student(student_id));

-- ── Dados de saúde: acesso estreito ──────────────────────────────────────────
create policy assessments_self on assessments
  for select using (owns_student(student_id));
-- Somente professor, nutricionista e administração da própria academia.
create policy assessments_professional on assessments
  for all using (
    org_role(organization_id) in ('OWNER','MANAGER','TRAINER','NUTRITIONIST','PROFESSIONAL')
    or is_super_admin()
  )
  with check (
    org_role(organization_id) in ('OWNER','MANAGER','TRAINER','NUTRITIONIST','PROFESSIONAL')
    or is_super_admin()
  );

-- Plano nutricional: só o nutricionista da organização escreve; o paciente lê.
create policy nutrition_plans_patient_read on nutrition_plans
  for select using (owns_student(student_id) and status = 'PUBLISHED');
create policy nutrition_plans_professional on nutrition_plans
  for all using (org_role(organization_id) in ('NUTRITIONIST','OWNER'))
  with check (org_role(organization_id) in ('NUTRITIONIST','OWNER'));

create policy meals_scoped on meals
  for all using (
    exists (select 1 from nutrition_plans np where np.id = meals.nutrition_plan_id)
  )
  with check (
    exists (select 1 from nutrition_plans np
            where np.id = meals.nutrition_plan_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  );

create policy meal_items_scoped on meal_items
  for all using (exists (select 1 from meals m where m.id = meal_items.meal_id))
  with check (
    exists (select 1 from meals m
            join nutrition_plans np on np.id = m.nutrition_plan_id
            where m.id = meal_items.meal_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  );

create policy nutrition_notes_professional on nutrition_notes
  for all using (
    exists (select 1 from nutrition_plans np
            where np.id = nutrition_notes.nutrition_plan_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  )
  with check (
    exists (select 1 from nutrition_plans np
            where np.id = nutrition_notes.nutrition_plan_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  );

-- ── Biblioteca ───────────────────────────────────────────────────────────────
create policy recipes_read on recipes for select using (true);
create policy programs_read on programs for select using (true);
create policy program_steps_read on program_steps for select using (true);

create policy content_read on content_library
  for select using (
    visibility = 'FREE'
    or (visibility = 'ORGANIZATION' and organization_id is not null and is_org_member(organization_id))
    or (visibility = 'SYNSE_PLUS' and exists (
          select 1 from consumer_subscriptions cs
          where cs.user_profile_id = auth_profile_id() and cs.status = 'ACTIVE'))
  );
create policy content_write on content_library
  for all using (organization_id is not null and is_org_staff(organization_id))
  with check (organization_id is not null and is_org_staff(organization_id));

create policy program_enrollments_self on program_enrollments
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

create policy challenges_read on challenges
  for select using (organization_id is null or is_org_member(organization_id));
create policy challenges_write on challenges
  for all using (organization_id is not null and is_org_staff(organization_id))
  with check (organization_id is not null and is_org_staff(organization_id));

-- Ranking só expõe quem deu opt-in explícito.
create policy challenge_participants_self on challenge_participants
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());
create policy challenge_participants_ranking on challenge_participants
  for select using (
    ranking_opt_in
    and exists (select 1 from challenges c
                where c.id = challenge_participants.challenge_id and c.ranking_enabled)
  );

-- ── CRM, notificações, LGPD ──────────────────────────────────────────────────
create policy leads_staff on leads
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

create policy notifications_self on notifications
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

create policy consents_self on consents
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

-- Auditoria é somente leitura para a administração e imutável pelo cliente.
create policy audit_logs_read on audit_logs
  for select using (is_org_admin(organization_id));
create policy audit_logs_no_client_write on audit_logs for insert with check (false);
