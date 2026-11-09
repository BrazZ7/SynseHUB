-- =============================================================================
-- SynseHub · 0065 — As preferências de aviso
--
-- A central de notificações mostra tudo e não deixa controlar nada. Quem não
-- quer saber de cada conteúdo publicado tem duas opções hoje: aguentar, ou
-- desligar o push inteiro e perder também o aviso de cobrança.
--
-- ── Um ponto só, e ele já existia ────────────────────────────────────────────
--
-- Todo aviso do produto nasce de um gatilho no banco — matrícula, situação,
-- treino atribuído, cobrança criada, cobrança paga, vaga em aula, convite de
-- equipe, plano alimentar — e **todos passam por `notify_profiles`** (0012).
--
-- Então a preferência se aplica lá dentro, numa função só. Vale para os nove
-- emissores de hoje e para os que vierem, sem ninguém precisar lembrar: quem
-- escrever um gatilho novo chama `notify_profiles` porque é o jeito de
-- escrever aviso, e ganha o filtro de graça.
--
-- A alternativa era conferir a preferência em cada gatilho. Nove lugares para
-- acertar, e o décimo esquecido manda assim mesmo — defeito que ninguém
-- percebe, porque "recebi um aviso" não parece erro.
--
-- ── Sem linha é ligado ───────────────────────────────────────────────────────
--
-- A tabela guarda escolha, não estado. Quem nunca mexeu não tem linha e recebe
-- tudo, que é o comportamento de hoje — nenhuma conta existente muda de
-- comportamento quando esta migration entra, e não há o que preencher.
--
-- ── `SYSTEM` não entra na tela, e a razão não é técnica ──────────────────────
--
-- Nenhum gatilho emite `SYSTEM` hoje: é a categoria reservada para aviso de
-- conta e segurança. O banco aceita a preferência para ela — a trava é da
-- tela, que não a oferece —, porque uma regra no banco dizendo "esta não se
-- desliga" envelheceria junto com o primeiro aviso de segurança que alguém
-- precisasse mesmo silenciar.
--
-- Está escrito aqui para a decisão não se perder: se um dia `SYSTEM` passar a
-- carregar aviso dispensável, é a lista da tela que muda, não o banco.
--
-- ── Vale para a equipe também ────────────────────────────────────────────────
--
-- `notify_profiles` avisa aluno e staff pelo mesmo caminho — o dono recebe
-- `GYM` quando alguém entra pelo convite. O filtro não distingue, e isso é
-- certo: a recepcionista que não quer os nove avisos de matrícula por dia tem
-- o mesmo direito. A tela dela ainda não existe; a linha, se alguém gravar,
-- já funciona.
-- =============================================================================

create table notification_preferences (
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  /*
   * Texto com a mesma lista de `notifications.category`, repetida aqui em vez
   * de referenciada: criar um enum agora obrigaria a converter a coluna que já
   * existe, e a lista muda junto de qualquer jeito — as duas são conferidas
   * pelo mesmo teste.
   */
  category        text not null check (category in
                    ('PAYMENT','WORKOUT','GYM','CONTENT','PROGRAM','SYSTEM')),
  enabled         boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (user_profile_id, category)
);

-- ── O filtro, dentro do ponto único ──────────────────────────────────────────
/**
 * `notify_profiles`, agora respeitando o que a pessoa escolheu.
 *
 * Só o `where` mudou. A forma de chamar é a mesma, de propósito: os nove
 * gatilhos que já existem não são tocados, e um gatilho novo não precisa saber
 * que preferência existe.
 *
 * `not exists` e não `join`: ausência de linha é "ligado", e um `join` com a
 * tabela deixaria de fora justamente quem nunca mexeu — isto é, todo mundo.
 */
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
    and not exists (
      select 1 from notification_preferences np
      where np.user_profile_id = id
        and np.category = p_category
        and np.enabled is false
    )
$$;

/*
 * O `revoke` de novo, e **não** porque `create or replace` reabra o acesso.
 *
 * Conferido no Postgres: substituir uma função que já existe **preserva** o
 * ACL dela. O que nasce com EXECUTE para o PUBLIC é função nova — e foi isso
 * que mordeu este projeto na 0061, onde `set_plus_subscription` ganhou um
 * sétimo argumento: assinatura nova é função nova, com o grant padrão.
 *
 * Então esta linha é cinto além do suspensório. Ela custa nada e cobre o caso
 * em que alguém um dia muda a assinatura de `notify_profiles` — a função que
 * escreve aviso em nome de qualquer pessoa, e a única do projeto revogada
 * também de `authenticated`.
 */
revoke all on function notify_profiles(uuid[], uuid, text, text, text, text)
  from public, anon, authenticated;

-- ── A escolha da pessoa ──────────────────────────────────────────────────────
/**
 * Liga ou desliga uma categoria para quem está autenticado.
 *
 * Resolve o perfil por `auth.uid()`: receber o perfil do cliente deixaria
 * silenciar os avisos de outra pessoa, que é um jeito silencioso de esconder
 * cobrança de alguém.
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

  if p_category not in ('PAYMENT','WORKOUT','GYM','CONTENT','PROGRAM','SYSTEM') then
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table notification_preferences enable row level security;

/*
 * Só a própria pessoa lê, e **nem a academia**. O que alguém escolheu não
 * receber não é assunto do dono da academia: saber que o aluno silenciou
 * "cobrança" é informação para cobrar por fora, e a tela que mostrasse isso
 * seria usada para isso.
 *
 * Leitura direta; a escrita passa pela função, que é quem resolve o perfil.
 */
create policy notification_preferences_self on notification_preferences
  for select using (user_profile_id = auth_profile_id());

revoke insert, update, delete on notification_preferences from authenticated, anon;

insert into schema_migrations (version) values ('0065_preferencias_de_aviso.sql') on conflict do nothing;
