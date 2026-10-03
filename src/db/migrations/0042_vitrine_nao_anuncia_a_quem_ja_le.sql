-- =============================================================================
-- SynseHub · 0042 — A vitrine não anuncia para quem já lê
--
-- ── O defeito ────────────────────────────────────────────────────────────────
--
-- A 0041 esconde a vitrine de quem assina o Synse+ (`not tem_synse_plus()`) e
-- esqueceu o outro jeito de poder ler: a conta de plataforma. Desde a 0039 a
-- política dá o acervo inteiro a `is_super_admin()`, inclusive o que é pago,
-- e a vitrine não sabia disso.
--
-- Resultado, conferido no banco: o mesmo e-book aparece duas vezes para o
-- super admin sem assinatura — legível na lista e trancado logo abaixo, com
-- um convite para assinar o que ele acabou de ler.
--
-- ── Por que apareceu só agora ────────────────────────────────────────────────
--
-- Porque é o estado de quem publica. Quem põe o acervo no ar é a conta de
-- plataforma, e é ela que vai conferir o resultado no app logo em seguida —
-- então este é o primeiro par de olhos a bater na tela, não o último. Os
-- testes da 0041 cobriam o assinante e o visitante e não cobriam o publicador.
--
-- ── A regra que faltava ──────────────────────────────────────────────────────
--
-- A vitrine anuncia o que a pessoa **não pode** ler. "Não pode ler" tem duas
-- saídas, não uma: a assinatura e o papel de plataforma. A condição passa a
-- dizer isso inteiro, em vez de metade.
-- =============================================================================

/**
 * O que está trancado atrás do Synse+, para quem não assina e não é da
 * plataforma.
 *
 * Idêntica à da 0041, com `and not is_super_admin()` a mais. A projeção
 * continua estreita de propósito: **nunca acrescente `body` nem `media_url`**
 * — são o conteúdo pago e o link do arquivo.
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
    and not is_super_admin()
  order by c.pinned desc, c.published_at desc
$$;

-- `create or replace` preserva os grants, mas repetir é barato e o dia em que
-- alguém trocar por `drop`/`create` esta linha é a diferença entre a vitrine
-- continuar de pé e sumir sem aviso.
revoke all on function acervo_trancado(uuid) from public;
grant execute on function acervo_trancado(uuid) to anon, authenticated, service_role;

insert into schema_migrations (version) values ('0042_vitrine_nao_anuncia_a_quem_ja_le.sql') on conflict do nothing;
