-- =============================================================================
-- SynseHub · 0070 — Meu plano
--
-- O produto sabe o que a pessoa treina e não sabe nada do resto do dia dela. E
-- o resto do dia é onde o treino se perde: quem trabalha até as 19h e janta às
-- 22h não falta à academia por falta de vontade.
--
-- "Meu plano" é a rotina inteira num lugar — acordar, trabalhar, comer, beber
-- água, treinar, dormir —, com a meta escrita por cima para dizer para quê.
--
-- ── A academia não vê isto. Nunca. ──────────────────────────────────────────
--
-- É a regra mais importante desta migration, e ela não é cautela genérica:
-- **horário de trabalho não é dado de academia**. Saber que alguém entra às 6h
-- e sai às 19h, janta às 22h e dorme às 23h30 é um retrato da vida privada que
-- nenhuma recepção precisa para cobrar mensalidade ou montar treino.
--
-- Por isso a política é `user_profile_id = auth_profile_id()` e ponto — sem
-- ramo para `is_org_staff`, sem exceção para o professor, sem leitura pelo
-- dono. Se um dia alguém quiser mostrar a rotina ao professor, isso é um
-- consentimento novo, explícito, como o do peso (0032) e o do ranking (0037).
--
-- ── A chave é a pessoa ──────────────────────────────────────────────────────
--
-- `user_profile_id`, como corrida, pesagem e esquadrão. A rotina é da vida, não
-- da matrícula: quem troca de academia leva o plano junto, e quem não tem
-- academia nenhuma tem rotina igual.
--
-- ── Hora local, e não instante ──────────────────────────────────────────────
--
-- `time` e não `timestamptz`: "10h" é dez horas no relógio da pessoa, todo dia,
-- e guardar isso como instante exigiria uma linha por dia e quebraria no
-- horário de verão. O fuso entra na hora de comparar, não na de guardar.
--
-- ── O lembrete é um pedido, não uma promessa ────────────────────────────────
--
-- `remind` diz que a pessoa quer ser avisada daquele bloco. Quem **entrega** o
-- aviso é outra camada, e pode não existir ainda: sem agendador, o plano
-- continua inteiro e a tela continua mostrando o que é agora. A tabela não
-- promete entrega; ela guarda a intenção.
-- =============================================================================

create table routine_plans (
  user_profile_id uuid primary key references user_profiles(id) on delete cascade,
  /*
   * A meta, em uma frase. Curta de propósito: "emagrecer 6 kg até março" cabe,
   * um parágrafo de intenções não — e o que não cabe numa frase não vira
   * lembrete de nada.
   */
  goal            text check (goal is null or length(trim(goal)) between 3 and 120),
  wake_at         time,
  sleep_at        time,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table routine_blocks (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  /*
   * O vocabulário da rotina. Sem `REMEDIO` de propósito: medicação é dado de
   * saúde com regra própria (consentimento, retenção, quem pode ver), e
   * convidar para digitá-la num campo que nasceu para "almoço" seria recolher
   * dado sensível pela porta dos fundos.
   */
  kind            text not null check (kind in
                    ('AGUA', 'REFEICAO', 'TREINO', 'TRABALHO', 'SONO', 'PAUSA', 'ESTUDO')),
  title           text check (title is null or length(trim(title)) between 2 and 40),
  at_time         time not null,
  /*
   * Dias da semana em ISO — 1 é segunda, 7 é domingo, como `isodow` e como o
   * `date_trunc('week')` que o resto do projeto usa. Zero-indexado por domingo
   * seria a terceira convenção de semana no mesmo banco.
   */
  days            smallint[] not null default '{1,2,3,4,5,6,7}',
  remind          boolean not null default true,
  created_at      timestamptz not null default now(),

  /*
   * `coalesce(array_length(...), 0)` e não `array_length(...)` direto.
   *
   * `array_length('{}', 1)` é **nulo**, não zero — e um `check` que avalia
   * para nulo **passa**. O arranjo vazio entrava: um bloco sem dia nenhum,
   * que nunca dispara e fica no plano parecendo configurado. O teste pegou.
   */
  constraint routine_blocks_dias_validos check (
    coalesce(array_length(days, 1), 0) between 1 and 7
    and days <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

create index routine_blocks_pessoa_idx on routine_blocks (user_profile_id, at_time);
/*
 * O índice do agendador: ele pergunta "quem tem bloco com lembrete nesta hora",
 * sobre todas as pessoas. Parcial porque bloco sem lembrete nunca é varrido.
 */
create index routine_blocks_lembrete_idx on routine_blocks (at_time) where remind;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table routine_plans  enable row level security;
alter table routine_blocks enable row level security;

/*
 * Um ramo só, e é a pessoa. Ver o cabeçalho: horário de trabalho não é dado de
 * academia, e um `or is_org_staff(...)` aqui seria a linha que transforma a
 * rotina da vida de alguém em relatório de retenção.
 */
create policy routine_plans_self on routine_plans
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

create policy routine_blocks_self on routine_blocks
  for all using (user_profile_id = auth_profile_id())
  with check (user_profile_id = auth_profile_id());

/*
 * `update` fica, ao contrário dos favoritos: editar um bloco é mudar a hora,
 * e a tela faz isso o tempo todo. O que não existe é escrita em nome de
 * outra pessoa, e disso cuida o `with check`.
 */

-- ── Gravar ───────────────────────────────────────────────────────────────────
/**
 * A meta e as âncoras do dia.
 *
 * Idempotente: a tela pode reenviar, e responder de novo é corrigir — mesma
 * regra de `set_student_intake` (0063).
 */
create or replace function set_routine_plan(
  p_goal     text default null,
  p_wake_at  time default null,
  p_sleep_at time default null
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu uuid := auth_profile_id();
begin
  if v_eu is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  insert into routine_plans (user_profile_id, goal, wake_at, sleep_at)
  values (v_eu, nullif(trim(coalesce(p_goal, '')), ''), p_wake_at, p_sleep_at)
  on conflict (user_profile_id) do update
    set goal = excluded.goal,
        wake_at = excluded.wake_at,
        sleep_at = excluded.sleep_at,
        updated_at = now();
end;
$$;

revoke all on function set_routine_plan(text, time, time) from public, anon;
grant execute on function set_routine_plan(text, time, time) to authenticated, service_role;

/**
 * Cria ou edita um bloco da rotina. Devolve o id.
 *
 * `p_id` nulo cria; preenchido edita — e só alcança bloco de quem está
 * chamando, porque o `where` leva o perfil junto. Sem isso, um id vazado
 * editaria a rotina alheia, e a função é `security definer`.
 */
create or replace function upsert_routine_block(
  p_id      uuid default null,
  p_kind    text default 'AGUA',
  p_at_time time default '08:00',
  p_title   text default null,
  p_days    smallint[] default '{1,2,3,4,5,6,7}',
  p_remind  boolean default true
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu uuid := auth_profile_id();
  v_id uuid;
begin
  if v_eu is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  /*
   * O teto de blocos. Trinta cobre uma rotina detalhada — seis refeições, oito
   * copos d'água, trabalho, treino, sono — e impede que a tabela vire lista de
   * tarefas sem fim, que é outro produto.
   */
  if p_id is null and (
    select count(*) from routine_blocks where user_profile_id = v_eu
  ) >= 30 then
    raise exception 'Seu plano já tem 30 blocos. Apague um para criar outro.'
      using errcode = '23514';
  end if;

  if p_id is null then
    insert into routine_blocks (user_profile_id, kind, at_time, title, days, remind)
    values (v_eu, p_kind, p_at_time, nullif(trim(coalesce(p_title, '')), ''), p_days, p_remind)
    returning id into v_id;
    return v_id;
  end if;

  update routine_blocks set
    kind = p_kind,
    at_time = p_at_time,
    title = nullif(trim(coalesce(p_title, '')), ''),
    days = p_days,
    remind = p_remind
  where id = p_id and user_profile_id = v_eu
  returning id into v_id;

  if v_id is null then
    raise exception 'Bloco não encontrado, ou não é seu.' using errcode = '42501';
  end if;
  return v_id;
end;
$$;

revoke all on function upsert_routine_block(uuid, text, time, text, smallint[], boolean)
  from public, anon;
grant execute on function upsert_routine_block(uuid, text, time, text, smallint[], boolean)
  to authenticated, service_role;

create or replace function delete_routine_block(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_afetadas integer;
begin
  delete from routine_blocks where id = p_id and user_profile_id = auth_profile_id();
  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Bloco não encontrado, ou não é seu.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function delete_routine_block(uuid) from public, anon;
grant execute on function delete_routine_block(uuid) to authenticated, service_role;

-- ── O que o agendador precisa saber ──────────────────────────────────────────
/**
 * Quem tem lembrete vencendo nesta janela, com o fuso de cada um.
 *
 * ── Só `service_role` ───────────────────────────────────────────────────────
 *
 * Esta é a única leitura do projeto que atravessa pessoas, e por isso ela não
 * é alcançável por quem está autenticado — nem para ler a própria rotina, que
 * tem `list` própria. Quem chama é a rotina do servidor, com a chave de
 * serviço, e nenhum caminho da API autenticada leva aqui.
 *
 * ── A janela, e não o instante ──────────────────────────────────────────────
 *
 * **Lido depois da 0071? Esta parte não vale mais.** A 0071 substituiu esta
 * função: ela reivindica em vez de responder, e chamar duas vezes na mesma
 * janela não manda duas vezes. O texto abaixo fica como registro do que se
 * pensava aqui, e do que o agendador real cobrou.
 *
 * O agendador não acorda no segundo exato. Ele pergunta "o que venceu nos
 * últimos N minutos" e manda; chamar duas vezes na mesma janela manda duas
 * vezes, e é por isso que quem chama guarda o que já mandou. A função não
 * tenta ser idempotente — ela responde uma pergunta sobre horário.
 *
 * O dia da semana é o **de cada pessoa**, no fuso dela: às 23h50 de segunda em
 * Brasília já é terça em UTC, e um bloco de terça dispararia um dia antes.
 */
create or replace function routine_reminders_due(p_minutos integer default 15)
returns table (
  block_id        uuid,
  user_profile_id uuid,
  kind            text,
  title           text,
  at_time         time,
  fuso            text
)
language sql stable security definer set search_path = public as $$
  with pessoas as (
    select
      b.id, b.user_profile_id, b.kind, b.title, b.at_time,
      coalesce(
        (select org_timezone(s.organization_id) from students s
          where s.user_profile_id = b.user_profile_id
          order by s.created_at desc limit 1),
        'America/Sao_Paulo'
      ) as tz,
      b.days
    from routine_blocks b
    where b.remind
  )
  select p.id, p.user_profile_id, p.kind, p.title, p.at_time, p.tz
  from pessoas p
  cross join lateral (select (now() at time zone p.tz) as agora) l
  where extract(isodow from l.agora)::smallint = any(p.days)
    -- Venceu entre agora e N minutos atrás, no relógio da pessoa.
    and l.agora::time >= p.at_time
    and l.agora::time < p.at_time + make_interval(mins => greatest(coalesce(p_minutos, 15), 1))
$$;

/*
 * Nem `authenticated`, nem `anon`. A chave de serviço é a única porta.
 */
revoke all on function routine_reminders_due(integer) from public, anon, authenticated;
grant execute on function routine_reminders_due(integer) to service_role;

insert into schema_migrations (version) values ('0070_meu_plano.sql') on conflict do nothing;
