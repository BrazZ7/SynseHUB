-- =============================================================================
-- SynseHub · 0009 — Synse Pay como marketplace: subconta por academia
--
-- O dinheiro do aluno cai direto na conta da academia; o split desvia a
-- comissão para a carteira Synse. Isso mantém o Synse fora do caminho do
-- dinheiro — o padrão de marketplace no Brasil, e o que evita transformar a
-- plataforma numa operação de repasse.
--
-- Três lacunas impediam isso, todas descobertas ao ligar o adapter de verdade:
-- não havia onde guardar o cliente criado no provedor, nem a credencial da
-- subconta, nem o CPF que o provedor exige para emitir cobrança.
-- =============================================================================

-- ── CPF do aluno ─────────────────────────────────────────────────────────────
/*
 * O Asaas — como qualquer emissor de boleto ou PIX de cobrança — exige
 * cpfCnpj do pagador. Sem esse campo nenhuma cobrança real sai.
 *
 * Fica em user_profiles, e não em students, porque o documento é da pessoa e
 * sobrevive à troca de academia, igual ao Synse ID. Quem enxerga é a mesma
 * equipe que já enxerga o resto da ficha; o logger já trata `taxId` e `cpf`
 * como valores que nunca aparecem em log.
 */
alter table user_profiles add column if not exists tax_id text;

-- ── Cliente no provedor ──────────────────────────────────────────────────────
/*
 * O provedor identifica o pagador por um id próprio (`cus_...` no Asaas). A
 * action mandava o UUID do aluno no lugar, o que só falharia na hora de cobrar
 * de verdade.
 *
 * Tabela separada, e não coluna em students, pelo mesmo motivo de
 * payment_accounts: um aluno pode existir em mais de um provedor ao longo do
 * tempo, e a chave é (aluno, provedor).
 */
create table if not exists payment_customers (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  student_id           uuid not null references students(id) on delete cascade,
  provider             text not null,
  provider_customer_id text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (student_id, provider)
);
create index if not exists payment_customers_org_idx
  on payment_customers (organization_id, provider);

alter table payment_customers enable row level security;
alter table payment_customers force row level security;

drop policy if exists payment_customers_staff on payment_customers;
create policy payment_customers_staff on payment_customers for all
  using ((select is_super_admin()) or organization_id in (select staff_organization_ids()))
  with check ((select is_super_admin()) or organization_id in (select staff_organization_ids()));

-- ── Credencial da subconta ───────────────────────────────────────────────────
/*
 * Cobrar pela subconta da academia exige usar a chave de API dela. É a
 * credencial mais sensível do sistema depois da service role: quem a tem
 * movimenta o dinheiro daquela academia.
 *
 * Por isso ela tem duas travas independentes: RLS ligada e FORCE sem política
 * nenhuma, e o GRANT revogado de anon e authenticated. Só o cliente de service
 * role, que tem BYPASSRLS e existe apenas no servidor, alcança estas linhas.
 *
 * O GRANT revogado faz a consulta falhar com "permission denied" em vez de
 * devolver lista vazia — escolha oposta à da 0008, e de propósito. Lá o
 * visitante anônimo consulta tabelas legítimas e precisa receber nada em vez de
 * erro. Aqui ninguém deveria tocar nesta tabela pelo cliente, então falhar alto
 * é o certo: a tentativa aparece no log em vez de passar por engano inofensivo.
 * Revogar também esconde a tabela do PostgREST.
 *
 * A RLS sem política é o cinto de segurança: se alguém conceder o GRANT de novo
 * mais adiante, ela ainda barra.
 */
create table if not exists payment_account_secrets (
  payment_account_id uuid primary key references payment_accounts(id) on delete cascade,
  organization_id    uuid not null references organizations(id) on delete cascade,
  provider           text not null,
  api_key            text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table payment_account_secrets enable row level security;
alter table payment_account_secrets force row level security;

revoke all on table payment_account_secrets from anon, authenticated;
