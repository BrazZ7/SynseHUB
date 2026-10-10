-- =============================================================================
-- 0049 — A lista de alunos sem corte: decoração e a aba "Sumidos"
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- `/alunos` mostra duas colunas que não vêm da tabela `students`: "Próxima
-- mensalidade" e "Última presença". Elas eram preenchidas por
-- `decorateStudents`, que, para a página de 20 (ou 100) alunos, fazia duas
-- leituras **sem teto**:
--
--   charges   de todos aqueles alunos, ordenadas por vencimento
--   check_ins de todos aqueles alunos, ordenados do mais recente ao mais antigo
--
-- e depois guardava, na aplicação, a primeira linha de cada aluno. Trazer a
-- tabela inteira para usar a primeira linha de cada um já é desperdício —
-- cem alunos com um ano de frequência são quinze mil linhas pela rede para
-- preencher cem células. Mas o problema não é o desperdício.
--
-- O PostgREST tem um teto próprio de linhas por resposta, configurado no
-- servidor. Quando a resposta encosta nele, ela **não dá erro**: vem cortada.
-- E como os check-ins vêm ordenados do mais recente para o mais antigo, o que
-- o corte descarta é exatamente a presença mais velha — a do aluno que não
-- aparece há tempo. Esse aluno chega à tela com "Última presença: —", como se
-- nunca tivesse entrado na academia.
--
-- Pior: esse valor cortado **alimenta um filtro**. A aba "Sumidos"
-- (`?status=DORMANT`) é `!lastCheckInAt || dias >= 21`, aplicada sobre a
-- página já lida. Com o corte, ela lista como sumido quem treinou ontem. É uma
-- lista para telefonar para quem parou de vir: errar nela é ligar para o aluno
-- errado e não ligar para o que estava sumindo.
--
-- E por rodar depois da paginação, o filtro também mentia no rodapé: o `total`
-- vinha do `count` da consulta sem filtro, então a tela dizia "478 alunos" e
-- mostrava três. A demonstração sempre fez certo (filtra e só então conta), o
-- que torna isto uma divergência entre os dois caminhos, não uma escolha.
--
-- ── O que entra ─────────────────────────────────────────────────────────────
--
-- `decoracao_dos_alunos(org, ids[])` — uma linha por aluno pedido, com a
-- próxima cobrança e a última presença. Não há o que cortar: o número de
-- linhas é o número de alunos da página.
--
-- `alunos_dormentes(org, dias, busca, professor, limite, deslocamento)` — a aba
-- "Sumidos" decidida no banco, com `total_geral` junto. Devolve só os ids: o
-- `select` e o mapeamento do aluno continuam num lugar só, na aplicação.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- As duas rodam com o privilégio de quem chama, então a RLS filtra sozinha:
-- `students_staff` e `check_ins_staff` (0001/0003) e `charges_staff` (0002).
-- Em particular, a decoração devolve dado financeiro — e quem não tem acesso a
-- `charges` recebe `next_charge_*` nulo pela política, sem que esta função
-- precise saber disso. Um `security definer` aqui teria que reimplementar três
-- regras de acesso, e é assim que a terceira cópia de uma regra divergiu das
-- outras duas em todo sistema que já fez isso.
--
-- Nenhuma tabela nova, nenhuma política nova.
-- =============================================================================

/**
 * A decoração da página corrente: próxima cobrança e última presença.
 *
 * `distinct on` com `order by <chave>, <tempo>` é o jeito do Postgres de pegar
 * "a primeira de cada" numa passada só — era isto que a aplicação fazia à mão,
 * depois de trazer tudo pela rede.
 *
 * A próxima cobrança é a mais **próxima** entre as em aberto (`asc`); a última
 * presença é a mais **recente** (`desc`). Os dois índices que isso usa já
 * existem desde a 0002/0003.
 *
 * `p_student_ids` é o recorte da página, e o `where organization_id` continua
 * ali junto: a RLS já isola a academia, e o filtro explícito faz a consulta
 * usar o índice composto em vez de varrer.
 */
create or replace function decoracao_dos_alunos(
  p_organization_id uuid,
  p_student_ids     uuid[]
)
returns table (
  student_id            uuid,
  next_charge_due_date  date,
  next_charge_amount    numeric,
  last_check_in_at      timestamptz
)
language sql stable security invoker set search_path = public as $$
  with alvo as (
    select unnest(p_student_ids) as id
  ),
  proxima as (
    select distinct on (c.student_id)
           c.student_id,
           c.due_date,
           c.amount
      from charges c
     where c.organization_id = p_organization_id
       and c.student_id = any(p_student_ids)
       and c.status in ('PENDING', 'OVERDUE')
     order by c.student_id, c.due_date asc
  ),
  ultima as (
    select distinct on (k.student_id)
           k.student_id,
           k.checked_in_at
      from check_ins k
     where k.organization_id = p_organization_id
       and k.student_id = any(p_student_ids)
     order by k.student_id, k.checked_in_at desc
  )
  select a.id            as student_id,
         p.due_date      as next_charge_due_date,
         p.amount        as next_charge_amount,
         u.checked_in_at as last_check_in_at
    from alvo a
    left join proxima p on p.student_id = a.id
    left join ultima  u on u.student_id = a.id
$$;

revoke all on function decoracao_dos_alunos(uuid, uuid[]) from public, anon;
grant execute on function decoracao_dos_alunos(uuid, uuid[]) to authenticated, service_role;

/**
 * A aba "Sumidos": quem não aparece há `p_dias` dias ou mais, incluindo quem
 * nunca apareceu.
 *
 * Decidido aqui porque não há como decidir certo na aplicação: o critério é
 * sobre o conjunto inteiro, e paginar antes de filtrar devolve outra coisa.
 * O `count(*) over ()` vem na mesma passada para o rodapé não precisar de uma
 * segunda consulta — nem de um `count` que ignora o filtro, que era o defeito.
 *
 * Só ids saem daqui, de propósito: o `select` grande do aluno e o
 * `mapStudent` continuam num lugar só. Duplicá-los em SQL criaria duas
 * definições de "como é um aluno na lista" para divergirem.
 *
 * A ordem é a da urgência: quem nunca veio primeiro, depois do mais antigo
 * para o mais recente. O desempate pelo nome existe para a página 2 não
 * repetir nem pular quem a 1 já mostrou.
 *
 * Não há filtro de `status` aqui porque a aba nunca teve um: hoje ela também
 * lista quem já cancelou, e os dois caminhos (banco e demonstração) concordam
 * nisso. Discordar seria mudar o produto escondido numa correção de corte.
 */
create or replace function alunos_dormentes(
  p_organization_id uuid,
  p_dias            int  default 21,
  p_busca           text default null,
  p_trainer_id      uuid default null,
  p_plan_id         uuid default null,
  p_limit           int  default 20,
  p_offset          int  default 0
)
returns table (student_id uuid, total_geral bigint)
language sql stable security invoker set search_path = public as $$
  with ultima as (
    select distinct on (k.student_id) k.student_id, k.checked_in_at
      from check_ins k
     where k.organization_id = p_organization_id
     order by k.student_id, k.checked_in_at desc
  ),
  sumidos as (
    select s.id                as student_id,
           p.name              as student_name,
           u.checked_in_at     as visto_em
      from students s
      join user_profiles p on p.id = s.user_profile_id
      left join ultima u on u.student_id = s.id
     where s.organization_id = p_organization_id
       and (u.checked_in_at is null
            or u.checked_in_at < now() - make_interval(days => greatest(0, coalesce(p_dias, 21))))
       and (p_trainer_id is null or s.trainer_id = p_trainer_id)
       and (
         p_plan_id is null
         or exists (
           select 1
             from memberships m
            where m.student_id = s.id
              and m.plan_id = p_plan_id
              and m.status = 'ACTIVE'
         )
       )
       and (
         p_busca is null
         or p.name     ilike '%' || p_busca || '%'
         or p.email    ilike '%' || p_busca || '%'
         or p.synse_id ilike '%' || p_busca || '%'
       )
  )
  select d.student_id,
         count(*) over () as total_geral
    from sumidos d
   order by d.visto_em asc nulls first, d.student_name asc
   limit greatest(1, least(coalesce(p_limit, 20), 200))
  offset greatest(0, coalesce(p_offset, 0))
$$;

revoke all on function alunos_dormentes(uuid, int, text, uuid, uuid, int, int) from public, anon;
grant execute on function alunos_dormentes(uuid, int, text, uuid, uuid, int, int)
  to authenticated, service_role;

insert into schema_migrations (version) values ('0049_alunos_sem_corte.sql') on conflict do nothing;
