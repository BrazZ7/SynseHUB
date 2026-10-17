-- =============================================================================
-- SynseHub · 0036 — A assinatura do Synse+
--
-- A 0014 criou `user_profiles.tier`, que responde uma pergunta só: a conta é
-- FREE ou PRO, agora. O modelo do produto pede outra:
--
--   "Uma assinatura só. O primeiro ciclo custa R$ 0,00, e no fim dele renova
--    sozinha pelo valor cheio — até a pessoa cancelar."
--
-- Isso não cabe num sinalizador sem data. Sem saber **até quando** o acesso
-- vale, não há como distinguir quem está no teste de quem já paga, não há
-- quando cobrar, e não há o que dizer na tela além de "você é Synse+".
--
-- ── O que esta migration faz, e o que deliberadamente não faz ────────────────
--
-- Faz: guarda o estado da assinatura e a data em que o ciclo corrente termina.
-- Não faz: cobrança. Quem cobra é o provedor de pagamento — e qual provedor
-- depende de a venda acontecer na web (Asaas) ou dentro do app das lojas (onde
-- a compra é obrigatoriamente do próprio sistema da loja). Essa decisão ainda
-- não foi tomada, e modelar o ciclo de cobrança antes dela seria escrever uma
-- estrutura para jogar fora.
--
-- Por isso `plus_provider` e `plus_provider_ref` entram nulas: é onde o id da
-- assinatura do provedor vai morar quando existir, sem exigir outra migration.
--
-- ── Por que colunas, e não uma tabela de assinaturas ─────────────────────────
--
-- O histórico de cobrança é do provedor, não nosso: ele já guarda ciclo,
-- tentativa, falha e recibo, e duplicar isso aqui criaria duas verdades que
-- divergem no primeiro estorno. O que a aplicação precisa saber é uma linha
-- só — esta conta tem Synse+ até quando —, e isso é atributo da conta.
--
-- ── A trava é `guard_paid_columns`, da 0015 ──────────────────────────────────
--
-- E não `guard_user_tier`, que a 0014 criou e a 0015 apagou. A distinção custou
-- uma rodada: recriar o nome antigo produz uma função que nenhum gatilho
-- executa, o SQL sobe sem erro, e as colunas novas ficam abertas. Sem a trava
-- certa, um `update` do próprio cliente grava `plus_until` dez anos à frente —
-- Synse+ vitalício de graça, com uma requisição.
-- =============================================================================

alter table user_profiles
  add column if not exists plus_status text not null default 'NONE'
    check (plus_status in ('NONE', 'TRIAL', 'ACTIVE', 'CANCELED', 'EXPIRED')),
  /*
   * Fim do ciclo corrente. É a data que manda: em TRIAL é quando a primeira
   * cobrança acontece, em ACTIVE é quando renova, e em CANCELED é até quando o
   * acesso já pago continua valendo — cancelar interrompe a renovação seguinte,
   * não o período em curso, que é o que os Termos já prometem.
   */
  add column if not exists plus_until timestamptz,
  /** 'ASAAS', 'APPLE', 'GOOGLE' — nulo enquanto a venda não existe. */
  add column if not exists plus_provider text,
  /** O id da assinatura no provedor, para conciliar o webhook com a conta. */
  add column if not exists plus_provider_ref text;

comment on column user_profiles.plus_status is
  'Estado da assinatura Synse+. TRIAL é o primeiro ciclo, cobrado R$ 0,00.';
comment on column user_profiles.plus_until is
  'Fim do ciclo corrente: quando cobra, quando renova, ou até quando vale o já pago.';

-- ── A trava ──────────────────────────────────────────────────────────────────

/*
 * A trava é `guard_paid_columns`, criada pela 0015 — **não** `guard_user_tier`.
 *
 * Isto não é detalhe de nomenclatura, e eu errei aqui antes de o teste pegar.
 * A 0014 criou `guard_user_tier`; a 0015 apagou função e gatilho e pôs
 * `guard_paid_columns` no lugar, porque passou a cobrir duas colunas pagas.
 * Recriar o nome antigo produz uma função que **nenhum gatilho executa**: o
 * SQL sobe sem erro, a trava parece estar lá, e as colunas novas ficam
 * abertas. Foi exatamente o que aconteceu — um `update` do próprio cliente
 * gravou `plus_until` dez anos à frente, e o banco aceitou.
 *
 * Quem confere o que está no ar é `tests/db/assinatura-plus.test.ts`, não o
 * nome da função nesta migration.
 */
create or replace function guard_paid_columns() returns trigger
language plpgsql as $$
begin
  if (
       new.tier              is distinct from old.tier
    or new.professional_plan is distinct from old.professional_plan
    or new.plus_status       is distinct from old.plus_status
    or new.plus_until        is distinct from old.plus_until
    or new.plus_provider     is distinct from old.plus_provider
    or new.plus_provider_ref is distinct from old.plus_provider_ref
     )
     and coalesce(current_setting('synse.allow_tier_change', true), '') <> '1'
  then
    raise exception 'A assinatura da conta não é editável pelo cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

/*
 * O gatilho é recriado porque um banco que nunca recebeu a 0015 — ou que a
 * recebeu antes de ela ser revisada — pode estar com o gatilho antigo. Recriar
 * é barato e fecha essa porta.
 */
drop trigger if exists user_profiles_guard_paid on user_profiles;
create trigger user_profiles_guard_paid
  before update on user_profiles
  for each row execute function guard_paid_columns();

-- ── A única porta ────────────────────────────────────────────────────────────

/**
 * Grava o estado da assinatura, e o `tier` junto.
 *
 * `tier` deixa de ser escrito à mão e passa a ser consequência: TRIAL e ACTIVE
 * dão PRO, o resto dá FREE. Manter os dois editáveis em separado garantiria,
 * mais cedo ou mais tarde, uma conta com `plus_status = 'EXPIRED'` e
 * `tier = 'PRO'` — e nenhuma das duas telas concordando sobre o que a pessoa
 * pode fazer.
 *
 * CANCELED é a exceção que a regra precisa: quem cancelou continua PRO até
 * `plus_until`, porque o período já pago vale até o fim. Quem expirou, não.
 */
create or replace function set_plus_subscription(
  p_profile_id   uuid,
  p_status       text,
  p_until        timestamptz default null,
  p_provider     text default null,
  p_provider_ref text default null
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_tier text;
begin
  if p_status not in ('NONE', 'TRIAL', 'ACTIVE', 'CANCELED', 'EXPIRED') then
    raise exception 'Estado de assinatura inválido: %', p_status using errcode = '22023';
  end if;

  /*
   * Estado com prazo sem prazo seria acesso sem fim: a rotina de renovação não
   * teria o que comparar, e a conta ficaria PRO para sempre por omissão.
   */
  if p_status in ('TRIAL', 'ACTIVE', 'CANCELED') and p_until is null then
    raise exception 'Assinatura em % exige data de fim de ciclo.', p_status
      using errcode = '22023';
  end if;

  v_tier := case
    when p_status in ('TRIAL', 'ACTIVE') then 'PRO'
    when p_status = 'CANCELED' and p_until > now() then 'PRO'
    else 'FREE'
  end;

  perform set_config('synse.allow_tier_change', '1', true);

  update user_profiles set
    tier              = v_tier,
    plus_status       = p_status,
    plus_until        = case when p_status in ('NONE', 'EXPIRED') then null else p_until end,
    plus_provider     = case when p_status = 'NONE' then null else coalesce(p_provider, plus_provider) end,
    plus_provider_ref = case when p_status = 'NONE' then null else coalesce(p_provider_ref, plus_provider_ref) end
  where id = p_profile_id;

  perform set_config('synse.allow_tier_change', '', true);
end;
$$;

comment on function set_plus_subscription is
  'Única porta para a assinatura Synse+. Quem chama é o provedor de pagamento, nunca a tela.';

revoke all on function set_plus_subscription(uuid, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function set_plus_subscription(uuid, text, timestamptz, text, text)
  to service_role;

/**
 * Derruba quem passou da data.
 *
 * Existe porque o acesso não pode depender de o provedor avisar: webhook se
 * perde, e uma conta que ficou PRO porque a notificação não chegou é receita
 * que não entra e recurso que sai de graça. A rotina fecha por tempo, que é a
 * única informação que não depende de ninguém.
 *
 * Não cobra nada — cobrar é do provedor. Isto só reflete o que já venceu.
 */
create or replace function expire_plus_subscriptions() returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_quantas integer;
begin
  perform set_config('synse.allow_tier_change', '1', true);

  with vencidas as (
    update user_profiles set
      tier        = 'FREE',
      plus_status = 'EXPIRED',
      plus_until  = null
    where plus_status in ('TRIAL', 'ACTIVE', 'CANCELED')
      and plus_until is not null
      and plus_until <= now()
    returning 1
  )
  select count(*)::integer into v_quantas from vencidas;

  perform set_config('synse.allow_tier_change', '', true);
  return v_quantas;
end;
$$;

comment on function expire_plus_subscriptions is
  'Fecha o acesso de quem passou da data. Não cobra — só reflete o que venceu.';

revoke all on function expire_plus_subscriptions() from public, anon, authenticated;
grant execute on function expire_plus_subscriptions() to service_role;

insert into schema_migrations (version) values ('0036_assinatura_plus.sql') on conflict do nothing;
