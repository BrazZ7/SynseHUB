-- =============================================================================
-- SynseHub · 0007 — Cadastro de academia
--
-- Até aqui não existia forma de uma academia nascer. A RLS trancava as três
-- portas ao mesmo tempo:
--
--   organizations        só SELECT e UPDATE — ninguém insere
--   user_profiles        só SELECT e UPDATE — o novo dono não cria a própria ficha
--   organization_members exige is_org_admin — mas só é admin quem já é membro
--
-- Ovo e galinha: para criar a academia é preciso ser membro dela, e para ser
-- membro ela precisa existir. Nascer uma organização exige, por definição,
-- escrever antes de pertencer a alguma.
--
-- A saída é uma função `security definer`: ela roda com privilégio elevado,
-- mas faz uma coisa só e checa quem chamou. Preferível a afrouxar a RLS com
-- uma política de INSERT — uma política aberta valeria para qualquer insert,
-- enquanto aqui o privilégio existe apenas dentro deste caminho.
--
-- Também preferível a usar a service_role no servidor da aplicação: aquela
-- chave ignora a RLS inteira, e um bug no caminho do cadastro viraria acesso
-- irrestrito ao banco.
-- =============================================================================

create or replace function create_organization_with_owner(
  p_org_name    text,
  p_org_slug    text,
  p_owner_name  text,
  p_legal_name  text default null,
  p_tax_id      text default null,
  p_city        text default null,
  p_state       text default null
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
  -- Só entra quem está autenticado. `security definer` sem esta checagem
  -- deixaria qualquer visitante anônimo criar academias.
  if v_auth_id is null then
    raise exception 'É preciso estar autenticado para cadastrar uma academia.'
      using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_auth_id;

  -- Uma pessoa, uma academia. Sem isto um cadastro repetido criaria
  -- organizações órfãs a cada clique duplo no botão.
  if exists (
    select 1 from organization_members m
    join user_profiles p on p.id = m.user_profile_id
    where p.auth_user_id = v_auth_id and m.role = 'OWNER' and m.status = 'ACTIVE'
  ) then
    raise exception 'Esta conta já é proprietária de uma academia.'
      using errcode = '23505';
  end if;

  -- A ficha pode já existir: o Synse ID é vitalício e acompanha a pessoa,
  -- então quem entrou antes como aluno mantém o mesmo perfil ao abrir a
  -- própria academia.
  insert into user_profiles (auth_user_id, name, email)
  values (v_auth_id, p_owner_name, v_email)
  on conflict (auth_user_id) do update set name = excluded.name
  returning id into v_profile_id;

  insert into organizations (name, slug, type, legal_name, tax_id, city, state, status)
  values (p_org_name, p_org_slug, 'GYM', p_legal_name, p_tax_id, p_city, p_state, 'TRIALING')
  returning id into v_org_id;

  insert into organization_members (organization_id, user_profile_id, role, status)
  values (v_org_id, v_profile_id, 'OWNER', 'ACTIVE');

  -- Defaults de operação e de cobrança. A comissão vem do padrão da coluna,
  -- nunca de número escrito aqui.
  insert into organization_settings (organization_id) values (v_org_id);
  insert into organization_billing_settings (organization_id) values (v_org_id);

  return v_org_id;
end;
$$;

comment on function create_organization_with_owner is
  'Cria academia, perfil e vínculo de proprietário numa transação só. Único caminho de cadastro: a RLS não permite inserir organização diretamente.';

-- `authenticated` apenas: visitante anônimo não cadastra academia.
revoke all on function create_organization_with_owner from public, anon;
grant execute on function create_organization_with_owner to authenticated;
