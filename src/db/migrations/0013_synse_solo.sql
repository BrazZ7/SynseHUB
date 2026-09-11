-- =============================================================================
-- SynseHub · 0013 — Entrar sem academia
--
-- A 0011 registrou a decisão oposta: "não existe aluno sem academia no modelo".
-- A razão era boa — aluno solto cairia num app vazio. O que mudou não foi a
-- razão, foi o app: com treino base, plano alimentar base e desafio mensal
-- (0014), quem entra sozinho tem o que fazer no primeiro minuto.
--
-- E há o caso que o modelo antigo simplesmente não atendia: quem treina numa
-- academia que não usa o Synse. Essa pessoa não tem código para digitar, e
-- exigir um a expulsava do produto.
--
-- COMO, sem afrouxar nada:
--
-- `students.organization_id` continua obrigatório. Em vez de torná-lo nulo —
-- o que obrigaria a revisar toda consulta, toda policy e todo `organizationId`
-- da aplicação, cada um deles uma chance nova de vazar dado entre academias —
-- existe uma organização reservada, "Synse", onde essas matrículas moram.
--
-- Ela não tem equipe. É isso que dá o isolamento: toda a RLS de leitura de
-- aluno passa por `is_org_staff`, e sem nenhum membro ninguém é staff dela.
-- Um solo não enxerga outro solo, e nenhuma academia enxerga qualquer um dos
-- dois.
-- =============================================================================

-- ── A organização reservada ──────────────────────────────────────────────────
/*
 * `invite_code` nulo de propósito: `join_organization_as_student` casa o código
 * digitado com a coluna, e nada é igual a nulo em SQL. Não existe combinação de
 * seis caracteres que faça alguém cair aqui por engano.
 */
insert into organizations (id, name, slug, type, status, invite_code, onboarding_completed)
values (
  '00000000-0000-0000-0000-000000000001',
  'Synse',
  'synse',
  'COMPANY',
  'ACTIVE',
  null,
  true
)
on conflict (id) do nothing;

comment on table organizations is
  'Academias, estúdios e clínicas. A linha 00000000-0000-0000-0000-000000000001 é a organização reservada do Synse, onde ficam as matrículas de quem treina sem academia vinculada. Não tem equipe, e é isso que a isola.';

-- ── Entrada sem código ───────────────────────────────────────────────────────
create or replace function join_synse_as_solo_student(p_student_name text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solo_org  constant uuid := '00000000-0000-0000-0000-000000000001';
  v_auth_id   uuid := auth.uid();
  v_email     text;
  v_profile_id uuid;
  v_student_id uuid;
begin
  if v_auth_id is null then
    raise exception 'É preciso estar autenticado para começar.' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_auth_id;

  insert into user_profiles (auth_user_id, name, email)
  values (v_auth_id, p_student_name, v_email)
  on conflict (auth_user_id) do update set name = excluded.name
  returning id into v_profile_id;

  /*
   * Nasce ATIVA, ao contrário da entrada por código.
   *
   * Lá o PENDING existe porque há uma academia para confirmar. Aqui não há
   * quem confirme: deixar pendente seria uma espera que nunca termina.
   */
  insert into students (organization_id, user_profile_id, status)
  values (v_solo_org, v_profile_id, 'ACTIVE')
  on conflict (organization_id, user_profile_id) do nothing;

  select id into v_student_id
  from students
  where organization_id = v_solo_org and user_profile_id = v_profile_id;

  insert into notifications (organization_id, user_profile_id, category, title, body, action_url)
  values (
    v_solo_org,
    v_profile_id,
    'SYSTEM',
    'Bem-vindo ao Synse',
    'Seu treino base e seu plano alimentar já estão prontos. Escolha um desafio para o mês.',
    '/app'
  );

  return v_student_id;
end;
$$;

comment on function join_synse_as_solo_student is
  'Cria a matrícula de quem entra sem academia, na organização reservada do Synse.';

revoke all on function join_synse_as_solo_student from public, anon;
grant execute on function join_synse_as_solo_student to authenticated;

-- ── A academia reservada não aparece como opção ──────────────────────────────
/*
 * `organizations_read` deixa o aluno ler a própria organização — e a dele é a
 * reservada. Ler o nome "Synse" é inofensivo e necessário (o app mostra onde a
 * pessoa treina). O que não pode é ela virar destino de convite ou aparecer em
 * lista de academias; o código nulo já resolve o primeiro, e a listagem do
 * super admin filtra pelo id no aplicativo.
 */
