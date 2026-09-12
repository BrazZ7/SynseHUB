-- =============================================================================
-- SynseHub · migrations pendentes, em um arquivo só
--
-- GERADO. A fonte da verdade é src/db/migrations — este arquivo existe apenas
-- para quem aplica pelo SQL Editor do Supabase, onde quatro colagens são
-- quatro chances de errar a ordem ou pular uma.
--
-- Ordem obrigatória, e é a de baixo: a 0015 substitui uma trava que a 0014
-- cria, e recusa se a coluna dela não existir ainda.
--
-- Aplicar duas vezes é inofensivo: tudo aqui é `create or replace`,
-- `if not exists`, `on conflict do nothing` ou `drop ... if exists`.
--
-- Nenhum comando exige rodar fora de transação, então o editor pode executar
-- o arquivo inteiro de uma vez: ou entra tudo, ou não entra nada.
--
--   0012_notification_events.sql   gatilhos que enchem o sino
--   0013_synse_solo.sql            entrar sem academia vinculada
--   0014_baseline_experience.sql   plano da conta, desafios, medalhas
--   0015_professional_unlock.sql   perfil profissional como assinatura
--
-- Para conferir depois: synse.com.br/api/health?deep=1 → pendingMigrations
-- precisa voltar como lista vazia.
-- =============================================================================



-- ############################################################################
-- ##  0012_notification_events.sql
-- ############################################################################

-- =============================================================================
-- SynseHub · 0012 — O sino passa a tocar
--
-- A tabela `notifications` existe desde a 0003 e nunca recebeu uma linha: nada
-- no sistema escrevia nela. O sino do painel era desenho.
--
-- Quem escreve é o banco, por gatilho, e não a aplicação. A razão é a mesma
-- que vale para o resto do projeto: o aviso não pode depender de quem chamou.
-- Um aluno confirmado pela tela, pelo script de importação ou por um SQL de
-- suporte tem de gerar o mesmo aviso. Notificação emitida na camada de
-- aplicação só existe no caminho que alguém lembrou de instrumentar.
--
-- `security definer` em todos os gatilhos: a política `notifications_self`
-- deixa cada pessoa escrever apenas para si mesma, e é exatamente disso que
-- um aviso precisa fugir — quem entra na academia gera aviso para a recepção,
-- não para si.
-- =============================================================================

-- ── Destinatários ────────────────────────────────────────────────────────────
/*
 * Equipe que deve saber de movimentação de aluno.
 *
 * Professor e nutricionista ficam de fora: recebem aviso do que é deles
 * (treino, avaliação), não da fila de matrícula. Sino que avisa tudo para todo
 * mundo é sino que ninguém abre.
 */
create or replace function org_admin_profile_ids(p_org_id uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_profile_id
  from organization_members
  where organization_id = p_org_id
    and status = 'ACTIVE'
    and role in ('OWNER', 'MANAGER', 'RECEPTIONIST')
$$;

revoke all on function org_admin_profile_ids(uuid) from public, anon;
grant execute on function org_admin_profile_ids(uuid) to authenticated, service_role;

create or replace function notify_profiles(
  p_profile_ids uuid[],
  p_org_id      uuid,
  p_category    text,
  p_title       text,
  p_body        text,
  p_action_url  text
) returns void
language sql volatile security definer set search_path = public as $$
  insert into notifications (organization_id, user_profile_id, category, title, body, action_url)
  select p_org_id, id, p_category, p_title, p_body, p_action_url
  from unnest(p_profile_ids) as id
  where id is not null
$$;

revoke all on function notify_profiles(uuid[], uuid, text, text, text, text) from public, anon, authenticated;

-- ── Dinheiro em texto ────────────────────────────────────────────────────────
/*
 * `to_char` com G e D depende de lc_numeric do servidor, que num Postgres
 * gerenciado é 'C' — sairia "1,234.56" no aviso de uma academia brasileira.
 * Vírgula fixa, sem depender de localidade.
 */
create or replace function brl(p_amount numeric) returns text
language sql immutable as $$
  select 'R$ ' || replace(to_char(p_amount, 'FM9999990.00'), '.', ',')
$$;

-- ── Aluno entrou pelo código e aguarda confirmação ───────────────────────────
create or replace function notify_student_enrolled() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  select name into v_name from user_profiles where id = new.user_profile_id;

  if new.status = 'PENDING' then
    perform notify_profiles(
      array(select org_admin_profile_ids(new.organization_id)),
      new.organization_id,
      'GYM',
      coalesce(v_name, 'Alguém') || ' entrou pelo código de convite',
      'A matrícula está aguardando a confirmação da academia.',
      '/students?status=PENDING'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists students_notify_enrolled on students;
create trigger students_notify_enrolled
  after insert on students
  for each row execute function notify_student_enrolled();

-- ── A academia confirmou (ou encerrou) a matrícula ───────────────────────────
create or replace function notify_student_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select name into v_org_name from organizations where id = new.organization_id;

  if new.status = 'ACTIVE' and old.status = 'PENDING' then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula confirmada',
      coalesce(v_org_name, 'A academia') || ' confirmou sua entrada. Bons treinos.',
      '/app'
    );
  elsif new.status = 'CANCELLED' then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula encerrada',
      'Sua matrícula em ' || coalesce(v_org_name, 'na academia') || ' foi encerrada.',
      '/app'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists students_notify_status on students;
create trigger students_notify_status
  after update of status on students
  for each row execute function notify_student_status_change();

-- ── Treino atribuído ─────────────────────────────────────────────────────────
create or replace function notify_workout_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  v_plan_name  text;
begin
  select user_profile_id into v_profile_id from students where id = new.student_id;
  select name into v_plan_name from workout_plans where id = new.workout_plan_id;

  perform notify_profiles(
    array[v_profile_id],
    new.organization_id,
    'WORKOUT',
    'Novo treino disponível',
    coalesce(v_plan_name, 'Um treino') || ' foi atribuído a você.',
    '/app/workout'
  );

  return new;
end;
$$;

drop trigger if exists workout_assignments_notify on workout_assignments;
create trigger workout_assignments_notify
  after insert on workout_assignments
  for each row execute function notify_workout_assigned();

-- ── Cobranças ────────────────────────────────────────────────────────────────
/*
 * Aviso de cobrança criada vai para o aluno; aviso de pagamento confirmado vai
 * para os dois lados. A academia precisa do segundo porque é dinheiro que
 * entrou sem ninguém dar baixa na mão — é a única forma de a recepção saber.
 */
create or replace function notify_charge_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
begin
  if new.status <> 'PENDING' then
    return new;
  end if;

  select user_profile_id into v_profile_id from students where id = new.student_id;

  perform notify_profiles(
    array[v_profile_id],
    new.organization_id,
    'PAYMENT',
    'Nova cobrança de ' || brl(new.amount),
    new.description || ' · vence em ' || to_char(new.due_date, 'DD/MM/YYYY'),
    '/app/finance'
  );

  return new;
end;
$$;

drop trigger if exists charges_notify_created on charges;
create trigger charges_notify_created
  after insert on charges
  for each row execute function notify_charge_created();

create or replace function notify_charge_paid() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
  v_name       text;
begin
  if new.status <> 'PAID' or old.status = 'PAID' then
    return new;
  end if;

  select s.user_profile_id, p.name into v_profile_id, v_name
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where s.id = new.student_id;

  perform notify_profiles(
    array[v_profile_id],
    new.organization_id,
    'PAYMENT',
    'Pagamento confirmado',
    new.description || ' · ' || brl(new.amount),
    '/app/finance'
  );

  perform notify_profiles(
    array(select org_admin_profile_ids(new.organization_id)),
    new.organization_id,
    'PAYMENT',
    'Pagamento recebido de ' || coalesce(v_name, 'aluno'),
    new.description || ' · ' || brl(new.amount),
    '/finance'
  );

  return new;
end;
$$;

drop trigger if exists charges_notify_paid on charges;
create trigger charges_notify_paid
  after update of status on charges
  for each row execute function notify_charge_paid();

-- ── Leitura ──────────────────────────────────────────────────────────────────
/*
 * A política `notifications_self` já permite o UPDATE, mas passar pelo cliente
 * exigiria enviar a lista de ids. Marcar tudo de uma vez é o gesto que a tela
 * oferece, e uma linha só de SQL faz melhor.
 */
create or replace function mark_notifications_read() returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_count      integer;
begin
  if v_profile_id is null then
    return 0;
  end if;

  update notifications
  set read_at = now()
  where user_profile_id = v_profile_id and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function mark_notifications_read() from public, anon;
grant execute on function mark_notifications_read() to authenticated;

-- Índice do contador do sino: quantos não lidos tem esta pessoa.
create index if not exists notifications_unread_idx
  on notifications (user_profile_id) where read_at is null;


-- ############################################################################
-- ##  0013_synse_solo.sql
-- ############################################################################

-- =============================================================================
-- SynseHub · 0013 — Entrar sem academia
--
-- A 0011 registrou a decisão oposta: "não existe aluno sem academia no modelo".
-- A razão era boa — aluno solto cairia num app vazio. O que mudou não foi a
-- razão, foi o app: com treino base, plano alimentar base e desafio mensal
-- (0014), quem entra sozinho tem o que fazer no primeiro minuto.
--
-- E há o caso que o modelo antigo simplesmente não atendia: quem treina numa
-- academia que não usa o Synse. Essa pessoa não tem código para digitar, e
-- exigir um a expulsava do produto.
--
-- COMO, sem afrouxar nada:
--
-- `students.organization_id` continua obrigatório. Em vez de torná-lo nulo —
-- o que obrigaria a revisar toda consulta, toda policy e todo `organizationId`
-- da aplicação, cada um deles uma chance nova de vazar dado entre academias —
-- existe uma organização reservada, "Synse", onde essas matrículas moram.
--
-- Ela não tem equipe. É isso que dá o isolamento: toda a RLS de leitura de
-- aluno passa por `is_org_staff`, e sem nenhum membro ninguém é staff dela.
-- Um solo não enxerga outro solo, e nenhuma academia enxerga qualquer um dos
-- dois.
-- =============================================================================

-- ── A organização reservada ──────────────────────────────────────────────────
/*
 * `invite_code` nulo de propósito: `join_organization_as_student` casa o código
 * digitado com a coluna, e nada é igual a nulo em SQL. Não existe combinação de
 * seis caracteres que faça alguém cair aqui por engano.
 */
insert into organizations (id, name, slug, type, status, invite_code, onboarding_completed)
values (
  '00000000-0000-0000-0000-000000000001',
  'Synse',
  'synse',
  'COMPANY',
  'ACTIVE',
  null,
  true
)
on conflict (id) do nothing;

comment on table organizations is
  'Academias, estúdios e clínicas. A linha 00000000-0000-0000-0000-000000000001 é a organização reservada do Synse, onde ficam as matrículas de quem treina sem academia vinculada. Não tem equipe, e é isso que a isola.';

-- ── Entrada sem código ───────────────────────────────────────────────────────
create or replace function join_synse_as_solo_student(p_student_name text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solo_org  constant uuid := '00000000-0000-0000-0000-000000000001';
  v_auth_id   uuid := auth.uid();
  v_email     text;
  v_profile_id uuid;
  v_student_id uuid;
begin
  if v_auth_id is null then
    raise exception 'É preciso estar autenticado para começar.' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_auth_id;

  insert into user_profiles (auth_user_id, name, email)
  values (v_auth_id, p_student_name, v_email)
  on conflict (auth_user_id) do update set name = excluded.name
  returning id into v_profile_id;

  /*
   * Nasce ATIVA, ao contrário da entrada por código.
   *
   * Lá o PENDING existe porque há uma academia para confirmar. Aqui não há
   * quem confirme: deixar pendente seria uma espera que nunca termina.
   */
  insert into students (organization_id, user_profile_id, status)
  values (v_solo_org, v_profile_id, 'ACTIVE')
  on conflict (organization_id, user_profile_id) do nothing;

  select id into v_student_id
  from students
  where organization_id = v_solo_org and user_profile_id = v_profile_id;

  insert into notifications (organization_id, user_profile_id, category, title, body, action_url)
  values (
    v_solo_org,
    v_profile_id,
    'SYSTEM',
    'Bem-vindo ao Synse',
    'Seu treino base e seu plano alimentar já estão prontos. Escolha um desafio para o mês.',
    '/app'
  );

  return v_student_id;
end;
$$;

comment on function join_synse_as_solo_student is
  'Cria a matrícula de quem entra sem academia, na organização reservada do Synse.';

revoke all on function join_synse_as_solo_student from public, anon;
grant execute on function join_synse_as_solo_student to authenticated;

-- ── A academia reservada não aparece como opção ──────────────────────────────
/*
 * `organizations_read` deixa o aluno ler a própria organização — e a dele é a
 * reservada. Ler o nome "Synse" é inofensivo e necessário (o app mostra onde a
 * pessoa treina). O que não pode é ela virar destino de convite ou aparecer em
 * lista de academias; o código nulo já resolve o primeiro, e a listagem do
 * super admin filtra pelo id no aplicativo.
 */


-- ############################################################################
-- ##  0014_baseline_experience.sql
-- ############################################################################

-- =============================================================================
-- SynseHub · 0014 — O que todo mundo recebe no primeiro minuto
--
-- Até aqui, quem entrava via tela vazia até a academia atribuir alguma coisa —
-- e quem entrou sem academia (0013) não tinha nem essa espera para esperar.
--
-- Três coisas passam a existir para todo mundo, de graça:
--
--   treino base          conteúdo fixo, no código (src/lib/baseline)
--   plano alimentar base conteúdo fixo, no código, sem prescrição individual
--   desafio do mês       este arquivo
--
-- Treino e alimentação base são conteúdo idêntico para todos: uma linha por
-- pessoa no banco seria multiplicar milhares de cópias do mesmo texto, e ainda
-- criaria a dúvida de qual cópia é a boa quando o texto mudar. Desafio é
-- diferente — tem escolha, progresso e medalha, e isso é dado de cada um.
--
-- O plano gratuito dá direito a UM desafio por ciclo. Não é limitação
-- artificial: um desafio por mês é o que uma pessoa consegue perseguir. O que
-- o Pro abre é a escolha entre mais desafios e o acúmulo de vários no mesmo
-- mês, além dos desafios marcados como PRO.
-- =============================================================================

-- ── Plano da pessoa ──────────────────────────────────────────────────────────
alter table user_profiles
  add column if not exists tier text not null default 'FREE'
    check (tier in ('FREE', 'PRO'));

/*
 * `user_profiles_update_self` deixa cada pessoa editar a própria ficha — nome,
 * telefone, foto. Sem a trava abaixo, deixaria também editar `tier`: bastaria
 * um PATCH em user_profiles para virar Pro sem pagar.
 *
 * A trava é por sinalizador de transação, não por papel. Papel se acerta com
 * grant, e grant de coluna não vale nada quando o papel já tem UPDATE na
 * tabela inteira — o privilégio de tabela cobre toda coluna, inclusive as
 * criadas depois. O sinalizador só é ligado por `set_user_tier`, que é a única
 * porta, e não há como ligá-lo pelo PostgREST.
 */
create or replace function guard_user_tier() returns trigger
language plpgsql as $$
begin
  if new.tier is distinct from old.tier
     and coalesce(current_setting('synse.allow_tier_change', true), '') <> '1'
  then
    raise exception 'O plano da conta não é editável pelo cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_guard_tier on user_profiles;
create trigger user_profiles_guard_tier
  before update on user_profiles
  for each row execute function guard_user_tier();

create or replace function set_user_tier(p_profile_id uuid, p_tier text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_tier not in ('FREE', 'PRO') then
    raise exception 'Plano inválido: %', p_tier using errcode = '22023';
  end if;

  perform set_config('synse.allow_tier_change', '1', true);
  update user_profiles set tier = p_tier where id = p_profile_id;
  perform set_config('synse.allow_tier_change', '', true);
end;
$$;

comment on function set_user_tier is
  'Única porta para mudar o plano da conta. Quem chama é a confirmação de pagamento, nunca a tela.';

revoke all on function set_user_tier(uuid, text) from public, anon, authenticated;
grant execute on function set_user_tier(uuid, text) to service_role;

-- ── Catálogo de desafios base ────────────────────────────────────────────────
create table if not exists baseline_challenges (
  code          text primary key,
  title         text not null,
  description   text not null,
  /** Como o progresso é contado. CHECKINS é o único que conta sozinho. */
  metric        text not null check (metric in
                  ('DISTANCE_KM', 'SESSIONS', 'LOAD_PERCENT', 'CHECKINS', 'MINUTES')),
  unit          text not null,
  target_value  numeric(10,2) not null check (target_value > 0),
  min_tier      text not null default 'FREE' check (min_tier in ('FREE', 'PRO')),
  position      smallint not null default 0,
  active        boolean not null default true
);

insert into baseline_challenges (code, title, description, metric, unit, target_value, min_tier, position)
values
  ('CORRIDA_20KM', 'Meta de corrida',
   'Somar 20 km de corrida ou caminhada no mês. Vale esteira, rua e parque.',
   'DISTANCE_KM', 'km', 20, 'FREE', 1),
  ('CARDIO_POS_TREINO', 'Cardio pós-treino',
   'Fazer 12 sessões de 15 minutos de cardio depois do treino de força.',
   'SESSIONS', 'sessões', 12, 'FREE', 2),
  ('CARGA_PROGRESSIVA', 'Aumento de carga',
   'Subir 10% na carga total dos seus principais exercícios até o fim do mês.',
   'LOAD_PERCENT', '%', 10, 'FREE', 3),
  ('CONSTANCIA_12', 'Constância',
   'Treinar 12 vezes no mês. Conta sozinho, pelos seus check-ins.',
   'CHECKINS', 'treinos', 12, 'FREE', 4),
  ('MOBILIDADE_300', 'Mobilidade diária',
   '300 minutos de mobilidade e alongamento no mês, 10 por dia.',
   'MINUTES', 'min', 300, 'PRO', 5),
  ('CONSTANCIA_20', 'Constância Pro',
   'Treinar 20 vezes no mês. Para quem já tem o hábito e quer subir a régua.',
   'CHECKINS', 'treinos', 20, 'PRO', 6)
on conflict (code) do nothing;

-- ── Escolha e progresso ──────────────────────────────────────────────────────
/** Primeiro dia do mês corrente. Todo desafio vive dentro de um ciclo. */
create or replace function current_cycle() returns date
language sql stable as $$
  select date_trunc('month', current_date)::date
$$;

create table if not exists challenge_entries (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  challenge_code  text not null references baseline_challenges(code) on delete restrict,
  cycle           date not null,
  /** Congelado na escolha: mudar a meta do catálogo não reescreve o passado. */
  target_value    numeric(10,2) not null,
  progress_value  numeric(10,2) not null default 0 check (progress_value >= 0),
  chosen_at       timestamptz not null default now(),
  closed_at       timestamptz,
  unique (user_profile_id, cycle, challenge_code)
);
create index if not exists challenge_entries_person_idx
  on challenge_entries (user_profile_id, cycle desc);

create table if not exists challenge_medals (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  challenge_code  text not null references baseline_challenges(code) on delete restrict,
  cycle           date not null,
  level           text not null check (level in ('PARTICIPACAO', 'BRONZE', 'PRATA', 'OURO')),
  progress_value  numeric(10,2) not null,
  target_value    numeric(10,2) not null,
  awarded_at      timestamptz not null default now(),
  unique (user_profile_id, cycle, challenge_code)
);
create index if not exists challenge_medals_person_idx
  on challenge_medals (user_profile_id, cycle desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
/*
 * O catálogo é público para quem está autenticado — é conteúdo, não dado
 * pessoal. Escolha, progresso e medalha são só de quem os viveu, nem a
 * academia lê: "nunca publicar métricas pessoais do usuário sem consentimento"
 * vale aqui inteiro. Quando a academia precisar ver, será por opt-in explícito,
 * como já é o ranking de `challenge_participants`.
 */
alter table baseline_challenges enable row level security;
alter table challenge_entries   enable row level security;
alter table challenge_medals    enable row level security;

drop policy if exists baseline_challenges_read on baseline_challenges;
create policy baseline_challenges_read on baseline_challenges
  for select using (active);

drop policy if exists challenge_entries_self on challenge_entries;
create policy challenge_entries_self on challenge_entries
  for select using (user_profile_id = (select auth_profile_id()));

drop policy if exists challenge_medals_self on challenge_medals;
create policy challenge_medals_self on challenge_medals
  for select using (user_profile_id = (select auth_profile_id()));

/*
 * Nenhuma política de escrita, de propósito: entrada e medalha nascem pelas
 * funções abaixo. Se o cliente pudesse inserir em `challenge_medals`, a
 * medalha de ouro seria um POST.
 */

-- ── Escolher o desafio do mês ────────────────────────────────────────────────
create or replace function choose_baseline_challenge(p_code text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_tier       text;
  v_cycle      date := current_cycle();
  v_challenge  baseline_challenges%rowtype;
  v_escolhidos integer;
  v_entry_id   uuid;
begin
  if v_profile_id is null then
    raise exception 'É preciso estar autenticado para escolher um desafio.'
      using errcode = '42501';
  end if;

  select tier into v_tier from user_profiles where id = v_profile_id;

  select * into v_challenge from baseline_challenges where code = p_code and active;
  if v_challenge.code is null then
    raise exception 'Desafio não encontrado.' using errcode = '22023';
  end if;

  if v_challenge.min_tier = 'PRO' and v_tier <> 'PRO' then
    raise exception 'Este desafio é do plano Pro.' using errcode = '42501';
  end if;

  select count(*) into v_escolhidos
  from challenge_entries
  where user_profile_id = v_profile_id and cycle = v_cycle;

  /*
   * O limite do plano gratuito é verificado aqui e não por índice único: o
   * índice não sabe o plano da pessoa, e um limite que muda de 1 para vários
   * conforme o plano não cabe numa restrição de tabela.
   */
  if v_tier <> 'PRO' and v_escolhidos >= 1
     and not exists (
       select 1 from challenge_entries
       where user_profile_id = v_profile_id and cycle = v_cycle and challenge_code = p_code
     )
  then
    raise exception 'No plano gratuito você escolhe um desafio por mês.'
      using errcode = '42501';
  end if;

  insert into challenge_entries (user_profile_id, challenge_code, cycle, target_value)
  values (v_profile_id, p_code, v_cycle, v_challenge.target_value)
  on conflict (user_profile_id, cycle, challenge_code) do nothing;

  select id into v_entry_id
  from challenge_entries
  where user_profile_id = v_profile_id and cycle = v_cycle and challenge_code = p_code;

  /*
   * Constância já tem os dados: os check-ins do mês contam sozinhos, inclusive
   * os de antes da escolha. Fazer a pessoa começar do zero num desafio que o
   * sistema já sabe medir seria pedir para ela refazer o que já fez.
   */
  if v_challenge.metric = 'CHECKINS' then
    update challenge_entries e
    set progress_value = (
      select count(*)
      from check_ins c
      join students s on s.id = c.student_id
      where s.user_profile_id = v_profile_id
        and c.checked_in_at >= v_cycle
        and c.checked_in_at < (v_cycle + interval '1 month')
    )
    where e.id = v_entry_id;
  end if;

  insert into notifications (user_profile_id, category, title, body, action_url)
  values (
    v_profile_id,
    'PROGRAM',
    'Desafio do mês escolhido',
    v_challenge.title || ' · meta de ' || trim(to_char(v_challenge.target_value, 'FM999990.99'))
      || ' ' || v_challenge.unit,
    '/app/challenges'
  );

  return v_entry_id;
end;
$$;

revoke all on function choose_baseline_challenge(text) from public, anon;
grant execute on function choose_baseline_challenge(text) to authenticated;

-- ── Registrar progresso ──────────────────────────────────────────────────────
create or replace function record_challenge_progress(p_code text, p_delta numeric)
returns numeric
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_cycle      date := current_cycle();
  v_total      numeric;
begin
  if v_profile_id is null then
    raise exception 'É preciso estar autenticado.' using errcode = '42501';
  end if;

  -- Um lançamento absurdo é erro de digitação, não recorde: 10 mil km num
  -- toque só encerraria o desafio por engano.
  if p_delta is null or p_delta <= 0 or p_delta > 1000 then
    raise exception 'Informe um valor entre 0 e 1000.' using errcode = '22023';
  end if;

  update challenge_entries
  set progress_value = progress_value + p_delta
  where user_profile_id = v_profile_id
    and cycle = v_cycle
    and challenge_code = p_code
    and closed_at is null
  returning progress_value into v_total;

  if v_total is null then
    raise exception 'Você não tem este desafio em andamento.' using errcode = '22023';
  end if;

  return v_total;
end;
$$;

revoke all on function record_challenge_progress(text, numeric) from public, anon;
grant execute on function record_challenge_progress(text, numeric) to authenticated;

-- ── Check-in conta sozinho ───────────────────────────────────────────────────
create or replace function count_checkin_towards_challenge() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid;
begin
  select user_profile_id into v_profile_id from students where id = new.student_id;
  if v_profile_id is null then
    return new;
  end if;

  update challenge_entries e
  set progress_value = e.progress_value + 1
  from baseline_challenges c
  where c.code = e.challenge_code
    and c.metric = 'CHECKINS'
    and e.user_profile_id = v_profile_id
    and e.cycle = date_trunc('month', new.checked_in_at)::date
    and e.closed_at is null;

  return new;
end;
$$;

drop trigger if exists check_ins_count_challenge on check_ins;
create trigger check_ins_count_challenge
  after insert on check_ins
  for each row execute function count_checkin_towards_challenge();

-- ── Fechamento do ciclo e medalha ────────────────────────────────────────────
/*
 * Fecha os ciclos passados de quem chamou, e só os dela.
 *
 * Sem agendador: a função é chamada quando a pessoa abre o app. Um cron
 * mensal daria o mesmo resultado e uma peça de infraestrutura a mais para
 * quebrar em silêncio — aqui, se ninguém abre o app, não há medalha para
 * entregar mesmo.
 *
 * Idempotente pelo `closed_at` e pela chave única da medalha: chamar dez vezes
 * no mesmo dia entrega uma medalha só.
 */
create or replace function close_own_challenge_cycles() returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile_id uuid := auth_profile_id();
  v_entry      record;
  v_percent    numeric;
  v_level      text;
  v_total      integer := 0;
begin
  if v_profile_id is null then
    return 0;
  end if;

  for v_entry in
    select e.*, c.title, c.unit
    from challenge_entries e
    join baseline_challenges c on c.code = e.challenge_code
    where e.user_profile_id = v_profile_id
      and e.cycle < current_cycle()
      and e.closed_at is null
  loop
    v_percent := case
      when v_entry.target_value > 0 then (v_entry.progress_value / v_entry.target_value) * 100
      else 0
    end;

    v_level := case
      when v_percent >= 100 then 'OURO'
      when v_percent >= 75  then 'PRATA'
      when v_percent >= 50  then 'BRONZE'
      else 'PARTICIPACAO'
    end;

    insert into challenge_medals
      (user_profile_id, challenge_code, cycle, level, progress_value, target_value)
    values
      (v_profile_id, v_entry.challenge_code, v_entry.cycle, v_level,
       v_entry.progress_value, v_entry.target_value)
    on conflict (user_profile_id, cycle, challenge_code) do nothing;

    update challenge_entries set closed_at = now() where id = v_entry.id;

    insert into notifications (user_profile_id, category, title, body, action_url)
    values (
      v_profile_id,
      'PROGRAM',
      case v_level
        when 'OURO' then 'Medalha de ouro: ' || v_entry.title
        when 'PRATA' then 'Medalha de prata: ' || v_entry.title
        when 'BRONZE' then 'Medalha de bronze: ' || v_entry.title
        else 'Fechamento do mês: ' || v_entry.title
      end,
      'Você somou ' || trim(to_char(v_entry.progress_value, 'FM999990.99')) || ' de '
        || trim(to_char(v_entry.target_value, 'FM999990.99')) || ' ' || v_entry.unit
        || ' (' || round(v_percent) || '%). Veja a análise do mês.',
      '/app/challenges'
    );

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke all on function close_own_challenge_cycles() from public, anon;
grant execute on function close_own_challenge_cycles() to authenticated;


-- ############################################################################
-- ##  0015_professional_unlock.sql
-- ############################################################################

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
