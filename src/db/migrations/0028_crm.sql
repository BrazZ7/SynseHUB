-- =============================================================================
-- SynseHub · 0028 — CRM
--
-- `leads` existe desde a 0003 e nunca teve tela. `listLeads` está no contrato
-- de dados e nenhum arquivo em `src/app` a chama — é o mesmo caso do sino de
-- notificações, que era desenho até a 0012.
--
-- O que falta para virar produto não é a tabela: é o que torna um funil
-- mensurável e usado.
--
-- **Histórico de etapa.** Sem ele não há taxa de conversão. `leads.stage`
-- guarda onde a pessoa está, e sobrescrever essa coluna apaga por onde ela
-- passou — justamente o dado que responde "perdemos as pessoas na aula
-- experimental ou na proposta?".
--
-- **Data do próximo contato.** É o campo que faz alguém abrir o CRM de manhã.
-- Funil sem "com quem falo hoje" vira lista que ninguém olha, e aí o lead
-- esfria sozinho.
--
-- **Conversão.** O momento em que o lead vira aluno matriculado é o único que
-- justifica o módulo. Ele precisa ser uma operação só — criar o aluno e fechar
-- o lead separadamente deixa metade feita quando algo falha no meio.
-- =============================================================================

alter table leads
  add column if not exists next_follow_up_at timestamptz,
  -- Preenchido pela conversão. Liga o funil ao resto do produto.
  add column if not exists converted_student_id uuid references students(id) on delete set null,
  add column if not exists lost_reason text;

create index if not exists leads_follow_up_idx
  on leads (organization_id, next_follow_up_at)
  where stage not in ('ENROLLED', 'LOST');

/*
 * O que aconteceu com o lead, em ordem.
 *
 * Mudança de etapa, ligação, mensagem, observação. É daqui que sai a taxa de
 * conversão e o tempo médio entre etapas — `leads.stage` sozinha só sabe o
 * presente.
 */
create table lead_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  kind            text not null check (kind in
                    ('STAGE_CHANGE','NOTE','CALL','MESSAGE','VISIT','CREATED')),
  from_stage      lead_stage,
  to_stage        lead_stage,
  body            text,
  -- Quem fez. Nulo quando foi o sistema, como no evento de criação.
  actor_staff_id  uuid references staff(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events (lead_id, created_at desc);

/**
 * Toda mudança de etapa vira evento, venha de onde vier.
 *
 * No gatilho, e não na aplicação, pela razão de sempre neste projeto: a etapa
 * muda pela tela, por importação de planilha e por SQL de suporte. Histórico
 * que só é escrito no caminho instrumentado é histórico com buraco, e buraco em
 * funil aparece como taxa de conversão errada — um número que ninguém
 * desconfia.
 */
create or replace function lead_stage_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into lead_events (organization_id, lead_id, kind, to_stage, body)
    values (new.organization_id, new.id, 'CREATED', new.stage, 'Lead cadastrado');
    return null;
  end if;

  if new.stage is distinct from old.stage then
    insert into lead_events (organization_id, lead_id, kind, from_stage, to_stage, body)
    values (new.organization_id, new.id, 'STAGE_CHANGE', old.stage, new.stage, new.lost_reason);
  end if;
  return null;
end;
$$;

create trigger leads_stage_history
  after insert or update on leads
  for each row execute function lead_stage_history();

/** `updated_at` acompanha, porque a lista ordena por ele. */
create or replace function leads_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_touch_updated
  before update on leads
  for each row execute function leads_touch();

-- ── A conversão ──────────────────────────────────────────────────────────────
/**
 * O lead vira aluno.
 *
 * Numa transação só: cria o perfil, o aluno, a matrícula, e fecha o lead
 * apontando para quem ele virou. Fazer isso em três chamadas da aplicação
 * deixaria aluno criado com lead aberto quando a segunda falhasse — e ninguém
 * percebe um lead duplicado até ligar duas vezes para a mesma pessoa.
 *
 * Devolve o `students.id`.
 */
create or replace function convert_lead_to_student(
  p_lead_id     uuid,
  p_plan_id     uuid default null,
  p_billing_day smallint default 5
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_lead    leads;
  v_perfil  uuid;
  v_aluno   uuid;
  v_preco   numeric(10,2);
  v_email   citext;
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then
    raise exception 'Lead não encontrado.' using errcode = 'P0002';
  end if;

  -- `is not true`: `is_org_staff` devolve NULL para quem não pertence, e
  -- `if not null` não dispara. Ver a nota da 0025.
  if is_org_staff(v_lead.organization_id) is not true then
    raise exception 'Este lead não é da sua academia.' using errcode = '42501';
  end if;

  if v_lead.converted_student_id is not null then
    -- Já convertido: devolve quem ele virou, em vez de criar um segundo aluno.
    return v_lead.converted_student_id;
  end if;

  if p_plan_id is not null and not exists (
    select 1 from membership_plans
    where id = p_plan_id and organization_id = v_lead.organization_id
  ) then
    raise exception 'Este plano não é da sua academia.' using errcode = '42501';
  end if;

  /*
   * Sem e-mail não dá para criar conta, e lead de balcão costuma não ter. O
   * endereço `.invalid` é reservado por norma justamente para isto: ocupa a
   * coluna única sem poder receber mensagem, e a recepção corrige depois.
   */
  v_email := coalesce(
    nullif(trim(v_lead.email::text), ''),
    'lead+' || replace(p_lead_id::text, '-', '') || '@synse.invalid'
  );

  select id into v_perfil from user_profiles where email = v_email;
  if not found then
    insert into user_profiles (name, email, phone)
    values (v_lead.name, v_email, v_lead.phone)
    returning id into v_perfil;
  end if;

  insert into students (organization_id, user_profile_id, status)
  values (v_lead.organization_id, v_perfil, 'ACTIVE')
  on conflict (organization_id, user_profile_id) do update set status = 'ACTIVE'
  returning id into v_aluno;

  if p_plan_id is not null then
    -- O preço é copiado do plano agora: reajuste futuro não muda quem já entrou.
    select price into v_preco from membership_plans where id = p_plan_id;
    insert into memberships (organization_id, student_id, plan_id, price, billing_day)
    values (v_lead.organization_id, v_aluno, p_plan_id, v_preco, p_billing_day);
  end if;

  update leads
  set stage = 'ENROLLED',
      converted_student_id = v_aluno,
      next_follow_up_at = null
  where id = p_lead_id;

  return v_aluno;
end;
$$;

revoke all on function convert_lead_to_student(uuid, uuid, smallint) from public, anon;
grant execute on function convert_lead_to_student(uuid, uuid, smallint) to authenticated, service_role;

/**
 * O funil, contado.
 *
 * SECURITY INVOKER como as funções da 0027: nada a escrever, então a RLS
 * filtra e não há autorização a duplicar aqui.
 */
create or replace function lead_funnel(
  p_organization_id uuid,
  p_from            timestamptz,
  p_to              timestamptz
)
returns table (etapa lead_stage, total integer)
language sql stable as $$
  select l.stage, count(*)::integer
  from leads l
  where l.organization_id = p_organization_id
    and l.created_at >= p_from and l.created_at < p_to
  group by l.stage
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table lead_events enable row level security;

/*
 * Lead é dado de quem ainda não é aluno — alguém que deixou o telefone na
 * recepção. Só a equipe da academia enxerga, e nunca a academia vizinha.
 */
create policy lead_events_staff on lead_events
  for all using (is_org_staff(organization_id)) with check (is_org_staff(organization_id));

/*
 * O histórico é escrito pelo gatilho, que é `security definer`. Deixar o
 * cliente inserir permitiria forjar uma mudança de etapa que não aconteceu — e
 * a taxa de conversão passaria a medir ficção.
 */
revoke insert, update, delete on lead_events from authenticated, anon;

insert into schema_migrations (version) values ('0028_crm.sql') on conflict do nothing;
