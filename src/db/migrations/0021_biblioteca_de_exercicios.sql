-- =============================================================================
-- SynseHub · 0021 — Biblioteca de exercícios
--
-- A tabela `exercises` existe desde a 0003 e nunca recebeu uma linha. No modo
-- demonstração havia um punhado deles vindo do dataset falso, e foi por isso
-- que a tela pareceu funcionar o tempo todo: quem montou treino de verdade
-- abriu a lista e não encontrou nada para escolher.
--
-- Esta migration resolve as duas metades do problema.
--
-- **A classificação.** `muscle_group` tinha nove valores e juntava bíceps com
-- tríceps em ARMS e quadríceps com panturrilha em LEGS. Serve para colorir um
-- cartão; não serve para montar treino. Entram as dimensões que academia e
-- prescrição realmente usam:
--
--   · músculo alvo e sinergistas, separados — "peito" e "bíceps" viram valores
--     próprios, e a tela pode agrupar por eles;
--   · região (superiores, inferiores, core, corpo inteiro), que é o recorte
--     com que se fecha um treino A/B/C;
--   · padrão de movimento (empurrar, puxar, agachar, dobradiça de quadril,
--     afundo, carregar, rotação), que é como treinador equilibra um programa;
--   · mecânica (multiarticular ou isolado) e utilidade (básico ou auxiliar),
--     a classificação clássica que separa o exercício que sustenta o treino
--     daquele que complementa;
--   · o aparelho pelo nome que ele tem na academia — "cadeira extensora",
--     "graviton", "voador" —, e não só a categoria do equipamento.
--
-- **Os apelidos.** No Brasil o mesmo exercício tem dois ou três nomes conforme
-- a região: puxada frontal é pulley frente, voador é peck deck, remada baixa é
-- cavalinho, serrote é remada unilateral. Sem isso, quem digita o nome que
-- aprendeu não acha o exercício e conclui que ele não existe.
--
-- Os 132 exercícios entram com `organization_id` nulo: são da plataforma,
-- visíveis para todas as academias, e a política da 0004 já impede que
-- qualquer cliente os edite (escrita exige organização, e a deles é nula).
-- =============================================================================

-- ── Vocabulário ──────────────────────────────────────────────────────────────

do $$ begin
  create type muscle_target as enum (
    'PECTORAL','SERRATUS','LATS','TRAPS','RHOMBOIDS','LOWER_BACK',
    'DELT_ANTERIOR','DELT_LATERAL','DELT_POSTERIOR','ROTATOR_CUFF',
    'BICEPS','TRICEPS','FOREARMS',
    'ABS','OBLIQUES','HIP_FLEXORS',
    'QUADS','HAMSTRINGS','GLUTES','ADDUCTORS','ABDUCTORS','CALVES'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type body_region as enum ('UPPER_BODY','LOWER_BODY','CORE','FULL_BODY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_pattern as enum (
    'PUSH_HORIZONTAL','PUSH_VERTICAL','PULL_HORIZONTAL','PULL_VERTICAL',
    'SQUAT','HINGE','LUNGE','CARRY','ROTATION','GAIT','CONDITIONING','ISOLATION'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type exercise_mechanics as enum ('COMPOUND','ISOLATION');
exception when duplicate_object then null; end $$;

/*
 * Básico é o que sustenta o treino; auxiliar é o que complementa. A
 * classificação é da literatura de prescrição e é relativa ao programa — um
 * supino inclinado é auxiliar num treino de corpo inteiro e básico num A/B/C.
 * Guardamos o valor mais comum; quem prescreve decide o resto.
 */
do $$ begin
  create type exercise_utility as enum ('BASIC','AUXILIARY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_type as enum (
    'BARBELL','DUMBBELL','MACHINE','CABLE','SMITH','BODYWEIGHT',
    'KETTLEBELL','BAND','PLATE','MEDICINE_BALL','CARDIO','OTHER'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type exercise_level as enum ('BEGINNER','INTERMEDIATE','ADVANCED');
exception when duplicate_object then null; end $$;

-- ── Colunas ──────────────────────────────────────────────────────────────────

/*
 * Tudo anulável de propósito. A tabela já está no ar e uma academia pode ter
 * cadastrado exercício próprio antes desta migration: exigir as colunas novas
 * derrubaria a linha dela. O catálogo da plataforma vem completo; o que a
 * academia criar depois preenche o que quiser.
 */
alter table exercises
  add column if not exists slug              text,
  add column if not exists primary_muscle    muscle_target,
  add column if not exists secondary_muscles muscle_target[] not null default '{}',
  add column if not exists region            body_region,
  add column if not exists pattern           movement_pattern,
  add column if not exists mechanics         exercise_mechanics,
  add column if not exists utility           exercise_utility,
  add column if not exists equipment_type    equipment_type,
  add column if not exists unilateral        boolean not null default false,
  add column if not exists level             exercise_level,
  add column if not exists aliases           text[] not null default '{}';

comment on column exercises.slug is
  'Identificador estável do exercício da plataforma. Nulo em exercício criado por academia.';
comment on column exercises.aliases is
  'Outros nomes do mesmo exercício. No Brasil puxada frontal é pulley frente, e quem digita um precisa achar o outro.';
comment on column exercises.equipment is
  'O aparelho pelo nome que ele tem na academia — "cadeira extensora", "graviton". A categoria fica em equipment_type.';

/* Um catálogo da plataforma não pode ter dois exercícios com o mesmo slug. */
create unique index if not exists exercises_slug_idx
  on exercises (slug) where slug is not null;

create index if not exists exercises_primary_muscle_idx on exercises (primary_muscle);
create index if not exists exercises_region_idx on exercises (region);

-- ── Busca por nome ou apelido ────────────────────────────────────────────────

/*
 * `search_exercises` existe para que a tela não precise repetir a regra de
 * busca. Sem acento e sem diferenciar maiúsculas: quem digita "triceps" tem de
 * achar "Tríceps", e quem digita "cavalinho" tem de achar a remada baixa.
 */
/*
 * `unaccent` vive no schema `extensions`, que é onde o Supabase põe as
 * extensões — e o `create schema if not exists` deixa isto funcionar também
 * num Postgres comum, onde esse schema não existe de fábrica.
 */
create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to authenticated, anon, service_role;

create or replace function search_exercises(p_termo text default '', p_organization_id uuid default null)
returns setof exercises
language sql stable security invoker set search_path = public, extensions as $$
  select e.*
  from exercises e
  where (e.organization_id is null or e.organization_id = p_organization_id)
    and (
      coalesce(trim(p_termo), '') = ''
      or unaccent(lower(e.name)) like '%' || unaccent(lower(trim(p_termo))) || '%'
      or exists (
        select 1 from unnest(e.aliases) a
        where unaccent(lower(a)) like '%' || unaccent(lower(trim(p_termo))) || '%'
      )
    )
  order by e.region, e.primary_muscle, e.name;
$$;

revoke all on function search_exercises(text, uuid) from public, anon;
grant execute on function search_exercises(text, uuid) to authenticated;

-- ── O catálogo ───────────────────────────────────────────────────────────────

insert into exercises (
  organization_id, slug, name, muscle_group, primary_muscle, secondary_muscles,
  region, pattern, mechanics, utility, equipment_type, equipment, unilateral,
  level, aliases, description
) values
  (null, 'supino-reto-barra', 'Supino reto com barra', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'banco reto e barra', false,
   'INTERMEDIATE'::exercise_level, array['supino reto', 'bench press'], 'Escápulas retraídas no banco, barra desce na linha do mamilo, cotovelos a cerca de 45°.'),
  (null, 'supino-reto-halteres', 'Supino reto com halteres', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco reto e halteres', false,
   'INTERMEDIATE'::exercise_level, array['supino com halteres', 'dumbbell press'], 'Amplitude maior que a barra: desça até sentir alongar o peitoral, sem bater os halteres em cima.'),
  (null, 'supino-inclinado-barra', 'Supino inclinado com barra', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'banco inclinado e barra', false,
   'INTERMEDIATE'::exercise_level, array['supino inclinado', 'incline press'], 'Banco entre 30° e 45°. Acima disso o ombro assume o trabalho no lugar do peito.'),
  (null, 'supino-inclinado-halteres', 'Supino inclinado com halteres', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco inclinado e halteres', false,
   'INTERMEDIATE'::exercise_level, array['incline dumbbell press'], 'Punhos alinhados com os cotovelos durante todo o percurso.'),
  (null, 'supino-declinado', 'Supino declinado', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'banco declinado e barra', false,
   'INTERMEDIATE'::exercise_level, array['decline press'], 'Ombro fica em posição mais segura que no reto; útil para quem sente desconforto no supino plano.'),
  (null, 'supino-maquina', 'Supino máquina', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'supino máquina', false,
   'BEGINNER'::exercise_level, array['chest press', 'supino articulado'], 'Ajuste o banco para as manoplas ficarem na altura do meio do peito.'),
  (null, 'supino-smith', 'Supino no Smith', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'SMITH'::equipment_type, 'Smith machine', false,
   'BEGINNER'::exercise_level, array['supino guiado'], 'Trajetória fixa: bom para treinar perto da falha sem parceiro.'),
  (null, 'supino-fechado', 'Supino fechado', 'CHEST'::muscle_group, 'TRICEPS'::muscle_target, array['PECTORAL', 'DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'banco reto e barra', false,
   'INTERMEDIATE'::exercise_level, array['close grip bench'], 'Mãos na largura dos ombros e cotovelos rentes ao corpo — é exercício de tríceps.'),
  (null, 'crucifixo-reto', 'Crucifixo reto com halteres', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco reto e halteres', false,
   'INTERMEDIATE'::exercise_level, array['fly', 'voador com halteres'], 'Cotovelos levemente flexionados e travados: o movimento é do ombro, não do cotovelo.'),
  (null, 'crucifixo-inclinado', 'Crucifixo inclinado com halteres', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco inclinado e halteres', false,
   'INTERMEDIATE'::exercise_level, array['incline fly'], 'Mesma execução do crucifixo reto, com ênfase na porção clavicular do peitoral.'),
  (null, 'voador-peck-deck', 'Voador (peck deck)', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'SERRATUS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'voador / peck deck', false,
   'BEGINNER'::exercise_level, array['peck deck', 'fly máquina', 'butterfly'], 'Não force o alongamento atrás da linha do tronco: é onde o ombro se machuca.'),
  (null, 'crossover-polia-alta', 'Crossover na polia alta', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'crossover', false,
   'INTERMEDIATE'::exercise_level, array['cross over', 'crucifixo na polia alta'], 'Tronco levemente inclinado à frente, mãos se cruzando na altura do umbigo.'),
  (null, 'crossover-polia-baixa', 'Crossover na polia baixa', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'crossover', false,
   'INTERMEDIATE'::exercise_level, array['crucifixo na polia baixa'], 'Movimento de baixo para cima, terminando na altura dos ombros.'),
  (null, 'flexao-de-braco', 'Flexão de braço', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['TRICEPS', 'DELT_ANTERIOR', 'ABS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', false,
   'BEGINNER'::exercise_level, array['push up', 'apoio'], 'Corpo em prancha do calcanhar à cabeça: quadril caído tira o peito do exercício.'),
  (null, 'flexao-inclinada', 'Flexão inclinada (mãos elevadas)', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'banco ou barra fixa alta', false,
   'BEGINNER'::exercise_level, array['flexão no banco'], 'Versão mais leve: quanto mais alto o apoio, menor a carga.'),
  (null, 'flexao-declinada', 'Flexão declinada (pés elevados)', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['DELT_ANTERIOR', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'banco', false,
   'INTERMEDIATE'::exercise_level, '{}', 'Pés no banco aumenta a carga e desloca a ênfase para a parte alta do peito.'),
  (null, 'mergulho-paralelas-peito', 'Mergulho nas paralelas (peito)', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['TRICEPS', 'DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'paralelas', false,
   'ADVANCED'::exercise_level, array['dips peito', 'paralela peito', 'mergulho no peito'], 'Tronco inclinado à frente e cotovelos abertos joga o trabalho para o peito.'),
  (null, 'pullover-halter', 'Pullover com halter', 'CHEST'::muscle_group, 'PECTORAL'::muscle_target, array['LATS', 'TRICEPS', 'SERRATUS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halter', false,
   'INTERMEDIATE'::exercise_level, array['pull over'], 'Desça o halter atrás da cabeça só até onde o ombro permitir sem arquear a lombar.'),
  (null, 'barra-fixa-pronada', 'Barra fixa pronada', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS', 'RHOMBOIDS', 'DELT_POSTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'barra fixa', false,
   'ADVANCED'::exercise_level, array['pull up', 'barra'], 'Puxe com os cotovelos, não com as mãos: peito em direção à barra.'),
  (null, 'barra-fixa-supinada', 'Barra fixa supinada', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'barra fixa', false,
   'INTERMEDIATE'::exercise_level, array['chin up', 'barra supinada'], 'Pegada supinada dá mais bíceps e costuma permitir mais repetições.'),
  (null, 'barra-fixa-neutra', 'Barra fixa pegada neutra', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS', 'FOREARMS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'barra fixa com triângulo', false,
   'INTERMEDIATE'::exercise_level, array['neutral grip pull up'], 'Pegada mais confortável para quem tem desconforto no ombro ou no punho.'),
  (null, 'graviton-barra-fixa', 'Barra fixa assistida (graviton)', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS', 'RHOMBOIDS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'MACHINE'::equipment_type, 'graviton', false,
   'BEGINNER'::exercise_level, array['graviton', 'barra assistida', 'pull up assistido'], 'A carga da máquina te empurra para cima: quanto mais peso, mais fácil.'),
  (null, 'puxada-frontal-aberta', 'Puxada frontal pegada aberta', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS', 'RHOMBOIDS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CABLE'::equipment_type, 'puxador alto / pulley', false,
   'BEGINNER'::exercise_level, array['pulley frente', 'puxada alta', 'lat pulldown'], 'Puxe a barra até a clavícula com o peito aberto; não jogue o tronco para trás.'),
  (null, 'puxada-frontal-supinada', 'Puxada frontal supinada', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'puxador alto / pulley', false,
   'BEGINNER'::exercise_level, array['pulley supinado'], 'Pegada supinada na largura dos ombros; cotovelos rentes ao corpo.'),
  (null, 'puxada-triangulo', 'Puxada com triângulo', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS', 'RHOMBOIDS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'puxador alto com triângulo', false,
   'BEGINNER'::exercise_level, array['puxada neutra', 'pulley triângulo'], 'Puxada neutra, boa para quem sente o ombro na pegada aberta.'),
  (null, 'pulldown-braco-reto', 'Pulldown com braços estendidos', 'BACK'::muscle_group, 'LATS'::muscle_target, array['TRICEPS', 'ABS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia alta', false,
   'INTERMEDIATE'::exercise_level, array['pullover na polia', 'straight arm pulldown'], 'Cotovelos travados: o movimento é só do ombro, descendo a barra até a coxa.'),
  (null, 'remada-curvada-barra', 'Remada curvada com barra', 'BACK'::muscle_group, 'LATS'::muscle_target, array['RHOMBOIDS', 'TRAPS', 'BICEPS', 'LOWER_BACK']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra', false,
   'INTERMEDIATE'::exercise_level, array['barbell row', 'remada livre'], 'Tronco a cerca de 45°, coluna neutra, barra até o umbigo.'),
  (null, 'remada-curvada-supinada', 'Remada curvada supinada', 'BACK'::muscle_group, 'LATS'::muscle_target, array['BICEPS', 'RHOMBOIDS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'barra', false,
   'INTERMEDIATE'::exercise_level, array['yates row'], 'Pegada supinada aproxima os cotovelos do corpo e recruta mais a porção inferior do dorsal.'),
  (null, 'remada-unilateral-halter', 'Remada unilateral com halter', 'BACK'::muscle_group, 'LATS'::muscle_target, array['RHOMBOIDS', 'BICEPS', 'DELT_POSTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halter', true,
   'BEGINNER'::exercise_level, array['serrote', 'remada serrote', 'one arm row'], 'Apoie joelho e mão no banco; puxe o halter em direção ao quadril, sem girar o tronco.'),
  (null, 'remada-baixa-polia', 'Remada baixa na polia', 'BACK'::muscle_group, 'LATS'::muscle_target, array['RHOMBOIDS', 'TRAPS', 'BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CABLE'::equipment_type, 'remada baixa', false,
   'BEGINNER'::exercise_level, array['cavalinho', 'remada sentada', 'seated row'], 'Puxe até o abdômen mantendo o tronco parado; a lombar não acompanha o movimento.'),
  (null, 'remada-cavalinho', 'Remada cavalinho (T-bar)', 'BACK'::muscle_group, 'LATS'::muscle_target, array['RHOMBOIDS', 'TRAPS', 'BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'MACHINE'::equipment_type, 'remada cavalinho', false,
   'INTERMEDIATE'::exercise_level, array['t-bar row', 'remada T'], 'Peito apoiado quando o aparelho permitir: tira a lombar da conta.'),
  (null, 'remada-maquina', 'Remada máquina', 'BACK'::muscle_group, 'LATS'::muscle_target, array['RHOMBOIDS', 'BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'remada articulada', false,
   'BEGINNER'::exercise_level, array['remada articulada', 'machine row'], 'Peito no apoio; junte as escápulas no fim do movimento.'),
  (null, 'remada-alta', 'Remada alta', 'BACK'::muscle_group, 'TRAPS'::muscle_target, array['DELT_LATERAL', 'BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'barra', false,
   'INTERMEDIATE'::exercise_level, array['upright row'], 'Suba até a altura do peito, não do queixo: acima disso o ombro sofre.'),
  (null, 'encolhimento-halteres', 'Encolhimento com halteres', 'BACK'::muscle_group, 'TRAPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', false,
   'BEGINNER'::exercise_level, array['shrug', 'encolhimento de ombros'], 'Suba os ombros em direção às orelhas; não role o ombro para trás.'),
  (null, 'face-pull', 'Face pull', 'BACK'::muscle_group, 'DELT_POSTERIOR'::muscle_target, array['TRAPS', 'RHOMBOIDS', 'ROTATOR_CUFF']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia alta com corda', false,
   'BEGINNER'::exercise_level, array['puxada para o rosto'], 'Puxe a corda em direção à testa abrindo as mãos; é o melhor amigo do ombro saudável.'),
  (null, 'hiperextensao-lombar', 'Hiperextensão lombar', 'BACK'::muscle_group, 'LOWER_BACK'::muscle_target, array['GLUTES', 'HAMSTRINGS']::muscle_target[],
   'UPPER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'banco romano / cadeira romana', false,
   'BEGINNER'::exercise_level, array['extensão lombar', 'banco romano'], 'Suba só até o tronco alinhar com as pernas; não jogue a coluna para trás.'),
  (null, 'remada-invertida', 'Remada invertida', 'BACK'::muscle_group, 'LATS'::muscle_target, array['RHOMBOIDS', 'BICEPS', 'ABS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'barra baixa ou Smith', false,
   'BEGINNER'::exercise_level, array['inverted row', 'australian pull up'], 'Quanto mais horizontal o corpo, mais difícil. Ótima porta de entrada para a barra fixa.'),
  (null, 'desenvolvimento-barra', 'Desenvolvimento militar com barra', 'SHOULDERS'::muscle_group, 'DELT_ANTERIOR'::muscle_target, array['DELT_LATERAL', 'TRICEPS', 'ABS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra', false,
   'INTERMEDIATE'::exercise_level, array['militar', 'overhead press', 'desenvolvimento'], 'Glúteo e abdômen firmes: sem isso a lombar arqueia para compensar.'),
  (null, 'desenvolvimento-halteres', 'Desenvolvimento com halteres', 'SHOULDERS'::muscle_group, 'DELT_ANTERIOR'::muscle_target, array['DELT_LATERAL', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halteres', false,
   'BEGINNER'::exercise_level, array['shoulder press'], 'Cotovelos ligeiramente à frente do corpo, não abertos em linha reta.'),
  (null, 'desenvolvimento-maquina', 'Desenvolvimento máquina', 'SHOULDERS'::muscle_group, 'DELT_ANTERIOR'::muscle_target, array['DELT_LATERAL', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'desenvolvimento máquina', false,
   'BEGINNER'::exercise_level, array['shoulder press máquina'], 'Ajuste o banco para as manoplas começarem na altura das orelhas.'),
  (null, 'desenvolvimento-arnold', 'Desenvolvimento Arnold', 'SHOULDERS'::muscle_group, 'DELT_ANTERIOR'::muscle_target, array['DELT_LATERAL', 'TRICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halteres', false,
   'INTERMEDIATE'::exercise_level, array['arnold press'], 'Comece com as palmas para você e gire durante a subida.'),
  (null, 'elevacao-lateral-halteres', 'Elevação lateral com halteres', 'SHOULDERS'::muscle_group, 'DELT_LATERAL'::muscle_target, array['TRAPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', false,
   'BEGINNER'::exercise_level, array['lateral raise', 'elevação lateral'], 'Suba até a linha dos ombros com o cotovelo levemente dobrado; carga leve resolve.'),
  (null, 'elevacao-lateral-polia', 'Elevação lateral na polia', 'SHOULDERS'::muscle_group, 'DELT_LATERAL'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia baixa', true,
   'INTERMEDIATE'::exercise_level, '{}', 'A polia mantém tensão no começo do movimento, onde o halter alivia.'),
  (null, 'elevacao-lateral-maquina', 'Elevação lateral máquina', 'SHOULDERS'::muscle_group, 'DELT_LATERAL'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'máquina de elevação lateral', false,
   'BEGINNER'::exercise_level, '{}', 'Trajetória guiada: bom para aprender a sentir o deltoide lateral.'),
  (null, 'elevacao-frontal', 'Elevação frontal', 'SHOULDERS'::muscle_group, 'DELT_ANTERIOR'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres ou anilha', false,
   'BEGINNER'::exercise_level, array['front raise', 'elevação frontal com anilha'], 'Suba até a altura dos olhos sem balançar o tronco.'),
  (null, 'crucifixo-inverso-halteres', 'Crucifixo inverso com halteres', 'SHOULDERS'::muscle_group, 'DELT_POSTERIOR'::muscle_target, array['RHOMBOIDS', 'TRAPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco inclinado e halteres', false,
   'INTERMEDIATE'::exercise_level, array['reverse fly', 'voador inverso'], 'Tronco inclinado à frente; abra os braços pensando em juntar as escápulas.'),
  (null, 'crucifixo-inverso-maquina', 'Crucifixo inverso na máquina', 'SHOULDERS'::muscle_group, 'DELT_POSTERIOR'::muscle_target, array['RHOMBOIDS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'peck deck invertido', false,
   'BEGINNER'::exercise_level, array['peck deck inverso', 'voador invertido'], 'Mesmo aparelho do voador, sentado de frente para o encosto.'),
  (null, 'rosca-direta-barra', 'Rosca direta com barra', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, array['FOREARMS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra reta', false,
   'BEGINNER'::exercise_level, array['rosca direta', 'barbell curl'], 'Cotovelos parados ao lado do tronco: se eles vão à frente, virou remada.'),
  (null, 'rosca-direta-w', 'Rosca direta com barra W', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, array['FOREARMS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra W / EZ', false,
   'BEGINNER'::exercise_level, array['rosca barra ez', 'ez curl'], 'A pegada angulada da barra W alivia o punho de quem sente dor na barra reta.'),
  (null, 'rosca-alternada', 'Rosca alternada com halteres', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, array['FOREARMS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', true,
   'BEGINNER'::exercise_level, array['rosca alternada', 'alternating curl'], 'Gire o punho durante a subida (supinação) para completar a função do bíceps.'),
  (null, 'rosca-simultanea', 'Rosca simultânea com halteres', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, array['FOREARMS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', false,
   'BEGINNER'::exercise_level, '{}', 'Sobe os dois ao mesmo tempo; exige mais do tronco para não balançar.'),
  (null, 'rosca-martelo', 'Rosca martelo', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, array['FOREARMS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', false,
   'BEGINNER'::exercise_level, array['hammer curl'], 'Pegada neutra o tempo todo; trabalha o braquial e engrossa o braço.'),
  (null, 'rosca-concentrada', 'Rosca concentrada', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halter', true,
   'BEGINNER'::exercise_level, array['concentration curl'], 'Cotovelo apoiado na coxa; é o exercício com menos chance de trapaça.'),
  (null, 'rosca-scott', 'Rosca Scott', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'banco Scott e barra W', false,
   'INTERMEDIATE'::exercise_level, array['preacher curl', 'banco scott'], 'Não estenda o cotovelo por completo na descida com carga alta.'),
  (null, 'rosca-scott-maquina', 'Rosca Scott máquina', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'rosca máquina', false,
   'BEGINNER'::exercise_level, array['bíceps máquina'], 'Braço todo apoiado; bom para isolar sem se preocupar com postura.'),
  (null, 'rosca-inversa', 'Rosca inversa', 'ARMS'::muscle_group, 'FOREARMS'::muscle_target, array['BICEPS']::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'barra W', false,
   'BEGINNER'::exercise_level, array['reverse curl'], 'Pegada pronada: o alvo aqui é o antebraço e o braquiorradial.'),
  (null, 'rosca-polia-baixa', 'Rosca na polia baixa', 'ARMS'::muscle_group, 'BICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia baixa', false,
   'BEGINNER'::exercise_level, array['rosca no cabo'], 'Tensão constante do começo ao fim, diferente do halter.'),
  (null, 'triceps-pulley-barra', 'Tríceps na polia com barra', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CABLE'::equipment_type, 'polia alta com barra', false,
   'BEGINNER'::exercise_level, array['tríceps pulley', 'pushdown'], 'Cotovelos colados ao tronco; só o antebraço se move.'),
  (null, 'triceps-pulley-corda', 'Tríceps na polia com corda', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CABLE'::equipment_type, 'polia alta com corda', false,
   'BEGINNER'::exercise_level, array['tríceps corda', 'rope pushdown'], 'Abra a corda no final do movimento para fechar a contração.'),
  (null, 'triceps-testa-barra', 'Tríceps testa com barra W', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'banco e barra W', false,
   'INTERMEDIATE'::exercise_level, array['skull crusher', 'francês deitado'], 'Desça a barra até a testa ou um pouco atrás dela, cotovelos apontando ao teto.'),
  (null, 'triceps-testa-halteres', 'Tríceps testa com halteres', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halteres', false,
   'INTERMEDIATE'::exercise_level, '{}', 'Pegada neutra costuma incomodar menos o cotovelo que a barra.'),
  (null, 'triceps-frances', 'Tríceps francês', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halter', false,
   'INTERMEDIATE'::exercise_level, array['overhead extension', 'tríceps sobre a cabeça'], 'Braços ao lado da cabeça; é a posição que mais alonga a cabeça longa do tríceps.'),
  (null, 'triceps-coice', 'Tríceps coice', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halter', true,
   'BEGINNER'::exercise_level, array['kickback'], 'Braço paralelo ao chão e parado; estenda só o cotovelo.'),
  (null, 'triceps-banco', 'Mergulho no banco', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, array['DELT_ANTERIOR', 'PECTORAL']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'banco', false,
   'BEGINNER'::exercise_level, array['bench dips', 'tríceps no banco'], 'Mãos na borda do banco, quadril rente ao apoio; ombro não gosta de descer demais.'),
  (null, 'mergulho-paralelas-triceps', 'Mergulho nas paralelas (tríceps)', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, array['PECTORAL', 'DELT_ANTERIOR']::muscle_target[],
   'UPPER_BODY'::body_region, 'PUSH_VERTICAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'paralelas', false,
   'ADVANCED'::exercise_level, array['dips tríceps', 'paralela tríceps'], 'Tronco na vertical e cotovelos fechados joga o trabalho para o tríceps.'),
  (null, 'triceps-maquina', 'Tríceps máquina', 'ARMS'::muscle_group, 'TRICEPS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'tríceps máquina', false,
   'BEGINNER'::exercise_level, '{}', 'Trajetória guiada; boa opção para iniciante ou para finalizar o treino.'),
  (null, 'rosca-punho', 'Rosca de punho', 'ARMS'::muscle_group, 'FOREARMS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'banco e barra', false,
   'BEGINNER'::exercise_level, array['wrist curl'], 'Antebraços apoiados no banco, só os punhos se movem.'),
  (null, 'rosca-punho-inversa', 'Rosca de punho inversa', 'ARMS'::muscle_group, 'FOREARMS'::muscle_target, '{}'::muscle_target[],
   'UPPER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'banco e barra', false,
   'BEGINNER'::exercise_level, array['reverse wrist curl'], 'Pegada pronada; equilibra o trabalho dos extensores do punho.'),
  (null, 'farmer-walk', 'Caminhada do fazendeiro', 'FULL_BODY'::muscle_group, 'FOREARMS'::muscle_target, array['TRAPS', 'ABS', 'GLUTES']::muscle_target[],
   'FULL_BODY'::body_region, 'CARRY'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres ou kettlebells pesados', false,
   'BEGINNER'::exercise_level, array['farmer''s walk', 'caminhada com carga'], 'Ombros para trás, passos curtos; a pegada é o que costuma falhar primeiro.'),
  (null, 'agachamento-livre', 'Agachamento livre', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'HAMSTRINGS', 'LOWER_BACK', 'ABS']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra e rack', false,
   'INTERMEDIATE'::exercise_level, array['back squat', 'agachamento com barra'], 'Desça até a coxa ficar paralela ao chão, joelhos acompanhando a ponta dos pés.'),
  (null, 'agachamento-frontal', 'Agachamento frontal', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'ABS']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra e rack', false,
   'ADVANCED'::exercise_level, array['front squat'], 'Barra apoiada nos deltoides com cotovelos altos; exige mais do abdômen.'),
  (null, 'agachamento-smith', 'Agachamento no Smith', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'SMITH'::equipment_type, 'Smith machine', false,
   'BEGINNER'::exercise_level, array['agachamento guiado'], 'Pés um pouco à frente do corpo; a barra guiada perdoa o equilíbrio.'),
  (null, 'agachamento-bulgaro', 'Agachamento búlgaro', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'LUNGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'banco e halteres', true,
   'INTERMEDIATE'::exercise_level, array['bulgarian split squat', 'afundo búlgaro'], 'Pé de trás no banco; quanto mais longe o pé da frente, mais glúteo.'),
  (null, 'agachamento-goblet', 'Agachamento goblet', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'ABS']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'halter ou kettlebell', false,
   'BEGINNER'::exercise_level, array['goblet squat'], 'Peso junto ao peito; é a melhor forma de ensinar o padrão de agachamento.'),
  (null, 'agachamento-sumo', 'Agachamento sumô', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['ADDUCTORS', 'GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halter', false,
   'BEGINNER'::exercise_level, array['sumo squat'], 'Pés bem afastados e pontas para fora; pega mais adutor e glúteo.'),
  (null, 'hack-machine', 'Agachamento hack', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'MACHINE'::equipment_type, 'hack machine', false,
   'BEGINNER'::exercise_level, array['hack squat', 'hack'], 'Costas totalmente apoiadas; desça controlando, sem bater no fim.'),
  (null, 'leg-press-45', 'Leg press 45°', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'MACHINE'::equipment_type, 'leg press 45', false,
   'BEGINNER'::exercise_level, array['leg press', 'leg 45'], 'Não deixe a lombar descolar do apoio na descida — é aí que se machuca.'),
  (null, 'leg-press-horizontal', 'Leg press horizontal', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'leg press horizontal', false,
   'BEGINNER'::exercise_level, array['leg press sentado'], 'Versão mais leve e mais fácil de entrar e sair; boa para iniciantes e idosos.'),
  (null, 'cadeira-extensora', 'Cadeira extensora', 'LEGS'::muscle_group, 'QUADS'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'cadeira extensora', false,
   'BEGINNER'::exercise_level, array['extensora', 'leg extension'], 'Ajuste o encosto para o joelho ficar alinhado com o eixo da máquina.'),
  (null, 'afundo', 'Afundo', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'LUNGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', true,
   'BEGINNER'::exercise_level, array['lunge', 'avanço'], 'Joelho de trás quase encostando no chão; tronco na vertical.'),
  (null, 'passada-caminhando', 'Passada caminhando', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'LUNGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', true,
   'INTERMEDIATE'::exercise_level, array['walking lunge', 'avanço caminhando'], 'Passos longos puxam mais glúteo; passos curtos, mais quadríceps.'),
  (null, 'step-up', 'Subida no banco (step-up)', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'LUNGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'caixa ou banco e halteres', true,
   'BEGINNER'::exercise_level, array['step up', 'subida na caixa'], 'Empurre com o pé que está em cima; não impulsione com o de baixo.'),
  (null, 'sissy-squat', 'Sissy squat', 'LEGS'::muscle_group, 'QUADS'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', false,
   'ADVANCED'::exercise_level, '{}', 'Joelhos à frente e quadril estendido; alonga o reto femoral como nenhum outro.'),
  (null, 'agachamento-parede', 'Agachamento isométrico na parede', 'LEGS'::muscle_group, 'QUADS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'SQUAT'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'parede', false,
   'BEGINNER'::exercise_level, array['wall sit', 'cadeirinha'], 'Costas na parede, joelhos a 90°, segurando o tempo prescrito.'),
  (null, 'levantamento-terra', 'Levantamento terra', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['GLUTES', 'LOWER_BACK', 'TRAPS', 'QUADS']::muscle_target[],
   'FULL_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra e anilhas', false,
   'ADVANCED'::exercise_level, array['deadlift', 'terra'], 'Barra rente à canela, coluna neutra do começo ao fim; empurre o chão.'),
  (null, 'terra-sumo', 'Levantamento terra sumô', 'LEGS'::muscle_group, 'GLUTES'::muscle_target, array['ADDUCTORS', 'QUADS', 'LOWER_BACK']::muscle_target[],
   'FULL_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra e anilhas', false,
   'ADVANCED'::exercise_level, array['sumo deadlift'], 'Pés largos e mãos por dentro das pernas; exige menos da lombar que o convencional.'),
  (null, 'terra-romeno', 'Levantamento terra romeno', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['GLUTES', 'LOWER_BACK']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra', false,
   'INTERMEDIATE'::exercise_level, array['romanian deadlift', 'RDL'], 'Joelhos levemente flexionados e fixos; o movimento é o quadril indo para trás.'),
  (null, 'stiff', 'Stiff', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['GLUTES', 'LOWER_BACK']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'barra', false,
   'INTERMEDIATE'::exercise_level, array['stiff leg deadlift'], 'Desça até sentir o posterior alongar, sem arredondar a lombar.'),
  (null, 'stiff-halteres', 'Stiff com halteres', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'DUMBBELL'::equipment_type, 'halteres', false,
   'BEGINNER'::exercise_level, '{}', 'Mesma execução do stiff com barra, com carga menor e mais liberdade de trajeto.'),
  (null, 'good-morning', 'Good morning', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['LOWER_BACK', 'GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BARBELL'::equipment_type, 'barra e rack', false,
   'ADVANCED'::exercise_level, array['bom dia'], 'Barra nas costas, quadril para trás; carga leve, é exercício técnico.'),
  (null, 'mesa-flexora', 'Mesa flexora', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['CALVES']::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'mesa flexora', false,
   'BEGINNER'::exercise_level, array['flexora deitada', 'lying leg curl'], 'Deitado de bruços; não levante o quadril para ganhar amplitude.'),
  (null, 'cadeira-flexora', 'Cadeira flexora', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'cadeira flexora', false,
   'BEGINNER'::exercise_level, array['flexora sentada', 'seated leg curl'], 'Sentado, com o quadril flexionado: alonga mais o posterior que a mesa.'),
  (null, 'flexora-em-pe', 'Flexora em pé unilateral', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'flexora em pé', true,
   'BEGINNER'::exercise_level, array['standing leg curl'], 'Um lado por vez; boa para corrigir diferença entre as pernas.'),
  (null, 'nordic-curl', 'Nordic curl', 'LEGS'::muscle_group, 'HAMSTRINGS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'apoio para os tornozelos', false,
   'ADVANCED'::exercise_level, array['flexão nórdica'], 'Desça o mais devagar que conseguir; é o exercício com mais evidência para prevenir lesão de posterior.'),
  (null, 'elevacao-pelvica', 'Elevação pélvica (hip thrust)', 'LEGS'::muscle_group, 'GLUTES'::muscle_target, array['HAMSTRINGS', 'QUADS']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BARBELL'::equipment_type, 'banco e barra', false,
   'INTERMEDIATE'::exercise_level, array['hip thrust', 'elevação de quadril'], 'Escápulas no banco, queixo para baixo; termine com o quadril na linha do tronco.'),
  (null, 'ponte-de-gluteo', 'Ponte de glúteo', 'LEGS'::muscle_group, 'GLUTES'::muscle_target, array['HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', false,
   'BEGINNER'::exercise_level, array['glute bridge'], 'Versão no chão da elevação pélvica; ótima para aquecer o glúteo.'),
  (null, 'gluteo-maquina', 'Glúteo máquina (coice)', 'LEGS'::muscle_group, 'GLUTES'::muscle_target, array['HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'glúteo máquina', true,
   'BEGINNER'::exercise_level, array['coice', 'kickback máquina', 'glúteo quatro apoios'], 'Empurre com o calcanhar; não jogue a lombar para ganhar amplitude.'),
  (null, 'gluteo-polia', 'Glúteo na polia', 'LEGS'::muscle_group, 'GLUTES'::muscle_target, array['HAMSTRINGS']::muscle_target[],
   'LOWER_BODY'::body_region, 'HINGE'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia baixa com caneleira', true,
   'BEGINNER'::exercise_level, array['cable kickback'], 'Tronco firme; o movimento é só da perna indo para trás.'),
  (null, 'cadeira-abdutora', 'Cadeira abdutora', 'LEGS'::muscle_group, 'ABDUCTORS'::muscle_target, array['GLUTES']::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'cadeira abdutora', false,
   'BEGINNER'::exercise_level, array['abdutora', 'abdução de quadril'], 'Abre as pernas contra a resistência; trabalha glúteo médio e mínimo.'),
  (null, 'cadeira-adutora', 'Cadeira adutora', 'LEGS'::muscle_group, 'ADDUCTORS'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'cadeira adutora', false,
   'BEGINNER'::exercise_level, array['adutora', 'adução de quadril'], 'Fecha as pernas contra a resistência; parte interna da coxa.'),
  (null, 'panturrilha-em-pe', 'Panturrilha em pé', 'LEGS'::muscle_group, 'CALVES'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'panturrilha em pé', false,
   'BEGINNER'::exercise_level, array['gêmeos em pé', 'standing calf raise'], 'Amplitude completa: desça o calcanhar abaixo do degrau e suba na ponta.'),
  (null, 'panturrilha-sentado', 'Panturrilha sentado', 'LEGS'::muscle_group, 'CALVES'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'panturrilha sentado', false,
   'BEGINNER'::exercise_level, array['seated calf raise'], 'Joelho dobrado tira o gastrocnêmio e sobra o sóleo — por isso é diferente da em pé.'),
  (null, 'panturrilha-leg-press', 'Panturrilha no leg press', 'LEGS'::muscle_group, 'CALVES'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'leg press 45', false,
   'BEGINNER'::exercise_level, '{}', 'Só a ponta dos pés na plataforma; cuidado ao destravar a máquina.'),
  (null, 'panturrilha-unilateral', 'Panturrilha unilateral', 'LEGS'::muscle_group, 'CALVES'::muscle_target, '{}'::muscle_target[],
   'LOWER_BODY'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'degrau e halter', true,
   'BEGINNER'::exercise_level, '{}', 'Uma perna por vez, segurando um halter; corrige diferença entre os lados.'),
  (null, 'prancha', 'Prancha isométrica', 'CORE'::muscle_group, 'ABS'::muscle_target, array['OBLIQUES', 'GLUTES']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', false,
   'BEGINNER'::exercise_level, array['plank', 'prancha frontal'], 'Linha reta do calcanhar à cabeça, glúteo contraído; qualidade vale mais que tempo.'),
  (null, 'prancha-lateral', 'Prancha lateral', 'CORE'::muscle_group, 'OBLIQUES'::muscle_target, array['ABS', 'ABDUCTORS']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', true,
   'BEGINNER'::exercise_level, array['side plank'], 'Quadril alto e alinhado; não deixe cair em direção ao chão.'),
  (null, 'abdominal-supra', 'Abdominal supra (crunch)', 'CORE'::muscle_group, 'ABS'::muscle_target, '{}'::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'colchonete', false,
   'BEGINNER'::exercise_level, array['crunch', 'abdominal'], 'Suba enrolando a coluna, não puxando o pescoço com as mãos.'),
  (null, 'abdominal-infra', 'Abdominal infra', 'CORE'::muscle_group, 'ABS'::muscle_target, array['HIP_FLEXORS']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'colchonete', false,
   'BEGINNER'::exercise_level, array['elevação de pernas deitado'], 'Lombar colada no chão o tempo todo; se descolar, reduza a amplitude.'),
  (null, 'abdominal-maquina', 'Abdominal máquina', 'CORE'::muscle_group, 'ABS'::muscle_target, '{}'::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'abdominal máquina', false,
   'BEGINNER'::exercise_level, '{}', 'Permite progredir carga no abdômen, o que o peso corporal não oferece.'),
  (null, 'abdominal-polia', 'Abdominal na polia', 'CORE'::muscle_group, 'ABS'::muscle_target, array['OBLIQUES']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia alta com corda', false,
   'INTERMEDIATE'::exercise_level, array['crunch na polia', 'abdominal ajoelhado'], 'Ajoelhado, enrole o tronco em direção ao joelho; o quadril fica parado.'),
  (null, 'elevacao-pernas-suspenso', 'Elevação de pernas suspenso', 'CORE'::muscle_group, 'ABS'::muscle_target, array['HIP_FLEXORS', 'OBLIQUES']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'BASIC'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'barra fixa', false,
   'ADVANCED'::exercise_level, array['hanging leg raise'], 'Sem balanço: se o corpo embala, o abdômen sai do exercício.'),
  (null, 'elevacao-pernas-banco', 'Elevação de pernas no banco romano', 'CORE'::muscle_group, 'ABS'::muscle_target, array['HIP_FLEXORS']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MACHINE'::equipment_type, 'cadeira romana / paralela', false,
   'INTERMEDIATE'::exercise_level, array['captain chair'], 'Antebraços apoiados, costas no encosto; suba os joelhos até acima da linha do quadril.'),
  (null, 'russian-twist', 'Rotação russa', 'CORE'::muscle_group, 'OBLIQUES'::muscle_target, array['ABS']::muscle_target[],
   'CORE'::body_region, 'ROTATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'MEDICINE_BALL'::equipment_type, 'anilha ou medicine ball', false,
   'BEGINNER'::exercise_level, array['russian twist', 'abdominal oblíquo'], 'Gire o tronco, não só os braços; pés podem ficar no chão para facilitar.'),
  (null, 'rotacao-polia', 'Rotação na polia (wood chop)', 'CORE'::muscle_group, 'OBLIQUES'::muscle_target, array['ABS', 'GLUTES']::muscle_target[],
   'CORE'::body_region, 'ROTATION'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CABLE'::equipment_type, 'polia regulável', true,
   'INTERMEDIATE'::exercise_level, array['wood chop', 'lenhador'], 'Gire a partir do quadril, com os braços estendidos; o pé de trás acompanha.'),
  (null, 'roda-abdominal', 'Roda abdominal', 'CORE'::muscle_group, 'ABS'::muscle_target, array['OBLIQUES', 'LATS']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'OTHER'::equipment_type, 'roda abdominal', false,
   'ADVANCED'::exercise_level, array['ab wheel', 'rodinha'], 'Vá só até onde conseguir manter a lombar sem arquear.'),
  (null, 'hollow-hold', 'Hollow hold', 'CORE'::muscle_group, 'ABS'::muscle_target, array['HIP_FLEXORS']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'colchonete', false,
   'INTERMEDIATE'::exercise_level, '{}', 'Lombar pressionada contra o chão; braços e pernas estendidos e baixos.'),
  (null, 'dead-bug', 'Dead bug', 'CORE'::muscle_group, 'ABS'::muscle_target, '{}'::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'colchonete', false,
   'BEGINNER'::exercise_level, array['inseto morto'], 'Estenda braço e perna opostos sem deixar a lombar sair do chão.'),
  (null, 'bird-dog', 'Bird dog', 'CORE'::muscle_group, 'LOWER_BACK'::muscle_target, array['GLUTES', 'ABS']::muscle_target[],
   'CORE'::body_region, 'ISOLATION'::movement_pattern, 'ISOLATION'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'colchonete', true,
   'BEGINNER'::exercise_level, array['perdigueiro'], 'Quatro apoios; estenda braço e perna opostos sem girar o quadril.'),
  (null, 'esteira-caminhada', 'Caminhada na esteira', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CARDIO'::equipment_type, 'esteira', false,
   'BEGINNER'::exercise_level, array['caminhada'], 'Inclinação entre 3% e 8% aumenta o gasto sem exigir corrida.'),
  (null, 'esteira-corrida', 'Corrida na esteira', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CARDIO'::equipment_type, 'esteira', false,
   'INTERMEDIATE'::exercise_level, array['corrida'], 'Pise embaixo do corpo, não à frente; cadência alta poupa o joelho.'),
  (null, 'bicicleta-ergometrica', 'Bicicleta ergométrica', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CARDIO'::equipment_type, 'bicicleta ergométrica', false,
   'BEGINNER'::exercise_level, array['bike'], 'Regule o selim: joelho quase estendido no ponto mais baixo do pedal.'),
  (null, 'spinning', 'Bicicleta de spinning', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CARDIO'::equipment_type, 'bicicleta de spinning', false,
   'INTERMEDIATE'::exercise_level, array['spinning'], 'Carga suficiente para não pedalar solto; é o erro mais comum na aula.'),
  (null, 'eliptico', 'Elíptico', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CARDIO'::equipment_type, 'elíptico', false,
   'BEGINNER'::exercise_level, array['transport', 'cross trainer'], 'Impacto quase zero; boa opção para quem tem dor no joelho.'),
  (null, 'escada-stepmill', 'Escada (stepmill)', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CARDIO'::equipment_type, 'escada ergométrica', false,
   'INTERMEDIATE'::exercise_level, array['stepmill', 'simulador de escada'], 'Não se pendure no corrimão: apoiar o peso ali corta metade do esforço.'),
  (null, 'remo-ergometro', 'Remo ergométrico', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'PULL_HORIZONTAL'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'CARDIO'::equipment_type, 'remo ergométrico', false,
   'INTERMEDIATE'::exercise_level, array['remo', 'rowing'], 'A ordem é pernas, tronco, braços — e o inverso na volta.'),
  (null, 'air-bike', 'Air bike', 'CARDIO'::muscle_group, null, '{}'::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'CARDIO'::equipment_type, 'air bike', false,
   'INTERMEDIATE'::exercise_level, array['bike de vento', 'assault bike'], 'Quanto mais forte você pedala, mais ela resiste; ideal para intervalado curto.'),
  (null, 'corda-naval', 'Corda naval', 'CARDIO'::muscle_group, null, array['DELT_ANTERIOR', 'ABS', 'FOREARMS']::muscle_target[],
   'FULL_BODY'::body_region, 'CONDITIONING'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'OTHER'::equipment_type, 'corda naval', false,
   'INTERMEDIATE'::exercise_level, array['battle rope'], 'Joelhos levemente flexionados; a onda sai do ombro, não do punho.'),
  (null, 'pular-corda', 'Pular corda', 'CARDIO'::muscle_group, null, array['CALVES']::muscle_target[],
   'FULL_BODY'::body_region, 'GAIT'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'OTHER'::equipment_type, 'corda de pular', false,
   'BEGINNER'::exercise_level, array['jump rope'], 'Saltos baixos, na ponta dos pés; o giro vem do punho.'),
  (null, 'burpee', 'Burpee', 'FULL_BODY'::muscle_group, null, array['PECTORAL', 'QUADS', 'ABS']::muscle_target[],
   'FULL_BODY'::body_region, 'CONDITIONING'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', false,
   'INTERMEDIATE'::exercise_level, '{}', 'Agacha, prancha, flexão, salto. Escale tirando a flexão ou o salto.'),
  (null, 'mountain-climber', 'Escalador (mountain climber)', 'CORE'::muscle_group, 'ABS'::muscle_target, array['HIP_FLEXORS', 'DELT_ANTERIOR']::muscle_target[],
   'CORE'::body_region, 'CONDITIONING'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'BODYWEIGHT'::equipment_type, 'peso corporal', false,
   'BEGINNER'::exercise_level, array['escalador'], 'Quadril na altura dos ombros; não deixe subir a cada joelho que vem.'),
  (null, 'kettlebell-swing', 'Swing com kettlebell', 'FULL_BODY'::muscle_group, 'GLUTES'::muscle_target, array['HAMSTRINGS', 'LOWER_BACK', 'ABS']::muscle_target[],
   'FULL_BODY'::body_region, 'HINGE'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'BASIC'::exercise_utility, 'KETTLEBELL'::equipment_type, 'kettlebell', false,
   'INTERMEDIATE'::exercise_level, array['swing'], 'É extensão explosiva de quadril, não elevação frontal: o braço só acompanha.'),
  (null, 'sled-push', 'Empurrar o trenó', 'FULL_BODY'::muscle_group, 'QUADS'::muscle_target, array['GLUTES', 'CALVES', 'ABS']::muscle_target[],
   'FULL_BODY'::body_region, 'CARRY'::movement_pattern, 'COMPOUND'::exercise_mechanics,
   'AUXILIARY'::exercise_utility, 'OTHER'::equipment_type, 'trenó / sled', false,
   'INTERMEDIATE'::exercise_level, array['sled', 'trenó'], 'Tronco inclinado e passos curtos e fortes; sem fase excêntrica, dói menos no dia seguinte.')
on conflict (slug) where slug is not null do update set
  name              = excluded.name,
  muscle_group      = excluded.muscle_group,
  primary_muscle    = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  region            = excluded.region,
  pattern           = excluded.pattern,
  mechanics         = excluded.mechanics,
  utility           = excluded.utility,
  equipment_type    = excluded.equipment_type,
  equipment         = excluded.equipment,
  unilateral        = excluded.unilateral,
  level             = excluded.level,
  aliases           = excluded.aliases,
  description       = excluded.description;

/*
 * O `do update` acima faz desta migration a fonte da verdade do catálogo:
 * rodar de novo depois de corrigir um nome ou uma dica atualiza o que está no
 * ar, em vez de criar duplicata. Exercício próprio de academia tem slug nulo e
 * nunca é tocado.
 */

insert into schema_migrations (version) values ('0021_biblioteca_de_exercicios.sql')
on conflict (version) do nothing;
