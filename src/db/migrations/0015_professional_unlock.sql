-- =============================================================================
-- SynseHub · 0015 — Profissional deixa de ser um tipo de cadastro
--
-- Na 0011 "profissional" virou uma das portas de entrada, ao lado de academia
-- e aluno. Com a 0013 somaram quatro cartões na primeira tela — e escolher
-- entre quatro coisas parecidas, antes de ver o produto, é ruído: quem chega
-- não sabe ainda a diferença entre "profissional" e "academia", e quem só quer
-- treinar tem de ler as quatro para descobrir que nenhuma é obviamente dele.
--
-- Ficam duas: pessoa física e academia.
--
-- Treinador, fisioterapeuta e nutricionista passam a ser *acesso*, não tipo de
-- conta: a pessoa entra normalmente, e libera o perfil profissional assinando
-- um plano, dentro do próprio perfil. Além de simplificar a entrada, põe o
-- profissional onde ele pertence — do lado pago, junto do que custa suporte.
--
-- No banco isso é uma coluna. O que a coluna guarda é permissão de virar dono
-- de um espaço; a organização em si continua nascendo pela função de sempre.
-- =============================================================================

alter table user_profiles
  add column if not exists professional_plan boolean not null default false;

comment on column user_profiles.professional_plan is
  'Assinatura do plano profissional. Libera abrir o próprio espaço (STUDIO). Só a confirmação de pagamento escreve aqui.';

/*
 * A trava da 0014 passa a cobrir as duas colunas pagas.
 *
 * Mesma razão de lá, agora em dobro: `user_profiles_update_self` deixa cada
 * pessoa editar a própria ficha, e sem isto deixaria também marcar-se como
 * assinante. Um PATCH viraria plano profissional de graça.
 *
 * O nome antigo sai junto com o gatilho antigo — guardar uma função chamada
 * `guard_user_tier` que confere duas colunas seria mentir no nome.
 */
drop trigger if exists user_profiles_guard_tier on user_profiles;
drop function if exists guard_user_tier();

create or replace function guard_paid_columns() returns trigger
language plpgsql as $$
begin
  if (new.tier is distinct from old.tier
      or new.professional_plan is distinct from old.professional_plan)
     and coalesce(current_setting('synse.allow_tier_change', true), '') <> '1'
  then
    raise exception 'O plano da conta não é editável pelo cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_guard_paid on user_profiles;
create trigger user_profiles_guard_paid
  before update on user_profiles
  for each row execute function guard_paid_columns();

create or replace function set_professional_plan(p_profile_id uuid, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('synse.allow_tier_change', '1', true);
  update user_profiles set professional_plan = coalesce(p_active, false) where id = p_profile_id;
  perform set_config('synse.allow_tier_change', '', true);
end;
$$;

comment on function set_professional_plan is
  'Única porta para liberar o perfil profissional. Quem chama é a confirmação de pagamento, nunca a tela.';

revoke all on function set_professional_plan(uuid, boolean) from public, anon, authenticated;
grant execute on function set_professional_plan(uuid, boolean) to service_role;

-- ── Abrir o espaço depois de assinar ─────────────────────────────────────────
/*
 * A organização do profissional nasce pela mesma função da academia — mesma
 * estrutura, mesmo papel de dono, tipo STUDIO. O que esta função acrescenta é
 * a única regra nova: sem assinatura, não abre.
 *
 * A verificação é aqui e não na tela porque tela se contorna. Se um dia o
 * botão aparecer por engano para quem não assinou, o banco continua dizendo
 * não.
 */
create or replace function open_professional_space(
  p_name text,
  p_slug text,
  p_owner_name text
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_assinante  boolean;
begin
  if v_profile_id is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;

  select professional_plan into v_assinante from user_profiles where id = v_profile_id;

  if not coalesce(v_assinante, false) then
    raise exception 'O perfil profissional exige o plano ativo.' using errcode = '42501';
  end if;

  return create_organization_with_owner(p_name, p_slug, p_owner_name, null, null, null, null, 'STUDIO');
end;
$$;

revoke all on function open_professional_space(text, text, text) from public, anon;
grant execute on function open_professional_space(text, text, text) to authenticated;
