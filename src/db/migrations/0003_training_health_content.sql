-- =============================================================================
-- SynseHub · 0003 — Check-in, treinos, avaliações, nutrição, conteúdo, CRM
-- =============================================================================

create type muscle_group as enum
  ('CHEST','BACK','LEGS','SHOULDERS','ARMS','CORE','GLUTES','CARDIO','FULL_BODY');
create type checkin_method as enum ('QR_CODE','MANUAL','APP','TURNSTILE');
create type content_type as enum ('ARTICLE','EBOOK','VIDEO','RECIPE','GUIDE','PROGRAM','CHALLENGE');
create type content_visibility as enum ('FREE','ORGANIZATION','SYNSE_PLUS');
create type lead_stage as enum ('NEW','CONTACTED','TRIAL_CLASS','PROPOSAL','ENROLLED','LOST');

-- ── Check-in ─────────────────────────────────────────────────────────────────
create table check_ins (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  checked_in_at   timestamptz not null default now(),
  method          checkin_method not null default 'QR_CODE',
  device_id       text,
  registered_by   uuid references staff(id) on delete set null
);
create index check_ins_org_time_idx on check_ins (organization_id, checked_in_at desc);
create index check_ins_student_idx on check_ins (student_id, checked_in_at desc);

-- ── Treinos ──────────────────────────────────────────────────────────────────
-- organization_id nulo = exercício da biblioteca global Synse.
create table exercises (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  name            text not null,
  muscle_group    muscle_group not null,
  equipment       text,
  description     text,
  video_url       text,
  image_url       text,
  created_at      timestamptz not null default now()
);
create index exercises_group_idx on exercises (muscle_group);

create table workout_plans (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  name                 text not null,
  goal                 text,
  split_label          text not null default 'A',
  created_by_staff_id  uuid references staff(id) on delete set null,
  status               text not null default 'PUBLISHED'
                         check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  created_at           timestamptz not null default now()
);
create index workout_plans_org_idx on workout_plans (organization_id);

create table workout_exercises (
  id               uuid primary key default gen_random_uuid(),
  workout_plan_id  uuid not null references workout_plans(id) on delete cascade,
  exercise_id      uuid not null references exercises(id) on delete restrict,
  position         smallint not null default 1,
  sets             smallint not null default 3,
  reps             text not null default '12',
  rest_seconds     smallint not null default 60,
  suggested_load   numeric(6,2),
  notes            text
);
create index workout_exercises_plan_idx on workout_exercises (workout_plan_id, position);

create table workout_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  workout_plan_id  uuid not null references workout_plans(id) on delete cascade,
  student_id       uuid not null references students(id) on delete cascade,
  assigned_at      timestamptz not null default now(),
  valid_until      date,
  unique (workout_plan_id, student_id)
);
create index workout_assignments_student_idx on workout_assignments (student_id);

create table workout_logs (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  student_id          uuid not null references students(id) on delete cascade,
  workout_plan_id     uuid references workout_plans(id) on delete set null,
  workout_exercise_id uuid references workout_exercises(id) on delete set null,
  performed_at        timestamptz not null default now(),
  load                numeric(6,2),
  reps                smallint,
  sets                smallint,
  rpe                 smallint check (rpe between 1 and 10),
  notes               text
);
create index workout_logs_student_time_idx on workout_logs (student_id, performed_at desc);

-- ── Avaliações físicas (dado de saúde — acesso restrito) ─────────────────────
create table assessments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  student_id            uuid not null references students(id) on delete cascade,
  assessed_by_staff_id  uuid references staff(id) on delete set null,
  assessed_at           date not null default current_date,
  weight                numeric(5,2),
  height                numeric(5,2),
  bmi                   numeric(5,2),
  body_fat_percentage   numeric(5,2),
  chest                 numeric(5,2),
  arm                   numeric(5,2),
  waist                 numeric(5,2),
  abdomen               numeric(5,2),
  hip                   numeric(5,2),
  thigh                 numeric(5,2),
  calf                  numeric(5,2),
  notes                 text,
  created_at            timestamptz not null default now()
);
create index assessments_student_idx on assessments (student_id, assessed_at desc);

-- ── Nutrição (somente profissional habilitado publica) ───────────────────────
create table nutrition_plans (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references organizations(id) on delete cascade,
  student_id            uuid not null references students(id) on delete cascade,
  -- Autoria obrigatória: plano individual só existe com profissional responsável.
  author_staff_id       uuid not null references staff(id) on delete restrict,
  title                 text not null,
  version               smallint not null default 1,
  status                text not null default 'DRAFT'
                          check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  published_at          timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  unique (student_id, version)
);

create table meals (
  id                uuid primary key default gen_random_uuid(),
  nutrition_plan_id uuid not null references nutrition_plans(id) on delete cascade,
  name              text not null,
  time_of_day       time,
  position          smallint not null default 1
);

create table meal_items (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references meals(id) on delete cascade,
  description text not null,
  quantity    text,
  calories    numeric(7,2)
);

create table nutrition_notes (
  id                uuid primary key default gen_random_uuid(),
  nutrition_plan_id uuid not null references nutrition_plans(id) on delete cascade,
  author_staff_id   uuid not null references staff(id) on delete restrict,
  note              text not null,
  created_at        timestamptz not null default now()
);

-- ── Biblioteca Synse: receitas, conteúdo, programas, desafios ────────────────
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  image_url     text,
  description   text,
  ingredients   text[] not null default '{}',
  instructions  text,
  prep_minutes  smallint,
  servings      smallint,
  category      text not null,
  nutrition_facts jsonb,
  tags          text[] not null default '{}',
  visibility    content_visibility not null default 'FREE',
  created_at    timestamptz not null default now()
);

create table content_library (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  type            content_type not null,
  title           text not null,
  summary         text,
  body            text,
  cover_url       text,
  media_url       text,
  visibility      content_visibility not null default 'FREE',
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index content_library_visibility_idx on content_library (visibility, published_at desc);

create table programs (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,      -- SYNSE_21, SYNSE_30, SYNSE_60, SYNSE_90
  title        text not null,
  description  text,
  duration_days smallint not null,
  cover_url    text,
  visibility   content_visibility not null default 'SYNSE_PLUS',
  created_at   timestamptz not null default now()
);

create table program_steps (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references programs(id) on delete cascade,
  day_number  smallint not null,
  title       text not null,
  tasks       jsonb not null default '[]'::jsonb,
  content_id  uuid references content_library(id) on delete set null,
  unique (program_id, day_number)
);

create table program_enrollments (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references programs(id) on delete cascade,
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  started_at      date not null default current_date,
  current_day     smallint not null default 1,
  completed_days  smallint[] not null default '{}',
  status          text not null default 'ACTIVE'
                    check (status in ('ACTIVE','COMPLETED','ABANDONED')),
  unique (program_id, user_profile_id)
);

create table challenges (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  title           text not null,
  description     text,
  metric          text not null,          -- CHECKINS, STEPS, HYDRATION…
  target_value    numeric(10,2) not null,
  starts_at       date not null,
  ends_at         date not null,
  -- Ranking é opt-in: métrica pessoal nunca aparece sem consentimento.
  ranking_enabled boolean not null default false,
  created_at      timestamptz not null default now()
);

create table challenge_participants (
  id               uuid primary key default gen_random_uuid(),
  challenge_id     uuid not null references challenges(id) on delete cascade,
  user_profile_id  uuid not null references user_profiles(id) on delete cascade,
  progress_value   numeric(10,2) not null default 0,
  ranking_opt_in   boolean not null default false,
  joined_at        timestamptz not null default now(),
  unique (challenge_id, user_profile_id)
);

-- ── CRM ──────────────────────────────────────────────────────────────────────
create table leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  phone           text,
  email           citext,
  stage           lead_stage not null default 'NEW',
  source          text not null default 'OTHER',
  owner_staff_id  uuid references staff(id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index leads_org_stage_idx on leads (organization_id, stage);

-- ── Notificações ─────────────────────────────────────────────────────────────
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  category        text not null check (category in
                    ('PAYMENT','WORKOUT','GYM','CONTENT','PROGRAM','SYSTEM')),
  title           text not null,
  body            text,
  action_url      text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_profile_id, created_at desc);

-- ── LGPD: consentimento e auditoria ──────────────────────────────────────────
create table consents (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  consent_type    text not null check (consent_type in (
                    'TERMS_OF_USE','PRIVACY_POLICY','HEALTH_DATA_PROCESSING',
                    'MARKETING_COMMUNICATION','PROGRESS_PHOTOS','RANKING_VISIBILITY')),
  accepted        boolean not null,
  version         text not null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_profile_id, consent_type, version)
);

create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references user_profiles(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  metadata        jsonb not null default '{}'::jsonb,
  ip_address      inet,
  created_at      timestamptz not null default now()
);
create index audit_logs_org_time_idx on audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);

create trigger leads_updated before update on leads
  for each row execute function touch_updated_at();
