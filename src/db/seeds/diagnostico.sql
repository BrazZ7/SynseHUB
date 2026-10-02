-- =============================================================================
-- Diagnóstico — "rodei a migration e a sonda diz que falta"
--
-- Cola no SQL Editor do Supabase e me manda as três tabelas que ele devolve.
-- Não altera nada: são três `select`.
--
-- ── O que cada uma responde ────────────────────────────────────────────────
--
-- 1. Em que projeto você está, e quantas migrations o banco registra. Se o
--    `ref` não for o que a sonda mostra em `databaseRef`, a colagem foi no
--    projeto errado — e nada do que vem depois importa.
-- 2. Quais das últimas migrations estão registradas. O registro é a última
--    linha de cada arquivo: se ela não está aqui, o arquivo não terminou.
-- 3. Quais funções existem. O SQL Editor roda o texto colado **numa
--    transação**: um comando que falha no meio desfaz tudo, inclusive o
--    registro. Função ausente com registro ausente é esse caso.
-- =============================================================================

-- 1 ── Onde estamos
select
  current_database()                         as banco,
  current_setting('request.jwt.claims', true) is null as sem_sessao,
  (select count(*) from schema_migrations)   as migrations_registradas,
  (select max(version) from schema_migrations) as ultima_registrada;

-- 2 ── As últimas, uma a uma
select v.version,
       exists (select 1 from schema_migrations m where m.version = v.version) as registrada
from (values
  ('0041_vitrine_do_cadeado.sql'),
  ('0042_vitrine_nao_anuncia_a_quem_ja_le.sql'),
  ('0043_programas_guiados.sql'),
  ('0044_biblioteca_de_receitas.sql'),
  ('0045_quem_o_aluno_pode_autorizar.sql')
) as v(version);

-- 3 ── As funções que a 0044 e a 0045 criam
select f.nome,
       exists (select 1 from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = f.nome) as existe
from (values
  ('save_recipe'),            -- 0044
  ('delete_recipe'),          -- 0044
  ('receitas_trancadas'),     -- 0044
  ('equipe_para_autorizar'),  -- 0045
  ('autorizar_corpo')         -- 0045
) as f(nome);
