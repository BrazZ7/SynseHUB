-- =============================================================================
-- SynseHub · 0019 — A mensalidade se gera sozinha
--
-- Até aqui nenhuma cobrança nascia sem alguém digitar. Para uma academia com
-- duzentos alunos isso é meio dia de trabalho por mês, todo mês, e o erro
-- aparece como aluno que não recebeu boleto e ninguém percebeu.
--
-- A geração fica no banco, não na aplicação, por três razões:
--
-- 1. **Idempotência tem que ser do banco.** `charges` já tem
--    `unique (organization_id, billing_reference)`. Com a regra aqui dentro,
--    rodar duas vezes no mesmo dia — ou dois processos ao mesmo tempo, que é o
--    que acontece quando um agendamento repete — não cria cobrança dobrada:
--    o `on conflict` absorve. Em código de aplicação isso vira uma corrida.
--
-- 2. **O preço é o combinado, não o vigente.** O valor sai de `memberships`,
--    onde foi copiado no dia da matrícula. Ler o preço do plano na hora de
--    cobrar reajustaria em silêncio todo mundo que já estava matriculado.
--
-- 3. **O aviso já existe.** O gatilho da 0012 notifica o aluno quando entra uma
--    cobrança PENDING. Gerando por aqui, o aviso sai junto, sem a aplicação
--    precisar lembrar.
-- =============================================================================

/*
 * Quantos meses tem o ciclo de cada plano.
 *
 * CUSTOM cai em 1: é o plano que a academia combina caso a caso, e cobrar todo
 * mês é o comportamento menos surpreendente — errar para menos deixa dinheiro
 * na mesa, errar para mais cobra alguém indevidamente.
 */
create or replace function billing_cycle_months(p_cycle text)
returns integer
language sql immutable as $$
  select case p_cycle
    when 'MONTHLY'    then 1
    when 'QUARTERLY'  then 3
    when 'SEMIANNUAL' then 6
    when 'ANNUAL'     then 12
    else 1
  end;
$$;

/**
 * Gera as mensalidades que vencem dentro da janela.
 *
 * Devolve quantas cobranças criou. Roda como service_role, a partir do
 * agendamento diário — não há sessão de usuário num job.
 */
create or replace function generate_due_charges(
  p_reference date default current_date,
  p_days_ahead integer default 5
)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_criadas integer;
begin
  if p_days_ahead < 0 or p_days_ahead > 31 then
    raise exception 'Janela de geração fora do razoável: % dias', p_days_ahead
      using errcode = '22023';
  end if;

  with candidatas as (
    select
      m.id                as membership_id,
      m.organization_id,
      m.student_id,
      m.price,
      p.billing_cycle,
      /*
       * O vencimento do mês de referência. `billing_day` é limitado a 28 na
       * própria tabela, então nunca cai em dia inexistente de fevereiro.
       */
      (date_trunc('month', p_reference)::date + (m.billing_day - 1)) as vencimento,
      m.started_at
    from memberships m
    join membership_plans p on p.id = m.plan_id
    join students s on s.id = m.student_id
    where m.status = 'ACTIVE'
      and p.auto_charge
      -- Quem saiu, foi suspenso ou ainda não foi confirmado não é cobrado.
      and s.status in ('ACTIVE', 'OVERDUE')
      and (m.ends_at is null or m.ends_at >= p_reference)
  ),
  devidas as (
    select *
    from candidatas
    where vencimento between p_reference and p_reference + p_days_ahead
      /*
       * Plano trimestral não cobra todo mês. A conta é a distância em meses
       * desde o início da matrícula: só vence quando ela fecha um múltiplo do
       * ciclo.
       */
      and mod(
            (extract(year from vencimento)::int * 12 + extract(month from vencimento)::int)
            - (extract(year from started_at)::int * 12 + extract(month from started_at)::int),
            billing_cycle_months(billing_cycle::text)
          ) = 0
      /*
       * Ninguém paga por vencimento anterior à própria entrada.
       *
       * Quem se matricula no dia 20 com vencimento no dia 10 tem a primeira
       * cobrança só no mês seguinte. O efeito colateral — treinar de graça
       * nesses dias — é conhecido e preferível ao contrário: cobrar por um
       * período em que a pessoa nem era aluna é o tipo de erro que a academia
       * descobre pela reclamação. Cobrança proporcional é decisão de negócio e
       * ainda não foi tomada; quando for, entra aqui.
       */
      and vencimento >= started_at
  ),
  inseridas as (
    insert into charges (
      organization_id, student_id, membership_id, description, amount, due_date,
      status, billing_reference
    )
    select
      d.organization_id,
      d.student_id,
      d.membership_id,
      'Mensalidade de ' || trim(to_char(d.vencimento, 'TMMonth')) || ' de '
        || to_char(d.vencimento, 'YYYY'),
      d.price,
      d.vencimento,
      'PENDING',
      d.membership_id::text || ':' || to_char(d.vencimento, 'YYYY-MM')
    from devidas d
    on conflict (organization_id, billing_reference) do nothing
    returning 1
  )
  select count(*)::int into v_criadas from inseridas;

  return v_criadas;
end;
$$;

comment on function generate_due_charges(date, integer) is
  'Cria as mensalidades que vencem na janela. Idempotente pelo billing_reference — rodar duas vezes não duplica.';

/*
 * Nem o cliente nem o anônimo geram cobrança. Este é o caminho pelo qual
 * dinheiro passa a ser devido por alguém: fica com o service_role, que só o
 * agendamento no servidor usa.
 */
revoke all on function billing_cycle_months(text) from public, anon, authenticated;
revoke all on function generate_due_charges(date, integer) from public, anon, authenticated;
grant execute on function generate_due_charges(date, integer) to service_role;
grant execute on function billing_cycle_months(text) to service_role;

-- =============================================================================
-- Vencer também precisava de alguém para fazer.
--
-- `charge_status` tem 'OVERDUE' desde a 0002 e nada jamais escreveu esse valor:
-- a cobrança nascia PENDING e ficava PENDING para sempre, mesmo três meses
-- depois do vencimento. A consequência é que a lista de inadimplentes do painel
-- estava permanentemente vazia — não porque a academia não tinha inadimplente,
-- mas porque ninguém marcava.
--
-- O mesmo vale para o aluno: `student_status` tem 'OVERDUE' e nada o usava.
-- =============================================================================

create or replace function mark_overdue_charges(p_reference date default current_date)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_marcadas integer := 0;
  v_linha record;
begin
  /*
   * O laço existe porque a primeira versão disto era uma CTE só, e ela não
   * avisava ninguém: no Postgres, uma CTE de `select` que o corpo da consulta
   * não referencia simplesmente não é executada. O `update` rodava, o aviso
   * não, e nada acusava — foi um teste que pegou.
   */
  for v_linha in
    update charges
    set status = 'OVERDUE', updated_at = now()
    where status = 'PENDING' and due_date < p_reference
    returning id, organization_id, student_id, amount, due_date
  loop
    v_marcadas := v_marcadas + 1;

    /*
     * Um aviso por cobrança, e só na virada. Como o `update` acima só alcança
     * quem ainda estava PENDING, rodar o job todo dia não repete o aviso de uma
     * dívida antiga — que é o caminho mais curto para a pessoa silenciar as
     * notificações do aplicativo.
     */
    perform notify_profiles(
      array[(select user_profile_id from students where id = v_linha.student_id)],
      v_linha.organization_id,
      'PAYMENT',
      'Cobrança em atraso',
      'A cobrança de ' || brl(v_linha.amount) || ' venceu em '
        || to_char(v_linha.due_date, 'DD/MM/YYYY') || '.',
      '/app/finance'
    );
  end loop;

  /*
   * A situação do aluno acompanha. Quem tem cobrança vencida fica inadimplente;
   * a volta para ativo não acontece aqui — acontece no gatilho de pagamento,
   * porque é o pagamento que resolve, não a passagem do tempo.
   */
  update students s
  set status = 'OVERDUE', updated_at = now()
  where s.status = 'ACTIVE'
    and exists (
      select 1 from charges c
      where c.student_id = s.id and c.status = 'OVERDUE'
    );

  return v_marcadas;
end;
$$;

comment on function mark_overdue_charges(date) is
  'Marca como vencidas as cobranças PENDING com vencimento passado, avisa o aluno uma vez, e põe quem deve em OVERDUE.';

/*
 * Pagou, volta a ficar em dia.
 *
 * Como gatilho, e não dentro do job: quem confirma o pagamento é o webhook do
 * provedor, e ele pode chegar a qualquer hora. Esperar o job da madrugada
 * deixaria a pessoa marcada como inadimplente no dia em que ela pagou — que é
 * exatamente quando ela abre o aplicativo para conferir.
 */
create or replace function clear_overdue_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'PAID' and old.status is distinct from 'PAID' then
    update students s
    set status = 'ACTIVE', updated_at = now()
    where s.id = new.student_id
      and s.status = 'OVERDUE'
      and not exists (
        select 1 from charges c
        where c.student_id = s.id and c.status = 'OVERDUE' and c.id <> new.id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists charges_clear_overdue on charges;
create trigger charges_clear_overdue
  after update on charges
  for each row execute function clear_overdue_on_payment();

revoke all on function mark_overdue_charges(date) from public, anon, authenticated;
grant execute on function mark_overdue_charges(date) to service_role;

insert into schema_migrations (version) values ('0019_mensalidade_automatica.sql')
on conflict (version) do nothing;
