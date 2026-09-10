-- =============================================================================
-- SynseHub · 0005 — Perfis de alunos visíveis para a equipe da academia
--
-- A 0004 tornou `user_profiles` visível em dois casos: o próprio perfil, e
-- perfis de quem está em `organization_members`. Mas aluno não é membro da
-- organização — aluno está em `students`. O resultado é que a equipe da
-- academia enxergava a matrícula e não enxergava o nome de quem matriculou.
--
-- Na prática toda a lista de alunos vinha sem nome e sem e-mail, porque a
-- consulta pede `user_profiles ( synse_id, name, email, ... )` junto.
--
-- Sem espelhar dado: quem decide continua sendo a RLS de `students`, através
-- de `is_org_staff`. Esta política apenas segue o mesmo caminho de leitura
-- para o perfil ligado à matrícula.
-- =============================================================================

create policy user_profiles_student_visible on user_profiles
  for select using (
    exists (
      select 1 from students s
      where s.user_profile_id = user_profiles.id and is_org_staff(s.organization_id)
    )
  );

comment on policy user_profiles_student_visible on user_profiles is
  'Equipe da academia lê o perfil de quem tem matrícula na própria organização.';
