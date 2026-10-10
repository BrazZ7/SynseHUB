-- =============================================================================
-- SynseHub · 0010 — Dados que o provedor exige para abrir a subconta
--
-- Descoberto ao tentar conectar de verdade: o Asaas recusou com "é necessário
-- informar o CEP" e "é necessário informar o tipo de empresa". Abrir subconta
-- é abrir conta de pagamento — o provedor precisa saber quem é a empresa, onde
-- ela fica e quanto movimenta.
--
-- Tudo anulável: uma academia pode usar o SynseHub para gestão sem nunca ligar
-- o Synse Pay, e exigir endereço no cadastro barraria quem só quer controlar
-- alunos e treinos.
-- =============================================================================

alter table organizations
  add column if not exists postal_code     text,
  add column if not exists address         text,
  add column if not exists address_number  text,
  add column if not exists district        text,
  add column if not exists phone           text,
  /*
   * Natureza jurídica, no vocabulário do provedor: MEI, LIMITED, INDIVIDUAL ou
   * ASSOCIATION. Guardado como texto em vez de enum porque é uma lista do
   * Asaas, não do Synse — se ele acrescentar uma opção, não queremos uma
   * migração de banco para acompanhar.
   */
  add column if not exists company_type    text,
  /** Faturamento mensal estimado, exigido na abertura da conta. */
  add column if not exists monthly_revenue numeric(12,2);
