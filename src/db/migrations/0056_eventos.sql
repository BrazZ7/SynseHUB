-- =============================================================================
-- 0056 — Eventos com inscrição paga
--
-- O primeiro é a corrida de inauguração: inscrição dentro do app, R$ 79,90,
-- aberta a quem não é aluno. Nada no produto fazia isso — `class_sessions` é
-- aula recorrente para aluno matriculado, e `gym_challenges` é desafio sem
-- dinheiro e sem vaga.
--
-- ── Três decisões que moldam tudo o que vem abaixo ──────────────────────────
--
-- **1. A inscrição não cria `charge`, e isso é deliberado.**
--
-- `charges.student_id` é `not null`: toda cobrança pertence a um aluno de uma
-- academia. Inscrição de quem não é aluno não cabe ali sem afrouxar a coluna,
-- e afrouxá-la faria a mensalidade — o dinheiro que sustenta o produto —
-- passar a aceitar linha sem dono.
--
-- Pior que isso: hoje **nenhum centavo se move** no Synse. Não há provedor de
-- pagamento; o Asaas saiu por causa da taxa e não houve substituto. Lançar
-- inscrição em `charges` encheria o GMV, a receita da plataforma e os
-- indicadores de `/synse-pay` com dinheiro que ninguém processou. A tela do
-- financeiro passaria a mentir — e esta sessão inteira foi gastando tempo
-- consertando telas que mentem.
--
-- Então a inscrição guarda o próprio valor e a própria baixa. Quando houver
-- provedor, é o adapter que cria a cobrança no gateway e o webhook que
-- confirma; o `payment_reference` abaixo é onde o id dele vai morar, e nada
-- do que está aqui precisa mudar para isso acontecer.
--
-- **2. Quem não tem conta se inscreve, e nunca escreve na tabela direto.**
--
-- A inscrição pública entra por `inscrever_no_evento`, que é `security
-- definer` e valida tudo antes de gravar. O anônimo recebe `execute` nessa
-- função e **nada** em `event_registrations`: ele não lista, não lê a de
-- outro, não altera a própria. Para acompanhar a dele existe o código de
-- confirmação, que é aleatório de 16 caracteres e serve de senha de consulta.
--
-- **3. Vaga é contada sob trava, não na tela.**
--
-- Mesma lição da 0024: duas pessoas tocando "inscrever" no mesmo segundo
-- passam as duas por qualquer contagem feita antes. A função tranca a linha
-- do evento (`for update`) e conta ali dentro. Quem passar do teto entra na
-- fila de espera, que é posição por ordem de chegada.
--
-- ── Dado pessoal de quem não é aluno ────────────────────────────────────────
--
-- CPF, telefone e contato de emergência de gente que nunca aceitou a política
-- de privacidade do Synse. A inscrição guarda **qual versão** da política a
-- pessoa aceitou e **quando** — sem isso, o consentimento não existe como
-- prova, e é dado sensível de terceiro guardado sem base. A tela não deixa
-- enviar sem o aceite, e o banco também não: `privacy_version` é `not null`.
-- =============================================================================

create type event_status as enum ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED');

/*
 * `WAITLIST` → fila; `PENDING_PAYMENT` → vaga segurada, aguardando o dinheiro;
 * `CONFIRMED` → pago; `CANCELLED` → desistiu ou foi cancelada.
 *
 * Vaga é segurada por `PENDING_PAYMENT` **e** `CONFIRMED`. Segurar só o
 * confirmado deixaria alguém pagar e descobrir que o evento lotou no meio do
 * PIX; não segurar nenhum dos dois é não ter teto. O custo é a inscrição que
 * ninguém paga ocupando lugar, e quem resolve isso é a organização,
 * cancelando — decisão de gente, não de relógio.
 */
create type event_registration_status as enum (
  'WAITLIST', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED'
);

create table events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  /** Vai na URL pública: `/eventos/<slug>`. */
  slug             text not null,
  title            text not null check (length(btrim(title)) between 3 and 120),
  description      text,
  /** Onde é, em texto livre — não é endereço estruturado, é o que se lê. */
  location         text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  /** Zero é evento gratuito; a tela não cobra e a inscrição já nasce paga. */
  price            numeric(10,2) not null default 0 check (price >= 0),
  /** Nulo é sem teto: evento que não lota não tem fila de espera. */
  capacity         integer check (capacity is null or capacity > 0),
  registration_opens_at  timestamptz,
  registration_closes_at timestamptz,
  status           event_status not null default 'DRAFT',
  /*
   * A chave PIX fica no evento, e não nas configurações da academia, porque
   * evento pode ser de outra conta — a corrida de inauguração não tem de cair
   * na mesma conta da mensalidade. É dado para ser mostrado a quem paga.
   */
  pix_key          text,
  pix_holder_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug),
  check (ends_at is null or ends_at > starts_at),
  check (
    registration_closes_at is null
    or registration_opens_at is null
    or registration_closes_at > registration_opens_at
  )
);
create index events_org_idx on events (organization_id, starts_at desc);
create index events_publicos_idx on events (status, starts_at) where status = 'PUBLISHED';

/** As distâncias ou modalidades do evento: 5 km, 10 km, caminhada. */
create table event_categories (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  position   smallint not null default 0,
  unique (event_id, name)
);
create index event_categories_event_idx on event_categories (event_id, position);

create table event_registrations (
  id               uuid primary key default gen_random_uuid(),
  /*
   * Repetida do evento de propósito: é por ela que as políticas de RLS
   * respondem "esta inscrição é da minha academia?" sem um join a cada linha.
   * O gatilho abaixo impede que ela discorde do evento.
   */
  organization_id  uuid not null references organizations(id) on delete cascade,
  event_id         uuid not null references events(id) on delete cascade,
  category_id      uuid references event_categories(id) on delete set null,
  /** Preenchido quando quem se inscreveu é aluno da casa. Nulo é gente de fora. */
  student_id       uuid references students(id) on delete set null,
  full_name        text not null check (length(btrim(full_name)) between 3 and 120),
  email            text not null check (position('@' in email) > 1),
  phone            text not null check (length(btrim(phone)) between 8 and 20),
  /** Só dígitos; a aplicação normaliza antes de mandar. */
  tax_id           text not null check (tax_id ~ '^[0-9]{11}$'),
  shirt_size       text check (shirt_size in ('PP', 'P', 'M', 'G', 'GG', 'XGG')),
  emergency_name   text,
  emergency_phone  text,
  status           event_registration_status not null default 'PENDING_PAYMENT',
  /** Congelado na inscrição: mudar o preço do evento não muda o que já foi cobrado. */
  amount           numeric(10,2) not null check (amount >= 0),
  /*
   * Senha de consulta de quem não tem conta. Aleatória, porque ela dá acesso
   * a nome, CPF e telefone — adivinhável seria vazamento.
   */
  confirmation_code text not null unique default encode(gen_random_bytes(8), 'hex'),
  paid_at          timestamptz,
  payment_method   payment_method,
  /** Onde o id da cobrança do provedor vai morar quando houver provedor. */
  payment_reference text,
  confirmed_by_staff_id uuid references staff(id) on delete set null,
  /** A versão da política que a pessoa aceitou, e quando. Sem isso não há base. */
  privacy_version  text not null,
  consented_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz
);
create index event_registrations_event_idx on event_registrations (event_id, created_at);
create index event_registrations_org_idx on event_registrations (organization_id, created_at desc);
create index event_registrations_student_idx on event_registrations (student_id)
  where student_id is not null;

/*
 * Uma inscrição por CPF por evento — a cancelada não conta, porque desistir e
 * se inscrever de novo é legítimo. Índice parcial em vez de `unique`
 * simples por causa disso.
 */
create unique index event_registrations_sem_repeticao_idx
  on event_registrations (event_id, tax_id)
  where status <> 'CANCELLED';

-- ── A academia da inscrição é a do evento ────────────────────────────────────

/*
 * `organization_id` é repetida para a RLS responder sem join, e dado repetido
 * que ninguém guarda é dado que diverge. Aqui o gatilho preenche a partir do
 * evento e recusa quem tentar divergir — a política confia nessa coluna, e uma
 * inscrição com a organização de outra academia atravessaria a tranca.
 */
create or replace function event_registration_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organization_id into v_org from events where id = new.event_id;
  if v_org is null then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;
  new.organization_id := v_org;
  return new;
end;
$$;

create trigger event_registrations_org
  before insert or update of event_id on event_registrations
  for each row execute function event_registration_org();

create trigger events_touch before update on events
  for each row execute function touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table events enable row level security;
alter table event_categories enable row level security;
alter table event_registrations enable row level security;

/*
 * O anônimo lê evento **publicado**, e só. É o que faz a página pública
 * existir sem conta: quem recebe o link vê a corrida antes de se inscrever.
 * Rascunho e cancelado ficam fora — rascunho é trabalho em andamento, e
 * anunciar cancelado como se estivesse de pé é pior que não anunciar.
 */
create policy events_public_read on events
  for select using (status = 'PUBLISHED');
create policy events_staff_read on events
  for select using (is_org_staff(organization_id));
create policy events_staff_write on events
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy event_categories_public_read on event_categories
  for select using (
    exists (select 1 from events e where e.id = event_id and e.status = 'PUBLISHED')
  );
create policy event_categories_staff_write on event_categories
  for all using (
    exists (select 1 from events e where e.id = event_id and is_org_admin(e.organization_id))
  ) with check (
    exists (select 1 from events e where e.id = event_id and is_org_admin(e.organization_id))
  );

/*
 * Inscrição é dado pessoal de terceiro: nome, CPF, telefone, contato de
 * emergência. Quem lê é a equipe da academia que organiza — e a própria
 * pessoa, quando ela é aluna da casa.
 *
 * O anônimo **não tem política nenhuma** aqui, nem de leitura. Ele se inscreve
 * por `inscrever_no_evento` e consulta por `consultar_inscricao`, as duas com
 * o código em mãos. Dar `select` ao anônimo seria publicar a lista de CPF de
 * quem corre.
 */
create policy event_registrations_staff on event_registrations
  for select using (is_org_staff(organization_id));
create policy event_registrations_staff_write on event_registrations
  for all using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));
create policy event_registrations_self on event_registrations
  for select using (student_id is not null and owns_student(student_id));

-- ── Inscrever-se, com ou sem conta ───────────────────────────────────────────

/**
 * A inscrição pública, validada e contada sob trava.
 *
 * `security definer` porque quem chama pode ser anônimo e não tem — nem deve
 * ter — `insert` na tabela. A função é a única porta, e por isso ela valida
 * tudo: evento publicado, janela aberta, categoria do próprio evento, CPF com
 * onze dígitos, aceite da política registrado.
 *
 * Devolve o código de confirmação e a situação. A situação é a resposta à
 * pergunta que a pessoa tem: entrei, ou fiquei na fila?
 *
 * ── A trava ────────────────────────────────────────────────────────────────
 *
 * `for update` na linha do evento, e a contagem **depois** dela. Duas pessoas
 * tocando "inscrever" no mesmo segundo passam as duas por qualquer contagem
 * feita antes de travar, e o evento estoura o teto por um — que é o defeito
 * que a 0024 já pagou para aprender.
 *
 * ── O que ela não faz ──────────────────────────────────────────────────────
 *
 * Não cria cobrança. Não há provedor de pagamento no Synse, e lançar isto em
 * `charges` encheria o GMV da academia com dinheiro que ninguém processou. O
 * valor fica congelado na inscrição, e a baixa é `confirmar_inscricao`.
 */
create or replace function inscrever_no_evento(
  p_event_id        uuid,
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_tax_id          text,
  p_privacy_version text,
  p_category_id     uuid default null,
  p_shirt_size      text default null,
  p_emergency_name  text default null,
  p_emergency_phone text default null
)
returns table (confirmation_code text, status event_registration_status)
language plpgsql security definer set search_path = public as $$
declare
  v_evento  events%rowtype;
  v_ocupadas integer;
  v_status  event_registration_status;
  v_cpf     text := regexp_replace(coalesce(p_tax_id, ''), '[^0-9]', '', 'g');
  v_aluno   uuid;
  v_codigo  text;
begin
  if coalesce(btrim(p_privacy_version), '') = '' then
    raise exception 'A política de privacidade precisa ser aceita.' using errcode = '22023';
  end if;
  if v_cpf !~ '^[0-9]{11}$' then
    raise exception 'CPF inválido.' using errcode = '22023';
  end if;

  -- A trava vem antes de qualquer contagem. Ver a nota acima.
  select * into v_evento from events where id = p_event_id for update;
  if not found then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;
  if v_evento.status <> 'PUBLISHED' then
    raise exception 'As inscrições deste evento não estão abertas.' using errcode = '22023';
  end if;
  if v_evento.registration_opens_at is not null
     and now() < v_evento.registration_opens_at then
    raise exception 'As inscrições ainda não abriram.' using errcode = '22023';
  end if;
  if v_evento.registration_closes_at is not null
     and now() >= v_evento.registration_closes_at then
    raise exception 'As inscrições já encerraram.' using errcode = '22023';
  end if;

  if p_category_id is not null
     and not exists (
       select 1 from event_categories c where c.id = p_category_id and c.event_id = p_event_id
     ) then
    raise exception 'Categoria não é deste evento.' using errcode = '22023';
  end if;

  /*
   * Quem já está logado como aluno desta academia entra ligado à matrícula:
   * é o que faz a inscrição aparecer no app dele depois. Quem não está, entra
   * solto — e é o caso que o evento de inauguração existe para atender.
   */
  select s.id into v_aluno
  from students s
  join user_profiles u on u.id = s.user_profile_id
  where u.auth_user_id = auth.uid() and s.organization_id = v_evento.organization_id;

  /*
   * Vaga segurada é `PENDING_PAYMENT` mais `CONFIRMED`. Sem teto, ninguém
   * vai para a fila.
   */
  if v_evento.capacity is null then
    v_status := 'PENDING_PAYMENT';
  else
    select count(*) into v_ocupadas
    from event_registrations r
    where r.event_id = p_event_id
      and r.status in ('PENDING_PAYMENT', 'CONFIRMED');

    v_status := case when v_ocupadas < v_evento.capacity
                     then 'PENDING_PAYMENT'::event_registration_status
                     else 'WAITLIST'::event_registration_status end;
  end if;

  -- Evento de graça já nasce pago: não há o que esperar.
  insert into event_registrations (
    event_id, category_id, student_id, full_name, email, phone, tax_id,
    shirt_size, emergency_name, emergency_phone, status, amount,
    privacy_version, paid_at, organization_id
  ) values (
    p_event_id, p_category_id, v_aluno, btrim(p_full_name), lower(btrim(p_email)),
    btrim(p_phone), v_cpf, p_shirt_size, p_emergency_name, p_emergency_phone,
    case when v_evento.price = 0 and v_status = 'PENDING_PAYMENT'
         then 'CONFIRMED'::event_registration_status else v_status end,
    v_evento.price, btrim(p_privacy_version),
    case when v_evento.price = 0 and v_status = 'PENDING_PAYMENT' then now() end,
    v_evento.organization_id
  )
  returning event_registrations.confirmation_code, event_registrations.status
  into v_codigo, v_status;

  return query select v_codigo, v_status;
end;
$$;

revoke all on function inscrever_no_evento(uuid, text, text, text, text, text, uuid, text, text, text)
  from public;
grant execute on function inscrever_no_evento(uuid, text, text, text, text, text, uuid, text, text, text)
  to anon, authenticated, service_role;

/**
 * A inscrição de quem tem o código.
 *
 * É a única leitura que o anônimo alcança, e o código é o que a protege: 16
 * caracteres aleatórios, um por inscrição. Sem ele não há como pedir a linha
 * de ninguém — a tabela não tem política para o anônimo.
 */
create or replace function consultar_inscricao(p_code text)
returns table (
  id uuid, event_id uuid, event_title text, starts_at timestamptz,
  full_name text, status event_registration_status, amount numeric,
  category text, pix_key text, pix_holder_name text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.event_id, e.title, e.starts_at,
         r.full_name, r.status, r.amount,
         c.name, e.pix_key, e.pix_holder_name
    from event_registrations r
    join events e on e.id = r.event_id
    left join event_categories c on c.id = r.category_id
   where r.confirmation_code = p_code
$$;

revoke all on function consultar_inscricao(text) from public;
grant execute on function consultar_inscricao(text) to anon, authenticated, service_role;

/**
 * A baixa do pagamento, dada por gente.
 *
 * Enquanto não houver provedor, é um humano da academia que confere o PIX e
 * marca. Por isso ela é `security invoker`: quem pode confirmar é exatamente
 * quem a RLS deixa escrever na inscrição, e a política já diz que é o
 * administrador da academia. Guardar quem confirmou não é enfeite — é a única
 * trilha que resta quando o dinheiro é conferido fora do sistema.
 *
 * Confirmar o que já está confirmado não é erro: o segundo toque devolve a
 * mesma linha sem mexer no `paid_at`.
 */
create or replace function confirmar_inscricao(
  p_registration_id uuid,
  p_method          payment_method default null
)
returns event_registration_status
language plpgsql security invoker set search_path = public as $$
declare
  v_staff uuid;
  v_status event_registration_status;
begin
  select r.status into v_status from event_registrations r where r.id = p_registration_id;
  if not found then
    raise exception 'Inscrição não encontrada.' using errcode = 'P0002';
  end if;
  if v_status = 'CONFIRMED' then
    return v_status;
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'Inscrição cancelada não recebe baixa.' using errcode = '22023';
  end if;

  select s.id into v_staff
  from staff s
  join user_profiles u on u.id = s.user_profile_id
  join event_registrations r on r.organization_id = s.organization_id
  where r.id = p_registration_id and u.auth_user_id = auth.uid();

  update event_registrations
     set status = 'CONFIRMED',
         paid_at = now(),
         payment_method = p_method,
         confirmed_by_staff_id = v_staff
   where id = p_registration_id
  returning status into v_status;

  -- A RLS recusou a escrita: nenhuma linha voltou.
  if v_status is null then
    raise exception 'Sem permissão para confirmar esta inscrição.' using errcode = '42501';
  end if;

  return v_status;
end;
$$;

revoke all on function confirmar_inscricao(uuid, payment_method) from public, anon;
grant execute on function confirmar_inscricao(uuid, payment_method) to authenticated, service_role;

insert into schema_migrations (version) values ('0056_eventos.sql') on conflict do nothing;
