-- =============================================================================
-- SynseHub · 0044 — A biblioteca de receitas
--
-- ── A última tabela da 0003 sem leitura ─────────────────────────────────────
--
-- `recipes` nasceu na 0003 junto com `content_library`, `programs` e
-- `program_steps`. As outras três foram construídas: o acervo na 0039, a
-- vitrine na 0041, os programas guiados na 0043. `recipes` ficou — tabela
-- completa, com RLS desde a 0004 e visibilidade corrigida na 0038, e **zero
-- leituras** no aplicativo.
--
-- Não era inofensivo. A linha "Plano alimentar base" do comparativo de planos
-- diz a mesma coisa nos dois lados desde a 0042 do texto, porque não havia o
-- que o Synse+ acrescentasse ali. A tabela de planos é a descrição do que a
-- pessoa compra, e uma linha idêntica nas duas colunas é uma linha que não
-- vende nada — honesta, mas vazia. Esta migration é o que faltava atrás dela.
--
-- ── O que esta migration faz, e o que ela não precisa fazer ─────────────────
--
-- Não cria tabela: `recipes` já existe, com RLS e com a política certa. O que
-- falta é a porta de autoria da conta de plataforma e a vitrine para quem não
-- assina — exatamente o par que a 0039 e a 0041 deram ao acervo, e a 0043 aos
-- programas. Repetir o desenho é de propósito: três assuntos com três formas
-- diferentes de resolver o mesmo problema é o que faz um deles ficar para trás
-- na próxima mudança de regra.
--
-- ── Categoria continua texto livre ──────────────────────────────────────────
--
-- `category` é `text not null` desde a 0003, sem `check`. Fica assim, pelo
-- mesmo motivo que o `context` da trilha na 0034: acrescentar "lanche da
-- madrugada" à lista não deve exigir migration. Quem oferece o conjunto é a
-- tela, em `src/lib/validations/recipe.ts`; o banco guarda o que recebe.
-- =============================================================================

-- ── A conta de plataforma enxerga o que ela mesma escreveu ───────────────────
/**
 * Mesma falta que a 0039 corrigiu no acervo e a 0043 nos programas.
 *
 * A política da 0038 fala de `FREE` e de assinatura. A conta de plataforma não
 * cai em nenhum dos dois ramos — ela publicaria receita do Synse+ que não
 * consegue reler, e a tela de autoria abriria vazia logo depois de salvar.
 */
drop policy if exists recipes_read on recipes;
create policy recipes_read on recipes
  for select using (
    visibility = 'FREE'
    or (visibility = 'SYNSE_PLUS' and tem_synse_plus())
    or is_super_admin()
  );

/*
 * O índice que a 0003 não criou.
 *
 * As duas leituras da tela são "tudo que posso ver, por categoria" e "as
 * trancadas". Ambas filtram por `visibility` e ordenam dentro da categoria.
 */
create index if not exists recipes_visibility_idx on recipes (visibility, category, title);

-- ── Autoria ──────────────────────────────────────────────────────────────────
/**
 * Grava uma receita. Cria quando `p_id` é nulo, atualiza quando não é.
 *
 * `security definer` com `is_super_admin()` dentro, e não uma política de
 * `insert`: a checagem fica num lugar só, e a tabela continua sem escrita
 * concedida a `authenticated` — o que não existe não vaza por engano numa
 * política futura escrita com pressa.
 *
 * A trilha em `platform_access_log` é escrita aqui, como em `save_program`:
 * quem publica no catálogo da plataforma deixa rastro, sempre.
 */
create or replace function save_recipe(
  p_id              uuid,
  p_title           text,
  p_description     text,
  p_category        text,
  p_ingredients     text[],
  p_instructions    text,
  p_prep_minutes    smallint,
  p_servings        smallint,
  p_image_url       text,
  p_tags            text[],
  p_nutrition_facts jsonb,
  p_visibility      content_visibility
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_super_admin() then
    raise exception 'Apenas a conta de plataforma publica receitas.' using errcode = '42501';
  end if;

  /*
   * `ORGANIZATION` não serve aqui, e a mesma trava está em `save_program`.
   *
   * `recipes` não tem `organization_id` — a 0038 já observa isso. Uma linha
   * marcada assim não é de ninguém: a política só casa `FREE`, `SYNSE_PLUS` e
   * a conta de plataforma, então a receita ficaria gravada e invisível para
   * todo mundo, inclusive para quem a escreveu.
   */
  if p_visibility not in ('FREE', 'SYNSE_PLUS') then
    raise exception 'Receita é da plataforma: só FREE ou SYNSE_PLUS.' using errcode = '22023';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'A receita precisa de um título.' using errcode = '22023';
  end if;

  if coalesce(btrim(p_category), '') = '' then
    raise exception 'A receita precisa de uma categoria.' using errcode = '22023';
  end if;

  /*
   * Faixas largas de propósito: a tela já valida com mensagem no campo, e o
   * banco só precisa barrar o absurdo que chegaria por outro caminho. Um
   * preparo de 10 mil minutos não é engano de digitação, é dado corrompido.
   */
  if p_prep_minutes is not null and (p_prep_minutes < 1 or p_prep_minutes > 1440) then
    raise exception 'Tempo de preparo fora da faixa (1 a 1440 minutos).' using errcode = '22023';
  end if;

  if p_servings is not null and (p_servings < 1 or p_servings > 50) then
    raise exception 'Porções fora da faixa (1 a 50).' using errcode = '22023';
  end if;

  if p_id is null then
    insert into recipes (
      title, description, category, ingredients, instructions,
      prep_minutes, servings, image_url, tags, nutrition_facts, visibility
    )
    values (
      btrim(p_title), p_description, btrim(p_category),
      coalesce(p_ingredients, '{}'), p_instructions,
      p_prep_minutes, p_servings, p_image_url,
      coalesce(p_tags, '{}'), p_nutrition_facts, p_visibility
    )
    returning id into v_id;
  else
    update recipes set
      title = btrim(p_title),
      description = p_description,
      category = btrim(p_category),
      ingredients = coalesce(p_ingredients, '{}'),
      instructions = p_instructions,
      prep_minutes = p_prep_minutes,
      servings = p_servings,
      image_url = p_image_url,
      tags = coalesce(p_tags, '{}'),
      nutrition_facts = p_nutrition_facts,
      visibility = p_visibility
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Receita não encontrada.' using errcode = 'no_data_found';
    end if;
  end if;

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (auth_profile_id(), null, 'RECEITA');

  return v_id;
end;
$$;

/*
 * Concedida a `authenticated`, como `save_synse_content` (0039) e
 * `save_program` (0043): quem chama é a tela do `/synse-admin`, pelo cliente
 * da sessão. Quem barra é o `is_super_admin()` lá dentro — no banco, porque
 * sessão é cookie e cookie se edita.
 */
revoke all on function save_recipe(
  uuid, text, text, text, text[], text, smallint, smallint, text, text[], jsonb,
  content_visibility
) from public, anon;
grant execute on function save_recipe(
  uuid, text, text, text, text[], text, smallint, smallint, text, text[], jsonb,
  content_visibility
) to authenticated, service_role;

/** Apaga a receita. Nada depende dela por chave estrangeira. */
create or replace function delete_recipe(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Apenas a conta de plataforma publica receitas.' using errcode = '42501';
  end if;

  delete from recipes where id = p_id;

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (auth_profile_id(), null, 'RECEITA');
end;
$$;

revoke all on function delete_recipe(uuid) from public, anon;
grant execute on function delete_recipe(uuid) to authenticated, service_role;

-- ── A vitrine, também aqui ───────────────────────────────────────────────────
/**
 * As receitas trancadas atrás do Synse+, para quem não assina.
 *
 * Mesma razão da 0041 no acervo e da 0043 nos programas: a RLS esconde a
 * linha, e prateleira vazia convence quem está no plano grátis de que não
 * existe receita nenhuma.
 *
 * ── Onde fica a linha entre o anúncio e o conteúdo ──────────────────────────
 *
 * O conteúdo de uma receita são **os ingredientes e o modo de preparo**: com
 * os dois, não falta nada. Nenhum dos dois sai daqui, e `nutrition_facts`
 * também não — a tabela de macros é metade do valor de uma receita para quem
 * conta caloria.
 *
 * A imagem sai, e é a única escolha que não se repete do acervo: lá a capa é
 * ilustração, aqui a foto do prato **é** o anúncio. Mostrar o prato e guardar
 * o preparo é exatamente a vitrine de uma padaria.
 */
create or replace function receitas_trancadas()
returns table (
  id        uuid,
  titulo    text,
  descricao text,
  categoria text,
  minutos   smallint,
  porcoes   smallint,
  imagem    text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.title, r.description, r.category, r.prep_minutes, r.servings, r.image_url
  from recipes r
  where r.visibility = 'SYNSE_PLUS'
    and not tem_synse_plus()
    and not is_super_admin()
  order by r.category, r.title
$$;

revoke all on function receitas_trancadas() from public;
grant execute on function receitas_trancadas() to anon, authenticated, service_role;

insert into schema_migrations (version) values ('0044_biblioteca_de_receitas.sql') on conflict do nothing;
