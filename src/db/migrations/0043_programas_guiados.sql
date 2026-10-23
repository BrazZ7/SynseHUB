-- =============================================================================
-- SynseHub · 0043 — Os programas guiados
--
-- ── O que estava parado ──────────────────────────────────────────────────────
--
-- `programs`, `program_steps` e `program_enrollments` existem desde a 0003 e
-- nunca foram lidas por uma linha de aplicação. A 0038 até consertou a
-- visibilidade delas, e a tabela de planos anunciava "programas guiados de 21,
-- 30, 60 e 90 dias" — até a 0042 do comparativo tirar a promessa, porque não
-- havia nada atrás dela.
--
-- Esta migration é o que faltava dos dois lados: a porta de autoria para a
-- conta de plataforma e as funções que o aluno usa para seguir o programa.
--
-- ── Por que a matrícula sai da mão do cliente ───────────────────────────────
--
-- A 0004 deu ao aluno `for all` em `program_enrollments` com
-- `user_profile_id = auth_profile_id()`. Parece razoável — é a linha dele —,
-- mas tem um furo: **nada confere se ele pode ler o programa**. Quem não
-- assina consegue inserir matrícula num programa `SYNSE_PLUS`. Os passos
-- continuam trancados pela 0038, então não vaza conteúdo; o que vaza é o
-- estado: a tela do aluno passaria a mostrar "você está no Programa 90 dias"
-- para quem nunca pagou, e o relatório de matrículas contaria gente que não
-- tem acesso.
--
-- A política vira só leitura e as escritas passam por função, que confere a
-- visibilidade antes. É o mesmo desenho da amizade e da avaliação física.
--
-- ── E por que o progresso também ────────────────────────────────────────────
--
-- `current_day` e `completed_days` precisam andar juntos. Escrita solta deixa
-- marcar o dia 40 sem ter feito o 39, e deixa `current_day` apontar para um
-- dia que não existe no programa. Não é fraude com valor — é o progresso da
-- própria pessoa —, mas é estado incoerente que depois aparece como defeito
-- na tela e ninguém sabe de onde veio.
-- =============================================================================

-- ── Quem pode ver este programa? ─────────────────────────────────────────────
/**
 * A mesma condição da política da 0038, num lugar só.
 *
 * Repetida em cada função, ela divergiria na primeira vez que a regra mudasse
 * — e a que ficasse para trás seria a que ninguém revisa.
 */
create or replace function programa_visivel(p_program_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from programs p
    where p.id = p_program_id
      and (p.visibility = 'FREE' or (p.visibility = 'SYNSE_PLUS' and tem_synse_plus()))
  )
$$;

revoke all on function programa_visivel(uuid) from public;
grant execute on function programa_visivel(uuid) to anon, authenticated, service_role;

-- ── A matrícula ──────────────────────────────────────────────────────────────
/**
 * Começa — ou recomeça — um programa.
 *
 * Recomeçar zera o progresso de propósito: quem abandonou e volta meses
 * depois não está no dia 14 de nada. Reaproveitar a linha mantém o histórico
 * de que a pessoa já tentou, que é o que a unicidade (program_id,
 * user_profile_id) já guardava.
 */
create or replace function iniciar_programa(p_program_id uuid) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid := auth_profile_id();
  v_id     uuid;
begin
  if v_perfil is null then
    raise exception 'Sessão não identificada.' using errcode = '28000';
  end if;

  if not programa_visivel(p_program_id) then
    /*
     * Mesma mensagem para "não existe" e "não é seu plano", de propósito:
     * distinguir contaria ao plano gratuito quantos programas o Synse+ tem,
     * e isso quem conta é a vitrine, não uma mensagem de erro.
     */
    raise exception 'Programa indisponível.' using errcode = '42501';
  end if;

  insert into program_enrollments (program_id, user_profile_id)
  values (p_program_id, v_perfil)
  on conflict (program_id, user_profile_id) do update
    set started_at = current_date,
        current_day = 1,
        completed_days = '{}',
        status = 'ACTIVE'
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function iniciar_programa(uuid) from public, anon;
grant execute on function iniciar_programa(uuid) to authenticated, service_role;

/**
 * Marca um dia como feito.
 *
 * `current_day` passa a ser o menor dia ainda não concluído, e não "o último
 * mais um": quem pula o dia 3 e faz o 4 continua devendo o 3, e a tela
 * precisa apontar para lá. Terminar todos fecha o programa.
 */
create or replace function concluir_dia(p_program_id uuid, p_dia smallint) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil   uuid := auth_profile_id();
  v_duracao  smallint;
  v_dias     smallint[];
  v_proximo  smallint;
begin
  if v_perfil is null then
    raise exception 'Sessão não identificada.' using errcode = '28000';
  end if;

  if not programa_visivel(p_program_id) then
    raise exception 'Programa indisponível.' using errcode = '42501';
  end if;

  select duration_days into v_duracao from programs where id = p_program_id;

  if p_dia < 1 or p_dia > v_duracao then
    raise exception 'O dia % não existe neste programa.', p_dia using errcode = '22023';
  end if;

  -- `array_agg(distinct)` ordena e tira repetição: marcar duas vezes o mesmo
  -- dia não pode crescer o array nem contar duas vezes no progresso.
  select coalesce(array_agg(distinct d order by d), '{}')
    into v_dias
    from (
      select unnest(completed_days) as d from program_enrollments
       where program_id = p_program_id and user_profile_id = v_perfil
      union all select p_dia
    ) t;

  select min(g) into v_proximo
    from generate_series(1, v_duracao) g
   where g <> all (v_dias);

  update program_enrollments set
    completed_days = v_dias,
    current_day    = coalesce(v_proximo, v_duracao),
    status         = case when v_proximo is null then 'COMPLETED' else 'ACTIVE' end
  where program_id = p_program_id and user_profile_id = v_perfil;

  if not found then
    raise exception 'Você não está neste programa.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function concluir_dia(uuid, smallint) from public, anon;
grant execute on function concluir_dia(uuid, smallint) to authenticated, service_role;

/** Desfaz um dia. Errar o toque não pode custar o progresso inteiro. */
create or replace function desfazer_dia(p_program_id uuid, p_dia smallint) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil  uuid := auth_profile_id();
  v_duracao smallint;
  v_dias    smallint[];
  v_proximo smallint;
begin
  if v_perfil is null then
    raise exception 'Sessão não identificada.' using errcode = '28000';
  end if;

  select duration_days into v_duracao from programs where id = p_program_id;
  if v_duracao is null then
    raise exception 'Programa indisponível.' using errcode = '42501';
  end if;

  select coalesce(array_agg(d order by d), '{}') into v_dias
    from (
      select unnest(completed_days) as d from program_enrollments
       where program_id = p_program_id and user_profile_id = v_perfil
    ) t
   where d <> p_dia;

  select min(g) into v_proximo
    from generate_series(1, v_duracao) g
   where g <> all (v_dias);

  update program_enrollments set
    completed_days = v_dias,
    current_day    = coalesce(v_proximo, v_duracao),
    -- Desfazer um dia reabre o programa: concluído com dia faltando seria o
    -- tipo de estado que a tela mostra errado e ninguém explica.
    status         = case when v_proximo is null then 'COMPLETED' else 'ACTIVE' end
  where program_id = p_program_id and user_profile_id = v_perfil;
end;
$$;

revoke all on function desfazer_dia(uuid, smallint) from public, anon;
grant execute on function desfazer_dia(uuid, smallint) to authenticated, service_role;

/** Sai do programa, guardando o que já foi feito. */
create or replace function abandonar_programa(p_program_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update program_enrollments set status = 'ABANDONED'
   where program_id = p_program_id and user_profile_id = auth_profile_id();
end;
$$;

revoke all on function abandonar_programa(uuid) from public, anon;
grant execute on function abandonar_programa(uuid) to authenticated, service_role;

-- ── A política perde a escrita ───────────────────────────────────────────────
/*
 * Leitura continua sendo a própria linha. A escrita sai do alcance do cliente
 * e passa pelas funções acima, que conferem visibilidade e mantêm
 * `current_day` e `completed_days` coerentes entre si.
 */
drop policy if exists program_enrollments_self on program_enrollments;
create policy program_enrollments_self on program_enrollments
  for select using (user_profile_id = auth_profile_id());

revoke insert, update, delete on program_enrollments from authenticated, anon;

-- ── A porta de autoria, para a conta de plataforma ───────────────────────────
/**
 * Cria ou atualiza um programa. Só a conta de plataforma.
 *
 * Mesmo desenho de `save_synse_content` (0039): a checagem é no banco, porque
 * sessão é cookie, e a trilha em `platform_access_log` é escrita aqui dentro,
 * não pela aplicação — registro que depende de alguém lembrar de chamar é
 * registro que um dia falta.
 */
create or replace function save_program(
  p_id            uuid,
  p_code          text,
  p_title         text,
  p_description   text,
  p_duration_days smallint,
  p_cover_url     text,
  p_visibility    content_visibility
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_super_admin() then
    raise exception 'Apenas a conta de plataforma publica programas.' using errcode = '42501';
  end if;

  if p_visibility not in ('FREE', 'SYNSE_PLUS') then
    raise exception 'Programa é da plataforma: só FREE ou SYNSE_PLUS.' using errcode = '22023';
  end if;

  if p_duration_days < 1 or p_duration_days > 365 then
    raise exception 'Duração fora da faixa (1 a 365 dias).' using errcode = '22023';
  end if;

  if p_id is null then
    insert into programs (code, title, description, duration_days, cover_url, visibility)
    values (p_code, p_title, p_description, p_duration_days, p_cover_url, p_visibility)
    returning id into v_id;
  else
    update programs set
      code = p_code, title = p_title, description = p_description,
      duration_days = p_duration_days, cover_url = p_cover_url, visibility = p_visibility
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Programa não encontrado.' using errcode = 'no_data_found';
    end if;
  end if;

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (auth_profile_id(), null, 'PROGRAMA');

  return v_id;
end;
$$;

/*
 * Concedida a `authenticated`, como `save_synse_content` (0039), e não só ao
 * `service_role`: quem chama é a tela do `/synse-admin`, pelo cliente da
 * sessão. Quem barra é o `is_super_admin()` lá dentro — no banco, porque
 * sessão é cookie e cookie se edita.
 */
revoke all on function save_program(uuid, text, text, text, smallint, text, content_visibility)
  from public, anon;
grant execute on function save_program(uuid, text, text, text, smallint, text, content_visibility)
  to authenticated, service_role;

/**
 * Grava um dia do programa.
 *
 * `on conflict (program_id, day_number)` porque reescrever o dia 7 é a
 * operação normal de quem está montando: a unicidade da 0003 é a chave, e
 * duplicar o dia seria o defeito.
 */
create or replace function save_program_step(
  p_program_id uuid,
  p_day_number smallint,
  p_title      text,
  p_tasks      jsonb
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id      uuid;
  v_duracao smallint;
begin
  if not is_super_admin() then
    raise exception 'Apenas a conta de plataforma publica programas.' using errcode = '42501';
  end if;

  select duration_days into v_duracao from programs where id = p_program_id;
  if v_duracao is null then
    raise exception 'Programa não encontrado.' using errcode = 'no_data_found';
  end if;

  -- Dia fora da duração seria passo que nenhuma tela alcança: o aluno percorre
  -- de 1 até `duration_days`, e o resto ficaria gravado e invisível.
  if p_day_number < 1 or p_day_number > v_duracao then
    raise exception 'O dia % está fora da duração do programa (%).', p_day_number, v_duracao
      using errcode = '22023';
  end if;

  insert into program_steps (program_id, day_number, title, tasks)
  values (p_program_id, p_day_number, p_title, coalesce(p_tasks, '[]'::jsonb))
  on conflict (program_id, day_number) do update
    set title = excluded.title, tasks = excluded.tasks
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function save_program_step(uuid, smallint, text, jsonb) from public, anon;
grant execute on function save_program_step(uuid, smallint, text, jsonb)
  to authenticated, service_role;

/** Apaga o programa e, por cascata da 0003, os passos e as matrículas. */
create or replace function delete_program(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Apenas a conta de plataforma publica programas.' using errcode = '42501';
  end if;

  delete from programs where id = p_id;

  insert into platform_access_log (user_profile_id, organization_id, context)
  values (auth_profile_id(), null, 'PROGRAMA');
end;
$$;

revoke all on function delete_program(uuid) from public, anon;
grant execute on function delete_program(uuid) to authenticated, service_role;

/**
 * A conta de plataforma enxerga o próprio rascunho.
 *
 * Mesma falta que a 0039 corrigiu no acervo: as políticas da 0038 falam de
 * `FREE` e de assinatura, e a conta de plataforma não cai em nenhum dos dois
 * ramos — ela publicaria programas que não consegue reler.
 */
drop policy if exists programs_read on programs;
create policy programs_read on programs
  for select using (
    visibility = 'FREE'
    or (visibility = 'SYNSE_PLUS' and tem_synse_plus())
    or is_super_admin()
  );

drop policy if exists program_steps_read on program_steps;
create policy program_steps_read on program_steps
  for select using (
    exists (
      select 1 from programs p
      where p.id = program_steps.program_id
        and (
          p.visibility = 'FREE'
          or (p.visibility = 'SYNSE_PLUS' and tem_synse_plus())
          or is_super_admin()
        )
    )
  );

-- ── A vitrine, também aqui ───────────────────────────────────────────────────
/**
 * Os programas trancados atrás do Synse+, para quem não assina.
 *
 * Mesma razão da 0041 no acervo: a RLS esconde a linha, e prateleira vazia
 * convence o aluno do plano grátis de que não existe programa nenhum. Sem
 * isto, a tela de programas abriria em branco para ele.
 *
 * A projeção é estreita e a escolha é mais fácil que no acervo: **o conteúdo
 * de um programa são os dias**, e `program_steps` não entra aqui de jeito
 * nenhum. Nome, duração e descrição são o anúncio.
 *
 * `not tem_synse_plus() and not is_super_admin()` pelo mesmo motivo da 0042:
 * quem já lê não precisa de anúncio, e a conta de plataforma lê tudo.
 */
create or replace function programas_trancados()
returns table (id uuid, titulo text, descricao text, dias smallint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.title, p.description, p.duration_days
  from programs p
  where p.visibility = 'SYNSE_PLUS'
    and not tem_synse_plus()
    and not is_super_admin()
  order by p.duration_days
$$;

revoke all on function programas_trancados() from public;
grant execute on function programas_trancados() to anon, authenticated, service_role;

insert into schema_migrations (version) values ('0043_programas_guiados.sql') on conflict do nothing;
