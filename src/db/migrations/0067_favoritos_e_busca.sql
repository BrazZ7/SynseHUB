-- =============================================================================
-- SynseHub · 0067 — Favoritos e busca de conteúdos
--
-- Duas faltas da mesma tela. O acervo abre com cinquenta itens numa lista
-- corrida e **não tem campo de busca**: quem leu um artigo semana passada
-- rola até achar, ou desiste. E não há como guardar nada — a receita que deu
-- certo volta a ser procurada toda vez.
--
-- ── Tudo `security invoker`, de propósito ───────────────────────────────────
--
-- Nenhuma função daqui é `security definer`, e isso é uma decisão e não
-- esquecimento. Quem decide o que cada pessoa enxerga de conteúdo já é a RLS:
-- `content_read` (0039) e `recipes_read` (0044) carregam a regra inteira,
-- incluindo o cadeado do Synse+. A 0031 escreveu o motivo ao criar
-- `published_content`:
--
--   "SECURITY INVOKER: a RLS acima é quem filtra, e repetir a regra aqui
--    criaria um segundo lugar para ela divergir."
--
-- Vale igual aqui, e com mais força: são quatro funções novas, e cada uma
-- seria um lugar a mais para o cadeado do Synse+ sair errado.
--
-- ── Favorito é da pessoa, não da matrícula ──────────────────────────────────
--
-- `user_profile_id`, como corrida e pesagem (0016). O acervo do Synse não é de
-- academia nenhuma, as receitas também não, e quem troca de academia leva o
-- que guardou.
--
-- ── Um dos dois, nunca os dois ──────────────────────────────────────────────
--
-- Uma tabela com duas chaves estrangeiras e um `check` de exclusividade, em vez
-- de duas tabelas ou de um par (tipo, id) solto.
--
-- Duas tabelas seriam duas políticas, dois `toggle`, duas leituras — a mesma
-- regra escrita duas vezes. E um par (tipo, id) sem referência perderia a
-- integridade: receita apagada deixaria favorito apontando para o nada, e a
-- tela teria de filtrar fantasma a cada leitura. Com a chave estrangeira, o
-- `on delete cascade` resolve no banco.
-- =============================================================================

create table content_favorites (
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  content_id      uuid references content_library(id) on delete cascade,
  recipe_id       uuid references recipes(id) on delete cascade,
  created_at      timestamptz not null default now(),
  /*
   * `num_nonnulls` em vez de dois `is null` cruzados: a intenção fica legível
   * na mensagem de erro, e acrescentar um terceiro tipo amanhã é mudar o
   * número, não reescrever a expressão.
   */
  constraint content_favorites_um_so check (num_nonnulls(content_id, recipe_id) = 1)
);

/*
 * Chave única por tipo, parcial porque a coluna do outro tipo é nula — e nulo
 * não colide com nulo numa chave composta comum. Sem os índices parciais, a
 * mesma pessoa favoritaria a mesma receita duas vezes.
 */
create unique index content_favorites_conteudo
  on content_favorites (user_profile_id, content_id) where content_id is not null;
create unique index content_favorites_receita
  on content_favorites (user_profile_id, recipe_id) where recipe_id is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table content_favorites enable row level security;

/*
 * Só a própria pessoa, nas quatro operações.
 *
 * `for all` com `using` e `with check`: a leitura e o apagamento alcançam só as
 * linhas dela, e a escrita só grava com o perfil dela. A academia não entra —
 * o que alguém guardou para ler é leitura pessoal, e uma lista disso na mão do
 * dono da academia é perfil de comportamento, não gestão.
 *
 * ── Por que a escrita direta fica aberta aqui, ao contrário da 0062 e 0065 ──
 *
 * Naquelas o `insert` foi revogado e só a função escreve, porque a função
 * precisava resolver a matrícula e preencher coluna derivada. Aqui não há
 * derivação: a linha é (pessoa, item), e a política já amarra a pessoa.
 *
 * Fechar a escrita obrigaria a função a ser `security definer`, e aí ela
 * precisaria reimplementar a visibilidade do conteúdo para não virar porta de
 * favoritar o que a pessoa não pode ver — o segundo lugar para a regra
 * divergir, que é justamente o que esta migration evita.
 *
 * O que sobra de superfície: alguém com o endereço da API pode gravar um
 * favorito para si apontando para um id que não enxerga, porque a chave
 * estrangeira não passa pela RLS. Não vaza nada — `student_favorites` é
 * `invoker` e não devolve a linha —, e o que se aprende é a existência de um
 * UUID que a pessoa já teria de conhecer para tentar.
 *
 * `update` fica revogado: favorito não tem o que atualizar, e permitir seria
 * deixar mover um favorito de um item para outro sem motivo nenhum.
 */
create policy content_favorites_self on content_favorites
  for all
  using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

revoke update on content_favorites from authenticated, anon;

-- ── Guardar e desguardar ─────────────────────────────────────────────────────
/**
 * Liga ou desliga o favorito, e devolve como ficou.
 *
 * Um botão só na tela, então uma função só aqui: a tela manda o item e recebe
 * `true` se passou a estar guardado. Duas funções (guardar/esquecer) deixariam
 * a tela decidir qual chamar a partir de um estado que ela leu antes — e entre
 * a leitura e o toque a verdade pode ter mudado noutra aba.
 *
 * **`security invoker`**: o `exists` abaixo passa pela RLS do conteúdo, então
 * favoritar o que a pessoa não enxerga é recusado sem esta função saber uma
 * linha sequer sobre cadeado, academia ou publicação.
 */
create or replace function toggle_content_favorite(
  p_content_id uuid default null,
  p_recipe_id  uuid default null
)
returns boolean
language plpgsql volatile security invoker set search_path = public as $$
declare
  v_profile uuid := auth_profile_id();
  v_apagou  integer;
begin
  if v_profile is null then
    raise exception 'Sem perfil para esta conta.' using errcode = '42501';
  end if;

  if num_nonnulls(p_content_id, p_recipe_id) <> 1 then
    raise exception 'Informe um conteúdo ou uma receita, não os dois.'
      using errcode = '22023';
  end if;

  /*
   * O item precisa existir **para quem está chamando**. Sem isto, o favorito
   * viraria o único lugar do produto onde o cadeado do Synse+ não se aplica.
   */
  if p_content_id is not null
     and not exists (select 1 from content_library c where c.id = p_content_id) then
    raise exception 'Conteúdo não encontrado.' using errcode = 'P0002';
  end if;

  if p_recipe_id is not null
     and not exists (select 1 from recipes r where r.id = p_recipe_id) then
    raise exception 'Receita não encontrada.' using errcode = 'P0002';
  end if;

  delete from content_favorites f
  where f.user_profile_id = v_profile
    and f.content_id is not distinct from p_content_id
    and f.recipe_id is not distinct from p_recipe_id;

  get diagnostics v_apagou = row_count;
  if v_apagou > 0 then
    return false;
  end if;

  insert into content_favorites (user_profile_id, content_id, recipe_id)
  values (v_profile, p_content_id, p_recipe_id);

  return true;
end;
$$;

revoke all on function toggle_content_favorite(uuid, uuid) from public, anon;
grant execute on function toggle_content_favorite(uuid, uuid) to authenticated, service_role;

-- ── O que a pessoa guardou ───────────────────────────────────────────────────
/**
 * Os favoritos de quem está autenticado, conteúdo e receita na mesma lista.
 *
 * Uma lista e não duas, como na linha do tempo (0064): a pergunta é "o que eu
 * guardei", e separar em duas abas obrigaria a lembrar em qual delas estava.
 *
 * ── O que some daqui, e por quê ─────────────────────────────────────────────
 *
 * `inner join`, com a RLS valendo: some o que a pessoa deixou de poder ver —
 * conteúdo que a academia despublicou, item do Synse+ de quem deixou de
 * assinar, conteúdo da academia de onde a pessoa saiu.
 *
 * A linha continua na tabela. Quem reassinar o Synse+ encontra o que guardou
 * no mesmo lugar, e é por isso que a saída é sumir da lista e não apagar.
 */
create or replace function student_favorites(p_limite integer default 60)
returns table (
  kind         text,
  ref_id       uuid,
  title        text,
  subtitle     text,
  image_url    text,
  badge        text,
  favorited_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select * from (
    select
      'CONTEUDO'::text          as kind,
      c.id                      as ref_id,
      c.title                   as title,
      c.summary                 as subtitle,
      c.cover_url               as image_url,
      c.type::text              as badge,
      f.created_at              as favorited_at
    from content_favorites f
    join content_library c on c.id = f.content_id
    where f.user_profile_id = auth_profile_id()
      -- Publicado: rascunho que a equipe enxerga pela RLS não é leitura de aluno.
      and c.published_at is not null
      and c.published_at <= now()

    union all

    select
      'RECEITA',
      r.id,
      r.title,
      r.description,
      r.image_url,
      r.category,
      f.created_at
    from content_favorites f
    join recipes r on r.id = f.recipe_id
    where f.user_profile_id = auth_profile_id()
  ) tudo
  order by favorited_at desc, ref_id desc
  -- Teto, como em toda leitura do projeto. Sessenta cabe numa rolagem longa.
  limit least(greatest(coalesce(p_limite, 60), 1), 200);
$$;

revoke all on function student_favorites(integer) from public, anon;
grant execute on function student_favorites(integer) to authenticated, service_role;

/**
 * Só os ids guardados, para a lista desenhar o coração cheio.
 *
 * Separado da lista acima porque a pergunta é outra: as telas de acervo e de
 * receitas precisam saber **quais destes** estão guardados, e trazer título e
 * capa de tudo outra vez para isso seria pagar a leitura duas vezes.
 */
create or replace function student_favorite_ids()
returns table (content_id uuid, recipe_id uuid)
language sql stable security invoker set search_path = public as $$
  select f.content_id, f.recipe_id
  from content_favorites f
  where f.user_profile_id = auth_profile_id()
$$;

revoke all on function student_favorite_ids() from public, anon;
grant execute on function student_favorite_ids() to authenticated, service_role;

-- ── A busca ──────────────────────────────────────────────────────────────────
/*
 * `unaccent` já entrou na 0021, no schema `extensions`. A regra de casamento
 * daqui é a mesma que a busca de exercícios estabeleceu, com uma diferença:
 * **cada palavra** do termo precisa casar, e não o termo inteiro de uma vez.
 *
 * É o que faz "treino casa" encontrar "Treino em casa sem equipamento" — com
 * o termo inteiro, só casaria quem digitasse as palavras grudadas e na ordem.
 */
create or replace function casa_termo(p_texto text, p_termo text)
returns boolean
language sql immutable set search_path = public, extensions as $$
  select coalesce(trim(p_termo), '') = ''
    or not exists (
      select 1
      from unnest(string_to_array(unaccent(lower(trim(p_termo))), ' ')) as palavra
      where palavra <> ''
        and unaccent(lower(coalesce(p_texto, ''))) not like '%' || palavra || '%'
    )
$$;

revoke all on function casa_termo(text, text) from public, anon;
grant execute on function casa_termo(text, text) to authenticated, service_role;

/**
 * O acervo, filtrado por texto.
 *
 * Mesmas colunas e mesma ordem de `published_content` (0031), que continua
 * existindo para quem não busca — a home pede três itens e não tem campo de
 * texto. Função nova em vez de parâmetro novo lá: acrescentar um argumento
 * criaria uma **segunda** função de mesmo nome, e aí toda chamada com dois
 * argumentos ficaria ambígua.
 *
 * O corpo entra na busca. Quem procura "creatina" quer o artigo que fala de
 * creatina, mesmo que o título seja "Suplementação para iniciantes".
 *
 * ── `organizacao_id` é coluna nova, e conserta um defeito ───────────────────
 *
 * `published_content` não devolve o dono do item, e o mapeamento da aplicação
 * carimbava **todos** com a academia de quem pediu. A tela do acervo decide o
 * selo "Acervo Synse" por `organizationId === null`, então o selo nunca
 * aparecia em produção — e o item da plataforma se lia como publicação da
 * academia, que é exatamente o que o selo existe para evitar. Na demonstração
 * aparecia, porque lá o dono vem do conjunto de dados.
 */
create or replace function search_published_content(
  p_organization_id uuid,
  p_termo           text default '',
  p_limite          integer default 50
)
returns table (
  id             uuid,
  organizacao_id uuid,
  tipo           content_type,
  titulo         text,
  resumo         text,
  capa_url       text,
  midia_url      text,
  fixado         boolean,
  publicado_em   timestamptz,
  autor          text
)
language sql stable security invoker set search_path = public as $$
  select
    c.id, c.organization_id, c.type, c.title, c.summary, c.cover_url, c.media_url,
    c.pinned, c.published_at,
    u.name
  from content_library c
  left join staff s on s.id = c.author_staff_id
  left join user_profiles u on u.id = s.user_profile_id
  where (c.organization_id = p_organization_id or c.organization_id is null)
    and c.published_at is not null
    and c.published_at <= now()
    and casa_termo(
      coalesce(c.title, '') || ' ' || coalesce(c.summary, '') || ' ' || coalesce(c.body, ''),
      p_termo
    )
  order by c.pinned desc, c.published_at desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

revoke all on function search_published_content(uuid, text, integer) from public, anon;
grant execute on function search_published_content(uuid, text, integer) to authenticated, service_role;

/**
 * As receitas, filtradas por texto.
 *
 * `setof recipes` como `search_exercises`: a tela já sabe desenhar uma receita
 * inteira, e uma projeção estreita aqui a obrigaria a ter um segundo cartão.
 *
 * Ingredientes entram na busca, e é metade do valor dela: "o que eu faço com
 * abobrinha" é a pergunta de quem abre a geladeira, não "qual receita se chama
 * abobrinha".
 */
create or replace function search_recipes(
  p_termo  text default '',
  p_limite integer default 50
)
returns setof recipes
language sql stable security invoker set search_path = public as $$
  select r.*
  from recipes r
  where casa_termo(
    coalesce(r.title, '') || ' ' || coalesce(r.description, '') || ' '
      || array_to_string(r.ingredients, ' ') || ' '
      || array_to_string(r.tags, ' '),
    p_termo
  )
  order by r.category, r.title
  limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

revoke all on function search_recipes(text, integer) from public, anon;
grant execute on function search_recipes(text, integer) to authenticated, service_role;

insert into schema_migrations (version) values ('0067_favoritos_e_busca.sql') on conflict do nothing;
