-- =============================================================================
-- SynseHub · 0018 — Reativar matrícula também avisa
--
-- O gatilho da 0012 avisava em dois casos: entrada confirmada (PENDING →
-- ACTIVE) e matrícula encerrada. Voltar alguém para ativo depois de suspenso ou
-- encerrado ficava em silêncio.
--
-- Isso não incomodava enquanto não havia como reativar pela tela. Agora há — a
-- ficha do aluno ganhou suspender, encerrar e reativar — e o silêncio virou
-- defeito: a pessoa que foi encerrada recebeu o aviso da saída, e voltaria sem
-- saber que voltou. Foi um teste de banco que encontrou isso, não a tela.
--
-- OVERDUE → ACTIVE continua sem aviso próprio de propósito: essa transição é a
-- baixa de um pagamento, e o aviso "Pagamento confirmado" já sai pelo gatilho
-- de cobrança. Dois avisos para o mesmo fato ensinam a ignorar os dois.
-- =============================================================================

create or replace function notify_student_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_name text;
begin
  if new.status = old.status then
    return new;
  end if;

  select name into v_org_name from organizations where id = new.organization_id;

  if new.status = 'ACTIVE' and old.status = 'PENDING' then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula confirmada',
      coalesce(v_org_name, 'A academia') || ' confirmou sua entrada. Bons treinos.',
      '/app'
    );
  elsif new.status = 'ACTIVE' and old.status in ('CANCELLED', 'INACTIVE') then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula reativada',
      'Sua matrícula em ' || coalesce(v_org_name, 'na academia') || ' voltou a valer.',
      '/app'
    );
  elsif new.status = 'CANCELLED' then
    perform notify_profiles(
      array[new.user_profile_id],
      new.organization_id,
      'GYM',
      'Matrícula encerrada',
      'Sua matrícula em ' || coalesce(v_org_name, 'na academia') || ' foi encerrada.',
      '/app'
    );
  end if;

  return new;
end;
$$;

-- =============================================================================
-- E, junto, o registro de quais migrations já rodaram.
--
-- Até aqui a sonda de `/api/health?deep=1` adivinhava pelo formato do schema:
-- "existe a coluna `tier`? então a 0014 subiu". Funciona enquanto cada
-- migration cria alguma coisa nova e visível pelo PostgREST. Esta não cria: ela
-- só troca o corpo de uma função de gatilho, que a API nem expõe. Sem registro,
-- não haveria como saber se ela foi aplicada.
--
-- O preenchimento inicial não confia em ninguém: cada versão anterior só entra
-- se o próprio banco mostrar a marca dela. Assim, colar este arquivo num banco
-- que pulou a 0017 não passa a dizer que a 0017 subiu.
-- =============================================================================

create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

comment on table schema_migrations is
  'Migrations aplicadas. Cada arquivo novo insere a própria versão no fim.';

alter table schema_migrations enable row level security;

drop policy if exists schema_migrations_read on schema_migrations;
create policy schema_migrations_read on schema_migrations for select using (true);

revoke all on schema_migrations from anon, authenticated;
grant select on schema_migrations to anon, authenticated;

do $$
declare
  v_marcas constant text[][] := array[
    ['0001_core.sql',                    'table:organizations'],
    ['0002_payments_billing.sql',        'table:charges'],
    ['0003_training_health_content.sql', 'table:workout_plans'],
    ['0004_rls.sql',                     'function:auth_profile_id'],
    ['0011_onboarding.sql',              'function:join_organization_as_student'],
    ['0012_notification_events.sql',     'function:notify_profiles'],
    ['0013_synse_solo.sql',              'function:join_synse_as_solo_student'],
    ['0014_baseline_experience.sql',     'table:baseline_challenges'],
    ['0015_professional_unlock.sql',     'function:set_professional_plan'],
    ['0016_synse_run.sql',               'table:activities'],
    ['0017_consentimento.sql',           'table:consent_documents']
  ];
  v_linha text[];
  v_tipo text;
  v_nome text;
  v_existe boolean;
begin
  foreach v_linha slice 1 in array v_marcas loop
    v_tipo := split_part(v_linha[2], ':', 1);
    v_nome := split_part(v_linha[2], ':', 2);

    if v_tipo = 'table' then
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = v_nome
      ) into v_existe;
    else
      select exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_nome
      ) into v_existe;
    end if;

    if v_existe then
      insert into schema_migrations (version) values (v_linha[1])
      on conflict (version) do nothing;
    end if;
  end loop;
end $$;

/*
 * As migrations sem marca própria — as que só ajustaram política ou corpo de
 * função — entram junto das vizinhas que criaram algo verificável. Registrar
 * uma dessas por conta própria seria inventar informação; deixá-las de fora do
 * histórico é o preço de não ter tido o registro desde o começo.
 */
insert into schema_migrations (version) values ('0018_reativacao_avisa.sql')
on conflict (version) do nothing;
