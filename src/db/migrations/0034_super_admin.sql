-- =============================================================================
-- SynseHub · 0034 — Conta de plataforma (super admin)
--
-- O papel `SUPER_ADMIN` existe desde a 0001 e a RLS já o reconhece desde a
-- 0004: `is_super_admin()` está embutido em `is_org_member`, `is_org_staff` e
-- `is_org_admin`, então quem tem o papel enxerga toda academia. O que nunca
-- existiu foi **como criar a conta** e **onde ela mora**.
--
-- ── Uma organização reservada só para isso ───────────────────────────────────
--
-- `is_super_admin()` procura uma linha em `organization_members` com esse
-- papel — qualquer linha, em qualquer organização. Pendurar o super admin numa
-- academia de cliente faria o papel aparecer na lista de equipe dela, e
-- encostar na organização reservada dos alunos solo estragaria a promessa que
-- a 0013 faz sobre ela ("não tem equipe, e é isso que a isola").
--
-- Daí uma segunda organização reservada, que existe só para hospedar contas de
-- plataforma. Id fixo, como o da 0013, e reconhecido pela aplicação.
--
-- ── Por que há trilha de acesso ──────────────────────────────────────────────
--
-- Esta conta lê dado de saúde de qualquer aluno de qualquer academia. Isso é
-- necessário para dar suporte e é exatamente o tipo de poder que precisa
-- deixar rastro: sem registro, não há como responder "quem abriu a ficha
-- daquela pessoa, e quando". A LGPD pede esse registro no art. 37, e ele é
-- muito mais difícil de acrescentar depois de o primeiro incidente acontecer.
-- =============================================================================

-- ── A organização da plataforma ──────────────────────────────────────────────
insert into organizations (id, name, slug, timezone)
values (
  '00000000-0000-0000-0000-000000000002',
  'Synse Plataforma',
  'synse-plataforma',
  'America/Sao_Paulo'
)
on conflict (id) do nothing;

comment on table organizations is
  'Academias, estúdios e clínicas. Duas linhas são reservadas: ...0001 é onde ficam as matrículas de quem treina sem academia (0013), e ...0002 hospeda as contas de plataforma (0034). Nenhuma das duas é academia de cliente.';

/**
 * Promove uma conta a super admin.
 *
 * Só o `service_role` executa — na prática, o SQL Editor do Supabase. Deixar
 * isto ao alcance da aplicação significaria que um defeito numa tela poderia
 * criar uma conta que lê o banco inteiro.
 */
create or replace function grant_super_admin(p_email text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid;
begin
  select id into v_perfil from user_profiles where lower(email) = lower(trim(p_email));
  if v_perfil is null then
    raise exception 'Nenhuma conta com o e-mail %. Crie a conta pelo app antes de promovê-la.', p_email
      using errcode = 'no_data_found';
  end if;

  insert into organization_members (organization_id, user_profile_id, role, status)
  values ('00000000-0000-0000-0000-000000000002', v_perfil, 'SUPER_ADMIN', 'ACTIVE')
  on conflict (organization_id, user_profile_id) do update
    set role = 'SUPER_ADMIN', status = 'ACTIVE';

  return v_perfil;
end;
$$;

revoke all on function grant_super_admin(text) from public, anon, authenticated;
grant execute on function grant_super_admin(text) to service_role;

/** Tira o poder. Mesma porta de entrada, e igualmente fora do alcance do app. */
create or replace function revoke_super_admin(p_email text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from organization_members m
   using user_profiles p
   where m.user_profile_id = p.id
     and lower(p.email) = lower(trim(p_email))
     and m.role = 'SUPER_ADMIN';
end;
$$;

revoke all on function revoke_super_admin(text) from public, anon, authenticated;
grant execute on function revoke_super_admin(text) to service_role;

-- ── A trilha ─────────────────────────────────────────────────────────────────
create table platform_access_log (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  /** Nulo quando a conta voltou para o contexto pessoal. */
  organization_id uuid references organizations(id) on delete set null,
  /** 'PLATAFORMA', 'ACADEMIA' ou 'PESSOAL'. Texto: acrescentar não é migration. */
  context         text not null,
  at              timestamptz not null default now()
);
create index platform_access_log_quem_idx on platform_access_log (user_profile_id, at desc);
create index platform_access_log_onde_idx on platform_access_log (organization_id, at desc);

alter table platform_access_log enable row level security;

/*
 * Só super admin lê, e ninguém edita nem apaga pela aplicação. Trilha que o
 * próprio auditado pode limpar não é trilha.
 */
create policy platform_access_log_read on platform_access_log
  for select using (is_super_admin());

revoke insert, update, delete on platform_access_log from authenticated, anon;

/**
 * Troca o contexto e registra a troca.
 *
 * A checagem é aqui dentro, e não na aplicação: um cookie é editável, e o que
 * decide se alguém pode agir como academia é o banco. Sem `is_super_admin()`,
 * esta função recusa — mesmo que a tela tenha deixado passar.
 */
create or replace function log_platform_context(
  p_organization_id uuid,
  p_context text
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid;
begin
  if not is_super_admin() then
    raise exception 'Somente contas de plataforma trocam de contexto.' using errcode = '42501';
  end if;

  select id into v_perfil from user_profiles where auth_user_id = auth.uid();

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (v_perfil, p_organization_id, p_context);
end;
$$;

revoke all on function log_platform_context(uuid, text) from public, anon;
grant execute on function log_platform_context(uuid, text) to authenticated, service_role;

insert into schema_migrations (version) values ('0034_super_admin.sql') on conflict do nothing;
