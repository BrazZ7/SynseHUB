-- =============================================================================
-- SynseHub · 0061 — A assinatura do Synse+ com três origens
--
-- A 0036 deixou `plus_provider` e `plus_provider_ref` nulas de propósito, com
-- um comentário dizendo que a decisão entre vender na web ou dentro do app das
-- lojas ainda não havia sido tomada. Foi tomada: **as duas.**
--
-- A auditoria de 17/10/2026 encontrou o Synse+ sendo vendido dentro do app por
-- assinatura recorrente no Mercado Pago, destravando só conteúdo digital — que
-- é exatamente o que Apple e Google reservam para a cobrança delas. A decisão
-- do dono do produto foi oferecer a cobrança da loja **ao lado** do Mercado
-- Pago, que é o que as duas exigem hoje no Brasil.
--
-- Isso faz `user_profiles.plus_status` ter três escritores em vez de um, e é aí
-- que mora o defeito que esta migration existe para impedir.
--
-- ── O defeito: um webhook apagando o estado do outro ─────────────────────────
--
-- `set_plus_subscription` da 0036 aceita qualquer provedor sobrescrevendo
-- qualquer outro, com `coalesce(p_provider, plus_provider)`. Com um provedor
-- só isso nunca aparece. Com três, aparece assim:
--
--   1. A pessoa assina na web. `plus_provider = 'mercadopago'`, ACTIVE.
--   2. Meses depois, a Apple manda uma notificação atrasada de uma compra
--      cancelada no ano passado — elas chegam fora de ordem, está na
--      documentação.
--   3. O estado vira EXPIRED. **A pessoa que está pagando perde o acesso.**
--
-- E o espelho, que é pior: uma renovação velha do Mercado Pago reativando uma
-- assinatura que a pessoa já cancelou na App Store. Synse+ de graça, sem
-- ninguém perceber, até a conciliação de receita de algum mês não fechar.
--
-- ── Como esta migration resolve ──────────────────────────────────────────────
--
-- Três regras, em ordem de precedência:
--
-- **1. Fora de ordem não escreve.** `plus_event_at` guarda o horário do evento
-- *na origem*, não o nosso. Notificação mais velha que a última aplicada é
-- descartada e a função devolve 'STALE'. Resolve o caso 2 acima.
--
-- **2. Quem não é dono não mexe.** Se existe assinatura viva de um provedor,
-- escrita de outro **não é aplicada**: a função devolve 'CONFLICT' e registra
-- em `plus_subscription_conflicts`. Resolve o espelho.
--
-- **3. Compra nova é dona, e ganha.** `p_takeover` separa "a loja me avisou de
-- uma mudança" de "a pessoa acabou de comprar aqui". Compra sempre é aplicada,
-- mesmo havendo assinatura viva em outro provedor.
--
-- A regra 3 existe por uma razão específica, e ela é a mais importante das
-- três: **negar a compra depois de a loja cobrar é tirar dinheiro de alguém e
-- não entregar nada.** A pessoa que assinou na web, esqueceu, e assinou de
-- novo pela App Store pagou duas vezes — e das duas, a única que o Synse não
-- consegue cancelar é a da loja. Então o acesso segue a compra mais recente, e
-- a cobrança duplicada vira uma linha numa tabela que alguém tem de olhar.
--
-- Impedir de verdade a compra dupla é trabalho da tela e do servidor **antes**
-- de abrir a loja, não daqui — e é por isso que o conflito é registrado em vez
-- de ignorado: ele é a medida de quantas vezes aquela trava falhou.
-- =============================================================================

-- ── Os nomes dos provedores ──────────────────────────────────────────────────

/*
 * Minúsculas, porque é o que `PaymentProvider.id` já usa — `'mercadopago'` em
 * `src/lib/payments/providers/mercadopago/index.ts:80`. O comentário da 0036
 * previa `'ASAAS', 'APPLE', 'GOOGLE'` em maiúsculas e ficou desatualizado nos
 * dois sentidos: o Asaas saiu do projeto e a caixa é outra. Vale o código.
 *
 * A lista é fechada de propósito: `plus_provider` escrito com um nome que a
 * conciliação não conhece é receita que ninguém acha depois.
 *
 * Sem `not valid` nem backfill: a produção foi consultada antes desta
 * migration e tem 545 perfis, todos em `plus_status = 'NONE'` com
 * `plus_provider` nulo. Ninguém nunca assinou, então não há dado para migrar.
 */
alter table user_profiles
  drop constraint if exists user_profiles_plus_provider_check;

alter table user_profiles
  add constraint user_profiles_plus_provider_check
    check (plus_provider is null or plus_provider in ('mercadopago', 'apple', 'google'));

-- ── O horário do evento na origem ────────────────────────────────────────────

alter table user_profiles
  /*
   * O horário que a origem informa, não `now()`. A diferença é o ponto: a
   * Apple documenta que as notificações da App Store Server **podem chegar
   * fora de ordem**, e o Google também reenvia pelo Pub/Sub. Ordenar pelo
   * nosso horário de recebimento ordena a entrega, não os fatos.
   *
   * Nulo é permitido porque a 0036 não tinha a coluna: perfil que nunca
   * recebeu escrita nenhuma não tem horário, e a primeira escrita passa.
   */
  add column if not exists plus_event_at timestamptz;

comment on column user_profiles.plus_event_at is
  'Horário do evento na origem (não o de recebimento). Descarta notificação fora de ordem.';

-- ── Onde a cobrança duplicada aparece ────────────────────────────────────────

create table if not exists plus_subscription_conflicts (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references user_profiles(id) on delete cascade,
  /** Quem era o dono quando o conflito apareceu. */
  provider_atual   text not null check (provider_atual in ('mercadopago', 'apple', 'google')),
  /** Quem tentou escrever. */
  provider_novo    text not null check (provider_novo in ('mercadopago', 'apple', 'google')),
  /** O que a função fez: 'RECUSADO' (regra 2) ou 'ASSUMIDO' (regra 3). */
  desfecho         text not null check (desfecho in ('RECUSADO', 'ASSUMIDO')),
  /** O estado que o provedor novo pediu, para quem for conciliar entender. */
  status_pedido    text not null,
  detectado_em     timestamptz not null default now(),
  /*
   * Preenchido à mão por quem cancelar a assinatura sobrando. Nulo é fila de
   * trabalho: `where resolvido_em is null` é a pergunta "o que falta
   * resolver", e é assim que isto deixa de ser uma tabela que só cresce.
   */
  resolvido_em     timestamptz,
  resolucao        text
);

create index if not exists plus_conflicts_abertos_idx
  on plus_subscription_conflicts (detectado_em desc)
  where resolvido_em is null;

create index if not exists plus_conflicts_perfil_idx
  on plus_subscription_conflicts (profile_id);

comment on table plus_subscription_conflicts is
  'Cobrança duplicada do Synse+: a pessoa tem assinatura viva em mais de uma origem.';

-- ── RLS: ninguém, a não ser o servidor ───────────────────────────────────────

/*
 * RLS ligada **sem política nenhuma**, e isso é a política: no Postgres, tabela
 * com RLS e sem policy nega tudo para quem não é `service_role` nem dono da
 * tabela. Então nem o aluno, nem a academia, nem o dono da plataforma leem
 * daqui pelo cliente.
 *
 * É deliberado, e não preguiça de escrever policy: cada linha aqui diz que uma
 * pessoa específica está pagando duas vezes pelo mesmo produto. Isso é dado
 * financeiro de quem não é cliente de nenhuma academia — o Synse+ é relação
 * direta com a pessoa —, e a tela que vai mostrar isso ainda não existe.
 * Quando existir, ela entra por `service_role` numa rota de servidor, com a
 * policy escrita na migration que criar a tela.
 */
alter table plus_subscription_conflicts enable row level security;

revoke all on table plus_subscription_conflicts from public, anon, authenticated;

-- ── A única porta, agora com três donos possíveis ────────────────────────────

/*
 * `drop` antes de `create`, e não `create or replace`: a assinatura da função
 * muda (dois parâmetros novos e retorno `text` em vez de `void`), e o Postgres
 * recusa trocar o tipo de retorno em `replace`. Deixar as duas conviver seria
 * pior do que recusar: o PostgREST resolve por nome e lista de argumentos, e
 * `admin.rpc('set_plus_subscription', {...})` com cinco parâmetros acharia a
 * antiga — a que não tem nenhuma das três regras acima.
 */
drop function if exists set_plus_subscription(uuid, text, timestamptz, text, text);

create or replace function set_plus_subscription(
  p_profile_id   uuid,
  p_status       text,
  p_until        timestamptz default null,
  p_provider     text default null,
  p_provider_ref text default null,
  /** Horário do evento na origem. Nulo desliga a regra 1 para esta chamada. */
  p_event_at     timestamptz default null,
  /** `true` só no caminho de compra. Ver a regra 3 no cabeçalho. */
  p_takeover     boolean default false
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_tier          text;
  v_atual         record;
  v_dono_vivo     boolean;
  v_desfecho      text;
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

  if p_provider is not null and p_provider not in ('mercadopago', 'apple', 'google') then
    raise exception 'Provedor de assinatura desconhecido: %', p_provider using errcode = '22023';
  end if;

  /*
   * `for update` porque duas notificações do mesmo perfil podem chegar juntas
   * — a Apple e o Google reenviam, e dois processos da Vercel atendem em
   * paralelo. Sem a trava, as regras 1 e 2 leem o estado de antes das duas e
   * aplicam as duas.
   */
  select plus_status, plus_until, plus_provider, plus_event_at
    into v_atual
    from user_profiles
   where id = p_profile_id
     for update;

  if not found then
    raise exception 'Perfil % não existe.', p_profile_id using errcode = '23503';
  end if;

  -- ── Regra 1: fora de ordem não escreve ─────────────────────────────────────
  if p_event_at is not null
     and v_atual.plus_event_at is not null
     and p_event_at <= v_atual.plus_event_at
  then
    return 'STALE';
  end if;

  -- ── Regras 2 e 3: quem é o dono ────────────────────────────────────────────
  v_dono_vivo := v_atual.plus_provider is not null
    and (
      v_atual.plus_status in ('TRIAL', 'ACTIVE')
      or (v_atual.plus_status = 'CANCELED'
          and v_atual.plus_until is not null
          and v_atual.plus_until > now())
    );

  if v_dono_vivo
     and p_provider is not null
     and p_provider <> v_atual.plus_provider
  then
    v_desfecho := case when p_takeover then 'ASSUMIDO' else 'RECUSADO' end;

    insert into plus_subscription_conflicts
      (profile_id, provider_atual, provider_novo, desfecho, status_pedido)
    values
      (p_profile_id, v_atual.plus_provider, p_provider, v_desfecho, p_status);

    /*
     * Recusado devolve sem escrever. A assinatura viva continua de pé, e quem
     * tentou escrever fica registrado — é o caso da renovação velha de um
     * provedor que a pessoa já abandonou.
     */
    if not p_takeover then
      return 'CONFLICT';
    end if;
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
    plus_provider_ref = case when p_status = 'NONE' then null else coalesce(p_provider_ref, plus_provider_ref) end,
    /*
     * `coalesce` e não sobrescrita: chamada sem `p_event_at` — a rotina de
     * expiração, um acerto à mão — não pode apagar o horário que a regra 1
     * usa. Apagar faria a próxima notificação atrasada passar.
     */
    plus_event_at     = coalesce(p_event_at, plus_event_at)
  where id = p_profile_id;

  perform set_config('synse.allow_tier_change', '', true);
  return 'APPLIED';
end;
$$;

comment on function set_plus_subscription is
  'Única porta da assinatura Synse+, com três origens. Devolve APPLIED, STALE ou CONFLICT.';

revoke all on function set_plus_subscription(uuid, text, timestamptz, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function set_plus_subscription(uuid, text, timestamptz, text, text, timestamptz, boolean)
  to service_role;

-- ── A trava das colunas pagas, com a coluna nova ─────────────────────────────

/*
 * `plus_event_at` entra na trava da 0015 pelo mesmo motivo das outras: um
 * `update` do próprio cliente gravando `plus_event_at` no ano 2100 faria **toda
 * notificação futura ser descartada pela regra 1**. A assinatura congelaria no
 * estado em que está — inclusive em ACTIVE, de graça, para sempre.
 *
 * É a forma mais discreta de burlar o pagamento neste arquivo, e só existe
 * porque a coluna nova é usada numa decisão. Por isso ela nasce junto com a
 * trava, e não numa migration seguinte.
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
    or new.plus_event_at     is distinct from old.plus_event_at
     )
     and coalesce(current_setting('synse.allow_tier_change', true), '') <> '1'
  then
    raise exception 'A assinatura da conta não é editável pelo cliente.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_guard_paid on user_profiles;
create trigger user_profiles_guard_paid
  before update on user_profiles
  for each row execute function guard_paid_columns();

insert into schema_migrations (version) values ('0061_assinatura_de_tres_origens.sql') on conflict do nothing;
