-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0057 — Os exercícios da sessão, gravados quando o treino abre            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `workout_session_exercises` existe desde a 0026 e **nunca foi preenchida**.
-- Nada no sistema insere linha nela: nem `start_workout_session`, nem
-- `log_workout_set`, nem a aplicação. Conferido com
-- `grep -rn workout_session_exercises src/`.
--
-- O efeito é silencioso, que é o pior tipo. O gatilho `workout_set_progress`
-- (0026) existe para marcar o exercício como concluído quando a última série
-- prevista entra; ele procura a linha da sessão, não acha, e atualiza zero
-- linhas. Nenhum erro, nenhum log, e um progresso que o banco acha que está
-- mantendo.
--
-- Preencher a tabela resolve duas coisas ao mesmo tempo:
--
--   1. O gatilho da 0026 passa a funcionar.
--   2. A sessão ganha o **retrato da prescrição** no instante em que abriu. Sem
--      ele, o treinador que edita a ficha no meio do treino muda o que a
--      sessão em andamento considera "previsto": o aluno que já fez 3 de 3
--      séries vê o exercício desconcluir porque a ficha agora pede 4. A
--      sessão precisa ser consistente com o que foi prescrito quando ela
--      começou.
--
-- Por isso a quantidade de séries é **copiada** para a linha da sessão em vez
-- de lida de `workout_exercises` na hora do gatilho. `workout_exercise_id`
-- continua guardado, para ligar a sessão à prescrição de origem, mas quem
-- manda na sessão é a cópia.
--
-- Exercício feito fora do plano também entra: a linha é criada na primeira
-- série, com `workout_exercise_id` nulo — que é o caso que a 0026 já previa no
-- comentário da coluna — e sem previsão de séries, porque não havia previsão.

alter table workout_session_exercises
  add column if not exists sets_planned smallint check (sets_planned between 1 and 50);

comment on column workout_session_exercises.sets_planned is
  'Cópia de workout_exercises.sets no instante em que o treino abriu. Nula para exercício fora do plano.';

-- ── A abertura do treino grava a prescrição ──────────────────────────────────
/**
 * Igual à da **0047**, com uma diferença: depois de criar a sessão, copia os
 * exercícios do plano para dentro dela.
 *
 * O corpo vem da 0047 e não da 0026 — e vale dizer por quê, porque custou um
 * teste vermelho. `create or replace` troca a função inteira: reescrevê-la a
 * partir da 0026 apagou em silêncio o abandono do treino pendurado de oito
 * horas que a 0047 acrescentou, e as séries de hoje voltaram a cair na sessão
 * de três dias atrás. Quem redefinir esta função de novo precisa partir desta
 * versão, não de uma anterior. (O que pegou foi
 * `tests/db/treino-ativo.test.ts`, "o treino esquecido de três dias atrás não
 * engole o de hoje".)
 *
 * A cópia não acontece quando a função devolve um treino que já estava aberto —
 * `on conflict (session_id, position) do nothing` garante isso mesmo se alguém
 * chamar duas vezes. Recopiar sobrescreveria o retrato com a ficha de agora, o
 * que é exatamente o que o retrato existe para evitar.
 */
create or replace function start_workout_session(
  p_client_id       text,
  p_workout_plan_id uuid default null
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_student students;
  v_id      uuid;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador do treino ausente.' using errcode = '22023';
  end if;

  select s.* into v_student
  from students s
  join user_profiles p on p.id = s.user_profile_id
  where p.auth_user_id = auth.uid()
  order by s.created_at desc
  limit 1;

  if not found then
    raise exception 'Nenhum aluno para esta conta.' using errcode = '42501';
  end if;

  if p_workout_plan_id is not null and not exists (
    select 1 from workout_plans
    where id = p_workout_plan_id and organization_id = v_student.organization_id
  ) then
    raise exception 'Este treino não é da sua academia.' using errcode = '42501';
  end if;

  /*
   * Fecha o que ficou pendurado antes de procurar a sessão aberta — a regra da
   * 0047, preservada aqui palavra por palavra.
   *
   * Sessão sem fim é comum: o app morre no meio, a bateria acaba, a fila
   * offline desiste do FINISH. Sem esta limpeza, o `select` abaixo acha aquela
   * linha e devolve o id dela — as séries de hoje caem no treino de três dias
   * atrás, com o `started_at` de três dias atrás. Duração de 72 horas, volume
   * dos dois treinos somado, e o dia de hoje sem histórico.
   *
   * Oito horas é o corte. Treino mais longo que isso não é treino, e quem
   * passou disso já foi embora da academia.
   */
  update workout_sessions
     set status = 'ABANDONED',
         completed_at = coalesce(completed_at, started_at + interval '8 hours'),
         updated_at = now()
   where student_id = v_student.id
     and status in ('IN_PROGRESS','PAUSED')
     and started_at < now() - interval '8 hours';

  /*
   * O treino já aberto — e recente — vence o pedido novo. Sem isto, o índice
   * de sessão única recusaria com erro de constraint, e o aluno que voltou ao
   * app veria falha onde deveria ver o treino de volta.
   */
  select id into v_id from workout_sessions
  where student_id = v_student.id and status in ('IN_PROGRESS','PAUSED');
  if found then return v_id; end if;

  insert into workout_sessions (organization_id, student_id, workout_plan_id, client_id)
  values (v_student.organization_id, v_student.id, p_workout_plan_id, p_client_id)
  on conflict (student_id, client_id) do update set updated_at = now()
  returning id into v_id;

  if p_workout_plan_id is not null then
    insert into workout_session_exercises
      (session_id, workout_exercise_id, exercise_id, position, sets_planned)
    select v_id, we.id, we.exercise_id, we.position, we.sets
    from workout_exercises we
    where we.workout_plan_id = p_workout_plan_id
    on conflict (session_id, position) do nothing;
  end if;

  return v_id;
end;
$$;

revoke all on function start_workout_session(text, uuid) from public, anon;
grant execute on function start_workout_session(text, uuid) to authenticated, service_role;

-- ── A série fora do plano cria a própria linha ───────────────────────────────
/**
 * Igual à da 0026, com uma diferença: garante a linha da sessão antes de
 * gravar a série.
 *
 * Existe para o exercício que não estava na ficha. Sem isto, a série entra e o
 * gatilho de progresso não tem onde escrever — e o exercício trocado na hora
 * (o aparelho estava ocupado, a pessoa fez outro) ficaria fora do retrato da
 * sessão, como se não tivesse acontecido.
 *
 * `position` vai para o fim da lista: fora do plano não tem lugar reservado.
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

  insert into workout_set_logs (
    organization_id, session_id, exercise_id, set_number,
    reps_planned, reps_completed, weight, rest_seconds,
    started_at, completed_at, client_id
  )
  values (
    v_sessao.organization_id, p_session_id, p_exercise_id, p_set_number,
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

-- ── O progresso passa a ler o retrato ───────────────────────────────────────
/**
 * Igual ao da 0026, com uma diferença: a quantidade prevista sai da linha da
 * sessão, não da ficha.
 *
 * `coalesce(se.sets_planned, we.sets)` por causa da janela de publicação: a
 * Vercel publica no push e o SQL é colado à mão, então existem sessões abertas
 * antes desta migration, sem o retrato. Para elas a conta continua como era.
 */
create or replace function workout_set_progress() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_previstas smallint;
  v_feitas    smallint;
begin
  select coalesce(se.sets_planned, we.sets) into v_previstas
  from workout_session_exercises se
  left join workout_exercises we on we.id = se.workout_exercise_id
  where se.session_id = new.session_id and se.exercise_id = new.exercise_id;

  select count(*) into v_feitas
  from workout_set_logs
  where session_id = new.session_id and exercise_id = new.exercise_id;

  update workout_session_exercises
  set completed_at = case
        when v_previstas is not null and v_feitas >= v_previstas then now()
        else completed_at
      end,
      started_at = coalesce(started_at, new.started_at, new.completed_at)
  where session_id = new.session_id and exercise_id = new.exercise_id;

  update workout_sessions set updated_at = now() where id = new.session_id;
  return null;
end;
$$;

insert into schema_migrations (version) values ('0057_exercicios_da_sessao.sql') on conflict do nothing;
