-- =============================================================================
-- Diagnóstico da 0044
--
-- A 0045 entrou e a 0044 não. As duas não dependem uma da outra, então o
-- problema é específico desta.
--
-- A suspeita: a tabela `recipes` em produção tem forma diferente da que a
-- 0003 cria. `receitas_trancadas` é `language sql`, e o Postgres **valida o
-- corpo na criação** — uma coluna com outro nome derruba o arquivo inteiro, e
-- o SQL Editor desfaz tudo junto, inclusive o registro do fim.
--
-- Cola no SQL Editor e me manda as duas tabelas. São dois `select`, não
-- alteram nada.
-- =============================================================================

-- 1 ── As colunas que a 0044 precisa encontrar em `recipes`
select c.esperada,
       exists (
         select 1 from information_schema.columns i
         where i.table_schema = 'public'
           and i.table_name = 'recipes'
           and i.column_name = c.esperada
       ) as existe
from (values
  ('id'), ('title'), ('description'), ('category'),
  ('ingredients'), ('instructions'), ('prep_minutes'),
  ('servings'), ('image_url'), ('tags'),
  ('nutrition_facts'), ('visibility')
) as c(esperada);

-- 2 ── As funções que a 0044 usa e precisa já existir
select f.nome,
       exists (
         select 1 from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = f.nome
       ) as existe
from (values
  ('tem_synse_plus'),   -- usada na política e na vitrine
  ('is_super_admin'),   -- usada na política e na autoria
  ('auth_profile_id')   -- usada na trilha
) as f(nome);
