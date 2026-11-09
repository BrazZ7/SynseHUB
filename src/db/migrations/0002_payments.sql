-- =============================================================================
-- SynseHub · 0002 — Synse Pay: contas, cobranças, split, webhooks, régua
-- =============================================================================

create type charge_status as enum ('PENDING','PAID','OVERDUE','CANCELLED','REFUNDED','FAILED');
create type payment_method as enum (
  'PIX','PIX_AUTOMATIC','CREDIT_CARD','CREDIT_CARD_RECURRING','BOLETO','CASH'
);
create type payment_account_status as enum ('DISCONNECTED','PENDING','ACTIVE','BLOCKED');
create type onboarding_status as enum ('NOT_STARTED','IN_REVIEW','APPROVED','REJECTED');

-- ── Subconta financeira da academia ──────────────────────────────────────────
-- Nenhum dado bancário sensível é armazenado: guardamos apenas a referência
-- opaca criada no provedor.
create table payment_accounts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  provider            text not null,
  provider_account_id text,
  status              payment_account_status not null default 'DISCONNECTED',
  onboarding_status   onboarding_status not null default 'NOT_STARTED',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, provider)
);

-- ── Cobranças ────────────────────────────────────────────────────────────────
create table charges (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  membership_id      uuid references memberships(id) on delete set null,
  provider           text,
  provider_charge_id text,
  description        text not null,
  amount             numeric(10,2) not null check (amount > 0),
  due_date           date not null,
  payment_method     payment_method,
  status             charge_status not null default 'PENDING',
  paid_at            timestamptz,
  /** Idempotência de geração de mensalidade: uma cobrança por ciclo. */
  billing_reference  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, billing_reference)
);
create index charges_org_status_idx on charges (organization_id, status);
create index charges_student_idx on charges (student_id);
create index charges_due_date_idx on charges (due_date);
create unique index charges_provider_charge_idx
  on charges (provider, provider_charge_id) where provider_charge_id is not null;

-- ── Pagamentos confirmados ───────────────────────────────────────────────────
-- Só é escrito a partir de webhook validado ou consulta ao provedor.
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  charge_id           uuid not null references charges(id) on delete cascade,
  provider            text not null,
  provider_payment_id text,
  amount              numeric(10,2) not null,
  net_amount          numeric(10,2),
  method              payment_method not null,
  confirmed_at        timestamptz not null default now(),
  raw_provider_status text,
  created_at          timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_org_idx on payments (organization_id);

-- ── Split: academia × Synse ──────────────────────────────────────────────────
create table payment_splits (
  id                  uuid primary key default gen_random_uuid(),
  charge_id           uuid not null references charges(id) on delete cascade,
  payment_id          uuid references payments(id) on delete set null,
  organization_amount numeric(10,2) not null,
  platform_amount     numeric(10,2) not null,
  platform_percentage numeric(5,2) not null,
  provider_fee        numeric(10,2) not null default 0,
  status              text not null default 'PENDING' check (status in ('PENDING','SETTLED','FAILED')),
  created_at          timestamptz not null default now(),
  unique (charge_id)
);

-- ── Webhooks (idempotência) ──────────────────────────────────────────────────
create table webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  event_type   text not null,
  payload      jsonb not null,
  status       text not null default 'RECEIVED'
                 check (status in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  error_detail text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  -- Chave de idempotência: o mesmo evento nunca é processado duas vezes.
  unique (provider, event_id)
);
create index webhook_events_status_idx on webhook_events (status, received_at desc);

-- ── Régua de cobrança ────────────────────────────────────────────────────────
create table collection_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  offset_days     smallint not null check (offset_days in (-3, 0, 3, 7, 15, 30)),
  channels        text[] not null default '{PUSH,EMAIL}',
  template        text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, offset_days)
);

create table collection_attempts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  charge_id       uuid not null references charges(id) on delete cascade,
  rule_id         uuid references collection_rules(id) on delete set null,
  channel         text not null,
  sent_at         timestamptz not null default now(),
  status          text not null default 'SENT',
  note            text
);
create index collection_attempts_charge_idx on collection_attempts (charge_id);

-- ── Assinaturas ──────────────────────────────────────────────────────────────
-- SynseHub (academia paga a Synse)
create table hub_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  tier                hub_plan_tier not null,
  price               numeric(10,2) not null,
  status              text not null default 'ACTIVE'
                        check (status in ('TRIALING','ACTIVE','PAST_DUE','CANCELLED')),
  current_period_end  date,
  created_at          timestamptz not null default now(),
  unique (organization_id)
);

-- Synse+ (consumidor final paga a Synse) — separado de tudo acima.
create table consumer_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_profile_id    uuid not null references user_profiles(id) on delete cascade,
  product            text not null default 'SYNSE_PLUS',
  price              numeric(10,2) not null,
  status             text not null default 'ACTIVE'
                       check (status in ('TRIALING','ACTIVE','PAST_DUE','CANCELLED')),
  provider           text,
  provider_subscription_id text,
  current_period_end date,
  created_at         timestamptz not null default now()
);
create index consumer_subscriptions_user_idx on consumer_subscriptions (user_profile_id);

do $$
declare t text;
begin
  foreach t in array array['payment_accounts','charges'] loop
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t || '_updated', t
    );
  end loop;
end;
$$;
