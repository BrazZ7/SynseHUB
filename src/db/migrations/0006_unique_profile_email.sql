-- =============================================================================
-- SynseHub · 0006 — E-mail de perfil é único
--
-- `user_profiles.email` tinha índice comum, enquanto `auth_user_id` e
-- `synse_id` já eram únicos. Faltava dizer no banco o que o modelo assume:
-- uma pessoa, uma ficha.
--
-- Sem isso, duas fichas com o mesmo e-mail conviveriam, e a promessa do Synse
-- ID vitalício — o mesmo ID seguindo a pessoa entre academias — dependeria de
-- a aplicação nunca errar. Também é o que faltava para `on conflict (email)`
-- funcionar: o Postgres exige índice único para resolver o conflito, e o seed
-- parava com "no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- A coluna é `citext`, então a unicidade já ignora maiúsculas: Ana@x.com e
-- ana@x.com são a mesma pessoa.
-- =============================================================================

drop index if exists user_profiles_email_idx;

create unique index if not exists user_profiles_email_key on user_profiles (email);
