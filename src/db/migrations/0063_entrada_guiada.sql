-- =============================================================================
-- SynseHub · 0063 — A entrada guiada do aluno
--
-- O app do aluno abre direto na tela de hoje, e nunca perguntou nada. O
-- resultado é que o Synse não sabe por que a pessoa está ali: se quer emagrecer
-- ou ganhar massa, se nunca treinou ou está voltando depois de dois anos, se
-- tem três dias por semana ou seis.
--
-- Sem isso, o planejamento semanal não tem contra o que planejar e o resumo
-- semanal não tem o que comparar. É por isso que esta vem antes das duas.
--
-- ── Por que não reaproveitar `students.goal` ─────────────────────────────────
--
-- Porque o autor é outro. `goal` é texto livre preenchido **pela academia** no
-- cadastro, no hub — é a anotação de quem matriculou. O que entra aqui é o que
-- a pessoa diz sobre si, e sobrescrever um com o outro apagaria a observação do
-- professor ou poria palavra na boca do aluno.
--
-- É a mesma separação da 0062: relato de saúde com autor errado não é dado, é
-- ruído. Os dois convivem, e a ficha mostra os dois lado a lado.
--
-- ── Três perguntas, e o teto é esse ──────────────────────────────────────────
--
-- Objetivo, experiência e dias por semana. Um toque cada.
--
-- A tentação é perguntar mais na única hora em que a pessoa está disposta a
-- responder: lesões, horário preferido, equipamento em casa, peso atual. A
-- 0062 já ensinou o preço disso — cada campo a mais é gente que abandona, e
-- entrada guiada que ninguém termina não alimenta planejamento nenhum. O resto
-- se pergunta quando for usar.
--
-- **Quais dias** da semana ficou de fora de propósito, e não por esquecimento:
-- ele só vira dado útil quando existir o planejamento semanal para consumi-lo,
-- e escolher sete caixinhas é a pergunta mais cansativa das quatro. Entra com
-- a funcionalidade que precisa dela.
--
-- ── Pular é um estado, não a ausência de resposta ────────────────────────────
--
-- `skipped_at` existe para a porta do `/app` saber a diferença entre "ainda não
-- perguntei" e "já perguntei e a pessoa disse depois". Sem ele a tela voltaria
-- a cada abertura, que é como se transforma uma boa-vinda em obstáculo.
--
-- Quem pulou e responde depois tem `skipped_at` limpo: a resposta vale mais que
-- a recusa anterior.
-- =============================================================================

create type student_goal as enum (
  'EMAGRECER',
  'GANHAR_MASSA',
  'CONDICIONAMENTO',
  'SAUDE'
);

create type student_experience as enum (
  'NUNCA_TREINEI',
  'VOLTANDO',
  'TREINO_SEMPRE'
);

create table student_intake (
  /*
   * Uma entrada por matrícula, e não por pessoa. Quem treina em duas academias
   * tem dois objetivos possíveis — musculação numa, natação noutra — e a ficha
   * que o professor abre é a da academia dele.
   */
  student_id      uuid primary key references students(id) on delete cascade,
  -- Da matrícula, preenchido pela função. Deixa a RLS ser direta, como em 0062.
  organization_id uuid not null references organizations(id) on delete cascade,
  /*
   * Nulos enquanto a pessoa não respondeu: a linha nasce no "pular" também, e
   * é ela que guarda a recusa.
   */
  goal            student_goal,
  experience      student_experience,
  days_per_week   smallint check (days_per_week between 1 and 7),
  completed_at    timestamptz,
  skipped_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  /*
   * Respondido é respondido inteiro.
   *
   * Sem esta trava dava para existir `completed_at` com objetivo nulo, e aí a
   * ficha do professor mostraria "respondeu" ao lado de três traços. Quem lê
   * precisa confiar que `completed_at` significa as três respostas.
   */
  constraint student_intake_completo check (
    completed_at is null
    or (goal is not null and experience is not null and days_per_week is not null)
  )
);

/*
 * A pergunta da academia é "quem ainda não respondeu", para ir atrás. Parcial
 * porque a resposta esperada é que a maioria responda.
 */
create index student_intake_pendente
  on student_intake (organization_id)
  where completed_at is null;

-- ── A resposta do aluno ──────────────────────────────────────────────────────
/**
 * O aluno responde as três perguntas.
 *
 * Não recebe `student_id`: ele sai de `auth.uid()`, como em
 * `start_workout_session`. Receber do cliente seria deixar escolher a matrícula
 * — e a academia junto, já que `organization_id` vem dela.
 *
 * `order by created_at desc limit 1` é a mesma regra das outras funções do
 * app: quem treina em duas academias responde pela matrícula mais recente, que
 * é a que o app está mostrando.
 *
 * Idempotente. A tela pode reenviar, e responder de novo é corrigir.
 */
create or replace function set_student_intake(
  p_goal          student_goal,
  p_experience    student_experience,
  p_days_per_week smallint
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_student students;
begin
  select s.* into v_student
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
  order by s.created_at desc
  limit 1;

  if not found then
    raise exception 'Nenhum aluno para esta conta.' using errcode = '42501';
  end if;

  if p_goal is null or p_experience is null then
    raise exception 'Objetivo e experiência são obrigatórios.' using errcode = '22023';
  end if;

  if p_days_per_week is null or p_days_per_week not between 1 and 7 then
    raise exception 'Dias por semana fora da faixa: %', p_days_per_week using errcode = '22023';
  end if;

  insert into student_intake
    (student_id, organization_id, goal, experience, days_per_week, completed_at)
  values (
    v_student.id,
    v_student.organization_id,
    p_goal,
    p_experience,
    p_days_per_week,
    now()
  )
  on conflict (student_id) do update
    set goal          = excluded.goal,
        experience    = excluded.experience,
        days_per_week = excluded.days_per_week,
        completed_at  = coalesce(student_intake.completed_at, now()),
        -- Respondeu depois de ter pulado: a resposta vale mais que a recusa.
        skipped_at    = null,
        updated_at    = now();
end;
$$;

revoke all on function set_student_intake(student_goal, student_experience, smallint)
  from public, anon;
grant execute on function set_student_intake(student_goal, student_experience, smallint)
  to authenticated, service_role;

-- ── "Depois" ─────────────────────────────────────────────────────────────────
/**
 * A pessoa escolheu responder outra hora.
 *
 * Grava a recusa em vez de não fazer nada: é o que faz a tela parar de aparecer
 * a cada abertura do app. Quem já respondeu não é afetado — `completed_at` fica
 * onde está, e pular depois de responder não apaga a resposta.
 */
create or replace function skip_student_intake()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_student students;
begin
  select s.* into v_student
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
  order by s.created_at desc
  limit 1;

  if not found then
    raise exception 'Nenhum aluno para esta conta.' using errcode = '42501';
  end if;

  insert into student_intake (student_id, organization_id, skipped_at)
  values (v_student.id, v_student.organization_id, now())
  on conflict (student_id) do update
    set skipped_at = coalesce(student_intake.skipped_at, now()),
        updated_at = now();
end;
$$;

revoke all on function skip_student_intake() from public, anon;
grant execute on function skip_student_intake() to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table student_intake enable row level security;

/*
 * O aluno lê o que declarou — a tela mostra de volta para corrigir. Só leitura:
 * a escrita passa pelas funções, que preenchem a matrícula e a academia a
 * partir de `auth.uid()`.
 */
create policy student_intake_self on student_intake
  for select using (owns_student(student_id));

/*
 * A academia lê, e é o ponto da funcionalidade: é com isto que o professor
 * monta o primeiro treino. **Só leitura, também para a academia** — ao
 * contrário da maioria das tabelas, em que `is_org_staff` tem `for all`.
 * Objetivo declarado é a voz do aluno; a anotação do professor já tem lugar,
 * em `students.goal`.
 */
create policy student_intake_staff on student_intake
  for select using (is_org_staff(organization_id));

revoke insert, update, delete on student_intake from authenticated, anon;

insert into schema_migrations (version) values ('0063_entrada_guiada.sql') on conflict do nothing;
