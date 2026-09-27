-- =============================================================================
-- SynseHub · 0040 — Aviso que chega com o app fechado
--
-- ── O que muda ───────────────────────────────────────────────────────────────
--
-- Até aqui o sino só funcionava para quem já tinha aberto o app — e é
-- justamente quem já abriu que não precisa ser lembrado. Esta migration guarda
-- a inscrição de push de cada aparelho para que o aviso saia de dentro do
-- navegador.
--
-- ── Uma linha por aparelho, não por pessoa ──────────────────────────────────
--
-- A mesma conta usa celular e computador, e cada um tem um `endpoint` próprio.
-- Guardar um só apagaria o outro a cada login — a pessoa pararia de receber no
-- celular por ter aberto o app no trabalho, sem nada na tela explicando.
--
-- ── O endpoint é o segredo ───────────────────────────────────────────────────
--
-- Quem tem o endpoint e as duas chaves manda notificação para aquele aparelho.
-- Não é credencial da conta, mas é capacidade de escrever na tela de alguém, e
-- por isso a tabela **não tem política de leitura**: nem a dona do aparelho lê
-- a própria linha pela API. Quem envia é o servidor, com a chave de serviço.
-- =============================================================================

create table if not exists push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  /** Para a pessoa reconhecer o aparelho numa lista, um dia. */
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_perfil_idx
  on push_subscriptions (user_profile_id);

comment on table push_subscriptions is
  'Inscrição de push por aparelho. Sem política de leitura: quem envia é o servidor.';

alter table push_subscriptions enable row level security;

/*
 * Nenhuma política. Toda leitura e escrita passa pelas funções abaixo ou pela
 * chave de serviço — é o mesmo padrão de `payment_account_secrets`, e pelo
 * mesmo motivo: o conteúdo é capacidade, não informação.
 */

/**
 * Registra (ou renova) a inscrição deste aparelho.
 *
 * O navegador troca o `endpoint` sozinho de tempos em tempos, e chama isto de
 * novo. `on conflict` atualiza em vez de duplicar — e move a inscrição para a
 * conta atual, que é o certo quando duas pessoas usam o mesmo aparelho: quem
 * está logado agora é quem recebe.
 */
create or replace function register_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid := auth_profile_id();
begin
  if v_perfil is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  if coalesce(trim(p_endpoint), '') = '' or coalesce(trim(p_p256dh), '') = ''
     or coalesce(trim(p_auth), '') = '' then
    raise exception 'Inscrição incompleta.' using errcode = '22023';
  end if;

  insert into push_subscriptions (user_profile_id, endpoint, p256dh, auth, user_agent)
  values (v_perfil, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_profile_id = v_perfil,
    p256dh          = excluded.p256dh,
    auth            = excluded.auth,
    user_agent      = excluded.user_agent,
    last_seen_at    = now();
end;
$$;

revoke all on function register_push_subscription(text, text, text, text) from public, anon;
grant execute on function register_push_subscription(text, text, text, text)
  to authenticated, service_role;

/**
 * Desliga o aviso neste aparelho.
 *
 * Só apaga a linha de quem está pedindo: sem isso, conhecer o endpoint alheio
 * — que é exatamente o que um aparelho emprestado revela — bastaria para
 * silenciar a conta de outra pessoa.
 */
create or replace function remove_push_subscription(p_endpoint text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid := auth_profile_id();
begin
  if v_perfil is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  delete from push_subscriptions
   where endpoint = p_endpoint and user_profile_id = v_perfil;
end;
$$;

revoke all on function remove_push_subscription(text) from public, anon;
grant execute on function remove_push_subscription(text) to authenticated, service_role;

/**
 * Este aparelho está inscrito, e é desta conta?
 *
 * A tela precisa saber se mostra "ativado" ou "ativar", e não pode ler a
 * tabela. Devolve booleano e nada mais — o endpoint já é conhecido por quem
 * pergunta, porque é o do próprio navegador.
 */
create or replace function has_push_subscription(p_endpoint text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from push_subscriptions
    where endpoint = p_endpoint and user_profile_id = auth_profile_id()
  )
$$;

revoke all on function has_push_subscription(text) from public, anon;
grant execute on function has_push_subscription(text) to authenticated, service_role;

insert into schema_migrations (version) values ('0040_push.sql') on conflict do nothing;
