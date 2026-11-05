-- =============================================================================
-- SynseHub · 0001 — Núcleo: identidade, organizações, alunos, planos
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ── Enums ────────────────────────────────────────────────────────────────────
create type user_role as enum (
  'SUPER_ADMIN','OWNER','MANAGER','RECEPTIONIST','TRAINER','NUTRITIONIST','STUDENT','PROFESSIONAL'
);
create type organization_type as enum ('GYM','NETWORK','BRANCH','CLINIC','STUDIO','BOX','COMPANY');
create type organization_status as enum ('ACTIVE','TRIALING','SUSPENDED','CANCELLED');
create type hub_plan_tier as enum ('START','PRO','PREMIUM','NETWORK');
create type member_status as enum ('ACTIVE','INVITED','SUSPENDED');
create type student_status as enum ('ACTIVE','INACTIVE','OVERDUE','PENDING','CANCELLED');
create type billing_cycle as enum ('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM');
create type membership_status as enum ('ACTIVE','PAUSED','CANCELLED');
create type gender_type as enum ('FEMALE','MALE','OTHER','UNDISCLOSED');

-- ── Synse ID ─────────────────────────────────────────────────────────────────
-- Identificador público não sequencial (Crockford base32 sem I/L/O/U).
create or replace function generate_synse_id() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'SYN-' || result;
end;
$$;

-- ── Perfis ───────────────────────────────────────────────────────────────────
create table user_profiles (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users(id) on delete set null,
  synse_id       text unique not null default generate_synse_id(),
  name           text not null,
  email          citext not null,
  avatar_url     text,
  phone          text,
  birth_date     date,
  gender         gender_type,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint synse_id_format check (synse_id ~ '^SYN-[0-9A-HJKMNP-TV-Z]{8}$')
);
create index user_profiles_email_idx on user_profiles (email);

-- ── Organizações ─────────────────────────────────────────────────────────────
create table organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text unique not null,
  type                 organization_type not null default 'GYM',
  parent_id            uuid references organizations(id) on delete set null, -- redes/filiais
  legal_name           text,
  tax_id               text,
  logo_url             text,
  city                 text,
  state                text,
  timezone             text not null default 'America/Sao_Paulo',
  hub_plan             hub_plan_tier not null default 'START',
  status               organization_status not null default 'TRIALING',
  onboarding_completed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index organizations_parent_idx on organizations (parent_id);

create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_profile_id  uuid not null references user_profiles(id) on delete cascade,
  role             user_role not null,
  status           member_status not null default 'ACTIVE',
  job_title        text,
  created_at       timestamptz not null default now(),
  unique (organization_id, user_profile_id)
);
create index organization_members_user_idx on organization_members (user_profile_id);
create index organization_members_org_idx on organization_members (organization_id);

create table organization_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  brand_color     text,
  checkin_qr_secret text not null default encode(gen_random_bytes(24), 'hex'),
  business_hours  jsonb not null default '{}'::jsonb,
  features        jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now()
);

-- Taxas da plataforma por organização. NUNCA hard-code no código.
create table organization_billing_settings (
  organization_id             uuid primary key references organizations(id) on delete cascade,
  platform_fee_percentage     numeric(5,2) not null default 2.00,
  platform_fixed_fee          numeric(10,2) not null default 0.00,
  payment_provider_fee_strategy text not null default 'ORGANIZATION_ABSORBS'
    check (payment_provider_fee_strategy in ('PLATFORM_ABSORBS','ORGANIZATION_ABSORBS','CUSTOMER_ABSORBS')),
  updated_at                  timestamptz not null default now()
);

-- ── Equipe ───────────────────────────────────────────────────────────────────
create table staff (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_profile_id  uuid not null references user_profiles(id) on delete cascade,
  role             user_role not null,
  registration_number text,               -- CREF / CRN
  specialties      text[] not null default '{}',
  status           member_status not null default 'ACTIVE',
  created_at       timestamptz not null default now(),
  unique (organization_id, user_profile_id)
);
create index staff_org_idx on staff (organization_id);

-- ── Planos e alunos ──────────────────────────────────────────────────────────
create table membership_plans (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  name               text not null,
  description        text,
  price              numeric(10,2) not null check (price >= 0),
  billing_cycle      billing_cycle not null default 'MONTHLY',
  enrollment_fee     numeric(10,2) not null default 0,
  weekly_access_days smallint check (weekly_access_days between 1 and 7),
  benefits           text[] not null default '{}',
  auto_charge        boolean not null default true,
  status             text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index membership_plans_org_idx on membership_plans (organization_id);

create table students (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_profile_id  uuid not null references user_profiles(id) on delete cascade,
  status           student_status not null default 'ACTIVE',
  goal             text,
  enrolled_at      date not null default current_date,
  -- Data de saída: alimenta o relatório de cancelamentos e a retenção.
  cancelled_at     date,
  trainer_id       uuid references staff(id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_profile_id)
);
create index students_org_status_idx on students (organization_id, status);
create index students_trainer_idx on students (trainer_id);

create table memberships (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  plan_id          uuid not null references membership_plans(id) on delete restrict,
  price            numeric(10,2) not null check (price >= 0),
  billing_day      smallint not null default 5 check (billing_day between 1 and 28),
  started_at       date not null default current_date,
  ends_at          date,
  status           membership_status not null default 'ACTIVE',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index memberships_org_idx on memberships (organization_id);
create index memberships_student_idx on memberships (student_id);

-- `students.membership_id` é derivado: a matrícula ativa mais recente.
create view student_active_memberships as
  select distinct on (student_id) id as membership_id, student_id, plan_id, price, billing_day, status
  from memberships
  where status = 'ACTIVE'
  order by student_id, started_at desc;

-- ── updated_at automático ────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'user_profiles','organizations','membership_plans','students','memberships'
  ] loop
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t || '_updated', t
    );
  end loop;
end;
$$;
