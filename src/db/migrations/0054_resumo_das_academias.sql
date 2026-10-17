-- =============================================================================
-- 0054 — O resumo de cada academia somado no banco
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- `/synse-admin` monta o painel da plataforma assim:
--
--   1. lê **todas** as organizações, sem teto;
--   2. para **cada uma**, dispara duas consultas — a contagem de alunos e o
--      `getPaySummary`;
--   3. e o `getPaySummary` lê **vinte mil cobranças** da academia para somar
--      quatro números num laço da aplicação.
--
-- Com cinquenta academias isso é 1 + 150 consultas e um milhão de linhas de
-- cobrança atravessando a rede para produzir dez números. O painel fica mais
-- lento a cada cliente novo — e o `limit: 20000` do passo 3 é um corte
-- silencioso igual ao do PostgREST: a academia que passar dele aparece com
-- GMV menor do que faturou, sem nada na tela dizendo isso.
--
-- É a mesma família da 0049, 0050 e 0051, e a regra do projeto já dizia quem
-- soma: o banco.
--
-- ── O que esta função devolve, e o que ela não calcula ──────────────────────
--
-- Ela devolve **dinheiro bruto e contagem**: recebido, previsto, atrasado,
-- quantas estão atrasadas, quantos alunos ativos. Uma linha por academia.
--
-- Ela **não** calcula a comissão da Synse, e isso é deliberado. O split mora
-- em `src/lib/payments/split.ts`: tem percentual por academia, taxa fixa,
-- três estratégias de quem absorve a tarifa do provedor, uma trava para a
-- academia nunca receber valor negativo, e padrões que vêm de variáveis de
-- ambiente — que o banco não lê. Reescrever essa regra em SQL criaria uma
-- segunda definição da conta que paga as contas da empresa, e as duas
-- divergiriam no primeiro ajuste. A aplicação recebe o bruto e aplica o split
-- uma vez, no único lugar onde ele existe.
--
-- ── Por que uma linha por academia, e não um total só ───────────────────────
--
-- Porque a comissão depende do acordo de cada academia: taxa fixa é somada
-- **uma vez por academia**, então `split(soma dos recebidos)` não é a soma dos
-- splits. Para totalizar a plataforma é preciso o bruto de cada uma. Uma linha
-- curta por academia é a forma irredutível disso — e é ordens de grandeza
-- menor que as vinte mil cobranças por academia que trafegavam antes.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- Roda com o privilégio de quem chama. A conta de plataforma enxerga todas as
-- academias porque as políticas já permitem; a equipe de uma academia que
-- chamasse esta função com o id de outra não somaria nada, porque
-- `charges_staff` e as políticas de `students` filtram antes. Nenhuma tabela
-- nova, nenhuma política nova.
--
-- Nenhum índice novo: `charges_org_status_idx` (0002) já recorta academia e
-- situação, e `students` já é indexada por organização. Este comentário fica
-- no lugar de um índice redundante, para a próxima pessoa não procurar.
-- =============================================================================

/**
 * O resumo financeiro e de alunos de cada academia.
 *
 * `p_organization_ids` nulo significa "todas que eu posso ver" — é o que o
 * painel da plataforma usa para totalizar. Com a lista preenchida, devolve só
 * as perguntadas, que é como a tela de uma academia pergunta pela sua.
 *
 * `p_limite` é teto escrito: a função ordena por criação (a mais nova
 * primeiro, como a lista do painel) e devolve no máximo esse tanto. A
 * aplicação compara a quantidade de linhas com o total de academias e avisa na
 * tela quando o corte aconteceu — corte que a tela anuncia é diferente de
 * resposta cortada em silêncio, que é o defeito que esta migration fecha.
 *
 * Academia sem cobrança nenhuma ainda devolve linha, zerada: o painel espera
 * número, não ausência.
 */
create or replace function resumo_das_academias(
  p_organization_ids uuid[] default null,
  p_limite           int    default 500
)
returns table (
  organization_id uuid,
  alunos_ativos   bigint,
  recebido        numeric,
  previsto        numeric,
  atrasado_valor  numeric,
  atrasado_qtd    bigint
)
language sql stable security invoker set search_path = public as $$
  select o.id,
         coalesce(a.alunos, 0)::bigint,
         coalesce(c.recebido, 0)::numeric,
         coalesce(c.previsto, 0)::numeric,
         coalesce(c.atrasado_valor, 0)::numeric,
         coalesce(c.atrasado_qtd, 0)::bigint
    from organizations o
    left join lateral (
      select count(*) as alunos
        from students s
       where s.organization_id = o.id
         and s.status = 'ACTIVE'
    ) a on true
    left join lateral (
      select sum(ch.amount) filter (where ch.status = 'PAID')    as recebido,
             sum(ch.amount) filter (where ch.status = 'PENDING') as previsto,
             sum(ch.amount) filter (where ch.status = 'OVERDUE') as atrasado_valor,
             count(*)       filter (where ch.status = 'OVERDUE') as atrasado_qtd
        from charges ch
       where ch.organization_id = o.id
    ) c on true
   where p_organization_ids is null or o.id = any(p_organization_ids)
   order by o.created_at desc, o.id
   limit greatest(1, coalesce(p_limite, 500))
$$;

revoke all on function resumo_das_academias(uuid[], int) from public, anon;
grant execute on function resumo_das_academias(uuid[], int) to authenticated, service_role;

/**
 * Quantas academias existem por plano, entre as ativas.
 *
 * O MRR da Synse é a soma das assinaturas SynseHub das academias ativas, e o
 * preço de cada plano mora em `HUB_PLAN_CATALOG`, na aplicação — é catálogo
 * comercial, muda sem migration. Então o banco conta por plano e a aplicação
 * multiplica: quatro linhas em vez de uma por academia, e o preço continua em
 * um lugar só.
 */
create or replace function academias_por_plano()
returns table (hub_plan text, academias bigint)
language sql stable security invoker set search_path = public as $$
  select o.hub_plan::text, count(*)::bigint
    from organizations o
   where o.status = 'ACTIVE'
   group by o.hub_plan
$$;

revoke all on function academias_por_plano() from public, anon;
grant execute on function academias_por_plano() to authenticated, service_role;

insert into schema_migrations (version) values ('0054_resumo_das_academias.sql') on conflict do nothing;
