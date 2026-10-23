-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0060 — Eventos do produto                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Não havia indicador de produto nenhum. `grep -rln "analytics|posthog|
-- plausible|gtag(" src/` não devolvia nada, e `src/lib/logger.ts` é registro
-- técnico — erro e evento de sistema. Não havia como responder a pergunta mais
-- básica de um produto de treino: **quantos treinos iniciados viram
-- concluídos?**
--
-- ── Por que no próprio banco, e não numa ferramenta ─────────────────────────
--
-- Rastreador externo recebe o que mandam, e o que este produto tem para mandar
-- é frequência de academia, carga levantada e corrida com localização. Dado de
-- saúde pela LGPD. O pedido é explícito: não enviar conteúdo de saúde para
-- plataforma de publicidade, e não acrescentar rastreador externo sem avaliar a
-- configuração de consentimento.
--
-- Aqui não sai nada do banco que já guarda esses dados. Nenhum script de
-- terceiro, nenhuma requisição do navegador para fora.
--
-- ── O que esta tabela aceita, e por que tão pouco ───────────────────────────
--
-- Nome de uma lista fechada, rótulo de uma lista fechada, um número. **Não há
-- campo livre, nem `jsonb`.** Campo livre em tabela de evento recebe, em algum
-- momento, o nome do exercício, a observação do treinador ou o texto que a
-- pessoa digitou — e aí a tabela de métrica virou cópia do dado sensível, com
-- outra política de acesso e outro prazo de guarda.
--
-- Quem é a pessoa sai do `auth.uid()`, nunca do argumento. Um cliente que
-- pudesse dizer de quem é o evento poderia atribuir uso a outra conta.
--
-- ── Idempotência ────────────────────────────────────────────────────────────
--
-- `unique (name, client_id)`: o identificador é gerado no aparelho, uma vez por
-- acontecimento. Reenvio da fila, segunda renderização do componente e
-- reexecução da action chegam com o mesmo `client_id` e não criam linha nova. É
-- o requisito "evitar duplicação por reenvio ou renderização", e é a mesma
-- mecânica que o Treino Ativo já usa para as séries.

create table if not exists product_events (
  id              uuid primary key default gen_random_uuid(),
  /*
   * A lista fechada é o contrato. Evento novo exige migration, e isso é
   * proposital: nome de evento inventado no cliente produz série temporal que
   * ninguém sabe ler seis meses depois.
   *
   * O significado e a origem de cada um estão em
   * `src/features/analytics/eventos.ts`, com teste que confere que cada evento
   * declarado é emitido de onde diz.
   */
  name            text not null check (name in (
                    'ENTRADA_ESCOLHIDA',
                    'CADASTRO_CONCLUIDO',
                    'TREINO_INICIADO',
                    'SERIE_CONCLUIDA',
                    'SERIE_DESFEITA',
                    'TREINO_CONCLUIDO',
                    'TREINO_RECUPERADO',
                    'REGISTRO_PERDIDO',
                    'RESUMO_CONSULTADO',
                    'COMPARTILHAMENTO_PEDIDO',
                    'COMPARTILHAMENTO_CONFIRMADO',
                    'LEMBRETE_ALTERADO'
                  )),
  /*
   * Nulo quando a conta é encerrada (`on delete set null`): o indicador do mês
   * passado não precisa saber de quem era, e apagar a linha junto faria o
   * número do passado mudar porque alguém saiu.
   */
  user_profile_id uuid references user_profiles(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  /** Lista fechada, como o nome. Nunca texto que alguém digitou. */
  rotulo          text check (rotulo is null or rotulo in (
                    -- a porta escolhida no onboarding
                    'ACADEMIA','PESSOAL',
                    -- o que se compartilha, ou o que se perdeu
                    'TREINO','SERIE','CORRIDA','PESO','AULA',
                    -- qual resumo foi consultado
                    'SEMANA','PROGRESSO',
                    -- o estado para onde o lembrete foi
                    'LIGADO','DESLIGADO'
                  )),
  /** Número, quando o evento tem um: segundos, quantidade. Nunca medida de saúde. */
  valor           numeric(12,2) check (valor is null or valor >= 0),
  occurred_at     timestamptz not null default now(),
  /** Gerado no aparelho, uma vez por acontecimento. Torna o reenvio inofensivo. */
  client_id       text not null,
  unique (name, client_id)
);

create index if not exists product_events_nome_idx on product_events (name, occurred_at desc);
create index if not exists product_events_pessoa_idx
  on product_events (user_profile_id, occurred_at);

comment on table product_events is
  'Indicadores de produto, primeira parte. Vocabulário fechado, sem campo livre, sem envio externo.';

-- ── A escrita ────────────────────────────────────────────────────────────────
/**
 * Registra um evento de produto.
 *
 * A pessoa e a academia saem da sessão autenticada. A função é `security
 * definer` porque a tabela não dá escrita a ninguém: evento gravado por `insert`
 * direto poderia dizer qualquer coisa sobre qualquer conta.
 *
 * Silenciosa de propósito quando o evento repete (`on conflict do nothing`):
 * quem chama é instrumentação, e instrumentação que estoura erro derruba a
 * operação que ela deveria apenas observar.
 */
create or replace function registrar_evento(
  p_name      text,
  p_client_id text,
  p_rotulo    text default null,
  p_valor     numeric default null
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile uuid;
  v_org     uuid;
begin
  if coalesce(trim(p_client_id), '') = '' then
    raise exception 'Identificador do evento ausente.' using errcode = '22023';
  end if;

  v_profile := auth_profile_id();
  if v_profile is null then
    /*
     * Sem conta não há evento. A escolha de entrada acontece no onboarding, com
     * a pessoa já autenticada, então nenhum evento do catálogo precisa de
     * anônimo — e abrir esta função para `anon` daria a qualquer um uma tabela
     * para encher.
     */
    return;
  end if;

  /*
   * A academia vem do vínculo, e o vínculo mora em dois lugares: a matrícula do
   * aluno em `students` e o papel de equipe em `organization_members`. A
   * matrícula vem primeiro porque a maioria dos eventos nasce no app do aluno;
   * o papel de equipe cobre o resto, inclusive o cadastro da academia, que
   * acontece antes de existir matrícula nenhuma.
   *
   * Quem é de duas academias — aluna de uma, recepcionista de outra — tem o
   * evento atribuído à matrícula. É onde ela treina, e é de lá que vem o que
   * se mede.
   */
  select coalesce(
    (
      select s.organization_id from students s
      where s.user_profile_id = v_profile
      order by s.created_at
      limit 1
    ),
    (
      select m.organization_id from organization_members m
      where m.user_profile_id = v_profile
      order by m.created_at
      limit 1
    )
  ) into v_org;

  insert into product_events (name, user_profile_id, organization_id, rotulo, valor, client_id)
  values (p_name, v_profile, v_org, p_rotulo, p_valor, p_client_id)
  on conflict (name, client_id) do nothing;
end;
$$;

revoke all on function registrar_evento(text, text, text, numeric) from public, anon;
grant execute on function registrar_evento(text, text, text, numeric) to authenticated, service_role;

-- ── Os indicadores ───────────────────────────────────────────────────────────
/**
 * Os indicadores de negócio, com a coorte dita por extenso.
 *
 * `p_dias` recorta a coorte por data de cadastro — e é por isso que a retenção
 * é um número honesto: ela mede quem **teve tempo** de voltar. Retenção de 30
 * dias calculada sobre quem se cadastrou ontem é zero por construção, e um
 * número que só pode descer não é indicador, é ruído.
 *
 * "Primeira ação útil" é derivada, não gravada: é o primeiro `TREINO_INICIADO`
 * da pessoa. O pedido sugere um evento próprio; derivar evita o problema de
 * saber "é a primeira?" no momento da escrita — pergunta que, respondida
 * errado, grava duas primeiras vezes.
 *
 * `security invoker`: quem lê precisa ter permissão de ler a tabela, e a
 * política diz que é conta de plataforma. Com `definer`, qualquer conta
 * autenticada veria o número do produto inteiro.
 */
create or replace function indicadores_do_produto(p_dias int default 30)
returns table (
  coorte_desde       date,
  escolheram_entrada bigint,
  coorte_tamanho     bigint,
  ativados           bigint,
  segundos_ate_acao  numeric,
  treinos_iniciados  bigint,
  treinos_concluidos bigint,
  treinos_recuperados bigint,
  registros_perdidos bigint,
  retornaram_7       bigint,
  retornaram_30      bigint
)
language sql stable security invoker set search_path = public as $$
  with limites as (
    select (current_date - greatest(p_dias, 1))::date as desde
  ),
  coorte as (
    select e.user_profile_id, min(e.occurred_at) as nasceu
    from product_events e, limites l
    where e.name = 'CADASTRO_CONCLUIDO'
      and e.user_profile_id is not null
      and e.occurred_at::date >= l.desde
    group by e.user_profile_id
  ),
  primeira_acao as (
    select c.user_profile_id, min(e.occurred_at) as quando
    from coorte c
    join product_events e
      on e.user_profile_id = c.user_profile_id and e.name = 'TREINO_INICIADO'
    group by c.user_profile_id
  ),
  -- Voltar é ter qualquer evento depois da janela, não só abrir o app.
  voltas as (
    select
      c.user_profile_id,
      max(case when e.occurred_at >= c.nasceu + interval '7 days' then 1 else 0 end) as v7,
      max(case when e.occurred_at >= c.nasceu + interval '30 days' then 1 else 0 end) as v30
    from coorte c
    left join product_events e on e.user_profile_id = c.user_profile_id
    group by c.user_profile_id
  )
  select
    (select desde from limites),
    /*
     * Pessoas distintas, não linhas. A escolha da porta é contada na chegada à
     * tela do formulário, e recarregar a página grava outra linha — o que não
     * pode virar outra pessoa no funil.
     */
    (select count(distinct e.user_profile_id) from product_events e, limites l
      where e.name = 'ENTRADA_ESCOLHIDA' and e.occurred_at::date >= l.desde),
    (select count(*) from coorte),
    (select count(*) from primeira_acao),
    (
      select round(
        avg(extract(epoch from (p.quando - c.nasceu)))::numeric,
        0
      )
      from primeira_acao p join coorte c on c.user_profile_id = p.user_profile_id
    ),
    (select count(*) from product_events e, limites l
      where e.name = 'TREINO_INICIADO' and e.occurred_at::date >= l.desde),
    (select count(*) from product_events e, limites l
      where e.name = 'TREINO_CONCLUIDO' and e.occurred_at::date >= l.desde),
    (select count(*) from product_events e, limites l
      where e.name = 'TREINO_RECUPERADO' and e.occurred_at::date >= l.desde),
    (select count(*) from product_events e, limites l
      where e.name = 'REGISTRO_PERDIDO' and e.occurred_at::date >= l.desde),
    (select coalesce(sum(v7), 0) from voltas),
    (select coalesce(sum(v30), 0) from voltas)
$$;

revoke all on function indicadores_do_produto(int) from public, anon;
grant execute on function indicadores_do_produto(int) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table product_events enable row level security;

/*
 * Leitura só de conta de plataforma, e nenhuma política de escrita: a escrita
 * passa pela função, que resolve a pessoa pelo `auth.uid()`.
 *
 * O aluno **não** lê os próprios eventos aqui, e isso é deliberado: a tela que
 * mostra o que a pessoa fez lê o histórico de treino, que é dado dela com
 * política própria. Esta tabela é instrumento de operação, e abrir leitura por
 * conta criaria um segundo caminho para o mesmo dado, com outra política.
 */
create policy product_events_platform on product_events
  for select using (is_super_admin());

revoke insert, update, delete on product_events from authenticated, anon;

insert into schema_migrations (version) values ('0060_eventos_do_produto.sql') on conflict do nothing;
