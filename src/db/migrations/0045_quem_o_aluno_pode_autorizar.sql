-- =============================================================================
-- SynseHub · 0045 — Quem o aluno pode autorizar a ver o corpo dele
--
-- ── O controle que existia e não tinha porta ────────────────────────────────
--
-- A 0032 criou `body_measurement_shares` com o desenho certo: autorização
-- nominal, por pessoa, revogável, nunca por academia inteira. O comentário
-- dela diz por quê — "pertencer à mesma academia não pode bastar".
--
-- `grantBodyShare` e `revokeBodyShare` existem no data source desde então, e
-- as server actions que as chamam também. O que nunca existiu foi a tela: as
-- actions revalidam `/app/corpo/compartilhamento`, uma rota que não está no
-- repositório. O lado do servidor inteiro, testado, inalcançável.
--
-- Numa funcionalidade de privacidade isso é pior que uma tela faltando: é
-- controle prometido que o aplicativo não entrega. Revogar o compartilhamento
-- de dado de saúde é direito, não recurso.
--
-- ── Por que a tela precisa de uma função, e não de um `select` ──────────────
--
-- Para autorizar alguém, a tela tem que oferecer **quem**. O natural é a
-- equipe da academia do aluno — é o professor que acompanha a evolução, que é
-- o caso que a 0032 descreve.
--
-- Só que `staff_read` (0004) exige `is_org_staff(organization_id)`: o aluno
-- não lê a tabela `staff`, e está certo que não leia. Abrir a política para
-- `is_org_member` resolveria a tela e daria a todo aluno a lista de CREF,
-- especialidades e situação de contrato de toda a equipe.
--
-- Daí uma função com projeção estreita: id do perfil, nome e papel. O
-- suficiente para escolher, e nada do que a tabela guarda além disso.
-- =============================================================================

/**
 * A equipe que esta conta pode autorizar a ver o corpo dela.
 *
 * ── O que ela devolve, e o que não ─────────────────────────────────────────
 *
 * Perfil, nome e papel. Fora: `registration_number` (CREF/CRN),
 * `specialties`, `status` e a data de entrada — nada disso ajuda a decidir
 * "autorizo este professor?", e tudo isso é dado da relação de trabalho de
 * outra pessoa.
 *
 * ── De quais academias ─────────────────────────────────────────────────────
 *
 * Das academias em que **esta conta é aluno ativo**, e só. Quem treina em
 * duas vê as duas equipes; quem é solo (0013) não vê ninguém, e a tela diz
 * isso em vez de ficar vazia sem explicação.
 *
 * `status = 'ACTIVE'` nos dois lados: equipe desligada não aparece para ser
 * autorizada, e matrícula encerrada não dá acesso à equipe da antiga
 * academia.
 *
 * ── E quem já está autorizado sai da lista ─────────────────────────────────
 *
 * `body_measurement_shares` tem `unique (user_profile_id,
 * shared_with_profile_id)`: autorizar de novo quem já está autorizado estoura
 * a unicidade. Filtrar aqui é o que impede a tela de oferecer um botão que
 * sempre falha.
 */
create or replace function equipe_para_autorizar()
returns table (
  perfil_id       uuid,
  nome            text,
  papel           user_role,
  organization_id uuid,
  academia        text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    s.user_profile_id,
    p.name,
    s.role,
    s.organization_id,
    o.name
  from staff s
  join user_profiles p on p.id = s.user_profile_id
  join organizations o on o.id = s.organization_id
  where s.status = 'ACTIVE'
    and s.user_profile_id <> auth_profile_id()
    and exists (
      select 1 from students a
      where a.organization_id = s.organization_id
        and a.user_profile_id = auth_profile_id()
        and a.status = 'ACTIVE'
    )
    and not exists (
      select 1 from body_measurement_shares b
      where b.user_profile_id = auth_profile_id()
        and b.shared_with_profile_id = s.user_profile_id
        and b.revoked_at is null
    )
  order by o.name, p.name
$$;

/*
 * Revogada do anônimo: sem sessão, `auth_profile_id()` é nulo e a função
 * devolveria vazio de qualquer jeito — mas uma função que lista nome de
 * pessoa não fica aberta "porque não vaza nada hoje".
 */
revoke all on function equipe_para_autorizar() from public, anon;
grant execute on function equipe_para_autorizar() to authenticated, service_role;

/**
 * Autoriza, conferindo que a pessoa é mesmo da equipe de uma academia desta
 * conta.
 *
 * A política `body_shares_owner` da 0032 já garante que ninguém autoriza em
 * nome de outro: ela casa `user_profile_id = auth_profile_id()` na escrita.
 * O que ela **não** confere é para quem — um insert direto autorizaria
 * qualquer perfil do banco, inclusive alguém de outra academia cujo id tenha
 * vazado por qualquer caminho.
 *
 * Não é o buraco mais grave do mundo, porque quem autoriza é o dono do dado e
 * o estrago é só dele. Mas "só é possível autorizar quem a tela oferece" é
 * uma garantia barata de dar aqui e impossível de dar na tela, e é o tipo de
 * frouxidão que depois vira um recurso que ninguém quis.
 */
create or replace function autorizar_corpo(p_perfil uuid) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  if auth_profile_id() is null then
    raise exception 'Sem sessão.' using errcode = '42501';
  end if;

  if p_perfil = auth_profile_id() then
    raise exception 'Você já vê o seu próprio histórico.' using errcode = '22023';
  end if;

  select s.organization_id into v_org
  from staff s
  where s.user_profile_id = p_perfil
    and s.status = 'ACTIVE'
    and exists (
      select 1 from students a
      where a.organization_id = s.organization_id
        and a.user_profile_id = auth_profile_id()
        and a.status = 'ACTIVE'
    )
  limit 1;

  if v_org is null then
    raise exception 'Esta pessoa não é da equipe de uma academia sua.' using errcode = '42501';
  end if;

  /*
   * `on conflict` e não erro: reautorizar quem foi revogado é a operação
   * normal de quem mudou de ideia, e a unicidade da 0032 é por par — sem
   * isto, revogar seria definitivo por acidente de schema.
   */
  insert into body_measurement_shares (user_profile_id, shared_with_profile_id, organization_id)
  values (auth_profile_id(), p_perfil, v_org)
  on conflict (user_profile_id, shared_with_profile_id) do update
    set revoked_at = null, granted_at = now(), organization_id = excluded.organization_id
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function autorizar_corpo(uuid) from public, anon;
grant execute on function autorizar_corpo(uuid) to authenticated, service_role;

insert into schema_migrations (version) values ('0045_quem_o_aluno_pode_autorizar.sql') on conflict do nothing;
