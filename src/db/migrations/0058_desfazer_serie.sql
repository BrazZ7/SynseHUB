-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0058 — Desfazer a série concluída por engano                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- O toque em "concluir série" é grande, fica no meio da tela e é apertado com
-- a mão cansada. Até aqui ele era definitivo: a série entrava na lista local,
-- na fila e no banco, e não havia caminho de volta. Quem errava a última série
-- do último exercício encerrava o treino sem querer.
--
-- Desfazer não é apagar e esquecer. A série concluída move três coisas além
-- dela mesma, e todas precisam voltar:
--
--   1. `workout_session_exercises.completed_at`, que o gatilho
--      `workout_set_progress` (0026) grava quando a última série prevista
--      entra. Ele é `after insert`: o delete não o chama, então a reversão é
--      feita aqui, à mão.
--   2. O progresso dos desafios da academia, que `gym_challenge_on_set`
--      (0029) soma em SETS e VOLUME_KG. Também `after insert`.
--   3. A medalha: `bump_gym_challenge` grava `completed_at` na primeira vez
--      que a meta é batida e nunca a limpa. Uma meta batida por uma série que
--      não aconteceu não pode ficar de pé — e ela vale XP
--      (`XP_POR_MEDALHA`, em `src/features/students/level.ts`).
--
-- O que **não** precisa de reversão, e vale dizer para quem vier depois: o
-- jardim, o nível e o XP são calculados na leitura, do histórico
-- (`src/features/students/plant.ts`: "nada aqui é guardado"). Tirada a série,
-- eles se corrigem sozinhos na próxima tela.
--
-- A função é idempotente porque a fila offline reenvia: desfazer o que já foi
-- desfeito devolve `false` sem mexer em nada. Sem isso, o reenvio descontaria
-- o desafio duas vezes — e progresso negativo é pior que progresso errado,
-- porque ninguém sabe de onde veio.

-- ── O desconto no desafio ────────────────────────────────────────────────────
/**
 * O contrário de `bump_gym_challenge` (0029), com uma diferença que é o ponto:
 * este limpa `completed_at` quando o progresso cai abaixo da meta.
 *
 * As mesmas condições do `bump` — desafio ativo, métrica igual, data dentro da
 * janela — de propósito: é preciso alcançar exatamente a linha que somou. Se o
 * desafio encerrou entre a série e o desfazer, nada é descontado, e isso é o
 * comportamento certo: desafio encerrado é placar fechado.
 */
create or replace function descontar_desafio(
  p_profile_id uuid,
  p_org_id     uuid,
  p_metric     text,
  p_valor      numeric,
  p_quando     timestamptz
) returns void
language sql volatile security definer set search_path = public as $$
  update challenge_participants p
  -- O piso é zero: progresso negativo não existe para quem lê a tela.
  set progress_value = greatest(p.progress_value - p_valor, 0),
      completed_at = case
        when greatest(p.progress_value - p_valor, 0) < c.target_value then null
        else p.completed_at
      end
  from challenges c
  where c.id = p.challenge_id
    and c.organization_id = p_org_id
    and c.status = 'ACTIVE'
    and c.metric = p_metric
    and p_quando::date between c.starts_at and c.ends_at
    and p.user_profile_id = p_profile_id
$$;

revoke all on function descontar_desafio(uuid, uuid, text, numeric, timestamptz)
  from public, anon, authenticated;

-- ── O desfazer ───────────────────────────────────────────────────────────────
/**
 * Tira a série do treino e desfaz o que ela moveu.
 *
 * Devolve `true` quando havia o que desfazer e `false` quando não havia — que
 * é o caso do reenvio. Quem chama trata os dois igual: a série não está mais
 * lá, que é o que foi pedido.
 *
 * A série é identificada pelo `client_id`, o mesmo que a gravou. Não pelo id
 * do banco: o aparelho conhece o `client_id` antes de existir rede, e é com
 * ele que a fila offline sobrevive a fechar o app no meio.
 */
create or replace function desfazer_serie(
  p_session_id uuid,
  p_client_id  text
)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sessao    workout_sessions;
  v_serie     workout_set_logs;
  v_profile   uuid;
  v_previstas smallint;
  v_feitas    smallint;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador da série ausente.' using errcode = '22023';
  end if;

  select * into v_sessao from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'Treino não encontrado.' using errcode = 'P0002';
  end if;

  -- `is not true` porque as duas funções podem devolver NULL. Ver a nota da 0025.
  if (owns_student(v_sessao.student_id) or is_org_staff(v_sessao.organization_id)) is not true then
    raise exception 'Este treino não é seu.' using errcode = '42501';
  end if;

  /*
   * Treino encerrado não se desfaz por aqui. Depois do encerramento o número
   * já entrou no histórico, no resumo da semana e no placar dos desafios de
   * quem olhou — corrigir isso é outra operação, com outra conversa na tela,
   * e não o desfazer de um toque errado.
   */
  if v_sessao.status not in ('IN_PROGRESS','PAUSED') then
    raise exception 'Este treino já foi encerrado.' using errcode = '23514';
  end if;

  delete from workout_set_logs
  where session_id = p_session_id and client_id = p_client_id
  returning * into v_serie;

  -- Nada apagado: ou já foi desfeita, ou nunca chegou. Reenvio cai aqui.
  if not found then
    return false;
  end if;

  /*
   * O exercício volta a não estar concluído se as séries que restaram não
   * alcançam as previstas. Mesma conta do gatilho da 0026, ao contrário.
   */
  -- Mesma fonte do gatilho da 0026 depois da 0057: o retrato da sessão, com a
  -- ficha viva como reserva para sessão aberta antes daquela migration.
  select coalesce(se.sets_planned, we.sets) into v_previstas
  from workout_session_exercises se
  left join workout_exercises we on we.id = se.workout_exercise_id
  where se.session_id = p_session_id and se.exercise_id = v_serie.exercise_id;

  select count(*) into v_feitas
  from workout_set_logs
  where session_id = p_session_id and exercise_id = v_serie.exercise_id;

  update workout_session_exercises
  set completed_at = case
        when v_previstas is null or v_feitas >= v_previstas then completed_at
        else null
      end
  where session_id = p_session_id and exercise_id = v_serie.exercise_id;

  -- O progresso do desafio volta atrás, com a data da série — é ela que diz
  -- em qual janela a soma entrou.
  select s.user_profile_id into v_profile
  from students s where s.id = v_sessao.student_id;

  if v_profile is not null then
    perform descontar_desafio(v_profile, v_serie.organization_id, 'SETS', 1, v_serie.completed_at);
    perform descontar_desafio(
      v_profile, v_serie.organization_id, 'VOLUME_KG',
      coalesce(v_serie.weight, 0) * v_serie.reps_completed, v_serie.completed_at
    );
  end if;

  update workout_sessions set updated_at = now() where id = p_session_id;

  return true;
end;
$$;

revoke all on function desfazer_serie(uuid, text) from public, anon;
grant execute on function desfazer_serie(uuid, text) to authenticated, service_role;

insert into schema_migrations (version) values ('0058_desfazer_serie.sql') on conflict do nothing;
