-- =============================================================================
-- SynseHub · 0071 — O lembrete entregue uma vez, e não três
--
-- A 0070 deixou a entrega para depois: a tabela guardava a intenção ("me avise
-- às 10h") e `routine_reminders_due` respondia "o que venceu nos últimos N
-- minutos". Quem entrega é a rotina do servidor, e agora que ela existe de
-- verdade — um agendador gratuito, de cinco em cinco minutos — a conta da 0070
-- não fecha mais.
--
-- ── O que estava errado, em números ─────────────────────────────────────────
--
-- A 0070 pedia que a janela casasse com a frequência de quem chama: de 15 em
-- 15 minutos com janela de 15, todo bloco é visto uma vez. **Nenhum agendador
-- gratuito acorda de 15 em 15 minutos.** O GitHub Actions aceita cinco minutos
-- de intervalo mínimo e, em troca, atrasa: a documentação dele avisa que uma
-- execução agendada pode sair com minutos de atraso, e no fim da hora cheia o
-- atraso é maior porque é quando o mundo todo agenda.
--
-- Com isso, as duas saídas da 0070 eram:
--
--   * janela = intervalo (15 e 15): a execução das 10h15 que sai 10h25 cobre
--     de 10h10 a 10h25, e **ninguém** cobre 10h00–10h10. O aviso de beber
--     água das 10h simplesmente não chega. Silenciosamente.
--   * janela > intervalo (15 com 5): cada bloco é visto três vezes, e a pessoa
--     recebe três vezes "Hora de beber água".
--
-- Não há terceira opção enquanto a função só responde sobre horário. Então ela
-- para de só responder: ela **reivindica**.
--
-- ── Reivindicar, e por que é uma coluna e não uma tabela ────────────────────
--
-- A 0070 escreveu que guardar o que já foi mandado exigiria "uma tabela de
-- entregas que cresce para sempre". Exigiria mesmo — e é justamente o que
-- **não** está aqui. O que está é uma coluna por bloco, sobrescrita: o último
-- instante em que aquele bloco virou aviso. Trinta blocos por pessoa, trinta
-- `timestamptz` que se sobrescrevem, nada que cresça.
--
-- A pergunta "já mandei este?" vira "o último envio é anterior à ocorrência de
-- hoje?". Comparar com a **ocorrência** (o instante das 10h de hoje no relógio
-- da pessoa), e não com "há menos de uma hora", é o que faz a conta funcionar
-- todo dia sem acumular nada.
--
-- ── Atômico, porque duas execuções se encontram ─────────────────────────────
--
-- Agendador atrasado mais agendador no horário é duas execuções ao mesmo tempo,
-- e isso acontece. A reivindicação é um `update ... returning`: o Postgres
-- trava a linha, a segunda transação reavalia o `where` depois da trava, vê o
-- `last_reminded_at` já escrito e não leva a linha. Quem não levou, não manda.
-- Sem tabela de fila, sem `advisory lock`, sem janela de corrida.
--
-- O preço, escrito para não ser descoberto num defeito: **reivindica antes de
-- entregar**. Se o push falhar depois da reivindicação, aquele aviso é perdido
-- em vez de repetido. Para "beber água" às 10h, um lembrete perdido é melhor
-- que o mesmo lembrete três vezes — e a decisão contrária (entregar e marcar
-- depois) devolve a corrida que acabamos de fechar.
--
-- ── O teto desce para dentro da função ──────────────────────────────────────
--
-- A rota tinha o teto em memória: pegava tudo e cortava em 500. Com
-- reivindicação isso vira perda — as linhas 501 em diante ficariam marcadas
-- como enviadas sem ninguém enviar. O teto passa a ser `limit` dentro da
-- mesma instrução: o que não cabe não é reivindicado e aparece na execução
-- seguinte.
--
-- ── E a janela deixa de ser medida em `time` ────────────────────────────────
--
-- A 0070 comparava `agora::time >= at_time`, e isso quebra na virada do dia:
-- um bloco de sono às 23h55 tinha janela de cinco minutos em vez de quinze,
-- porque à meia-noite `agora::time` é 00h00 e deixa de ser maior que 23h55.
-- Com agendador atrasado, esse bloco nunca saía. Aqui a comparação é entre
-- instantes, com a ocorrência de ontem e a de hoje como candidatas — e aí a
-- meia-noite não é fronteira de nada.
-- =============================================================================

/*
 * Nulo é "nunca avisei", e é o que vale para todo bloco que já existe: o
 * primeiro lembrete depois desta migration sai normalmente.
 */
alter table routine_blocks add column if not exists last_reminded_at timestamptz;

/*
 * A assinatura muda (ganhou o teto), então a antiga sai. Função nova nasce com
 * `execute` para `public` — o incidente da 0061 — e por isso o `revoke` logo
 * abaixo não é zelo, é a correção de um defeito que já aconteceu neste banco.
 */
drop function if exists routine_reminders_due(integer);

/**
 * A ocorrência deste bloco que venceu na janela, ou nulo.
 *
 * ── Por que isto é uma função à parte ───────────────────────────────────────
 *
 * Porque é a única aritmética difícil da entrega, e porque ela só é testável
 * de verdade se o "agora" vier de fora. A regra que ela guarda — a ocorrência
 * pode ser de **ontem** no relógio da pessoa — só acontece nos minutos
 * seguintes à meia-noite local, e não há como pôr o relógio do servidor ali
 * num teste. Com o instante como argumento, o caso vira uma linha de teste em
 * vez de uma esperança.
 *
 * ── As duas candidatas ──────────────────────────────────────────────────────
 *
 * Um bloco de sono às 23h55 vence às 23h55 de **ontem** quando o agendador
 * passa à 00h05 de hoje. A 0070 comparava `agora::time >= at_time` e perdia
 * exatamente esse bloco: à meia-noite, 00h05 deixa de ser maior que 23h55, e
 * o lembrete sumia sem erro nenhum. Aqui as candidatas são a ocorrência de
 * hoje e a de ontem, comparadas como instante — e a meia-noite deixa de ser
 * fronteira.
 *
 * `stable` e não `immutable`: a tabela de fusos do sistema pode mudar entre
 * versões do Postgres, e com ela o deslocamento de uma data passada. É
 * `stable` que o planejador precisa para embutir a função na consulta de fora,
 * que é o que mantém a varredura dos blocos em uma passada só.
 */
create or replace function routine_block_due_at(
  p_agora   timestamptz,
  p_tz      text,
  p_at_time time,
  p_days    smallint[],
  p_minutos integer
) returns timestamptz
language sql stable set search_path = public as $$
  select o.quando
  from (
    select ((p_agora at time zone p_tz)::date - n.atras) as dia
    from (values (0), (1)) as n(atras)
  ) d
  cross join lateral (select (d.dia + p_at_time) at time zone p_tz as quando) o
  where extract(isodow from d.dia)::smallint = any(p_days)
    and o.quando <= p_agora
    and o.quando > p_agora - make_interval(mins => p_minutos)
  /*
   * Com janela de até 60 minutos as duas candidatas nunca cabem na mesma
   * janela — elas estão a 24 horas uma da outra. O `limit` é para quem chamar
   * com uma janela maior não receber duas linhas de uma função escalar.
   */
  order by o.quando desc
  limit 1
$$;

revoke all on function routine_block_due_at(timestamptz, text, time, smallint[], integer)
  from public, anon, authenticated;
grant execute on function routine_block_due_at(timestamptz, text, time, smallint[], integer)
  to service_role;

/**
 * Reivindica e devolve os lembretes vencidos na janela.
 *
 * **Não é uma leitura.** Cada linha devolvida sai marcada como avisada, e uma
 * segunda chamada na mesma janela devolve vazio. Quem chama é a rotina do
 * servidor com a chave de serviço; nenhum caminho da API autenticada chega
 * aqui, e ler a própria rotina é pela tabela, com RLS.
 *
 * `p_minutos` é o quanto para trás olhar, limitado a 60 — o limite é o que
 * garante que a ocorrência de ontem e a de hoje nunca caiam na mesma janela.
 */
create or replace function routine_reminders_due(
  p_minutos integer default 15,
  p_teto    integer default 500
) returns table (
  block_id        uuid,
  user_profile_id uuid,
  kind            text,
  title           text,
  at_time         time,
  fuso            text
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_janela integer := least(greatest(coalesce(p_minutos, 15), 1), 60);
  v_teto   integer := least(greatest(coalesce(p_teto, 500), 1), 5000);
begin
  return query
  with devidos as materialized (
    select
      b.id,
      b.user_profile_id as perfil,
      b.kind,
      b.title,
      b.at_time,
      t.tz,
      q.quando
    from routine_blocks b
    /*
     * O fuso é o da academia mais recente da pessoa, e São Paulo para quem não
     * tem academia nenhuma: a rotina é da vida, não da matrícula.
     */
    cross join lateral (
      select coalesce(
        (select org_timezone(s.organization_id) from students s
          where s.user_profile_id = b.user_profile_id
          order by s.created_at desc limit 1),
        'America/Sao_Paulo'
      ) as tz
    ) t
    cross join lateral (
      select routine_block_due_at(now(), t.tz, b.at_time, b.days, v_janela) as quando
    ) q
    where b.remind
      and q.quando is not null
      /*
       * O coração da coisa: já avisei **esta** ocorrência? Comparar com a
       * ocorrência, e não com "há menos de N minutos", é o que faz o bloco
       * voltar a disparar amanhã sem guardar histórico de nada.
       */
      and (b.last_reminded_at is null or b.last_reminded_at < q.quando)
    /*
     * O mais antigo primeiro: numa janela que estourou o teto, o aviso mais
     * atrasado é o que ainda tem chance de significar algo.
     */
    order by q.quando
    limit v_teto
  ),
  reivindicados as (
    /*
     * ── A condição repetida aqui não é redundante ─────────────────────────
     *
     * `devidos` já filtrou por `last_reminded_at`, e mesmo assim ela aparece
     * de novo no `where` do `update`. É o que fecha a corrida, e quase passou
     * em branco:
     *
     * em `read committed`, quando um `update` tropeça numa linha travada por
     * outra transação e aquela confirma, o Postgres **reavalia o `where` do
     * próprio `update`** contra a versão nova da linha. O `where` reavaliado é
     * este, não o do CTE — que foi calculado no instantâneo do início. Com
     * `where b.id = d.id` sozinho, a segunda execução reavaliaria "o id é o
     * mesmo?", veria que sim, e mandaria o aviso de novo: exatamente o
     * problema que esta migration existe para resolver, de volta pela porta
     * dos fundos.
     *
     * Com a condição aqui, a segunda execução reavalia contra o
     * `last_reminded_at` recém-escrito, descarta a linha e não leva nada.
     */
    update routine_blocks b
      set last_reminded_at = now()
      from devidos d
      where b.id = d.id
        and (b.last_reminded_at is null or b.last_reminded_at < d.quando)
      returning d.id, d.perfil, d.kind, d.title, d.at_time, d.tz
  )
  select r.id, r.perfil, r.kind, r.title, r.at_time, r.tz from reivindicados r;
end;
$$;

/*
 * Nem `authenticated`, nem `anon`. A chave de serviço é a única porta — e
 * agora mais do que antes: esta função **escreve**.
 */
revoke all on function routine_reminders_due(integer, integer) from public, anon, authenticated;
grant execute on function routine_reminders_due(integer, integer) to service_role;

insert into schema_migrations (version) values ('0071_lembrete_entregue.sql') on conflict do nothing;
