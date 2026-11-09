-- =============================================================================
-- SynseHub · 0039 — O acervo Synse ganha porta de entrada
--
-- ── O que faltava ────────────────────────────────────────────────────────────
--
-- A 0038 consertou o cadeado: assinante do Synse+ enxerga conteúdo marcado
-- `SYNSE_PLUS`, quem não assina não enxerga. Só que **não havia como criar esse
-- conteúdo**. A política de escrita da 0004 exige dono:
--
--     using (organization_id is not null and is_org_staff(organization_id))
--
-- e conteúdo de plataforma é justamente o que não tem dono. O cadeado estava
-- certo e a porta não existia.
--
-- ── Por que função, e não uma política a mais ───────────────────────────────
--
-- Uma política `or (organization_id is null and is_super_admin())` seria uma
-- linha, e deixaria a conta de plataforma escrever `visibility` livre —
-- inclusive `ORGANIZATION` numa linha sem academia, que é um estado que o
-- `check` da 0031 recusa mas que a tela ofereceria alegremente até o banco
-- reclamar.
--
-- A regra tem condições — só duas visibilidades fazem sentido sem dono, e toda
-- publicação precisa cair na trilha —, e regra com condição em política vira
-- regra espalhada. Fica em função, como a assinatura e a amizade.
--
-- ── A trilha não é opcional ─────────────────────────────────────────────────
--
-- A conta de plataforma é a que enxerga tudo, e por isso a 0034 já registra
-- cada troca de contexto dela em `platform_access_log`. Publicar para toda a
-- base é ato da mesma natureza: "quem pôs esse e-book no ar, e quando" precisa
-- ter resposta. O contexto novo é `ACERVO`, e cabe sem migration porque a
-- coluna é texto de propósito — a 0034 já dizia isso.
-- =============================================================================

/*
 * A conta de plataforma enxerga o próprio rascunho.
 *
 * A política da 0038 dá o rascunho a quem é equipe da academia dona. Conteúdo
 * sem dono não cai nesse ramo, então o acervo ficaria invisível para quem o
 * escreve — escrever às cegas e só descobrir o resultado depois de publicar.
 */
drop policy if exists content_read on content_library;
create policy content_read on content_library
  for select using (
    (organization_id is not null and is_org_staff(organization_id))
    or (organization_id is null and is_super_admin())
    or (
      published_at is not null
      and published_at <= now()
      and (
        (visibility = 'FREE' and organization_id is null)
        or (
          visibility = 'ORGANIZATION'
          and organization_id is not null
          and is_org_member(organization_id)
        )
        or (visibility = 'SYNSE_PLUS' and tem_synse_plus())
      )
    )
  );

/**
 * Cria ou atualiza um item do acervo Synse.
 *
 * `p_id` nulo cria; preenchido atualiza — e só alcança linha **sem dono**, para
 * que esta porta nunca sirva para editar o conteúdo de uma academia.
 *
 * Devolve o id, e nada mais: quem chamou já sabe o que escreveu.
 */
create or replace function save_synse_content(
  p_id           uuid,
  p_type         content_type,
  p_title        text,
  p_summary      text default null,
  p_body         text default null,
  p_cover_url    text default null,
  p_media_url    text default null,
  p_visibility   content_visibility default 'SYNSE_PLUS',
  p_published_at timestamptz default null,
  p_pinned       boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid;
  v_id     uuid;
begin
  if not is_super_admin() then
    raise exception 'Somente contas de plataforma publicam no acervo Synse.'
      using errcode = '42501';
  end if;

  /*
   * `ORGANIZATION` sem academia é contradição, e o `check` da 0031 já a recusa.
   * Recusar aqui também dá mensagem em português em vez de erro de constraint,
   * e deixa claro que a escolha é entre duas coisas, não três.
   */
  if p_visibility not in ('FREE', 'SYNSE_PLUS') then
    raise exception 'O acervo Synse é aberto (FREE) ou do Synse+ (SYNSE_PLUS).'
      using errcode = '22023';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'Dê um título.' using errcode = '22023';
  end if;

  select id into v_perfil from user_profiles where auth_user_id = auth.uid();

  if p_id is null then
    insert into content_library (
      organization_id, type, title, summary, body,
      cover_url, media_url, visibility, published_at, pinned
    )
    values (
      null, p_type, trim(p_title), nullif(trim(coalesce(p_summary, '')), ''),
      nullif(trim(coalesce(p_body, '')), ''),
      nullif(trim(coalesce(p_cover_url, '')), ''),
      nullif(trim(coalesce(p_media_url, '')), ''),
      p_visibility, p_published_at, coalesce(p_pinned, false)
    )
    returning id into v_id;
  else
    update content_library set
      type         = p_type,
      title        = trim(p_title),
      summary      = nullif(trim(coalesce(p_summary, '')), ''),
      body         = nullif(trim(coalesce(p_body, '')), ''),
      cover_url    = nullif(trim(coalesce(p_cover_url, '')), ''),
      media_url    = nullif(trim(coalesce(p_media_url, '')), ''),
      visibility   = p_visibility,
      published_at = p_published_at,
      pinned       = coalesce(p_pinned, false)
    where id = p_id and organization_id is null
    returning id into v_id;

    if v_id is null then
      raise exception 'Item do acervo não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (v_perfil, null, 'ACERVO');

  return v_id;
end;
$$;

comment on function save_synse_content is
  'Publica no acervo Synse (conteúdo sem dono). Só conta de plataforma, e toda escrita cai na trilha.';

revoke all on function save_synse_content(
  uuid, content_type, text, text, text, text, text, content_visibility, timestamptz, boolean
) from public, anon;
grant execute on function save_synse_content(
  uuid, content_type, text, text, text, text, text, content_visibility, timestamptz, boolean
) to authenticated, service_role;

/** Apaga um item do acervo. Só alcança linha sem dono, como a de cima. */
create or replace function delete_synse_content(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil    uuid;
  v_afetadas  integer;
begin
  if not is_super_admin() then
    raise exception 'Somente contas de plataforma publicam no acervo Synse.'
      using errcode = '42501';
  end if;

  select id into v_perfil from user_profiles where auth_user_id = auth.uid();

  delete from content_library where id = p_id and organization_id is null;

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Item do acervo não encontrado.' using errcode = 'P0002';
  end if;

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (v_perfil, null, 'ACERVO');
end;
$$;

revoke all on function delete_synse_content(uuid) from public, anon;
grant execute on function delete_synse_content(uuid) to authenticated, service_role;

insert into schema_migrations (version) values ('0039_acervo_synse.sql') on conflict do nothing;
