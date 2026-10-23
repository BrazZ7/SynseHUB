-- =============================================================================
-- SynseHub · 0062 — O feedback do treino, do aluno para o professor
--
-- Hoje o professor vê o que o aluno **fez**: séries, carga, repetições,
-- duração. Não vê como foi. A diferença entre "fez 4×10 com 60 kg" e "fez
-- 4×10 com 60 kg e o ombro doeu na terceira" é a diferença entre ajustar o
-- treino na semana que vem e ajustar depois da lesão.
--
-- ── Por que uma tabela nova, e não uma coluna em `workout_sessions` ──────────
--
-- Porque o feedback é esparso. A maioria dos treinos não vai ter nenhum, e
-- `workout_sessions` é a tabela quente do Treino Ativo — ela ganha linha a cada
-- treino aberto. Cinco colunas quase sempre nulas ali encarecem toda leitura de
-- histórico para servir a minoria dos casos.
--
-- E porque o feedback tem ciclo próprio: ele é enviado pelo aluno e **visto**
-- pelo professor. Esse segundo tempo não é da sessão de treino.
--
-- ── Por que não reaproveitar `workout_logs.rpe` ──────────────────────────────
--
-- Porque `workout_logs` é a tabela achatada do desenho antigo, e **nada no
-- produto escreve nela** — está dito em seis lugares do código, e os leitores
-- já foram migrados para `exercise_progress` e `workout_set_logs`. A coluna
-- `rpe` dela é resto de um caminho abandonado, não um recurso pela metade: só
-- a semente da demonstração a preenche, e é por isso que os gráficos da demo
-- parecem cheios enquanto em academia de verdade a coluna é nula.
--
-- Ressuscitar a tabela para aproveitar uma coluna seria trazer de volta o
-- desenho que o projeto já abandonou de propósito.
--
-- ── Uma escala, e não três perguntas ─────────────────────────────────────────
--
-- A tela aparece no instante em que a pessoa acabou de treinar e quer sair.
-- Cada campo obrigatório ali é gente que não responde — e feedback que ninguém
-- manda não ajuda professor nenhum.
--
-- Então só `effort` é obrigatório: um toque numa escala de 1 a 10. "Necessidade
-- de ajuste" não virou campo porque o dado já diz: esforço 9 ou 10 semana após
-- semana é carga alta demais, 1 ou 2 é carga de menos, e o que não cabe em
-- número cabe na observação.
--
-- ── `discomfort` separado do esforço, e isso é de propósito ──────────────────
--
-- Dor não é intensidade. Um treino leve pode machucar o joelho e um treino
-- pesado pode não doer nada. Se desconforto fosse o extremo da escala, quem
-- sentiu dor num treino tranquilo teria de escolher entre relatar a dor e
-- relatar que foi tranquilo — e escolheria errado, porque a escala é o campo
-- obrigatório.
--
-- É também o campo que o professor precisa achar primeiro, e por isso tem
-- índice parcial próprio.
-- =============================================================================

create table workout_session_feedback (
  /*
   * Um feedback por treino. A chave é a própria sessão: reenvio da fila
   * offline cai no `on conflict` e atualiza, em vez de criar uma segunda
   * opinião sobre o mesmo treino.
   */
  session_id      uuid primary key references workout_sessions(id) on delete cascade,
  /*
   * Desnormalizados da sessão, como `workout_set_logs` já faz: deixam a RLS
   * ser `is_org_staff(organization_id)` sem junção. **Quem os preenche é a
   * função, lendo a sessão** — nunca o cliente, que escolheria a academia.
   */
  organization_id uuid not null references organizations(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  effort          smallint not null check (effort between 1 and 10),
  discomfort      boolean not null default false,
  note            text check (note is null or char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  /*
   * Quando alguém da academia leu. `null` é o que faz o feedback aparecer como
   * pendente — é o que transforma isto num canal e não num depósito.
   */
  seen_at         timestamptz,
  seen_by         uuid references user_profiles(id) on delete set null
);

-- A pergunta do professor é "o que chegou deste aluno", em ordem de chegada.
create index workout_session_feedback_aluno
  on workout_session_feedback (student_id, created_at desc);

/*
 * Parcial: a academia inteira tem muito feedback e pouco desconforto. O índice
 * só sobre as linhas que alguém precisa achar com urgência fica pequeno o
 * bastante para caber em memória.
 */
create index workout_session_feedback_pendente
  on workout_session_feedback (organization_id, created_at desc)
  where discomfort and seen_at is null;

-- ── A escrita do aluno ───────────────────────────────────────────────────────
/**
 * O aluno manda como foi o treino.
 *
 * ── Só o dono escreve, e nem a academia ─────────────────────────────────────
 *
 * `is_org_staff` **não** entra na checagem, ao contrário de
 * `finish_workout_session`. Encerrar um treino pela recepção é operação; dizer
 * que o treino foi pesado e doeu o ombro é a voz do aluno, e professor
 * escrevendo isso no lugar dele é relato de saúde com autor errado.
 *
 * ── Aceita treino não encerrado, e isso é escolha ───────────────────────────
 *
 * A fila offline manda o feedback depois do encerramento (`ordem.ts`), então
 * no caminho normal a sessão já está fechada. Exigir isso aqui transformaria
 * qualquer defeito de ordenação em feedback perdido — e o custo de aceitar é
 * zero: a sessão existe e é do aluno, que é o que importa.
 *
 * ── Reenvio é inofensivo ────────────────────────────────────────────────────
 *
 * `on conflict (session_id) do update`. A fila reenvia até receber sucesso, e
 * duas chegadas do mesmo feedback têm de deixar uma linha, não duas.
 */
create or replace function set_workout_feedback(
  p_session_id uuid,
  p_effort     smallint,
  p_discomfort boolean default false,
  p_note       text default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_sessao workout_sessions;
begin
  select * into v_sessao from workout_sessions where id = p_session_id;
  if not found then
    raise exception 'Treino não encontrado.' using errcode = 'P0002';
  end if;

  if owns_student(v_sessao.student_id) is not true then
    raise exception 'Este treino não é seu.' using errcode = '42501';
  end if;

  if p_effort is null or p_effort not between 1 and 10 then
    raise exception 'Esforço fora da escala: %', p_effort using errcode = '22023';
  end if;

  insert into workout_session_feedback
    (session_id, organization_id, student_id, effort, discomfort, note)
  values (
    v_sessao.id,
    -- Da sessão, não do cliente: é o que impede feedback plantado em outra academia.
    v_sessao.organization_id,
    v_sessao.student_id,
    p_effort,
    coalesce(p_discomfort, false),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (session_id) do update
    set effort     = excluded.effort,
        discomfort = excluded.discomfort,
        note       = excluded.note,
        updated_at = now(),
        /*
         * Feedback corrigido volta a ser novidade. Sem isto, o aluno que
         * manda de novo porque esqueceu de marcar a dor vê o relato ficar
         * como "já visto" — e ninguém olha de novo.
         */
        seen_at    = null,
        seen_by    = null;
end;
$$;

revoke all on function set_workout_feedback(uuid, smallint, boolean, text) from public, anon;
grant execute on function set_workout_feedback(uuid, smallint, boolean, text) to authenticated, service_role;

-- ── A leitura do professor ───────────────────────────────────────────────────
/**
 * A academia marca que leu.
 *
 * `coalesce(seen_at, now())` e não `now()`: "visto" é a primeira vez. Carimbar
 * de novo a cada abertura da página faria o relatório de tempo de resposta
 * medir o último clique em vez do atendimento.
 */
create or replace function marcar_feedback_visto(p_session_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from workout_session_feedback where session_id = p_session_id;
  if not found then
    raise exception 'Feedback não encontrado.' using errcode = 'P0002';
  end if;

  if is_org_staff(v_org) is not true then
    raise exception 'Este feedback não é da sua academia.' using errcode = '42501';
  end if;

  update workout_session_feedback
  set seen_at = coalesce(seen_at, now()),
      seen_by = coalesce(seen_by, auth_profile_id())
  where session_id = p_session_id;
end;
$$;

revoke all on function marcar_feedback_visto(uuid) from public, anon;
grant execute on function marcar_feedback_visto(uuid) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table workout_session_feedback enable row level security;

/*
 * O aluno lê o que ele mesmo mandou — a tela de histórico mostra de volta. Só
 * leitura: a escrita passa por `set_workout_feedback`, que é quem preenche a
 * academia a partir da sessão. Sem o `revoke` abaixo, um insert cru gravaria
 * feedback com `organization_id` escolhido pelo cliente.
 */
create policy workout_session_feedback_self on workout_session_feedback
  for select using (owns_student(student_id));

create policy workout_session_feedback_staff on workout_session_feedback
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

revoke insert, update, delete on workout_session_feedback from authenticated, anon;

insert into schema_migrations (version) values ('0062_feedback_do_treino.sql') on conflict do nothing;
