-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0059 — A série que chega de dois lugares                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- O produto mantém **uma** sessão de treino aberta por aluno
-- (`workout_sessions_um_ativo_idx`, 0026) e `start_workout_session` devolve a
-- que já está aberta. Isso é certo: duas sessões abertas dariam dois
-- cronômetros e séries caindo em lugares diferentes.
--
-- O efeito colateral aparece quando a mesma pessoa tem o treino aberto em dois
-- lugares — duas abas, o celular e o tablet, ou uma aba antiga cuja fila
-- offline só drena horas depois. Os dois lados contam as séries por conta
-- própria, então os dois mandam "série 3 do supino". E aí:
--
--   `unique (session_id, exercise_id, set_number)` recusa a segunda.
--
-- A restrição está certa no que ela quer dizer — "duas série 2 no mesmo
-- exercício não é reenvio, é dado errado" — e o jeito de aplicá-la estava
-- errado. A segunda série não era reenvio: tinha `client_id` próprio, de um
-- toque que aconteceu. A fila insistia oito vezes, desistia, e a tela dizia
-- "uma série não pôde ser enviada" para uma série que a pessoa fez.
--
-- ── A política, escrita ──────────────────────────────────────────────────────
--
-- **Reenvio** é `client_id` repetido, e continua resolvido pelo
-- `on conflict (session_id, client_id)`: devolve a mesma linha, não cria a
-- segunda. Esse é o caminho de longe mais comum — a fila remandando o que não
-- teve resposta.
--
-- **Série de outro lugar** é `client_id` novo com número ocupado. Ela entra, no
-- próximo número livre daquele exercício. Ninguém perde série, e é isso que
-- importa: o número da série é ordenação, a série é o dado.
--
-- Foi considerado e recusado comparar `completed_at` para adivinhar se é a
-- mesma série física (mesmo instante → descarta). Heurística que descarta
-- errado apaga em silêncio uma série real, e o item 7 do pedido é explícito:
-- não resolver conflito de um jeito que possa apagar série válida. Número de
-- série deslocado é visível e conferível; série apagada não.
--
-- A outra metade desta política — qual aba manda quando há duas abertas no
-- mesmo aparelho — é do cliente, e está em
-- `src/features/active-workout/storage/comando.ts`.

/**
 * Igual à da 0057, com uma diferença: o número de série ocupado desloca em vez
 * de recusar.
 *
 * (A da 0057 já carregava, da 0026, a garantia da linha em
 * `workout_session_exercises`. Quem redefinir esta função parte **desta**
 * versão — o histórico de 0026 → 0047 → 0057 → 0059 está no cabeçalho de cada
 * uma, e reescrevê-la a partir de uma antiga já apagou regra em silêncio.)
 */
create or replace function log_workout_set(
  p_session_id     uuid,
  p_exercise_id    uuid,
  p_set_number     smallint,
  p_reps_completed smallint,
  p_client_id      text,
  p_weight         numeric default null,
  p_reps_planned   smallint default null,
  p_rest_seconds   smallint default null,
  p_started_at     timestamptz default null,
  p_completed_at   timestamptz default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sessao workout_sessions;
  v_id     uuid;
  v_numero smallint := p_set_number;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador da série ausente.' using errcode = '22023';
  end if;

  select * into v_sessao from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'Treino não encontrado.' using errcode = 'P0002';
  end if;

  -- `is not true`: `owns_student` e `is_org_staff` podem devolver NULL, e
  -- `if not null` não dispara. Ver a nota da 0025.
  if (owns_student(v_sessao.student_id) or is_org_staff(v_sessao.organization_id)) is not true then
    raise exception 'Este treino não é seu.' using errcode = '42501';
  end if;

  if v_sessao.status not in ('IN_PROGRESS','PAUSED') then
    raise exception 'Este treino já foi encerrado.' using errcode = '23514';
  end if;

  insert into workout_session_exercises (session_id, exercise_id, position, sets_planned)
  select
    p_session_id,
    p_exercise_id,
    coalesce((select max(position) from workout_session_exercises where session_id = p_session_id), 0) + 1,
    null
  where not exists (
    select 1 from workout_session_exercises
    where session_id = p_session_id and exercise_id = p_exercise_id
  )
  on conflict (session_id, position) do nothing;

  /*
   * O número ocupado desloca para o próximo livre **daquele exercício**.
   *
   * Pelo exercício, e não pela sessão: contado pela sessão, a primeira série da
   * remada viraria "série 5" porque o supino teve quatro, e o histórico do
   * exercício ficaria ilegível.
   *
   * O reenvio não é afetado, e vale dizer por quê, porque parece que seria: o
   * `on conflict (session_id, client_id)` abaixo encontra a linha que já existe
   * e atualiza só as repetições — `set_number` fica como entrou na primeira
   * vez. O número novo calculado aqui é simplesmente descartado. (Uma
   * conferência extra de `client_id` existia nesta função e foi removida por
   * isso mesmo: ela não mudava nada, e uma mutação provou que não.)
   *
   * Quem mexer na cláusula de conflito para também gravar `set_number` precisa
   * trazer essa conferência de volta.
   */
  if exists (
    select 1 from workout_set_logs
    where session_id = p_session_id
      and exercise_id = p_exercise_id
      and set_number = v_numero
  ) then
    select coalesce(max(set_number), 0) + 1 into v_numero
    from workout_set_logs
    where session_id = p_session_id and exercise_id = p_exercise_id;
  end if;

  insert into workout_set_logs (
    organization_id, session_id, exercise_id, set_number,
    reps_planned, reps_completed, weight, rest_seconds,
    started_at, completed_at, client_id
  )
  values (
    v_sessao.organization_id, p_session_id, p_exercise_id, v_numero,
    p_reps_planned, p_reps_completed, p_weight, p_rest_seconds,
    p_started_at, coalesce(p_completed_at, now()), p_client_id
  )
  /*
   * O toque duplo chega aqui como a mesma linha. `do update` em vez de
   * `do nothing` porque `returning` não devolve nada num `do nothing`, e a
   * fila local precisa do id de volta para parar de tentar.
   */
  on conflict (session_id, client_id) do update set reps_completed = excluded.reps_completed
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function log_workout_set(uuid, uuid, smallint, smallint, text, numeric, smallint, smallint, timestamptz, timestamptz) from public, anon;
grant execute on function log_workout_set(uuid, uuid, smallint, smallint, text, numeric, smallint, smallint, timestamptz, timestamptz) to authenticated, service_role;

insert into schema_migrations (version) values ('0059_serie_de_dois_lugares.sql') on conflict do nothing;
