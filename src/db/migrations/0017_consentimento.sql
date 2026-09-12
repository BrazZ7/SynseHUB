-- =============================================================================
-- SynseHub · 0017 — Consentimento deixa de ser enfeite
--
-- A tela de perfil listava quatro consentimentos com selo de "Aceito" ou "Não
-- autorizado" fixos no código, e embaixo a frase: "cada consentimento é
-- registrado com versão e data, e pode ser revogado a qualquer momento".
-- Nenhuma das três coisas era verdade. A tabela `consents` existia desde a
-- 0003 e nunca recebeu uma linha.
--
-- Isso é pior que uma funcionalidade faltando. É o produto afirmando ao
-- titular que o dado dele está sob controle dele, quando não está — e é
-- exatamente o registro que a LGPD pede que exista para provar a base legal do
-- tratamento (art. 8º, §1º: cabe ao controlador o ônus da prova).
--
-- Três decisões nesta migração:
--
-- 1. **A versão do documento vive no banco, não no cliente.** O que a pessoa
--    aceitou é o texto que estava no ar naquele dia. Se o navegador mandasse a
--    versão junto, a prova seria a palavra de quem está sendo provado.
--
-- 2. **A tabela para de aceitar escrita direta.** Até agora a política era
--    `for all` sobre as próprias linhas — o que inclui `delete`. O registro que
--    documenta o consentimento podia ser apagado por quem ele documenta, e a
--    prova sumia junto. Passa a ter uma porta só, `record_consent`.
--
-- 3. **Revogar não apaga: carimba.** A linha continua lá com `accepted_at` de
--    quando foi aceito e `revoked_at` de quando deixou de valer. Histórico é o
--    ponto; sem ele não se responde "o tratamento em março tinha base?".
-- =============================================================================

-- ── Quais documentos existem, e em que versão ────────────────────────────────

create table if not exists consent_documents (
  consent_type  text not null check (consent_type in (
                  'TERMS_OF_USE','PRIVACY_POLICY','HEALTH_DATA_PROCESSING',
                  'MARKETING_COMMUNICATION','PROGRESS_PHOTOS','RANKING_VISIBILITY')),
  version       text not null,
  title         text not null,
  description   text not null,
  url           text,
  /*
   * Obrigatório é o que não se usa o produto sem aceitar — termos e
   * privacidade. Não vira caixinha de marcar: quem não concorda não cria a
   * conta, e quem quer sair de verdade apaga a conta, não desmarca a linha.
   */
  required      boolean not null default false,
  effective_at  timestamptz not null default now(),
  primary key (consent_type, version)
);

comment on table consent_documents is
  'Versões publicadas de cada consentimento. A vigente é a de maior effective_at já passado.';

insert into consent_documents (consent_type, version, title, description, url, required)
values
  ('TERMS_OF_USE', 'v1', 'Termos de Uso',
   'Regras de uso do Synse e da sua conta.', '/termos', true),
  ('PRIVACY_POLICY', 'v1', 'Política de Privacidade',
   'O que é coletado, por quê, e por quanto tempo fica guardado.', '/privacidade', true),
  ('HEALTH_DATA_PROCESSING', 'v1', 'Tratamento de dados de saúde',
   'Peso, medidas, lesões e restrições — dado sensível pela LGPD. Sem isto, treino e avaliação não funcionam.',
   '/privacidade#saude', false),
  ('PROGRESS_PHOTOS', 'v1', 'Fotos de progresso',
   'Guardar fotos suas para comparação ao longo do tempo. Só você e quem te treina veem.',
   null, false),
  ('RANKING_VISIBILITY', 'v1', 'Aparecer em rankings',
   'Seu nome e seus números em listas comparativas com outras pessoas.', null, false),
  ('MARKETING_COMMUNICATION', 'v1', 'Novidades por e-mail',
   'Avisos sobre recursos novos e conteúdo do Synse. Nada disso é necessário para treinar.',
   null, false)
on conflict (consent_type, version) do nothing;

-- ── A vigente ────────────────────────────────────────────────────────────────

create or replace function current_consent_version(p_type text)
returns text
language sql stable security definer set search_path = public as $$
  select version
  from consent_documents
  where consent_type = p_type
    and effective_at <= now()
  order by effective_at desc
  limit 1;
$$;

comment on function current_consent_version(text) is
  'Versão em vigor de um consentimento. Publicar uma versão nova não invalida o aceite antigo — ele fica registrado na versão dele.';

-- ── A única porta de escrita ─────────────────────────────────────────────────

create or replace function record_consent(p_type text, p_accepted boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_profile uuid := auth_profile_id();
  v_version text;
  v_required boolean;
begin
  if v_profile is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  select version, required into v_version, v_required
  from consent_documents
  where consent_type = p_type and effective_at <= now()
  order by effective_at desc
  limit 1;

  if v_version is null then
    raise exception 'Consentimento desconhecido: %', p_type using errcode = '22023';
  end if;

  /*
   * Recusar termos e privacidade pela tela seria um caminho sem saída: a conta
   * continua existindo, os dados continuam guardados, e o produto ficaria
   * usando o que a pessoa acabou de dizer que não autoriza. A saída de verdade
   * é apagar a conta, e é isso que a tela precisa oferecer.
   */
  if v_required and not p_accepted then
    raise exception 'Este consentimento não pode ser revogado sem encerrar a conta.'
      using errcode = '42501';
  end if;

  insert into consents (user_profile_id, consent_type, accepted, version, accepted_at, revoked_at)
  values (
    v_profile, p_type, p_accepted, v_version,
    case when p_accepted then now() else null end,
    case when p_accepted then null else now() end
  )
  on conflict (user_profile_id, consent_type, version) do update
  set accepted    = excluded.accepted,
      -- Reaceitar depois de revogar carimba a data nova; a revogação sai de
      -- cena porque o consentimento voltou a valer.
      accepted_at = case when excluded.accepted then now() else consents.accepted_at end,
      revoked_at  = case when excluded.accepted then null else now() end;
end;
$$;

comment on function record_consent(text, boolean) is
  'Registra aceite ou revogação do consentimento vigente para a pessoa autenticada. A versão vem do banco, nunca do cliente.';

-- ── Políticas ────────────────────────────────────────────────────────────────

alter table consent_documents enable row level security;

drop policy if exists consent_documents_read on consent_documents;
create policy consent_documents_read on consent_documents
  for select using (true);

/*
 * `consents_self` era `for all`: leitura, escrita, e também apagar. Some.
 *
 * Fica a leitura — a pessoa tem direito de ver o que autorizou, e é isso que a
 * tela mostra. Escrever passa por `record_consent`, que é `security definer` e
 * carimba a versão do banco.
 */
drop policy if exists consents_self on consents;

drop policy if exists consents_read_self on consents;
create policy consents_read_self on consents
  for select using (user_profile_id = auth_profile_id());

revoke insert, update, delete on consents from authenticated, anon;
revoke all on consent_documents from anon, authenticated;
grant select on consent_documents to authenticated, anon;

revoke all on function record_consent(text, boolean) from public, anon;
grant execute on function record_consent(text, boolean) to authenticated;

revoke all on function current_consent_version(text) from public;
grant execute on function current_consent_version(text) to authenticated, anon;
