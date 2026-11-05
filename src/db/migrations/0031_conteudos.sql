-- =============================================================================
-- SynseHub · 0031 — Conteúdos
--
-- `content_library` existe desde a 0003 com RLS desde a 0004, e nenhuma linha
-- do produto a lê. Antes de escrever a tela, testei a política que já estava
-- lá — e diferente do caso da nutrição, onde a suspeita se mostrou infundada,
-- aqui as duas suspeitas se confirmaram.
--
-- ── 1. Rascunho aparecia para o aluno ────────────────────────────────────────
--
-- `content_read` não olha `published_at`. Um artigo com data de publicação nula
-- é trabalho em andamento, e a política o entregava a qualquer membro da
-- academia — incluindo os alunos. Artigo meio escrito no app é pior que artigo
-- nenhum, e é o mesmo cuidado que `nutrition_plans` já tomava exigindo
-- `status = 'PUBLISHED'`.
--
-- ── 2. "FREE" era público de verdade ─────────────────────────────────────────
--
-- Esta é a séria. A política entrega todo conteúdo `FREE` a qualquer um, e o
-- teste confirmou: conteúdo da Academia A marcado FREE aparecia para a Academia
-- B **e para o visitante anônimo**.
--
-- O rótulo é a armadilha. Para quem opera a academia, "grátis" lê como "sem
-- custo para os meus alunos" — e o efeito real era publicar na internet. FREE
-- foi desenhado para o conteúdo da plataforma, que não tem `organization_id`;
-- conteúdo de academia é da academia.
--
-- A política passa a exigir `organization_id is null` no caso FREE, e uma
-- restrição impede a escolha na origem. Academia que um dia quiser publicar
-- para fora vai precisar de um recurso pensado para isso — vazar por engano não
-- é o mesmo que publicar de propósito.
-- =============================================================================

alter table content_library
  add column if not exists author_staff_id uuid references staff(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  /*
   * Fixado no topo da lista da academia. Aviso importante — mudança de horário,
   * feriado — não pode depender de ter sido escrito hoje para ser visto.
   */
  add column if not exists pinned boolean not null default false;

create index if not exists content_library_org_idx
  on content_library (organization_id, pinned desc, published_at desc);

/*
 * Conteúdo de academia não pode ser FREE. `not valid` porque a coluna é livre
 * desde a 0003 e pode haver linha antiga — validar retroativamente faria a
 * migration falhar num banco com dado. Vale para toda escrita nova, que é o que
 * fecha o buraco daqui para frente; a política abaixo fecha a leitura do que já
 * existe.
 */
alter table content_library drop constraint if exists content_library_escopo_coerente;
alter table content_library add constraint content_library_escopo_coerente
  check (visibility <> 'FREE' or organization_id is null) not valid;

-- ── A leitura, corrigida ─────────────────────────────────────────────────────
drop policy if exists content_read on content_library;

/**
 * Quem lê o quê.
 *
 * Três portas, e a diferença entre elas é o ponto do arquivo:
 *
 *   FREE          conteúdo da plataforma, sem academia dona. Aberto.
 *   ORGANIZATION  conteúdo da academia, para quem é da academia.
 *   SYNSE_PLUS    conteúdo da plataforma para quem assina.
 *
 * Em todas, publicado é publicado: `published_at` no passado. A equipe da
 * academia é a exceção, e precisa ser — é ela que escreve o rascunho.
 */
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
        or (
          visibility = 'SYNSE_PLUS'
          and exists (
            select 1 from consumer_subscriptions cs
            where cs.user_profile_id = auth_profile_id() and cs.status = 'ACTIVE'
          )
        )
      )
    )
  );

/*
 * A política de escrita da 0004 continua: só a equipe da academia dona escreve,
 * e conteúdo sem `organization_id` — o da plataforma — não é escrito por
 * ninguém pela API.
 */

-- ── O que a academia publicou ────────────────────────────────────────────────
/**
 * A lista do aluno, já ordenada.
 *
 * SECURITY INVOKER: a RLS acima é quem filtra, e repetir a regra aqui criaria
 * um segundo lugar para ela divergir. Fixado primeiro, depois o mais recente.
 */
create or replace function published_content(p_organization_id uuid, p_limite integer default 50)
returns table (
  id           uuid,
  tipo         content_type,
  titulo       text,
  resumo       text,
  capa_url     text,
  midia_url    text,
  fixado       boolean,
  publicado_em timestamptz,
  autor        text
)
language sql stable as $$
  select
    c.id, c.type, c.title, c.summary, c.cover_url, c.media_url, c.pinned, c.published_at,
    u.name
  from content_library c
  left join staff s on s.id = c.author_staff_id
  left join user_profiles u on u.id = s.user_profile_id
  where (c.organization_id = p_organization_id or c.organization_id is null)
    and c.published_at is not null
    and c.published_at <= now()
  order by c.pinned desc, c.published_at desc
  limit p_limite
$$;

insert into schema_migrations (version) values ('0031_conteudos.sql') on conflict do nothing;
