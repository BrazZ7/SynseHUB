-- =============================================================================
-- SynseHub · 0041 — A vitrine do cadeado
--
-- ── O cadeado sem vitrine ────────────────────────────────────────────────────
--
-- A 0038 trancou o conteúdo `SYNSE_PLUS` e a 0039 abriu a porta para publicá-lo.
-- Funciona: quem assina lê, quem não assina não lê. O efeito colateral é que
-- quem não assina **não fica sabendo que aquilo existe** — a RLS não devolve a
-- linha, e um item invisível não vende nada.
--
-- É o contrário do que um paywall faz. Jornal mostra a manchete e corta no
-- terceiro parágrafo; streaming mostra a capa com o cadeado. Aqui a prateleira
-- estava vazia, e o aluno do plano grátis concluía que o Synse+ não tem acervo.
--
-- ── Por que uma função, e não afrouxar a política ───────────────────────────
--
-- Dava para acrescentar um ramo a `content_read` liberando a leitura de
-- `SYNSE_PLUS` sem assinatura. Seria um desastre silencioso: a política governa
-- a **linha inteira**, e a linha inteira inclui `body` — até vinte mil
-- caracteres — e `media_url`, que é o link do próprio e-book. A vitrine teria
-- entregado o produto junto com o anúncio.
--
-- O que a vitrine mostra é uma projeção estreita, escolhida à mão: tipo,
-- título, resumo, capa, data. Projeção é coisa de função, não de política.
--
-- ── Só o acervo da plataforma ───────────────────────────────────────────────
--
-- `organization_id is null` não é detalhe de implementação: é a garantia
-- multi-inquilino. Conteúdo de academia nunca entra na vitrine, por mais que
-- alguém marque a visibilidade errada — o que a academia escreve não vira
-- anúncio para os alunos das concorrentes.
--
-- ── E por que o assinante não recebe nada ───────────────────────────────────
--
-- `not tem_synse_plus()`: quem assina já vê esses itens pela lista normal, com
-- corpo e tudo. Devolvê-los aqui também duplicaria a prateleira. A conferência
-- fica no banco, e não na tela, para que a tela não precise ser confiável.
-- =============================================================================

/**
 * O que está trancado atrás do Synse+, para quem não assina.
 *
 * `security definer` porque a RLS é justamente quem esconde estas linhas: sem
 * isso a função devolveria vazio para exatamente quem ela existe para servir.
 * Em troca, cada coluna da projeção foi escolhida uma a uma.
 *
 * **Nunca acrescente `body` nem `media_url` a esta lista.** São o conteúdo
 * pago e o link do arquivo; quem os expuser aqui entrega o produto na vitrine.
 *
 * `p_id` nulo devolve a prateleira inteira; preenchido, aquele item — é a tela
 * de leitura perguntando "este que me pediram está trancado?".
 */
create or replace function acervo_trancado(p_id uuid default null)
returns table (
  id           uuid,
  tipo         content_type,
  titulo       text,
  resumo       text,
  capa_url     text,
  publicado_em timestamptz,
  fixado       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.type, c.title, c.summary, c.cover_url, c.published_at, c.pinned
  from content_library c
  where c.organization_id is null
    and c.visibility = 'SYNSE_PLUS'
    and c.published_at is not null
    and c.published_at <= now()
    and (p_id is null or c.id = p_id)
    and not tem_synse_plus()
  order by c.pinned desc, c.published_at desc
$$;

/*
 * Concedida ao anônimo de propósito, e aqui isso é decisão de produto, não
 * descuido: vitrine serve para ser vista antes de entrar. Quem ainda não fez
 * login vê a mesma prateleira que o aluno do plano grátis — títulos e resumos,
 * nunca o conteúdo.
 */
revoke all on function acervo_trancado(uuid) from public;
grant execute on function acervo_trancado(uuid) to anon, authenticated, service_role;

insert into schema_migrations (version) values ('0041_vitrine_do_cadeado.sql') on conflict do nothing;
