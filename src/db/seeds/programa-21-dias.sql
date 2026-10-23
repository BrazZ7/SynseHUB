-- =============================================================================
-- Programa 21 dias — conteúdo
--
-- Cola de uma vez, no SQL Editor do Supabase. Cria o programa e os 21 dias.
--
-- ── Uma coisa para trocar, na linha marcada ─────────────────────────────────
--
-- Procure TROQUE mais abaixo e ponha ali o e-mail da sua conta de plataforma.
-- Se esquecer, nada quebra: a última linha devolve `trilha = 0` e você roda o
-- insert da trilha depois.
--
-- ── Por que insert direto, e não save_program_step ──────────────────────────
--
-- A função exige `is_super_admin()`, que no SQL Editor é falso: ali não há
-- sessão, `auth_profile_id()` devolve nulo. Rodar 21 vezes pela tela é a via
-- oficial; isto aqui é a carga em massa, e o que ela perderia — a trilha em
-- `platform_access_log` — está reposto no fim.
--
-- É seguro rodar duas vezes: o programa casa por `code` e os dias por
-- (program_id, day_number), as duas unicidades que a 0003 já tinha.
-- =============================================================================

insert into programs (code, title, description, duration_days, visibility)
values (
  'SYNSE_21',
  'Programa 21 dias',
  'Três semanas de treino guiado: na primeira você aprende o movimento, na segunda acrescenta repetição, na terceira sobe a carga. Três sessões de força por semana, com caminhada e descanso no meio.',
  21,
  'SYNSE_PLUS'
)
on conflict (code) do update
  set title = excluded.title,
      description = excluded.description,
      duration_days = excluded.duration_days,
      visibility = excluded.visibility;

insert into program_steps (program_id, day_number, title, tasks) values
  ((select id from programs where code = 'SYNSE_21'), 1, 'Corpo inteiro A', '["Semana 1 — carga leve. Termine cada série ainda conseguindo mais 3 ou 4 repetições.", "Agachamento livre ou no smith — 3x10", "Supino reto com halteres — 3x10", "Remada curvada — 3x10", "Prancha — 3x30s", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 2, 'Caminhada leve', '["25 a 30 minutos em ritmo de conversa.", "É recuperação ativa, não treino: se cansar, diminua o passo."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 3, 'Corpo inteiro B', '["Levantamento terra romeno — 3x10", "Desenvolvimento de ombros — 3x10", "Puxada alta ou barra assistida — 3x10", "Abdominal infra — 3x12", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 4, 'Descanso', '["Dia de recuperação. É nele que o músculo cresce, não no treino.", "Durma o que der. Sono curto derruba o desempenho da próxima sessão."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 5, 'Corpo inteiro C', '["Afundo ou leg press — 3x10", "Supino inclinado — 3x10", "Remada unilateral com halter — 3x10 de cada lado", "Elevação lateral — 2x15", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 6, 'Mobilidade e caminhada', '["20 minutos de caminhada.", "Mobilidade de quadril e ombro, 5 minutos — o que o professor indicar."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 7, 'Descanso', '["Dia de recuperação. É nele que o músculo cresce, não no treino.", "Durma o que der. Sono curto derruba o desempenho da próxima sessão."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 8, 'Corpo inteiro A', '["Semana 2 — mesma carga, duas repetições a mais. Termine com 2 sobrando.", "Agachamento livre ou no smith — 3x12", "Supino reto com halteres — 3x12", "Remada curvada — 3x12", "Prancha — 3x40s", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 9, 'Caminhada leve', '["25 a 30 minutos em ritmo de conversa.", "É recuperação ativa, não treino: se cansar, diminua o passo."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 10, 'Corpo inteiro B', '["Levantamento terra romeno — 3x12", "Desenvolvimento de ombros — 3x12", "Puxada alta ou barra assistida — 3x12", "Abdominal infra — 3x12", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 11, 'Descanso', '["Dia de recuperação. É nele que o músculo cresce, não no treino.", "Durma o que der. Sono curto derruba o desempenho da próxima sessão."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 12, 'Corpo inteiro C', '["Afundo ou leg press — 3x12", "Supino inclinado — 3x12", "Remada unilateral com halter — 3x12 de cada lado", "Elevação lateral — 2x15", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 13, 'Mobilidade e caminhada', '["20 minutos de caminhada.", "Mobilidade de quadril e ombro, 5 minutos — o que o professor indicar."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 14, 'Descanso', '["Dia de recuperação. É nele que o músculo cresce, não no treino.", "Durma o que der. Sono curto derruba o desempenho da próxima sessão."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 15, 'Corpo inteiro A', '["Semana 3 — suba a carga e volte a 10 repetições. Termine com 1 ou 2 sobrando.", "Agachamento livre ou no smith — 4x10", "Supino reto com halteres — 4x10", "Remada curvada — 4x10", "Prancha — 3x45s", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 16, 'Caminhada leve', '["25 a 30 minutos em ritmo de conversa.", "É recuperação ativa, não treino: se cansar, diminua o passo."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 17, 'Corpo inteiro B', '["Levantamento terra romeno — 4x10", "Desenvolvimento de ombros — 4x10", "Puxada alta ou barra assistida — 4x10", "Abdominal infra — 3x12", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 18, 'Descanso', '["Dia de recuperação. É nele que o músculo cresce, não no treino.", "Durma o que der. Sono curto derruba o desempenho da próxima sessão."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 19, 'Corpo inteiro C', '["Afundo ou leg press — 4x10", "Supino inclinado — 4x10", "Remada unilateral com halter — 4x10 de cada lado", "Elevação lateral — 2x15", "Descanso de 2 a 3 minutos entre as séries dos exercícios grandes."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 20, 'Mobilidade e caminhada', '["20 minutos de caminhada.", "Mobilidade de quadril e ombro, 5 minutos — o que o professor indicar."]'::jsonb),
  ((select id from programs where code = 'SYNSE_21'), 21, 'Descanso', '["Dia de recuperação. É nele que o músculo cresce, não no treino.", "Durma o que der. Sono curto derruba o desempenho da próxima sessão."]'::jsonb)
on conflict (program_id, day_number) do update
  set title = excluded.title, tasks = excluded.tasks;

-- A trilha que o insert direto pularia.
insert into platform_access_log (user_profile_id, organization_id, context)
select id, null, 'PROGRAMA' from user_profiles
 where lower(email) = lower('seu-email@exemplo.com');  -- TROQUE aqui

select
  (select count(*) from program_steps s
    join programs p on p.id = s.program_id
   where p.code = 'SYNSE_21') as dias_gravados,
  (select count(*) from platform_access_log
   where context = 'PROGRAMA') as trilha;
