-- =============================================================================
-- SynseHub · 0035 — Aderência ao treino
--
-- A 0026 gravou o planejado e o feito lado a lado em `workout_set_logs`, e
-- disse por quê:
--
--   "Guardar só o feito perderia a informação mais útil da evolução: a série em
--    que a pessoa parou antes do previsto, que é sinal de fadiga ou de carga
--    alta demais."
--
-- A coluna está lá desde então e **nenhuma consulta a lê**. A 0027 trouxe
-- carga, volume e recorde; aderência ficou de fora. Esta migration é a função
-- que faltava para a análise do Synse+ ter o número que o professor olha
-- primeiro.
--
-- ── Uma linha por sessão, e não um número só ─────────────────────────────────
--
-- A tentação é devolver "78% no mês". Mas a pergunta que interessa não é o
-- percentual do mês, é a comparação: 78% nas últimas três sessões contra 96%
-- de média é a notícia; 78% de média constante é outra conversa, e a mesma
-- porcentagem serviria para as duas.
--
-- Uma sessão por linha é pouco dado — trinta dias de quem treina todo dia dá
-- trinta linhas — e deixa o recorte para quem sabe qual recorte quer. O motivo
-- que levou a 0027 a agregar no banco (20 mil séries por mês) não se aplica
-- aqui: a agregação por sessão já reduz as séries a uma linha cada.
--
-- ── Série sem plano não entra na conta ───────────────────────────────────────
--
-- `reps_planned` é opcional: treino livre e série extra entram sem previsão.
-- Contá-las como "não aderiu" puniria quem fez mais do que o combinado, e
-- contá-las como aderência inventaria um plano que não existiu. Ficam fora dos
-- dois lados, e `series_planejadas` diz sobre quantas séries o percentual fala.
--
-- ── SECURITY INVOKER, como toda a 0027 ───────────────────────────────────────
--
-- Sem `security definer`: a função roda com os privilégios de quem chama, e a
-- RLS de `workout_sessions` e `workout_set_logs` filtra normalmente. Não há
-- nada a escrever aqui, então privilégio extra só abriria superfície de
-- vazamento entre academias.
-- =============================================================================

/**
 * Aderência ao planejado, uma linha por sessão concluída.
 *
 * `series_abaixo` conta separado de `reps_feitas` de propósito: dez séries com
 * uma repetição a menos cada e uma série interrompida pela metade dão a mesma
 * diferença de repetições e não são a mesma coisa. A primeira é carga alta
 * demais; a segunda é a pessoa que passou mal ou foi embora.
 */
create or replace function workout_adherence(
  p_student_id uuid,
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  sessao_id          uuid,
  iniciado_em        timestamptz,
  series_planejadas  integer,
  reps_planejadas    integer,
  reps_feitas        integer,
  series_abaixo      integer
)
language sql stable as $$
  select
    s.id,
    s.started_at,
    count(*)::integer,
    sum(l.reps_planned)::integer,
    sum(l.reps_completed)::integer,
    count(*) filter (where l.reps_completed < l.reps_planned)::integer
  from workout_sessions s
  join workout_set_logs l on l.session_id = s.id
  where s.student_id = p_student_id
    and s.status = 'COMPLETED'
    and s.started_at >= p_from
    and s.started_at < p_to
    -- A cláusula que define o recorte: só a série que tinha previsão.
    and l.reps_planned is not null
    and l.reps_planned > 0
  group by s.id, s.started_at
  order by s.started_at
$$;

comment on function workout_adherence is
  'Planejado contra feito, por sessão. Série sem reps_planned fica fora dos dois lados.';

insert into schema_migrations (version) values ('0035_aderencia.sql') on conflict do nothing;
