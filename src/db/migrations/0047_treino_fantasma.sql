-- =============================================================================
-- 0047 — O treino que ninguém fechou
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- `start_workout_session` (0026) devolve a sessão já aberta em vez de criar
-- outra, e isso está certo: o aluno que volta ao app dez minutos depois
-- precisa do treino de volta, não de um segundo cronômetro. O que a função
-- não olhava era **quando** aquela sessão abriu.
--
-- Sessão fica pendurada com facilidade — o app morre no meio da série, a
-- bateria acaba, a fila offline esgota as tentativas do FINISH. A linha
-- continua `IN_PROGRESS` para sempre, e na próxima vez que o aluno treina as
-- séries novas entram **naquela** sessão: `started_at` de três dias atrás,
-- duração de 72 horas, volume dos dois treinos somado, e o dia de hoje sem
-- nada no histórico. Nenhum erro, em lugar nenhum.
--
-- Encontrado ao construir o painel "Treinando agora": ele mostraria essas
-- linhas como gente treinando neste momento. O painel filtra por janela de
-- tempo de qualquer jeito, mas filtrar na tela deixaria o dado errado no
-- banco — e o dado errado é o que vai para o relatório do mês.
--
-- ── O que muda ──────────────────────────────────────────────────────────────
--
-- 1. `start_workout_session` abandona o que passou de oito horas antes de
--    procurar a sessão aberta. Oito horas porque treino mais longo que isso
--    não é treino, e quem passou disso já foi embora da academia.
-- 2. Limpeza única das que já estão penduradas hoje.
--
-- Nada de tabela nova, nada de política nova: é `create or replace` na função
-- e um `update` de arrumação.
-- =============================================================================

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
   * O treino já aberto vence o pedido novo. Sem isto, o índice de sessão única
   * recusaria com erro de constraint, e o aluno que voltou ao app veria falha
   * onde deveria ver o treino de volta.
   */
  /*
   * Fecha o que ficou pendurado antes de procurar a sessão aberta.
   *
   * Sessão sem fim é comum: o app morre no meio, a bateria acaba, a fila
   * offline desiste do FINISH. Sem esta limpeza, o `select` abaixo achava
   * aquela linha e devolvia o id dela — as séries de hoje caíam no treino de
   * três dias atrás, com o `started_at` de três dias atrás. Duração de 72
   * horas, volume dos dois treinos somado, e o dia de hoje sem histórico.
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

  select id into v_id from workout_sessions
  where student_id = v_student.id and status in ('IN_PROGRESS','PAUSED');
  if found then return v_id; end if;

  insert into workout_sessions (organization_id, student_id, workout_plan_id, client_id)
  values (v_student.organization_id, v_student.id, p_workout_plan_id, p_client_id)
  on conflict (student_id, client_id) do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ── As que já estão penduradas ──────────────────────────────────────────────
/*
 * Arrumação única. O `completed_at` recebe `started_at + 8h` em vez de `now()`
 * de propósito: carimbar agora inventaria um treino de três dias de duração no
 * relatório, que é justamente o número errado que esta migration existe para
 * impedir.
 *
 * `duration_seconds` fica nulo onde já estava: ele é do fim normal do treino, e
 * para uma sessão abandonada o honesto é não ter número — o relatório já
 * ignora quem não é COMPLETED.
 */
update workout_sessions
   set status = 'ABANDONED',
       completed_at = coalesce(completed_at, started_at + interval '8 hours'),
       updated_at = now()
 where status in ('IN_PROGRESS','PAUSED')
   and started_at < now() - interval '8 hours';

insert into schema_migrations (version) values ('0047_treino_fantasma.sql') on conflict do nothing;
