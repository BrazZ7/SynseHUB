-- =============================================================================
-- SynseHub · 0068 — O esquadrão
--
-- Quatro amigos combinam de treinar e resolvem isso num grupo de mensagens:
-- "cheguei", "tô a caminho", "hoje não dá", uma foto do treino. Nada disso
-- volta — na semana seguinte ninguém lembra quem foi, quando foi, nem qual era
-- o treino.
--
-- O esquadrão é esse grupo dentro do produto: quem está na academia **agora**,
-- o próximo treino marcado com quem confirmou, a ficha que alguém mandou, e a
-- semana de todo mundo lado a lado.
--
-- ── Atravessa academia, como a amizade ──────────────────────────────────────
--
-- A chave é `user_profile_id`, não matrícula. A 0037 já escreveu o porquê: o
-- Synse+ é assinatura de consumidor, e quem treina na Alpha quer combinar com
-- o primo que treina em outro lugar — ou com quem treina em casa.
--
-- Consequência que precisa estar escrita: **nada de academia atravessa o
-- esquadrão**. O que o grupo vê de cada pessoa é o estado de presença, a
-- resposta ao treino marcado e — só com consentimento — os dias treinados na
-- semana. Nome de academia, cobrança, peso e avaliação não entram.
--
-- ── Presença que estraga ────────────────────────────────────────────────────
--
-- "Cheguei" de ontem não é presença; é lixo com cara de informação. Em vez de
-- um agendador que limpa, o estado nasce com `expires_at` e **a leitura
-- filtra**. Sem cron, sem tabela crescendo, e sem o modo de falhar clássico
-- destas telas: o grupo inteiro aparecendo "na academia" às três da manhã.
--
-- ── Sem conversa livre, e isso é decisão ────────────────────────────────────
--
-- O lobby fala por estado de presença, resposta ao treino e título da sessão —
-- vocabulário fechado, nada de texto solto entre membros.
--
-- Academia tem aluno menor de idade, e um grupo que se forma por código é
-- gente que pode não se conhecer. Texto livre aí é superfície de moderação que
-- este produto não tem como sustentar hoje: não há denúncia, não há bloqueio,
-- não há quem leia. Preferir não ter a ter mal.
--
-- O único texto que uma pessoa escreve aqui é o **nome do esquadrão** e o
-- **título do treino marcado**, os dois limitados e visíveis só para quem já
-- está dentro.
--
-- ── Ranking: entrar no grupo não é autorizar ────────────────────────────────
--
-- A semana de cada um só aparece para os outros com `RANKING_VISIBILITY`
-- (0037). É a mesma separação daquela migration, pelo mesmo motivo: "somos do
-- mesmo grupo" não é "pode mostrar meu desempenho". Sem consentimento a pessoa
-- aparece no lobby, participa de tudo, e **sem o número** — e a tela diz que
-- é escolha dela, em vez de sumir com ela e parecer defeito.
-- =============================================================================

-- ── Os times ─────────────────────────────────────────────────────────────────
create table training_squads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 2 and 40),
  /*
   * O mesmo alfabeto sem caracteres ambíguos do código de academia (0011):
   * ninguém erra 0 por O lendo em voz alta para o amigo do lado.
   */
  join_code  text not null unique,
  created_by uuid not null references user_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table squad_members (
  squad_id        uuid not null references training_squads(id) on delete cascade,
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  role            text not null default 'MEMBER' check (role in ('OWNER', 'MEMBER')),
  joined_at       timestamptz not null default now(),
  primary key (squad_id, user_profile_id)
);

create index squad_members_perfil_idx on squad_members (user_profile_id);

/*
 * ── Presença é da pessoa, não do esquadrão ──────────────────────────────────
 *
 * Quem está em dois esquadrões chegou na academia **uma vez**. Uma linha por
 * (pessoa, esquadrão) deixaria "cheguei" num grupo e não no outro, que é um
 * estado impossível no mundo real e um bug esperando para ser contado.
 */
create table member_presence (
  user_profile_id uuid primary key references user_profiles(id) on delete cascade,
  state           text not null check (state in
                    ('A_CAMINHO', 'CHEGUEI', 'TREINANDO', 'TERMINEI')),
  updated_at      timestamptz not null default now(),
  /*
   * Quando este estado deixa de valer. Quatro horas cobre o trajeto, o treino
   * e a volta; passou disso, a pessoa esqueceu de desmarcar e o grupo não
   * precisa saber.
   */
  expires_at      timestamptz not null
);

create table squad_sessions (
  id              uuid primary key default gen_random_uuid(),
  squad_id        uuid not null references training_squads(id) on delete cascade,
  created_by      uuid not null references user_profiles(id) on delete cascade,
  starts_at       timestamptz not null,
  title           text check (title is null or length(trim(title)) between 2 and 60),
  /*
   * "Enviar treino" é isto: a sessão carrega a ficha.
   *
   * Uma tabela e não duas. Mandar um treino sem dizer quando é um recado solto
   * que ninguém abre; marcar um treino sem dizer qual é metade do combinado.
   * Juntos, o cartão do lobby diz "quinta 19h · Treino B — Costas".
   *
   * `on delete set null`: a academia apagar a ficha não pode apagar o
   * combinado entre as pessoas.
   */
  workout_plan_id uuid references workout_plans(id) on delete set null,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index squad_sessions_proximas_idx on squad_sessions (squad_id, starts_at desc);

create table squad_session_rsvp (
  session_id      uuid not null references squad_sessions(id) on delete cascade,
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  answer          text not null check (answer in ('VOU', 'TALVEZ', 'NAO_VOU')),
  answered_at     timestamptz not null default now(),
  primary key (session_id, user_profile_id)
);

-- ── O helper que evita a recursão da RLS ─────────────────────────────────────
/**
 * Estou neste esquadrão?
 *
 * `security definer` por necessidade, e não por conveniência: a política de
 * `squad_members` precisa consultar `squad_members`, e uma política que lê a
 * própria tabela entra em recursão infinita — o Postgres aborta com
 * `infinite recursion detected in policy`. Com a função definer, a leitura de
 * dentro não passa pela política.
 */
create or replace function is_squad_member(p_squad_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squad_members m
    where m.squad_id = p_squad_id
      and m.user_profile_id = auth_profile_id()
  )
$$;

revoke all on function is_squad_member(uuid) from public, anon;
grant execute on function is_squad_member(uuid) to authenticated, service_role;

/** Os esquadrões de quem está autenticado — a forma de conjunto da 0008. */
create or replace function my_squad_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.squad_id from squad_members m where m.user_profile_id = auth_profile_id()
$$;

revoke all on function my_squad_ids() from public, anon;
grant execute on function my_squad_ids() to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
/*
 * Leitura para quem está dentro; escrita só pelas funções, como na 0037.
 *
 * Entrar, sair, marcar e responder têm regra com lado — só o dono renomeia, só
 * o destinatário responde, o teto de oito precisa ser conferido no momento da
 * entrada. Regra em política vira regra espalhada.
 */
alter table training_squads     enable row level security;
alter table squad_members       enable row level security;
alter table member_presence     enable row level security;
alter table squad_sessions      enable row level security;
alter table squad_session_rsvp  enable row level security;

create policy training_squads_read on training_squads
  for select using (is_squad_member(id));

create policy squad_members_read on squad_members
  for select using (squad_id in (select my_squad_ids()));

/*
 * A presença de quem divide esquadrão comigo, e a minha.
 *
 * Sem o segundo ramo, quem não está em esquadrão nenhum não leria o próprio
 * estado — e a tela não saberia qual botão desenhar aceso.
 */
create policy member_presence_read on member_presence
  for select using (
    user_profile_id = auth_profile_id()
    or exists (
      select 1 from squad_members m
      where m.user_profile_id = member_presence.user_profile_id
        and m.squad_id in (select my_squad_ids())
    )
  );

create policy squad_sessions_read on squad_sessions
  for select using (squad_id in (select my_squad_ids()));

create policy squad_session_rsvp_read on squad_session_rsvp
  for select using (
    session_id in (select s.id from squad_sessions s where s.squad_id in (select my_squad_ids()))
  );

revoke insert, update, delete on training_squads, squad_members, member_presence,
  squad_sessions, squad_session_rsvp from authenticated, anon;

-- ── Avisos: a categoria nova ─────────────────────────────────────────────────
/*
 * `SQUAD` entra nas duas listas de categoria. Ela precisa existir nas duas:
 * em `notifications` para o gatilho poder escrever, e em
 * `notification_preferences` para a pessoa poder desligar — o que, por
 * `notify_profiles` (0065), passa a valer sozinho.
 *
 * Categoria própria e não `WORKOUT`: quem quer silenciar o grupo dos amigos
 * raramente quer silenciar o treino que o professor atribuiu. Enfiar as duas
 * coisas na mesma chave obrigaria a escolher entre perder as duas ou aguentar
 * as duas.
 */
alter table notifications drop constraint if exists notifications_category_check;
alter table notifications add constraint notifications_category_check
  check (category in ('PAYMENT','WORKOUT','GYM','CONTENT','PROGRAM','SYSTEM','SQUAD'));

alter table notification_preferences drop constraint if exists notification_preferences_category_check;
alter table notification_preferences add constraint notification_preferences_category_check
  check (category in ('PAYMENT','WORKOUT','GYM','CONTENT','PROGRAM','SYSTEM','SQUAD'));

/*
 * Mesma assinatura, então o `create or replace` preserva o ACL — conferido no
 * Postgres em 30/10. O `revoke` abaixo é cinto além do suspensório, como na
 * 0065.
 */
create or replace function set_notification_preference(
  p_category text,
  p_enabled  boolean
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile uuid;
begin
  select id into v_profile from user_profiles where auth_user_id = auth.uid();
  if v_profile is null then
    raise exception 'Sem perfil para esta conta.' using errcode = '42501';
  end if;

  if p_category not in ('PAYMENT','WORKOUT','GYM','CONTENT','PROGRAM','SYSTEM','SQUAD') then
    raise exception 'Categoria desconhecida: %', p_category using errcode = '22023';
  end if;

  insert into notification_preferences (user_profile_id, category, enabled)
  values (v_profile, p_category, coalesce(p_enabled, true))
  on conflict (user_profile_id, category) do update
    set enabled = excluded.enabled,
        updated_at = now();
end;
$$;

revoke all on function set_notification_preference(text, boolean) from public, anon;
grant execute on function set_notification_preference(text, boolean) to authenticated, service_role;

-- ── Criar, entrar, sair ──────────────────────────────────────────────────────
/** Quantas pessoas cabem. Oito é grupo; nove é lista de transmissão. */
create or replace function squad_limite() returns integer
language sql immutable as $$ select 8 $$;

/**
 * Cria o esquadrão e põe quem criou dentro, como dono.
 *
 * O código sai de `generate_invite_code()` (0011) e é conferido contra colisão
 * — seis caracteres num alfabeto de trinta dão 729 milhões de combinações, e
 * ainda assim repetir uma vez numa base grande é questão de tempo.
 */
create or replace function create_squad(p_name text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu     uuid := auth_profile_id();
  v_codigo text;
  v_id     uuid;
  v_tentativas int := 0;
begin
  if v_eu is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  loop
    v_codigo := generate_invite_code();
    exit when not exists (select 1 from training_squads where join_code = v_codigo);
    v_tentativas := v_tentativas + 1;
    if v_tentativas > 10 then
      raise exception 'Não foi possível gerar um código. Tente de novo.'
        using errcode = '55000';
    end if;
  end loop;

  insert into training_squads (name, join_code, created_by)
  values (trim(p_name), v_codigo, v_eu)
  returning id into v_id;

  insert into squad_members (squad_id, user_profile_id, role)
  values (v_id, v_eu, 'OWNER');

  return v_id;
end;
$$;

revoke all on function create_squad(text) from public, anon;
grant execute on function create_squad(text) to authenticated, service_role;

/**
 * Entra pelo código. Devolve o id do esquadrão.
 *
 * `security definer` porque quem está do lado de fora não enxerga o esquadrão
 * por política nenhuma — é o mesmo desenho da entrada por código de academia
 * (0011) e do pedido de amizade por Synse ID (0037).
 *
 * Entrar duas vezes devolve o mesmo id em vez de estourar: o segundo toque no
 * mesmo convite é engano de dedo, não erro de uso.
 */
create or replace function join_squad(p_code text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu      uuid := auth_profile_id();
  v_squad   uuid;
  v_quantos integer;
begin
  if v_eu is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  select id into v_squad from training_squads
   where join_code = upper(trim(coalesce(p_code, '')));

  if v_squad is null then
    raise exception 'Não encontramos nenhum esquadrão com esse código.'
      using errcode = 'P0002';
  end if;

  if exists (select 1 from squad_members where squad_id = v_squad and user_profile_id = v_eu) then
    return v_squad;
  end if;

  /*
   * O teto é conferido aqui e não por `check`: a restrição é sobre o conjunto
   * de linhas, não sobre uma linha. `for update` no esquadrão serializa duas
   * entradas simultâneas — sem ele, dois convites aceitos no mesmo instante
   * passariam os dois pela contagem de sete.
   */
  perform 1 from training_squads where id = v_squad for update;

  select count(*) into v_quantos from squad_members where squad_id = v_squad;
  if v_quantos >= squad_limite() then
    raise exception 'Este esquadrão já está cheio (% pessoas).', squad_limite()
      using errcode = '23514';
  end if;

  insert into squad_members (squad_id, user_profile_id) values (v_squad, v_eu);
  return v_squad;
end;
$$;

revoke all on function join_squad(text) from public, anon;
grant execute on function join_squad(text) to authenticated, service_role;

/**
 * Sai do esquadrão.
 *
 * ── O que acontece quando o dono sai ────────────────────────────────────────
 *
 * A posse passa para quem entrou primeiro depois dele. Sem isso, o esquadrão
 * ficaria sem ninguém que pode renomear ou remover — vivo e sem leme.
 *
 * Último a sair apaga o esquadrão. Grupo de zero pessoa não é grupo, e deixar
 * a linha ali faria o código de convite continuar válido para um lugar vazio.
 */
create or replace function leave_squad(p_squad_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu       uuid := auth_profile_id();
  v_era_dono boolean;
  v_proximo  uuid;
begin
  select role = 'OWNER' into v_era_dono
  from squad_members where squad_id = p_squad_id and user_profile_id = v_eu;

  if v_era_dono is null then
    raise exception 'Você não está neste esquadrão.' using errcode = '42501';
  end if;

  delete from squad_members where squad_id = p_squad_id and user_profile_id = v_eu;

  select user_profile_id into v_proximo
  from squad_members where squad_id = p_squad_id
  order by joined_at, user_profile_id limit 1;

  if v_proximo is null then
    delete from training_squads where id = p_squad_id;
    return;
  end if;

  if v_era_dono then
    update squad_members set role = 'OWNER'
    where squad_id = p_squad_id and user_profile_id = v_proximo;
  end if;
end;
$$;

revoke all on function leave_squad(uuid) from public, anon;
grant execute on function leave_squad(uuid) to authenticated, service_role;

/** Renomeia. Só o dono — é o nome que todo mundo vê. */
create or replace function rename_squad(p_squad_id uuid, p_name text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_afetadas integer;
begin
  update training_squads set name = trim(p_name)
  where id = p_squad_id
    and exists (
      select 1 from squad_members m
      where m.squad_id = p_squad_id
        and m.user_profile_id = auth_profile_id()
        and m.role = 'OWNER'
    );

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Só o dono do esquadrão pode renomear.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function rename_squad(uuid, text) from public, anon;
grant execute on function rename_squad(uuid, text) to authenticated, service_role;

/**
 * Tira alguém. Só o dono, e nunca a si mesmo.
 *
 * Sair é `leave_squad`, que tem a regra da sucessão. Deixar o dono se remover
 * por aqui pularia essa regra e deixaria o esquadrão sem dono.
 */
create or replace function remove_squad_member(p_squad_id uuid, p_profile_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu       uuid := auth_profile_id();
  v_afetadas integer;
begin
  if p_profile_id = v_eu then
    raise exception 'Para sair do esquadrão, use sair.' using errcode = '22023';
  end if;

  delete from squad_members
  where squad_id = p_squad_id
    and user_profile_id = p_profile_id
    and exists (
      select 1 from squad_members m
      where m.squad_id = p_squad_id and m.user_profile_id = v_eu and m.role = 'OWNER'
    );

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Só o dono pode remover, e a pessoa precisa estar no esquadrão.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function remove_squad_member(uuid, uuid) from public, anon;
grant execute on function remove_squad_member(uuid, uuid) to authenticated, service_role;

-- ── Presença ─────────────────────────────────────────────────────────────────
/** Quanto tempo um estado de presença vale. */
create or replace function presenca_validade() returns interval
language sql immutable as $$ select interval '4 hours' $$;

/**
 * "Cheguei", "tô a caminho", "treinando", "terminei" — ou nada.
 *
 * `p_state` nulo apaga: é o "saí" sem precisar de um quinto estado que
 * ninguém tocaria. O relógio recomeça a cada toque, então quem avisa que
 * chegou e depois que está treinando ganha quatro horas novas.
 */
create or replace function set_presence(p_state text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu uuid := auth_profile_id();
begin
  if v_eu is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  if p_state is null then
    delete from member_presence where user_profile_id = v_eu;
    return;
  end if;

  if p_state not in ('A_CAMINHO', 'CHEGUEI', 'TREINANDO', 'TERMINEI') then
    raise exception 'Estado desconhecido: %', p_state using errcode = '22023';
  end if;

  insert into member_presence (user_profile_id, state, expires_at)
  values (v_eu, p_state, now() + presenca_validade())
  on conflict (user_profile_id) do update
    set state = excluded.state,
        updated_at = now(),
        expires_at = excluded.expires_at;
end;
$$;

revoke all on function set_presence(text) from public, anon;
grant execute on function set_presence(text) to authenticated, service_role;

-- ── O lobby ──────────────────────────────────────────────────────────────────
/**
 * Quem está no esquadrão, como está agora, e a semana de cada um.
 *
 * ── Os dias da semana saem daqui, e não de `student_week_summary` ───────────
 *
 * Aquela (0066) resolve a pessoa por `auth.uid()` de propósito — ela lê peso e
 * corrida. Aqui a pergunta é sobre **outras** pessoas, então a conta é
 * refeita, e de propósito ela é mais pobre: só dias treinados, que é o número
 * que a 0037 escolheu para ranking por ser o único que todo mundo tem.
 *
 * A semana é a mesma de lá: segunda a domingo, no fuso de quem está olhando.
 * O fuso de quem olha e não o de cada um — senão a coluna compararia semanas
 * diferentes e a soma não fecharia com nada.
 *
 * ── `dias_na_semana` é nulo sem consentimento ───────────────────────────────
 *
 * E nulo não é zero. A tela escreve "não autorizou aparecer" em vez de "zero
 * dias", que seria uma afirmação sobre a semana de alguém que não autorizou
 * afirmação nenhuma.
 */
create or replace function squad_lobby(p_squad_id uuid)
returns table (
  perfil_id       uuid,
  nome            text,
  synse_id        text,
  avatar_url      text,
  papel           text,
  sou_eu          boolean,
  entrou_em       timestamptz,
  presenca        text,
  presenca_em     timestamptz,
  dias_na_semana  integer,
  no_ranking      boolean
)
language sql stable security definer set search_path = public as $$
  with eu as (select auth_profile_id() as id),
  /*
   * A trava. `security definer` enxerga tudo, então quem não é do esquadrão
   * precisa receber zero linha **por esta cláusula** — e não pela RLS, que
   * aqui não vale.
   */
  guarda as (
    select 1 where exists (
      select 1 from squad_members m, eu
      where m.squad_id = p_squad_id and m.user_profile_id = eu.id
    )
  ),
  fuso as (
    select coalesce(
      (select org_timezone(s.organization_id) from students s, eu
        where s.user_profile_id = eu.id order by s.created_at desc limit 1),
      'America/Sao_Paulo'
    ) as tz
  ),
  semana as (
    select (date_trunc('week', (now() at time zone (select tz from fuso)))::timestamp
            at time zone (select tz from fuso)) as desde
  ),
  dias as (
    select d.perfil, count(distinct d.dia)::int as dias
    from (
      select m.user_profile_id as perfil,
             (ws.completed_at at time zone (select tz from fuso))::date as dia
      from squad_members m
      join students st on st.user_profile_id = m.user_profile_id
      join workout_sessions ws on ws.student_id = st.id
      where m.squad_id = p_squad_id
        and ws.status = 'COMPLETED'
        and ws.completed_at >= (select desde from semana)

      union all

      select m.user_profile_id,
             (c.checked_in_at at time zone (select tz from fuso))::date
      from squad_members m
      join students st on st.user_profile_id = m.user_profile_id
      join check_ins c on c.student_id = st.id
      where m.squad_id = p_squad_id
        and c.checked_in_at >= (select desde from semana)
    ) d
    group by d.perfil
  )
  select
    m.user_profile_id,
    p.name,
    p.synse_id,
    p.avatar_url,
    m.role,
    m.user_profile_id = (select id from eu),
    m.joined_at,
    -- A presença vencida não é presença: some aqui, sem ninguém limpar nada.
    case when pr.expires_at > now() then pr.state end,
    case when pr.expires_at > now() then pr.updated_at end,
    /*
     * O próprio número aparece sempre: ele não é publicação. O consentimento
     * existe para o que os outros veem — mesma regra de `friends_ranking`.
     */
    case
      when m.user_profile_id = (select id from eu) then coalesce(d.dias, 0)
      when consentiu_ranking(m.user_profile_id) then coalesce(d.dias, 0)
    end,
    consentiu_ranking(m.user_profile_id)
  from guarda
  cross join squad_members m
  join user_profiles p on p.id = m.user_profile_id
  left join member_presence pr on pr.user_profile_id = m.user_profile_id
  left join dias d on d.perfil = m.user_profile_id
  where m.squad_id = p_squad_id
  order by m.role desc, p.name
$$;

revoke all on function squad_lobby(uuid) from public, anon;
grant execute on function squad_lobby(uuid) to authenticated, service_role;

/**
 * Meus esquadrões, com o que a lista precisa mostrar sem abrir cada um.
 *
 * `presentes` é a contagem de quem está com presença viva agora — é o número
 * que faz alguém abrir o app no meio da tarde.
 */
create or replace function my_squads()
returns table (
  id          uuid,
  nome        text,
  codigo      text,
  papel       text,
  membros     integer,
  presentes   integer,
  proxima_em  timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    s.id,
    s.name,
    s.join_code,
    m.role,
    (select count(*)::int from squad_members x where x.squad_id = s.id),
    (select count(*)::int
       from squad_members x
       join member_presence pr on pr.user_profile_id = x.user_profile_id
      where x.squad_id = s.id and pr.expires_at > now()),
    (select min(ss.starts_at)
       from squad_sessions ss
      where ss.squad_id = s.id and ss.cancelled_at is null and ss.starts_at >= now())
  from squad_members m
  join training_squads s on s.id = m.squad_id
  where m.user_profile_id = auth_profile_id()
  order by s.created_at
$$;

revoke all on function my_squads() from public, anon;
grant execute on function my_squads() to authenticated, service_role;

-- ── Marcar treino ────────────────────────────────────────────────────────────
/**
 * Marca um treino para o esquadrão, com ficha opcional.
 *
 * Quem marca já responde "vou": marcar e não ir é possível, marcar sem
 * responder é um cartão com zero confirmados criado por alguém que obviamente
 * vai.
 *
 * ── A ficha precisa ser de uma academia de quem manda ──────────────────────
 *
 * Sem conferência, um `security definer` aceitaria qualquer id e deixaria
 * mandar para o esquadrão a ficha de uma academia alheia — e o esquadrão
 * atravessa academia, então sempre há alguém de fora para ver.
 *
 * **A primeira tentativa aqui foi uma função `security invoker` auxiliar, e
 * ela não funciona.** Função chamada de dentro de uma `security definer` roda
 * com o privilégio da definer: "invoker" passa a significar o dono, não quem
 * chamou, e a RLS de `workout_plans` não se aplica. O teste pegou — a ficha da
 * concorrente entrava.
 *
 * A regra está escrita, então, e é mais estreita que a RLS de propósito: a
 * ficha tem de ser de uma academia em que **quem manda** está matriculado ou é
 * da equipe. As duas funções de conjunto já existem (0008 e 0011) e resolvem
 * por `auth.uid()`, que continua sendo o de quem chamou mesmo aqui dentro.
 */
create or replace function schedule_squad_session(
  p_squad_id        uuid,
  p_starts_at       timestamptz,
  p_title           text default null,
  p_workout_plan_id uuid default null
) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu   uuid := auth_profile_id();
  v_id   uuid;
  v_nome text;
begin
  if not is_squad_member(p_squad_id) then
    raise exception 'Você não está neste esquadrão.' using errcode = '42501';
  end if;

  if p_starts_at is null or p_starts_at < now() - interval '1 hour' then
    /*
     * Uma hora de folga para trás: quem marca "agora" enquanto digita não
     * pode ser barrado por trinta segundos de atraso. Mais que isso é treino
     * no passado, que não é combinado — é registro, e registro tem o
     * histórico (0064).
     */
    raise exception 'Escolha um horário que ainda não passou.' using errcode = '22023';
  end if;

  if p_workout_plan_id is not null and not exists (
    select 1 from workout_plans w
    where w.id = p_workout_plan_id
      and (
        w.organization_id in (select student_organization_ids())
        or w.organization_id in (select member_organization_ids())
      )
  ) then
    raise exception 'Ficha de treino não encontrada.' using errcode = 'P0002';
  end if;

  insert into squad_sessions (squad_id, created_by, starts_at, title, workout_plan_id)
  values (p_squad_id, v_eu, p_starts_at, nullif(trim(coalesce(p_title, '')), ''), p_workout_plan_id)
  returning id into v_id;

  insert into squad_session_rsvp (session_id, user_profile_id, answer)
  values (v_id, v_eu, 'VOU');

  select name into v_nome from training_squads where id = p_squad_id;

  /*
   * O aviso sai por `notify_profiles` (0012), que é o ponto único — e por isso
   * já respeita a preferência de categoria da 0065 sem nada aqui saber disso.
   * Quem marcou não se avisa.
   */
  perform notify_profiles(
    array(
      select m.user_profile_id from squad_members m
      where m.squad_id = p_squad_id and m.user_profile_id <> v_eu
    ),
    null,
    'SQUAD',
    'Treino marcado no ' || coalesce(v_nome, 'seu esquadrão'),
    to_char(p_starts_at at time zone 'America/Sao_Paulo', 'DD/MM à\s HH24h MI')
      || coalesce(' · ' || nullif(trim(coalesce(p_title, '')), ''), ''),
    '/app/esquadrao'
  );

  return v_id;
end;
$$;

revoke all on function schedule_squad_session(uuid, timestamptz, text, uuid) from public, anon;
grant execute on function schedule_squad_session(uuid, timestamptz, text, uuid)
  to authenticated, service_role;

/** Vou, talvez, não vou. Trocar de ideia é esperado, então é um upsert. */
create or replace function answer_squad_session(p_session_id uuid, p_answer text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu    uuid := auth_profile_id();
  v_squad uuid;
begin
  if p_answer not in ('VOU', 'TALVEZ', 'NAO_VOU') then
    raise exception 'Resposta desconhecida: %', p_answer using errcode = '22023';
  end if;

  select squad_id into v_squad from squad_sessions where id = p_session_id;
  if v_squad is null or not is_squad_member(v_squad) then
    raise exception 'Treino não encontrado, ou não é do seu esquadrão.'
      using errcode = '42501';
  end if;

  insert into squad_session_rsvp (session_id, user_profile_id, answer)
  values (p_session_id, v_eu, p_answer)
  on conflict (session_id, user_profile_id) do update
    set answer = excluded.answer, answered_at = now();
end;
$$;

revoke all on function answer_squad_session(uuid, text) from public, anon;
grant execute on function answer_squad_session(uuid, text) to authenticated, service_role;

/**
 * Cancela. Quem marcou, ou o dono do esquadrão.
 *
 * Cancelar e não apagar: quem já respondeu "vou" merece ver que foi cancelado,
 * em vez de o cartão sumir e a pessoa aparecer na academia à toa.
 */
create or replace function cancel_squad_session(p_session_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu       uuid := auth_profile_id();
  v_afetadas integer;
begin
  update squad_sessions ss set cancelled_at = now()
  where ss.id = p_session_id
    and ss.cancelled_at is null
    and (
      ss.created_by = v_eu
      or exists (
        select 1 from squad_members m
        where m.squad_id = ss.squad_id and m.user_profile_id = v_eu and m.role = 'OWNER'
      )
    );

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Só quem marcou ou o dono do esquadrão pode cancelar.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function cancel_squad_session(uuid) from public, anon;
grant execute on function cancel_squad_session(uuid) to authenticated, service_role;

/**
 * Os treinos do esquadrão: os que vêm, e os que passaram há pouco.
 *
 * Os que passaram ficam um dia na lista. "Foi ontem às sete" responde "por que
 * meu amigo está com cara de quem treinou" — e some antes de virar histórico,
 * que tem tela própria.
 */
create or replace function list_squad_sessions(p_squad_id uuid, p_limite integer default 10)
returns table (
  id              uuid,
  starts_at       timestamptz,
  title           text,
  workout_plan_id uuid,
  plano_nome      text,
  criado_por      uuid,
  criado_por_nome text,
  cancelado       boolean,
  vou             integer,
  talvez          integer,
  nao_vou         integer,
  minha_resposta  text
)
language sql stable security definer set search_path = public as $$
  with guarda as (
    select 1 where is_squad_member(p_squad_id)
  )
  select
    ss.id,
    ss.starts_at,
    ss.title,
    ss.workout_plan_id,
    wp.name,
    ss.created_by,
    p.name,
    ss.cancelled_at is not null,
    (select count(*)::int from squad_session_rsvp r where r.session_id = ss.id and r.answer = 'VOU'),
    (select count(*)::int from squad_session_rsvp r where r.session_id = ss.id and r.answer = 'TALVEZ'),
    (select count(*)::int from squad_session_rsvp r where r.session_id = ss.id and r.answer = 'NAO_VOU'),
    (select r.answer from squad_session_rsvp r
      where r.session_id = ss.id and r.user_profile_id = auth_profile_id())
  from guarda
  cross join squad_sessions ss
  left join workout_plans wp on wp.id = ss.workout_plan_id
  left join user_profiles p on p.id = ss.created_by
  where ss.squad_id = p_squad_id
    and ss.starts_at >= now() - interval '1 day'
  order by ss.starts_at
  limit least(greatest(coalesce(p_limite, 10), 1), 50)
$$;

revoke all on function list_squad_sessions(uuid, integer) from public, anon;
grant execute on function list_squad_sessions(uuid, integer) to authenticated, service_role;

-- ── Avisar quem já está dentro que alguém entrou ─────────────────────────────
create or replace function notify_squad_joined() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome  text;
  v_squad text;
begin
  select name into v_nome from user_profiles where id = new.user_profile_id;
  select name into v_squad from training_squads where id = new.squad_id;

  perform notify_profiles(
    array(
      select m.user_profile_id from squad_members m
      where m.squad_id = new.squad_id and m.user_profile_id <> new.user_profile_id
    ),
    null,
    'SQUAD',
    coalesce(v_nome, 'Alguém') || ' entrou no ' || coalesce(v_squad, 'esquadrão'),
    'O esquadrão cresceu.',
    '/app/esquadrao'
  );

  return new;
end;
$$;

drop trigger if exists squad_members_notify on squad_members;
create trigger squad_members_notify
  after insert on squad_members
  for each row execute function notify_squad_joined();

insert into schema_migrations (version) values ('0068_esquadrao.sql') on conflict do nothing;
