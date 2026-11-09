-- =============================================================================
-- 0055 — O ganho de carga vem da tabela que o produto escreve
--
-- ── O defeito, e ele é maior do que parece ──────────────────────────────────
--
-- A home do aluno mostra "Carga atual" e "Ganho de carga"; a ficha do aluno no
-- hub mostra "Treinos registrados" e o gráfico "Evolução de carga". Os quatro
-- saem de `workout_logs`.
--
-- **Nada no produto escreve em `workout_logs`.** A varredura é simples de
-- repetir: não há `insert` nessa tabela em lugar nenhum do repositório — nem
-- em action, nem em data source, nem em migration. Ela existe desde a 0003 e é
-- preenchida só pela semente da demonstração.
--
-- O treino de verdade entra pela 0026, série a série, em `workout_set_logs`
-- via `log_workout_set`. Então numa academia real os quatro números acima são
-- `—`, `—`, `0` e um gráfico que nunca aparece — **para sempre**, por mais que
-- o aluno treine. Na demonstração tudo funciona, porque a semente preenche a
-- tabela antiga. É o pior formato de defeito que este projeto conhece: a tela
-- plausível, sem erro nenhum, mentindo por omissão.
--
-- O sinal estava à vista e passou batido: `personal_records` (0027) lê
-- `workout_set_logs`, então "Seus recordes" funciona em produção na mesma tela
-- em que "Ganho de carga" não funciona.
--
-- ── Por que uma função, e não uma consulta ──────────────────────────────────
--
-- "O exercício mais treinado" é um `group by` com `order by count(*)`, que o
-- PostgREST não expressa. E a regra do projeto já diz quem calcula número
-- derivado: o banco.
--
-- ── O que ela decide, e por que assim ───────────────────────────────────────
--
-- **Um exercício só.** Comparar a primeira carga de qualquer exercício com a
-- última de qualquer exercício não é ganho de força: uma rosca de 20 kg
-- seguida de um agachamento de 100 virava "+80 kg de ganho". Decisão do dono
-- do produto, tomada em 13/10/2026: o número passa a ser a evolução no
-- exercício que a pessoa mais treinou, com o nome dele na tela.
--
-- **Mais treinado conta dias, não séries.** Quem faz quatro séries num dia não
-- treinou mais que quem fez duas séries em dois dias — e é a série temporal
-- que interessa aqui.
--
-- **A carga do dia é a máxima do dia.** Numa sessão há aquecimento e série
-- valendo: pegar uma série solta faria o número oscilar com a ordem em que as
-- séries foram anotadas. Máxima é também o que `personal_records` usa, então
-- as duas seções da mesma tela concordam.
--
-- **Menos de dois dias não devolve linha.** Sem dois pontos não há evolução, e
-- inventar zero diria "você não evoluiu" para quem acabou de começar. A tela
-- mostra travessão e explica o que fazer.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- Roda com o privilégio de quem chama: as políticas de `workout_sessions` e
-- `workout_set_logs` (0026) filtram sozinhas, e um aluno que passasse o id de
-- outro não recebe nada. Nenhuma tabela nova, nenhuma política nova.
--
-- Nenhum índice novo: a 0026 já indexa `workout_set_logs (session_id)` e
-- `workout_sessions (student_id, started_at desc)`, que é o caminho desta
-- consulta. Este comentário fica no lugar de um índice redundante, para a
-- próxima pessoa não procurar.
-- =============================================================================

/**
 * O ganho de carga do aluno, no exercício que ele mais treinou.
 *
 * Devolve **zero ou uma** linha. Zero quando não há dois dias com carga
 * anotada no mesmo exercício — aluno novo, ou que só passou uma vez por cada
 * coisa. A tela trata a ausência; ela não recebe um zero que mentiria.
 *
 * `primeira` e `ultima` são a carga máxima do primeiro e do último **dia** em
 * que o exercício apareceu. `dias` é quantos dias distintos ele tem, e serve
 * para a tela dizer sobre o que o número fala.
 */
create or replace function ganho_de_carga(p_student_id uuid)
returns table (
  exercise_id   uuid,
  exercise_name text,
  primeira      numeric,
  ultima        numeric,
  dias          bigint,
  primeiro_dia  timestamptz,
  ultimo_dia    timestamptz
)
language sql stable security invoker set search_path = public as $$
  with por_dia as (
    select l.exercise_id,
           date_trunc('day', l.completed_at) as dia,
           max(l.weight)                     as carga
      from workout_set_logs l
      join workout_sessions s on s.id = l.session_id
     where s.student_id = p_student_id
       and l.weight is not null
     group by 1, 2
  ),
  mais_treinado as (
    select p.exercise_id, count(*) as dias
      from por_dia p
     group by p.exercise_id
    having count(*) >= 2
     -- Empate no número de dias: o id decide, para a tela não trocar de
     -- exercício entre duas aberturas sem nada ter mudado.
     order by count(*) desc, p.exercise_id
     limit 1
  )
  select m.exercise_id,
         e.name::text,
         (array_agg(p.carga order by p.dia asc))[1]  as primeira,
         (array_agg(p.carga order by p.dia desc))[1] as ultima,
         m.dias,
         min(p.dia) as primeiro_dia,
         max(p.dia) as ultimo_dia
    from mais_treinado m
    join por_dia p   on p.exercise_id = m.exercise_id
    join exercises e on e.id = m.exercise_id
   group by m.exercise_id, e.name, m.dias
$$;

revoke all on function ganho_de_carga(uuid) from public, anon;
grant execute on function ganho_de_carga(uuid) to authenticated, service_role;

insert into schema_migrations (version) values ('0055_ganho_de_carga.sql') on conflict do nothing;
