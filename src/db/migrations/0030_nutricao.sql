-- =============================================================================
-- SynseHub · 0030 — Nutrição
--
-- As quatro tabelas existem desde a 0003 e a RLS delas desde a 0004. Nenhuma
-- linha do produto as lê: `/app/nutrition` mostra o plano base estático, e o
-- painel não tem tela nenhuma. É o mesmo estado em que o treino estava antes da
-- atribuição — uma base que funciona e nenhum caminho para o profissional
-- prescrever.
--
-- O que falta para virar produto:
--
-- **Macros.** `meal_items` só tem calorias. Nutricionista trabalha em proteína,
-- carboidrato e gordura; um plano que só soma caloria não é um plano, é uma
-- lista de compras.
--
-- **Meta diária.** Sem alvo, o plano não diz se está batendo. A meta fica no
-- plano, não no aluno, porque ela muda a cada ciclo de acompanhamento.
--
-- **Publicação com versão.** `unique (student_id, version)` já previa que o
-- plano evolui. Faltava a garantia de que só um está valendo por vez — dois
-- planos publicados para a mesma pessoa é o aluno seguindo o errado.
--
-- ── O que a RLS da 0004 já resolve, e que este arquivo não mexe ──────────────
--
-- `meals_scoped` e `meal_items_scoped` têm um `using` que parece não autorizar
-- nada: só conferem que o plano existe. Parecem, e não é o caso — a subconsulta
-- é avaliada sob a RLS de `nutrition_plans`, então quem não enxerga o plano não
-- enxerga a refeição. Foi testado antes de escrever esta migration, e
-- `tests/db/nutricao.test.ts` fixa o comportamento: é sutil demais para
-- depender de alguém reparar na dependência mais tarde.
-- =============================================================================

alter table meal_items
  /*
   * Gramas, não percentuais. Percentual exige recalcular tudo quando a meta
   * muda, e o nutricionista escreve grama na consulta.
   */
  add column if not exists protein_g numeric(6,2) check (protein_g >= 0),
  add column if not exists carbs_g   numeric(6,2) check (carbs_g >= 0),
  add column if not exists fat_g     numeric(6,2) check (fat_g >= 0),
  add column if not exists position  smallint not null default 1;

alter table nutrition_plans
  add column if not exists target_calories  numeric(7,2) check (target_calories >= 0),
  add column if not exists target_protein_g numeric(6,2) check (target_protein_g >= 0),
  add column if not exists target_carbs_g   numeric(6,2) check (target_carbs_g >= 0),
  add column if not exists target_fat_g     numeric(6,2) check (target_fat_g >= 0),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists nutrition_plans_student_idx
  on nutrition_plans (student_id, version desc);

/*
 * Um plano publicado por aluno.
 *
 * Dois valendo ao mesmo tempo é o aluno abrindo o app e seguindo o antigo. O
 * índice parcial é a garantia; `publish_nutrition_plan` arquiva o anterior
 * antes de chegar nele.
 */
create unique index if not exists nutrition_plans_um_publicado_idx
  on nutrition_plans (student_id)
  where status = 'PUBLISHED';

-- ── Somas ────────────────────────────────────────────────────────────────────
/**
 * O que o plano entrega, somado.
 *
 * SECURITY INVOKER: a RLS filtra, e não há autorização a duplicar. Somar no
 * banco em vez de na aplicação porque a tela do aluno mostra o total do dia e a
 * do profissional mostra o total por refeição — as duas leituras saem da mesma
 * conta, e duas somas em lugares diferentes divergem.
 */
create or replace function nutrition_plan_totals(p_plan_id uuid)
returns table (
  calories  numeric,
  protein_g numeric,
  carbs_g   numeric,
  fat_g     numeric,
  itens     integer
)
language sql stable as $$
  select
    coalesce(sum(i.calories), 0),
    coalesce(sum(i.protein_g), 0),
    coalesce(sum(i.carbs_g), 0),
    coalesce(sum(i.fat_g), 0),
    count(*)::integer
  from meal_items i
  join meals m on m.id = i.meal_id
  where m.nutrition_plan_id = p_plan_id
$$;

-- ── Publicação ───────────────────────────────────────────────────────────────
/**
 * Publica o plano e arquiva o que estava valendo.
 *
 * Numa transação só, e no banco, porque são duas escritas que não podem
 * acontecer pela metade: arquivar o antigo sem publicar o novo deixa o aluno
 * sem plano nenhum, e publicar sem arquivar esbarra no índice — com o erro
 * chegando como falha de constraint em vez de explicação.
 *
 * O aviso ao aluno sai daqui pelo mesmo motivo de sempre: plano publicado por
 * qualquer caminho tem de notificar.
 */
create or replace function publish_nutrition_plan(p_plan_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_plano   nutrition_plans;
  v_perfil  uuid;
  v_autor   text;
begin
  select * into v_plano from nutrition_plans where id = p_plan_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0002';
  end if;

  -- `is not true`: `org_role` devolve nulo para quem não pertence, e o `in`
  -- sobre nulo também é nulo. Ver a nota da 0025.
  if (org_role(v_plano.organization_id) in ('NUTRITIONIST', 'OWNER')) is not true then
    raise exception 'Só o nutricionista responsável publica o plano.' using errcode = '42501';
  end if;

  if v_plano.status = 'PUBLISHED' then
    return;
  end if;

  if not exists (select 1 from meals where nutrition_plan_id = p_plan_id) then
    raise exception 'Um plano sem refeições não vai ajudar ninguém.' using errcode = '23514';
  end if;

  update nutrition_plans
  set status = 'ARCHIVED', updated_at = now()
  where student_id = v_plano.student_id
    and status = 'PUBLISHED'
    and id <> p_plan_id;

  update nutrition_plans
  set status = 'PUBLISHED', published_at = now(), updated_at = now()
  where id = p_plan_id;

  select s.user_profile_id into v_perfil from students s where s.id = v_plano.student_id;
  select p.name into v_autor
  from staff st join user_profiles p on p.id = st.user_profile_id
  where st.id = v_plano.author_staff_id;

  perform notify_profiles(
    array[v_perfil],
    v_plano.organization_id,
    'CONTENT',
    'Seu plano alimentar foi atualizado',
    coalesce(v_autor || ' publicou ', 'Foi publicado ') || '"' || v_plano.title || '".',
    '/app/nutrition'
  );
end;
$$;

revoke all on function publish_nutrition_plan(uuid) from public, anon;
grant execute on function publish_nutrition_plan(uuid) to authenticated, service_role;

/**
 * Abre a próxima versão a partir da que está valendo.
 *
 * Copia refeições e itens. Reescrever o plano publicado seria mudar debaixo do
 * aluno o que ele está seguindo hoje — e apagaria o registro do que foi
 * prescrito antes, que num dado de saúde é o que importa quando alguém
 * pergunta "o que ele estava comendo em agosto?".
 *
 * Devolve o id da nova versão.
 */
create or replace function new_nutrition_plan_version(p_plan_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_plano nutrition_plans;
  v_nova  uuid;
begin
  select * into v_plano from nutrition_plans where id = p_plan_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = 'P0002';
  end if;

  if (org_role(v_plano.organization_id) in ('NUTRITIONIST', 'OWNER')) is not true then
    raise exception 'Só o nutricionista responsável edita o plano.' using errcode = '42501';
  end if;

  insert into nutrition_plans (
    organization_id, student_id, author_staff_id, title, version, status, notes,
    target_calories, target_protein_g, target_carbs_g, target_fat_g
  )
  select
    v_plano.organization_id, v_plano.student_id, v_plano.author_staff_id,
    v_plano.title,
    -- A próxima versão livre deste aluno, e não `version + 1`: pode haver
    -- rascunho aberto ocupando o número seguinte.
    (select coalesce(max(version), 0) + 1 from nutrition_plans where student_id = v_plano.student_id),
    'DRAFT', v_plano.notes,
    v_plano.target_calories, v_plano.target_protein_g, v_plano.target_carbs_g, v_plano.target_fat_g
  returning id into v_nova;

  with refeicoes as (
    insert into meals (nutrition_plan_id, name, time_of_day, position)
    select v_nova, m.name, m.time_of_day, m.position
    from meals m where m.nutrition_plan_id = p_plan_id
    returning id, position
  )
  insert into meal_items (meal_id, description, quantity, calories, protein_g, carbs_g, fat_g, position)
  select r.id, i.description, i.quantity, i.calories, i.protein_g, i.carbs_g, i.fat_g, i.position
  from meal_items i
  join meals m on m.id = i.meal_id
  join refeicoes r on r.position = m.position
  where m.nutrition_plan_id = p_plan_id;

  return v_nova;
end;
$$;

revoke all on function new_nutrition_plan_version(uuid) from public, anon;
grant execute on function new_nutrition_plan_version(uuid) to authenticated, service_role;

/*
 * A política do paciente da 0004 exige `status = 'PUBLISHED'`, e continua como
 * está: rascunho é trabalho em andamento do profissional, e um plano meio
 * escrito aparecendo no app do aluno seria pior que nenhum.
 *
 * `meals_scoped` e `meal_items_scoped` também ficam: já funcionam pela
 * dependência da RLS de `nutrition_plans`, provada em teste.
 */

insert into schema_migrations (version) values ('0030_nutricao.sql') on conflict do nothing;
