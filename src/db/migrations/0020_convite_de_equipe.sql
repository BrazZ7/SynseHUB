-- =============================================================================
-- SynseHub · 0020 — Convite de equipe
--
-- Até aqui a única pessoa com acesso ao painel era quem criou a academia. Não
-- havia como dar acesso ao recepcionista nem ao professor — e o contorno óbvio,
-- que é emprestar a senha do dono, entrega tudo: financeiro, dados de saúde dos
-- alunos, permissão de apagar. O botão "Convidar" existia desabilitado.
--
-- Duas decisões que moldam o resto:
--
-- **O convite é preso ao e-mail.** Quem aceita precisa estar autenticado com o
-- endereço convidado. Um link que qualquer um pudesse abrir seria uma chave de
-- acesso ao painel circulando por WhatsApp — e as chaves vazam.
--
-- **Quem convida não pode promover além de si.** Um gerente não cria um dono.
-- Sem essa trava, o caminho para tomar a academia é convidar a si mesmo como
-- OWNER a partir de um acesso menor.
-- =============================================================================

create table if not exists staff_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  email            text not null,
  role             user_role not null,
  job_title        text,
  registration_number text,
  /*
   * O token é o segredo do link. Fica em coluna própria, único no banco todo,
   * e é gerado aqui — não pelo cliente, que poderia escolher um valor que já
   * conhece.
   */
  token            text not null unique default encode(gen_random_bytes(24), 'hex'),
  status           text not null default 'PENDING'
                     check (status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  invited_by       uuid references user_profiles(id) on delete set null,
  expires_at       timestamptz not null default now() + interval '7 days',
  accepted_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index staff_invites_org_idx on staff_invites (organization_id, status);
create unique index staff_invites_pendente_idx
  on staff_invites (organization_id, lower(email))
  where status = 'PENDING';

comment on table staff_invites is
  'Convites de acesso ao painel. Um pendente por e-mail e academia; o token é o segredo do link.';

-- ── Quem pode convidar quem ──────────────────────────────────────────────────

/*
 * Hierarquia, em número, só para comparar.
 *
 * Não vira coluna nem enum novo: é regra de quem-manda-mais, e o dia em que uma
 * função mudar de lugar isso muda aqui, num lugar só.
 */
create or replace function role_rank(p_role user_role)
returns integer
language sql immutable as $$
  select case p_role
    when 'SUPER_ADMIN'  then 100
    when 'OWNER'        then 90
    when 'MANAGER'      then 70
    when 'RECEPTIONIST' then 50
    when 'TRAINER'      then 40
    when 'NUTRITIONIST' then 40
    when 'PROFESSIONAL' then 40
    else 10
  end;
$$;

create or replace function create_staff_invite(
  p_organization_id uuid,
  p_email text,
  p_role user_role,
  p_job_title text default null,
  p_registration_number text default null
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile uuid := auth_profile_id();
  v_meu_papel user_role;
  v_email text := lower(trim(p_email));
  v_token text;
begin
  if v_profile is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  select role into v_meu_papel
  from organization_members
  where organization_id = p_organization_id
    and user_profile_id = v_profile
    and status = 'ACTIVE';

  if v_meu_papel is null or role_rank(v_meu_papel) < role_rank('MANAGER') then
    raise exception 'Só a direção da academia convida a equipe.' using errcode = '42501';
  end if;

  /*
   * Convidar alguém acima de si é o caminho curto para tomar a academia: bastava
   * um gerente convidar o próprio e-mail alternativo como OWNER. Igual é
   * permitido — dono convida dono, e academia com um dono só é frágil.
   */
  if role_rank(p_role) > role_rank(v_meu_papel) then
    raise exception 'Não é possível convidar alguém com acesso maior que o seu.'
      using errcode = '42501';
  end if;

  if p_role in ('STUDENT', 'SUPER_ADMIN') then
    raise exception 'Esta função não se convida por aqui.' using errcode = '22023';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  -- Convite pendente vencido não bloqueia um novo: some antes.
  update staff_invites
  set status = 'EXPIRED'
  where organization_id = p_organization_id
    and status = 'PENDING'
    and expires_at < now();

  if exists (
    select 1 from organization_members m
    join user_profiles u on u.id = m.user_profile_id
    where m.organization_id = p_organization_id and lower(u.email) = v_email
  ) then
    raise exception 'Esta pessoa já faz parte da equipe.' using errcode = '23505';
  end if;

  insert into staff_invites (
    organization_id, email, role, job_title, registration_number, invited_by
  )
  values (
    p_organization_id, v_email, p_role, nullif(trim(p_job_title), ''),
    nullif(trim(p_registration_number), ''), v_profile
  )
  on conflict (organization_id, lower(email)) where status = 'PENDING'
  do update set
    role = excluded.role,
    job_title = excluded.job_title,
    registration_number = excluded.registration_number,
    -- Reconvidar renova o prazo e o token: o link antigo, que pode estar numa
    -- conversa esquecida, para de valer.
    token = encode(gen_random_bytes(24), 'hex'),
    expires_at = now() + interval '7 days',
    invited_by = excluded.invited_by
  returning token into v_token;

  return v_token;
end;
$$;

comment on function create_staff_invite is
  'Cria (ou renova) o convite e devolve o token do link. Ninguém convida acima do próprio acesso.';

-- ── Aceitar ──────────────────────────────────────────────────────────────────

create or replace function accept_staff_invite(p_token text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_auth uuid := auth.uid();
  v_email text;
  v_convite staff_invites;
  v_profile uuid;
begin
  if v_auth is null then
    raise exception 'É preciso entrar na conta para aceitar o convite.'
      using errcode = '42501';
  end if;

  select * into v_convite from staff_invites where token = p_token;

  if v_convite.id is null or v_convite.status <> 'PENDING' then
    raise exception 'Convite inválido ou já usado.' using errcode = '22023';
  end if;

  if v_convite.expires_at < now() then
    /*
     * Aqui não se marca nada como vencido: a exceção desfaz a transação, e o
     * `update` iria junto. A primeira versão fazia isso e o teste mostrou o
     * convite ainda PENDING depois de recusado — escrita fantasma, do tipo que
     * passa despercebida por parecer óbvia. Quem varre os vencidos é
     * `create_staff_invite`, na próxima vez que a academia convidar alguém.
     */
    raise exception 'Convite vencido. Peça um novo à academia.' using errcode = '22023';
  end if;

  select lower(email) into v_email from auth.users where id = v_auth;

  /*
   * O laço que fecha a segurança: o link sozinho não dá acesso.
   *
   * Sem esta comparação, um convite encaminhado por engano — ou um token
   * adivinhado — entregaria o painel da academia a quem abrisse primeiro.
   */
  if v_email is distinct from lower(v_convite.email) then
    raise exception 'Este convite é de outro e-mail. Entre com o endereço convidado.'
      using errcode = '42501';
  end if;

  insert into user_profiles (auth_user_id, name, email)
  values (v_auth, split_part(v_email, '@', 1), v_email)
  on conflict (auth_user_id) do update set email = excluded.email
  returning id into v_profile;

  insert into organization_members (organization_id, user_profile_id, role, job_title)
  values (v_convite.organization_id, v_profile, v_convite.role, v_convite.job_title)
  on conflict (organization_id, user_profile_id)
  do update set role = excluded.role, status = 'ACTIVE';

  /*
   * A ficha em `staff` é o que a academia vê na lista de profissionais, e é
   * para onde `created_by_staff_id` aponta quando essa pessoa montar um treino.
   * Sem ela, o convidado teria acesso e não existiria na equipe.
   */
  insert into staff (organization_id, user_profile_id, role, registration_number)
  values (
    v_convite.organization_id, v_profile, v_convite.role, v_convite.registration_number
  )
  on conflict (organization_id, user_profile_id)
  do update set role = excluded.role, status = 'ACTIVE';

  update staff_invites
  set status = 'ACCEPTED', accepted_at = now()
  where id = v_convite.id;

  /*
   * `org_admin_profile_ids` devolve um conjunto, não um vetor: passá-la direta
   * procura uma `notify_profiles(uuid, …)` que não existe. O `array(select …)`
   * é o que a 0012 usa nos gatilhos dela, e é o que casa com a assinatura.
   */
  perform notify_profiles(
    array(select org_admin_profile_ids(v_convite.organization_id)),
    v_convite.organization_id,
    'GYM',
    'Convite aceito',
    v_email || ' entrou na equipe como ' || v_convite.role::text || '.',
    '/staff'
  );

  return v_convite.organization_id;
end;
$$;

comment on function accept_staff_invite is
  'Aceita o convite se a sessão for do e-mail convidado. Cria o vínculo e a ficha de profissional.';

create or replace function revoke_staff_invite(p_invite_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile uuid := auth_profile_id();
  v_org uuid;
begin
  select organization_id into v_org from staff_invites where id = p_invite_id;
  if v_org is null then
    raise exception 'Convite não encontrado.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from organization_members
    where organization_id = v_org
      and user_profile_id = v_profile
      and status = 'ACTIVE'
      and role_rank(role) >= role_rank('MANAGER')
  ) then
    raise exception 'Só a direção da academia cancela convites.' using errcode = '42501';
  end if;

  update staff_invites set status = 'REVOKED' where id = p_invite_id and status = 'PENDING';
end;
$$;

-- ── Políticas ────────────────────────────────────────────────────────────────

alter table staff_invites enable row level security;

/*
 * A academia vê os próprios convites — menos o token.
 *
 * A coluna existe na tabela e a política não distingue coluna, então a leitura
 * da lista passa por uma view sem o token. O link completo só volta uma vez, no
 * retorno de `create_staff_invite`, para quem acabou de criá-lo: um token
 * legível na tela de qualquer pessoa da equipe é um token que circula.
 */
drop policy if exists staff_invites_read on staff_invites;
create policy staff_invites_read on staff_invites
  for select using (is_org_staff(organization_id));

revoke all on staff_invites from anon, authenticated;
grant select on staff_invites to authenticated;

create or replace view staff_invites_public
with (security_invoker = true) as
  select id, organization_id, email, role, job_title, registration_number,
         status, expires_at, accepted_at, created_at
  from staff_invites;

grant select on staff_invites_public to authenticated;

revoke all on function create_staff_invite(uuid, text, user_role, text, text)
  from public, anon;
grant execute on function create_staff_invite(uuid, text, user_role, text, text)
  to authenticated;

revoke all on function accept_staff_invite(text) from public, anon;
grant execute on function accept_staff_invite(text) to authenticated;

revoke all on function revoke_staff_invite(uuid) from public, anon;
grant execute on function revoke_staff_invite(uuid) to authenticated;

revoke all on function role_rank(user_role) from public, anon;
grant execute on function role_rank(user_role) to authenticated, service_role;

insert into schema_migrations (version) values ('0020_convite_de_equipe.sql')
on conflict (version) do nothing;
