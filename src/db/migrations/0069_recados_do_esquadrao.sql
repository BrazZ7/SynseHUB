-- =============================================================================
-- SynseHub · 0069 — Os recados do esquadrão
--
-- O lobby tinha estado de presença e resposta a treino marcado, e nada para o
-- que acontece no meio: "bora hoje?", "tô chegando", "atrasei dez minutos".
-- São as três frases que fazem o grupo de mensagens existir.
--
-- ── Vocabulário fechado, e não conversa ─────────────────────────────────────
--
-- Seis recados, escolhidos. Não é chat, e a diferença não é de tamanho — é de
-- natureza:
--
--   * **não tem como ofender ninguém** com uma lista de seis frases prontas;
--   * **não tem o que moderar**, então a falta de denúncia, bloqueio e equipe
--     de moderação deixa de ser um buraco;
--   * **não guarda texto de pessoa**, então não há dado livre de menor de
--     idade numa tabela que ninguém auditou.
--
-- A 0068 já tinha registrado a decisão de não ter conversa livre. Isto é o
-- que entra no lugar dela, e vale dizer o que **não** é: se um dia o produto
-- quiser chat de verdade, ele precisa vir com denúncia, bloqueio e alguém que
-- leia. Trocar esta tabela por uma de texto livre sem as três é a mudança que
-- não pode acontecer em silêncio.
--
-- ── Recado não vira aviso no sino ───────────────────────────────────────────
--
-- `notify_profiles` fica de fora daqui, de propósito. Um aviso por recado
-- transformaria "tô chegando" em notificação no celular de quatro pessoas, e
-- em uma semana todo mundo desligaria a categoria `SQUAD` inteira — levando
-- junto o aviso de treino marcado, que é o que importa.
--
-- O recado vive no lobby, para quem abrir. Quem precisa de aviso é o combinado.
--
-- ── Recado estraga, como a presença ─────────────────────────────────────────
--
-- Doze horas. Um "tô chegando" de ontem lido hoje de manhã é pior que recado
-- nenhum. A leitura filtra, como em `member_presence` — sem agendador.
-- =============================================================================

create table squad_pings (
  id              uuid primary key default gen_random_uuid(),
  squad_id        uuid not null references training_squads(id) on delete cascade,
  user_profile_id uuid not null references user_profiles(id) on delete cascade,
  kind            text not null check (kind in (
                    'BORA', 'CHEGANDO', 'ATRASADO', 'HOJE_NAO', 'MANDOU_BEM', 'TREINO_NOVO')),
  created_at      timestamptz not null default now()
);

create index squad_pings_recentes_idx on squad_pings (squad_id, created_at desc);

alter table squad_pings enable row level security;

create policy squad_pings_read on squad_pings
  for select using (squad_id in (select my_squad_ids()));

revoke insert, update, delete on squad_pings from authenticated, anon;

-- ── Mandar ───────────────────────────────────────────────────────────────────
/** Um recado a cada tantos segundos, por pessoa e por esquadrão. */
create or replace function ping_intervalo() returns interval
language sql immutable as $$ select interval '20 seconds' $$;

/**
 * Manda um recado.
 *
 * ── O limite não é contra ataque, é contra o dedo ───────────────────────────
 *
 * Vinte segundos. Ninguém precisa mandar "bora" duas vezes no mesmo minuto, e
 * sem o limite um toque repetido — ou um toque preso — enche o painel do
 * grupo e empurra o resto para fora da tela. É o mesmo cuidado de não avisar
 * no sino: o lobby tem de continuar legível.
 *
 * Passar do limite **não** é erro: devolve `false` e a tela não reclama. Dizer
 * "espere 14 segundos" para quem tocou duas vezes sem querer é transformar um
 * engano de dedo em mensagem de erro.
 */
create or replace function send_squad_ping(p_squad_id uuid, p_kind text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu uuid := auth_profile_id();
begin
  if not is_squad_member(p_squad_id) then
    raise exception 'Você não está neste esquadrão.' using errcode = '42501';
  end if;

  if p_kind not in ('BORA', 'CHEGANDO', 'ATRASADO', 'HOJE_NAO', 'MANDOU_BEM', 'TREINO_NOVO') then
    raise exception 'Recado desconhecido: %', p_kind using errcode = '22023';
  end if;

  if exists (
    select 1 from squad_pings
    where squad_id = p_squad_id
      and user_profile_id = v_eu
      and created_at > now() - ping_intervalo()
  ) then
    return false;
  end if;

  insert into squad_pings (squad_id, user_profile_id, kind) values (p_squad_id, v_eu, p_kind);
  return true;
end;
$$;

revoke all on function send_squad_ping(uuid, text) from public, anon;
grant execute on function send_squad_ping(uuid, text) to authenticated, service_role;

/**
 * Os recados das últimas doze horas, do mais antigo para o mais novo.
 *
 * Ordem de conversa: o último fica embaixo, que é onde o olho procura. O teto
 * é de trinta — o painel do lobby mostra os últimos poucos, e trinta é o que
 * cabe numa rolagem sem virar histórico.
 */
create or replace function list_squad_pings(p_squad_id uuid, p_limite integer default 20)
returns table (
  id         uuid,
  perfil_id  uuid,
  nome       text,
  kind       text,
  criado_em  timestamptz,
  sou_eu     boolean
)
language sql stable security definer set search_path = public as $$
  with guarda as (select 1 where is_squad_member(p_squad_id)),
  recentes as (
    select pg.id, pg.user_profile_id, pg.kind, pg.created_at
    from guarda
    cross join squad_pings pg
    where pg.squad_id = p_squad_id
      and pg.created_at > now() - interval '12 hours'
    order by pg.created_at desc
    limit least(greatest(coalesce(p_limite, 20), 1), 30)
  )
  select r.id, r.user_profile_id, p.name, r.kind, r.created_at,
         r.user_profile_id = auth_profile_id()
  from recentes r
  join user_profiles p on p.id = r.user_profile_id
  -- Os mais novos são escolhidos acima; aqui a ordem vira a de leitura.
  order by r.created_at
$$;

revoke all on function list_squad_pings(uuid, integer) from public, anon;
grant execute on function list_squad_pings(uuid, integer) to authenticated, service_role;

insert into schema_migrations (version) values ('0069_recados_do_esquadrao.sql') on conflict do nothing;
