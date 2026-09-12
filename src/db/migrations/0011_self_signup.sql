-- =============================================================================
-- SynseHub · 0011 — Cadastro por conta própria: aluno e profissional
--
-- Até aqui "criar conta" significava uma coisa só: abrir uma academia. Quem
-- chegava pelo site sem ser dono de academia não tinha caminho.
--
-- Duas portas novas:
--
--   profissional  abre a própria organização, do tipo STUDIO. Reaproveita todo
--                 o caminho da academia — muda o vocabulário, não a estrutura.
--
--   aluno         entra numa academia existente com um código de convite. Não
--                 existe aluno sem academia no modelo (students.organization_id
--                 é obrigatório), e isso é proposital: aluno solto cairia num
--                 app vazio. O código também mantém a academia no controle de
--                 quem entra — ela decide com quem o compartilha.
-- =============================================================================

-- ── Código de convite ────────────────────────────────────────────────────────
/*
 * Alfabeto sem I, L, O, U, 0 e 1.
 *
 * Este código vai ser lido em voz alta na recepção, copiado de um cartaz e
 * digitado no celular. Zero e O se confundem; um, I e L também. É mais
 * restrito que o alfabeto do Synse ID de propósito: o Synse ID é copiado da
 * tela, este é ditado.
 *
 * Sobram 30 caracteres — 729 milhões de combinações em seis posições, muito
 * além do necessário.
 */
create or replace function generate_invite_code() returns text
language sql volatile as $$
  select string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', (floor(random() * 30) + 1)::int, 1),
    ''
  )
  from generate_series(1, 6)
$$;

alter table organizations add column if not exists invite_code text;

-- Toda academia já existente ganha o seu, para o código não ser privilégio de
-- quem se cadastrar depois desta migração.
update organizations set invite_code = generate_invite_code() where invite_code is null;

create unique index if not exists organizations_invite_code_key
  on organizations (invite_code) where invite_code is not null;

-- ── Entrada do aluno ─────────────────────────────────────────────────────────
/*
 * `security definer` porque o aluno não tem — e não deve ter — permissão de
 * inserir na tabela `students` de uma academia à qual ainda não pertence. A
 * função é a única porta, e valida tudo antes de abrir.
 *
 * A matrícula nasce PENDING: a academia vê que alguém entrou pelo código e
 * confirma. Nascer ATIVA faria o aluno aparecer na contagem de mensalidades de
 * uma academia que nunca o cadastrou.
 */
create or replace function join_organization_as_student(
  p_invite_code text,
  p_student_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id    uuid := auth.uid();
  v_email      text;
  v_org_id     uuid;
  v_profile_id uuid;
  v_student_id uuid;
begin
  if v_auth_id is null then
    raise exception 'É preciso estar autenticado para entrar numa academia.'
      using errcode = '42501';
  end if;

  select id into v_org_id
  from organizations
  where invite_code = upper(trim(p_invite_code))
    and status in ('ACTIVE', 'TRIALING');

  if v_org_id is null then
    raise exception 'Código de convite inválido.' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_auth_id;

  -- O Synse ID é vitalício: quem já tem ficha mantém a mesma ao entrar aqui.
  insert into user_profiles (auth_user_id, name, email)
  values (v_auth_id, p_student_name, v_email)
  on conflict (auth_user_id) do update set name = excluded.name
  returning id into v_profile_id;

  insert into students (organization_id, user_profile_id, status)
  values (v_org_id, v_profile_id, 'PENDING')
  on conflict (organization_id, user_profile_id) do nothing;

  select id into v_student_id
  from students
  where organization_id = v_org_id and user_profile_id = v_profile_id;

  return v_student_id;
end;
$$;

comment on function join_organization_as_student is
  'Vincula a pessoa autenticada a uma academia pelo código de convite. Matrícula nasce PENDING para a academia confirmar.';

revoke all on function join_organization_as_student from public, anon;
grant execute on function join_organization_as_student to authenticated;

-- ── Organização com tipo ─────────────────────────────────────────────────────
/*
 * O profissional independente abre um STUDIO, não uma GYM. Mesma estrutura,
 * mesmo papel de dono — o tipo muda o vocabulário da interface e os relatórios
 * que fazem sentido, não as regras.
 *
 * O parâmetro entra no fim e com padrão, para as chamadas existentes seguirem
 * funcionando sem alteração.
 *
 * O DROP antes do CREATE não é zelo: no Postgres, acrescentar um parâmetro com
 * valor padrão cria uma *sobrecarga* em vez de substituir a função. As duas
 * versões passam a existir, a chamada de sete argumentos casa com ambas, e o
 * banco recusa com "function name is not unique". Só a assinatura antiga é
 * removida — a nova entra logo abaixo.
 */
drop function if exists create_organization_with_owner(text, text, text, text, text, text, text);

create or replace function create_organization_with_owner(
  p_org_name    text,
  p_org_slug    text,
  p_owner_name  text,
  p_legal_name  text default null,
  p_tax_id      text default null,
  p_city        text default null,
  p_state       text default null,
  p_type        organization_type default 'GYM'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id    uuid := auth.uid();
  v_email      text;
  v_profile_id uuid;
  v_org_id     uuid;
begin
  if v_auth_id is null then
    raise exception 'É preciso estar autenticado para cadastrar uma academia.'
      using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_auth_id;

  if exists (
    select 1 from organization_members m
    join user_profiles p on p.id = m.user_profile_id
    where p.auth_user_id = v_auth_id and m.role = 'OWNER' and m.status = 'ACTIVE'
  ) then
    raise exception 'Esta conta já é proprietária de uma academia.'
      using errcode = '23505';
  end if;

  insert into user_profiles (auth_user_id, name, email)
  values (v_auth_id, p_owner_name, v_email)
  on conflict (auth_user_id) do update set name = excluded.name
  returning id into v_profile_id;

  insert into organizations (name, slug, type, legal_name, tax_id, city, state, status, invite_code)
  values (
    p_org_name, p_org_slug, p_type, p_legal_name, p_tax_id, p_city, p_state,
    'TRIALING', generate_invite_code()
  )
  returning id into v_org_id;

  insert into organization_members (organization_id, user_profile_id, role, status)
  values (v_org_id, v_profile_id, 'OWNER', 'ACTIVE');

  insert into organization_settings (organization_id) values (v_org_id);
  insert into organization_billing_settings (organization_id) values (v_org_id);

  return v_org_id;
end;
$$;

revoke all on function create_organization_with_owner from public, anon;
grant execute on function create_organization_with_owner to authenticated;

-- ── O aluno enxerga a própria academia ───────────────────────────────────────
/*
 * Descoberto pelo teste de entrada por código: `organizations_read` exigia
 * vínculo em `organization_members`, e aluno não é membro — ele tem matrícula
 * em `students`. Resultado: quem entra como aluno não lê a própria academia, e
 * o Synse App mostraria o nome dela em branco.
 *
 * O defeito é anterior a esta migração e nunca apareceu porque o app de
 * demonstração não passa pela RLS. Só agora, com aluno se cadastrando sozinho,
 * ele teria vindo à tona — em produção, na cara do primeiro aluno.
 *
 * A forma de conjunto é a da 0008: avaliada uma vez por consulta, não por linha.
 */
create or replace function student_organization_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.organization_id
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
$$;

revoke all on function student_organization_ids from public;
grant execute on function student_organization_ids to anon, authenticated, service_role;

drop policy if exists organizations_read on organizations;
create policy organizations_read on organizations
  for select using (
    (select is_super_admin())
    or is_org_member(id)
    or id in (select student_organization_ids())
  );
