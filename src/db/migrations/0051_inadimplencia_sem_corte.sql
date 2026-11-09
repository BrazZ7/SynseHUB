-- =============================================================================
-- 0051 — A inadimplência contada no banco, não sobre uma resposta cortada
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- `/finance/inadimplentes` lia **todas** as cobranças vencidas da academia, sem
-- teto, e calculava cinco números em cima da lista na aplicação:
--
--   alunos em atraso      (distintos)
--   valor em aberto       (soma)
--   atraso médio          (média de dias)
--   acima de 30 dias      (contagem)
--   a contagem de cada faixa do filtro
--
-- O PostgREST corta a resposta no teto configurado no servidor **sem dar
-- erro**. Cobrança vencida acumula mês a mês e é justamente o conjunto que
-- mais cresce sem ninguém apagar, então esta era a leitura mais perto de
-- encostar no teto — e a que erra na direção mais cara: todos os cinco números
-- vêm **menores**. A academia vê "R$ 8.400 em aberto" quando são R$ 23.000, e
-- não há nada na tela dizendo que falta linha.
--
-- É a mesma família da 0049 e da 0050. A regra do projeto já dizia quem
-- calcula número derivado: o banco.
--
-- ── Por que os cortes vêm por argumento ─────────────────────────────────────
--
-- As faixas (1 a 5 dias, 6 a 15, 16 a 30, mais de 30) são régua de produto, e
-- já existem em `src/features/payments/faixas-de-atraso.ts` — a tela rotula por
-- elas e o data source as traduz em janela de datas para filtrar a lista.
-- Repeti-las em SQL criaria uma segunda definição da mesma régua, que
-- envelheceria em silêncio: a tela diria "7 dias" numa linha que a contagem
-- pôs na faixa de 1 a 5. Então a função recebe `p_cortes` e não conhece
-- nenhuma faixa por nome.
--
-- ── Por que `p_hoje` vem de fora ────────────────────────────────────────────
--
-- O selo de cada linha é desenhado pela aplicação com `daysOverdue`, que conta
-- em cima do relógio dela. Se a função usasse `current_date`, os dois poderiam
-- discordar por um dia na virada — e o sintoma seria uma linha marcada "6 dias"
-- dentro do filtro de 1 a 5. Recebendo a data, o número da faixa e o do selo
-- saem do mesmo dia.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- Roda com o privilégio de quem chama, então `charges_staff` (0001) filtra
-- sozinha: quem não é da academia não soma nada, mesmo passando o id dela.
-- Nenhuma tabela nova, nenhuma política nova.
-- =============================================================================

/**
 * O resumo das cobranças vencidas de uma academia, por faixa de atraso.
 *
 * Devolve uma linha por faixa **presente** mais uma linha de total, que é a
 * `faixa = 0`. Total não é a soma das faixas em todas as colunas: um aluno com
 * duas cobranças em faixas diferentes conta uma vez em cada faixa e uma vez só
 * no total, e é justamente esse número — "alunos em atraso" — que a tela
 * mostra ao lado de "cobranças em aberto" para dizer que são grandezas
 * diferentes.
 *
 * `dias_total` em vez da média: quem divide é a aplicação, com o mesmo
 * arredondamento de antes. Média de média não fecha, e devolver a soma deixa a
 * conta do total e a de cada faixa saírem da mesma linha.
 *
 * Com nenhuma cobrança vencida a função ainda devolve **uma** linha, a do
 * total, zerada — `grouping sets ((), …)` sempre produz o grupo vazio. A tela
 * espera número, não ausência.
 */
create or replace function resumo_de_inadimplencia(
  p_organization_id uuid,
  p_hoje            date,
  p_cortes          int[]
)
returns table (
  faixa      int,
  cobrancas  bigint,
  alunos     bigint,
  valor      numeric,
  dias_total bigint
)
language sql stable security invoker set search_path = public as $$
  with vencidas as (
    select c.student_id,
           c.amount,
           /*
            * Piso em zero, como `daysOverdue` na aplicação: cobrança marcada
            * como vencida com data futura tem zero dia de atraso, e cai na
            * primeira faixa em vez de virar um número negativo.
            */
           greatest(0, p_hoje - c.due_date) as dias
      from charges c
     where c.organization_id = p_organization_id
       and c.status = 'OVERDUE'
  ),
  marcadas as (
    select v.*,
           /*
            * O índice do primeiro corte que ainda cabe. Nenhum cabe — atraso
            * maior que o último corte — e é a faixa aberta, que é a de depois
            * do fim do array.
            */
           coalesce(
             (select min(i)
                from generate_subscripts(p_cortes, 1) i
               where v.dias <= p_cortes[i]),
             coalesce(array_length(p_cortes, 1), 0) + 1
           ) as faixa
      from vencidas v
  )
  select /*
          * `grouping()` distingue o grupo total da faixa, e não um `coalesce`
          * para zero: zero é um valor possível de agrupamento em geral, e
          * depender de ele nunca aparecer é apostar na numeração.
          */
         (case when grouping(m.faixa) = 1 then 0 else m.faixa end)::int as faixa,
         count(*)                         as cobrancas,
         count(distinct m.student_id)     as alunos,
         coalesce(sum(m.amount), 0)       as valor,
         coalesce(sum(m.dias), 0)::bigint as dias_total
    from marcadas m
   group by grouping sets ((), (m.faixa))
$$;

revoke all on function resumo_de_inadimplencia(uuid, date, int[]) from public, anon;
grant execute on function resumo_de_inadimplencia(uuid, date, int[]) to authenticated, service_role;

/*
 * A lista em si continua vindo de `charges`, filtrada por janela de
 * vencimento, e passa a ser paginada com `count: 'exact'`. Nenhum índice novo:
 * `charges_org_status_idx` (0002) já recorta academia e situação, e o que
 * sobra depois dele são as cobranças vencidas de **uma** academia — conjunto
 * em que ordenar por vencimento não pesa. Este comentário fica no lugar de um
 * índice redundante, para a próxima pessoa não procurar.
 */

insert into schema_migrations (version) values ('0051_inadimplencia_sem_corte.sql') on conflict do nothing;
