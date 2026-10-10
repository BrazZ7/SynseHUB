-- =============================================================================
-- SynseHub · 0038 — O cadeado do Synse+ confere a porta certa
--
-- ── O defeito ────────────────────────────────────────────────────────────────
--
-- Duas políticas de RLS liberavam conteúdo `SYNSE_PLUS` assim:
--
--     exists (select 1 from consumer_subscriptions cs
--             where cs.user_profile_id = auth_profile_id()
--               and cs.status = 'ACTIVE')
--
-- `consumer_subscriptions` existe desde a 0002 e **nada nunca escreveu nela**.
-- A assinatura mora em `user_profiles.plus_status` e `plus_until` desde a 0036.
--
-- O cadeado não estava frouxo: estava trancado para todo mundo. No dia em que o
-- primeiro e-book subisse como Synse+, nenhum assinante veria — e o sintoma
-- seria "o app não mostra o que eu paguei", com o pagamento em dia e a RLS
-- fazendo exatamente o que estava escrito.
--
-- ── O segundo furo, esse aberto para o lado errado ──────────────────────────
--
-- `recipes`, `programs` e `program_steps` nasceram na 0003 com coluna
-- `visibility` — e `programs` com o padrão `SYNSE_PLUS` — e receberam na 0004
-- políticas `for select using (true)`. Qualquer um lê tudo, inclusive quem nem
-- entrou. A coluna estava lá e a RLS a ignorava.
--
-- Hoje nenhuma das três tem uma linha sequer e nada no app as lê, então apertar
-- agora não muda comportamento nenhum. Apertar depois, com os programas
-- guiados no ar, seria mexer numa trava sob uso.
--
-- ── A data manda, não o rótulo ───────────────────────────────────────────────
--
-- Mesma regra de `resumoDaAssinatura`, e ela não é detalhe: o `tier` da conta
-- envelhece — um ciclo que venceu ontem continua PRO até a rotina de expiração
-- rodar. E `CANCELED` conta como ativo enquanto o período pago não acabou,
-- porque cancelar interrompe a renovação seguinte, não o que já foi pago. É o
-- que os Termos prometem, e tirar o acesso antes seria quebrar a promessa.
-- =============================================================================

/**
 * A conta desta sessão tem Synse+ vigente?
 *
 * `security definer` porque a política precisa da resposta mesmo quando a
 * pessoa não alcançaria a própria linha por outro caminho.
 *
 * **Concedida também ao anônimo**, de propósito. Ela devolve `false` para ele —
 * `auth_profile_id()` é nulo — e revogar transformaria "nenhuma linha" em
 * `permission denied for function` na leitura de conteúdo público. Foi
 * exatamente essa a pegadinha que a sonda da 0037 encontrou com
 * `is_friendship_party`, e ela não precisa acontecer duas vezes.
 */
create or replace function tem_synse_plus() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_profiles u
    where u.id = auth_profile_id()
      and u.plus_status in ('TRIAL', 'ACTIVE', 'CANCELED')
      and u.plus_until is not null
      and u.plus_until > now()
  )
$$;

comment on function tem_synse_plus is
  'Synse+ vigente nesta sessão. A data manda, não o rótulo — e CANCELED vale até o fim do período pago.';

revoke all on function tem_synse_plus() from public;
grant execute on function tem_synse_plus() to anon, authenticated, service_role;

-- ── Biblioteca de conteúdo ───────────────────────────────────────────────────

/*
 * Mesma política da 0031, com o cadeado trocado. O resto continua igual:
 * rascunho só quem escreve enxerga, conteúdo de academia só para quem é
 * membro dela, e conteúdo da plataforma para todo mundo.
 */
drop policy if exists content_read on content_library;
create policy content_read on content_library
  for select using (
    (organization_id is not null and is_org_staff(organization_id))
    or (
      published_at is not null
      and published_at <= now()
      and (
        (visibility = 'FREE' and organization_id is null)
        or (
          visibility = 'ORGANIZATION'
          and organization_id is not null
          and is_org_member(organization_id)
        )
        or (visibility = 'SYNSE_PLUS' and tem_synse_plus())
      )
    )
  );

-- ── Receitas e programas guiados ─────────────────────────────────────────────

/*
 * `ORGANIZATION` não aparece aqui porque estas tabelas não têm dono: não há
 * `organization_id` em nenhuma das três. Uma linha marcada assim não é de
 * ninguém, e deixá-la legível por omissão seria abrir por engano o que a
 * coluna existe para fechar.
 */
drop policy if exists recipes_read on recipes;
create policy recipes_read on recipes
  for select using (
    visibility = 'FREE' or (visibility = 'SYNSE_PLUS' and tem_synse_plus())
  );

drop policy if exists programs_read on programs;
create policy programs_read on programs
  for select using (
    visibility = 'FREE' or (visibility = 'SYNSE_PLUS' and tem_synse_plus())
  );

/*
 * O passo herda a visibilidade do programa. Sem isto, os dias de um programa
 * Synse+ ficariam legíveis por quem não pode ler o programa — e o passo é onde
 * está o conteúdo de verdade: as tarefas do dia.
 */
drop policy if exists program_steps_read on program_steps;
create policy program_steps_read on program_steps
  for select using (
    exists (
      select 1 from programs p
      where p.id = program_steps.program_id
        and (p.visibility = 'FREE' or (p.visibility = 'SYNSE_PLUS' and tem_synse_plus()))
    )
  );

insert into schema_migrations (version) values ('0038_cadeado_do_plus.sql') on conflict do nothing;
