-- =============================================================================
-- SynseHub · 0046 — Fechando o que a auditoria achou
--
-- Nove furos, cada um reproduzido como ataque em
-- `tests/db/auditoria-de-seguranca.test.ts` antes de ser fechado aqui. Os
-- testes passaram a falhar no dia em que foram escritos — era essa a prova de
-- que o furo existia — e esta migration é o que os faz passar.
--
-- Três deles nasceram de reescritas que se declararam neutras. A 0008 diz, em
-- voz alta, "a regra de negócio é idêntica — quem enxerga o quê não muda em
-- nada", e mudou três coisas: deu dado de saúde à recepção, tirou a
-- conferência de academia do check-in, e nada avisou. É o motivo de os testes
-- deste arquivo serem **ataques**, e não asserções sobre o texto da política:
-- asserção sobre texto envelhece junto com a reescrita que ela deveria pegar.
-- =============================================================================

-- ── A0 · Auto-promoção a conta de plataforma ────────────────────────────────
/*
 * O pior dos nove, e o mais curto de explicar.
 *
 * `organization_members_write` restringia **em qual academia** se escreve, e
 * não **qual papel** se grava. `is_super_admin()` aceitava a linha em
 * qualquer organização. Juntando as duas: a dona de qualquer academia cliente
 * virava conta de plataforma com um `update` de uma linha — e o `PATCH`
 * equivalente está a um `curl` de distância, porque a chave anônima está no
 * pacote do navegador por desenho e o JWT está no cookie dela.
 *
 * Daí lia e escrevia dado de saúde e financeiro de toda academia, e editava
 * `organization_billing_settings` — a taxa que o CLAUDE.md declara
 * inegociável ia a zero pelo próprio cliente que a paga.
 *
 * A correção tem duas metades, e nenhuma basta sozinha.
 */

/**
 * Metade um: o papel só vale na organização reservada da plataforma.
 *
 * É onde `grant_super_admin` (0034) sempre escreveu — a função nunca criou a
 * linha em outro lugar. Amarrar aqui faz a auto-promoção deixar de valer de
 * nada, porque nenhum admin de academia é admin da organização da plataforma.
 *
 * O id fixo é o mesmo da 0034, e a 0034 explica por que ele existe: pendurar
 * o super admin numa academia de cliente o faria aparecer na lista de equipe
 * dela.
 */
create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from organization_members m
    join user_profiles p on p.id = m.user_profile_id
    where p.auth_user_id = auth.uid()
      and m.organization_id = '00000000-0000-0000-0000-000000000002'
      and m.role = 'SUPER_ADMIN'
      and m.status = 'ACTIVE'
  );
$$;

/*
 * Metade dois: a aplicação não escreve o papel de plataforma, ponto.
 *
 * Sem isto, a linha fantasma continuaria entrando — não daria mais poder
 * nenhum, mas apareceria na lista de equipe da academia e na trilha, e
 * "inofensivo porque a outra metade segura" é como furo volta.
 *
 * `is_super_admin()` sai do `using`/`with check` de propósito: a conta de
 * plataforma administra equipe pelo `service_role`, não por esta política.
 */
drop policy if exists organization_members_write on organization_members;
create policy organization_members_write on organization_members
  for all
  using (organization_id in (select admin_organization_ids()) and role <> 'SUPER_ADMIN')
  with check (organization_id in (select admin_organization_ids()) and role <> 'SUPER_ADMIN');

-- ── F1 · A view que entregava toda matrícula ao anônimo ─────────────────────
/*
 * `student_active_memberships` (0001) nasceu sem `security_invoker`. View
 * assim é avaliada com os privilégios do **dono** — no Supabase, o `postgres`,
 * que tem `BYPASSRLS`. A RLS de `memberships` não se aplicava através dela, e
 * os privilégios padrão do schema dão `select` ao `anon` automaticamente.
 *
 * Resultado medido: `GET /rest/v1/student_active_memberships` sem sessão
 * nenhuma devolvia `student_id`, `plan_id`, **preço praticado** e dia de
 * cobrança de toda academia da plataforma.
 *
 * O projeto já conhecia o padrão certo — `staff_invites_public` (0020)
 * declara `security_invoker = true`. Esta view é de antes dele.
 */
alter view student_active_memberships set (security_invoker = true);
revoke all on student_active_memberships from anon;
grant select on student_active_memberships to authenticated, service_role;

-- ── F2 · Dado de saúde e a recepção ─────────────────────────────────────────
/*
 * A 0004 listava os papéis um a um sob o cabeçalho "Dados de saúde: acesso
 * estreito", e deixava `RECEPTIONIST` de fora de propósito. A 0008 trocou a
 * lista por `staff_organization_ids()`, que inclui a recepção — e, como a
 * política é `for all` sem `revoke`, a recepção passou a **ler, escrever e
 * apagar** peso, percentual de gordura, dobras e anotação clínica.
 *
 * A forma de conjunto da 0008 fica: ela existe por um motivo medido (997 ms
 * → 23 ms). O que entra é um conjunto próprio para dado de saúde.
 */
create or replace function health_organization_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.organization_id
  from organization_members m
  join user_profiles p on p.id = m.user_profile_id
  where p.auth_user_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','MANAGER','TRAINER','NUTRITIONIST','PROFESSIONAL','SUPER_ADMIN')
$$;

revoke all on function health_organization_ids() from public;
grant execute on function health_organization_ids() to anon, authenticated, service_role;

drop policy if exists assessments_professional on assessments;
create policy assessments_professional on assessments
  for all
  using ((select is_super_admin()) or organization_id in (select health_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select health_organization_ids()));

-- ── F3 · Check-in em academia alheia ────────────────────────────────────────
/*
 * A 0004 exigia o par: `owns_student(student_id) and is_org_member(org)`. A
 * 0008 reescreveu e o segundo termo caiu. Nada no schema amarra
 * `check_ins.organization_id` a `students.organization_id`.
 *
 * O aluno inseria check-in na academia do vizinho, poluindo a frequência, o
 * relatório de aderência (0035) e os desafios por check-in (0029) dela.
 */
drop policy if exists check_ins_self_write on check_ins;
create policy check_ins_self_write on check_ins
  for insert
  with check (
    student_id in (select current_student_ids())
    and exists (
      select 1 from students s
      where s.id = check_ins.student_id
        and s.organization_id = check_ins.organization_id
    )
  );

-- ── F4 · O paciente apagando a própria prescrição ───────────────────────────
/*
 * `meals_scoped` era `for all` com um `using` que só confere "o plano
 * existe". Como a RLS do pai se aplica dentro da subconsulta, isso queria
 * dizer "o plano é visível para mim" — e o paciente vê o plano publicado.
 * O `update` morria no `with check`; o `delete` só consulta o `using`, e
 * passava.
 *
 * Some dado de saúde que a 0030 versiona de propósito, para responder "o que
 * ele estava comendo em agosto?". Separar leitura de escrita é o desenho que
 * a 0043 já usou em `program_enrollments`.
 */
drop policy if exists meals_scoped on meals;
create policy meals_read on meals
  for select using (
    exists (select 1 from nutrition_plans np where np.id = meals.nutrition_plan_id)
  );
create policy meals_write on meals
  for all
  using (
    exists (select 1 from nutrition_plans np
            where np.id = meals.nutrition_plan_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  )
  with check (
    exists (select 1 from nutrition_plans np
            where np.id = meals.nutrition_plan_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  );

drop policy if exists meal_items_scoped on meal_items;
create policy meal_items_read on meal_items
  for select using (exists (select 1 from meals m where m.id = meal_items.meal_id));
create policy meal_items_write on meal_items
  for all
  using (
    exists (select 1 from meals m
            join nutrition_plans np on np.id = m.nutrition_plan_id
            where m.id = meal_items.meal_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  )
  with check (
    exists (select 1 from meals m
            join nutrition_plans np on np.id = m.nutrition_plan_id
            where m.id = meal_items.meal_id
              and org_role(np.organization_id) in ('NUTRITIONIST','OWNER'))
  );

-- ── F5 · Corrida no feed de academia alheia ─────────────────────────────────
/*
 * `activities_self` confere o perfil e não a organização, que vem colada pelo
 * cliente. A política irmã `activities_gym` entrega ao staff toda atividade
 * `PUBLIC`/`GYM` da própria academia **sem conferir que o autor é aluno
 * dela** — então a corrida de um estranho entrava no ranking.
 *
 * `organization_id is null` continua valendo: quem corre sem academia é o
 * caso do Synse Solo, e fechar isso quebraria o produto.
 */
drop policy if exists activities_self on activities;
create policy activities_self on activities
  for all
  using (user_profile_id = (select auth_profile_id()))
  with check (
    user_profile_id = (select auth_profile_id())
    and (
      organization_id is null
      or organization_id in (select student_organization_ids())
    )
  );

-- ── F7 · Autorização de corpo por escrita direta ────────────────────────────
/*
 * A 0045 existe para garantir que "só é possível autorizar quem a tela
 * oferece". Ela não revogou a escrita da tabela, e `body_shares_owner` seguia
 * `for all` — um insert direto pelo PostgREST contornava a função inteira.
 *
 * A 0032 fez esse `revoke` em `body_measurements` e esqueceu aqui.
 *
 * Como a revogação dependia do `update` que está sendo fechado, entra a
 * função irmã.
 */
drop policy if exists body_shares_owner on body_measurement_shares;
create policy body_shares_owner_read on body_measurement_shares
  for select using (user_profile_id = (select auth_profile_id()));

revoke insert, update, delete on body_measurement_shares from authenticated, anon;

/** Tira o acesso que `autorizar_corpo` deu. Só o dono do dado revoga. */
create or replace function revogar_corpo(p_share_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update body_measurement_shares
  set revoked_at = now()
  where id = p_share_id
    and user_profile_id = auth_profile_id()
    and revoked_at is null;
end;
$$;

revoke all on function revogar_corpo(uuid) from public, anon;
grant execute on function revogar_corpo(uuid) to authenticated, service_role;

-- ── A1 · Sequestro de conta por conversão de lead ───────────────────────────
/*
 * `convert_lead_to_student` é `security definer` e procurava `user_profiles`
 * **por e-mail em todo o banco**, criando `students` com status ACTIVE. Nada
 * conferia que o dono daquele perfil quis se matricular.
 *
 * Quem explora: qualquer pessoa com uma academia — e criar uma é
 * auto-serviço. O que ganha: a PII inteira da vítima (nome, telefone, CPF,
 * nascimento) pela política `user_profiles_visible`, cobrança no nome dela, e
 * — pior — `resolveSession` escolhe a matrícula mais recente, então o app da
 * vítima passava a abrir **dentro da academia do atacante**.
 *
 * O contraste prova que é defeito: o fluxo por código de convite nasce
 * PENDING de propósito, com um passo de confirmação, e o comentário da 0020
 * diz por quê.
 *
 * A correção preserva os dois caminhos legítimos — o lead de balcão sem conta
 * Synse, e o reaproveitamento do perfil de quem **já** é da casa.
 */
create or replace function convert_lead_to_student(
  p_lead_id     uuid,
  p_plan_id     uuid default null,
  p_billing_day smallint default 5
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_lead    leads;
  v_perfil  uuid;
  v_aluno   uuid;
  v_preco   numeric(10,2);
  v_email   citext;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  if is_org_staff(v_lead.organization_id) is not true then
    raise exception 'Este lead não é da sua academia.' using errcode = '42501';
  end if;

  if v_lead.converted_student_id is not null then
    return v_lead.converted_student_id;
  end if;

  if p_plan_id is not null and not exists (
    select 1 from membership_plans
    where id = p_plan_id and organization_id = v_lead.organization_id
  ) then
    raise exception 'Este plano não é da sua academia.' using errcode = '42501';
  end if;

  v_email := coalesce(
    nullif(trim(v_lead.email::text), ''),
    'lead+' || replace(p_lead_id::text, '-', '') || '@synse.invalid'
  );

  /*
   * Só reaproveita perfil que **já pertence a esta academia** — como aluno ou
   * como equipe. Era aqui que o `select … where email = v_email` cru, rodando
   * fora da RLS por ser `definer`, alcançava a conta de qualquer pessoa da
   * plataforma.
   */
  select up.id into v_perfil
  from user_profiles up
  where up.email = v_email
    and (
      exists (select 1 from students s
              where s.user_profile_id = up.id
                and s.organization_id = v_lead.organization_id)
      or exists (select 1 from organization_members m
                 where m.user_profile_id = up.id
                   and m.organization_id = v_lead.organization_id)
    );

  if v_perfil is null then
    /*
     * E se o e-mail já é de alguém **de fora**, a conversão para. Criar um
     * segundo perfil esbarraria na unicidade de e-mail (0006) com uma
     * mensagem incompreensível; recusar com texto claro é melhor que isso e
     * muito melhor que matricular a pessoa sem ela saber.
     */
    if exists (select 1 from user_profiles where email = v_email) then
      raise exception
        'Este e-mail já tem conta Synse. Peça à pessoa o código de convite da academia — matrícula sem o aceite dela não existe.'
        using errcode = '42501';
    end if;

    insert into user_profiles (name, email, phone)
    values (v_lead.name, v_email, v_lead.phone)
    returning id into v_perfil;
  end if;

  insert into students (organization_id, user_profile_id, status)
  values (v_lead.organization_id, v_perfil, 'ACTIVE')
  on conflict (organization_id, user_profile_id) do update set status = 'ACTIVE'
  returning id into v_aluno;

  if p_plan_id is not null then
    select price into v_preco from membership_plans where id = p_plan_id;
    insert into memberships (organization_id, student_id, plan_id, price, billing_day)
    values (v_lead.organization_id, v_aluno, p_plan_id, v_preco, p_billing_day);
  end if;

  update leads
  set stage = 'ENROLLED',
      converted_student_id = v_aluno,
      next_follow_up_at = null
  where id = p_lead_id;

  return v_aluno;
end;
$$;

-- ── A2 e A3 · Aluno de outra academia em plano alimentar e em treino ────────
/*
 * As duas políticas conferiam só `organization_id`, que vem da sessão e
 * portanto sempre passa. O `student_id` não era amarrado a ela por nada — nem
 * política, nem constraint, nem gatilho.
 *
 * No caso da nutrição havia um agravante: `publish_nutrition_plan` arquiva
 * por `student_id` **sem filtrar organização**, então publicar o plano
 * forjado arquivava a prescrição real da vítima, feita por outro profissional
 * em outra academia.
 */
drop policy if exists nutrition_plans_professional on nutrition_plans;
create policy nutrition_plans_professional on nutrition_plans
  for all
  using (org_role(organization_id) in ('NUTRITIONIST','OWNER'))
  with check (
    org_role(organization_id) in ('NUTRITIONIST','OWNER')
    and exists (
      select 1 from students s
      where s.id = nutrition_plans.student_id
        and s.organization_id = nutrition_plans.organization_id
    )
  );

drop policy if exists workout_assignments_staff on workout_assignments;
create policy workout_assignments_staff on workout_assignments
  for all
  using (is_org_staff(organization_id))
  with check (
    is_org_staff(organization_id)
    and exists (
      select 1 from students s
      where s.id = workout_assignments.student_id
        and s.organization_id = workout_assignments.organization_id
    )
  );

/** E o arquivamento para de atravessar a fronteira da academia. */
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
  /*
   * `and organization_id = v_plano.organization_id` é a correção da 0046.
   * Sem ele, publicar um plano arquivava o plano publicado do mesmo aluno em
   * **qualquer** academia — o que, somado ao `with check` que não amarrava o
   * aluno à organização, deixava a academia A apagar a prescrição da B.
   */
  where student_id = v_plano.student_id
    and organization_id = v_plano.organization_id
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

-- ── F6 · `claim_personal_records` agindo sobre atividade alheia ─────────────
/*
 * `security definer`, concedida a `authenticated`, recebia um id de atividade
 * e não conferia dono. O ganho do atacante é pequeno — a escrita vai para o
 * dono real, não para ele — mas a falta da checagem é inequívoca, e ela
 * servia de oráculo de existência.
 */
create or replace function claim_personal_records(p_activity_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_atividade  activities%rowtype;
  v_distancia  integer;
  v_segundos   numeric;
  v_novos      integer := 0;
  v_distancias constant integer[] := array[400, 1000, 1609, 5000, 10000, 15000, 21097, 42195];
begin
  select * into v_atividade from activities where id = p_activity_id;
  if v_atividade.id is null or v_atividade.status <> 'COMPLETED' then
    return 0;
  end if;

  /*
   * A conferência de dono que faltava. `security definer` concedida a
   * `authenticated` que recebe id e age sobre ele sem perguntar de quem é — a
   * única das funções-com-id do schema que não conferia.
   */
  if v_atividade.user_profile_id is distinct from auth_profile_id()
     and not is_super_admin() then
    raise exception 'Esta atividade não é sua.' using errcode = '42501';
  end if;

  foreach v_distancia in array v_distancias loop
    continue when v_atividade.distance_meters < v_distancia;

    -- Instante em que a rota cruzou a marca, interpolado entre dois pontos.
    /*
     * `coalesce(..., 0)` cobre a marca que cai exatamente em cima de um ponto:
     * ali o trecho tem comprimento zero, a fração seria divisão por zero, e o
     * recorde sumia inteiro. Com fração zero, o instante é o do próprio ponto.
     */
    select
      extract(epoch from (
        anterior.recorded_at
        + (atual.recorded_at - anterior.recorded_at)
          * coalesce(
              (v_distancia - anterior.total_distance) /
              nullif(atual.total_distance - anterior.total_distance, 0),
              0
            )
      ) - v_atividade.started_at)
    into v_segundos
    from activity_points atual
    join lateral (
      select * from activity_points anteriores
      where anteriores.activity_id = p_activity_id
        and anteriores.total_distance <= v_distancia
      order by anteriores.total_distance desc
      limit 1
    ) anterior on true
    where atual.activity_id = p_activity_id
      and atual.total_distance >= v_distancia
    order by atual.total_distance
    limit 1;

    continue when v_segundos is null or v_segundos <= 0;

    insert into personal_records
      (user_profile_id, sport, distance_meters, seconds, pace_seconds, activity_id)
    values (
      v_atividade.user_profile_id, v_atividade.sport, v_distancia,
      v_segundos, v_segundos / (v_distancia / 1000.0), p_activity_id
    )
    on conflict (user_profile_id, sport, distance_meters) do update
      set seconds = excluded.seconds,
          pace_seconds = excluded.pace_seconds,
          activity_id = excluded.activity_id,
          achieved_at = now()
      -- Só substitui quando é melhor. Sem isto, a última corrida viraria
      -- "recorde" mesmo sendo a mais lenta.
      where personal_records.seconds > excluded.seconds;

    if found then v_novos := v_novos + 1; end if;
  end loop;

  return v_novos;
end;
$$;

insert into schema_migrations (version) values ('0046_fechando_a_auditoria.sql') on conflict do nothing;
