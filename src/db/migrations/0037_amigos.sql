-- =============================================================================
-- SynseHub · 0037 — Amigos e o ranking entre eles
--
-- Última das promessas do Synse+ que dava para cumprir com código: "Ranking
-- entre amigos — opcional, com sua autorização". As outras três (programas
-- guiados, cardápios por objetivo, biblioteca de e-books) são conteúdo, não
-- código.
--
-- ── Amizade atravessa academia ───────────────────────────────────────────────
--
-- Todo o resto do sistema é isolado por organização: a RLS pergunta "esta
-- pessoa é membro desta academia?" e pronto. Amizade não cabe nisso — o Synse+
-- é assinatura de consumidor, e quem treina na Alpha quer disputar com o primo
-- que treina em outro lugar, ou com quem não treina em academia nenhuma.
--
-- Por isso as políticas daqui não olham organização. Elas olham **a própria
-- linha de amizade**: você enxerga a amizade em que você é uma das duas
-- pontas. Não é uma exceção ao isolamento, é outro eixo — e é o motivo de
-- `tests/db/amigos.test.ts` gastar metade dos testes provando que ninguém
-- enxerga amizade alheia.
--
-- ── O consentimento é separado da amizade ────────────────────────────────────
--
-- Aceitar alguém como amigo **não** é autorizar a publicação do próprio
-- número. São duas decisões, e juntá-las seria transformar "oi, somos amigos"
-- em "pode mostrar meu desempenho para ele".
--
-- O consentimento mora em `consents`, com `consent_type = 'RANKING_VISIBILITY'`
-- — que a 0003 já previa e ninguém usava. Sem ele, a pessoa participa da lista
-- de amigos e **não aparece no ranking**, nem para quem já é amigo dela. É a
-- regra do produto: nunca publicar métrica pessoal sem consentimento.
--
-- ── Por que ranquear por treino concluído ────────────────────────────────────
--
-- Porque é o único número que todo mundo tem. Distância exclui quem não corre;
-- carga exclui quem faz só aula; check-in exclui quem treina em casa. Treino
-- concluído no Treino Ativo existe para aluno de academia, aluno solo e quem
-- usa só o treino base — e é o que o produto pede que a pessoa faça.
-- =============================================================================

create table if not exists friendships (
  id                   uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references user_profiles(id) on delete cascade,
  addressee_profile_id uuid not null references user_profiles(id) on delete cascade,
  status               text not null default 'PENDING'
                         check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  -- Amizade consigo mesmo seria um ranking de um, e um bug em forma de dado.
  constraint friendship_nao_reflexiva check (requester_profile_id <> addressee_profile_id)
);

/*
 * (A,B) e (B,A) são a mesma amizade.
 *
 * Sem este índice, os dois pedirem um ao outro criaria duas linhas, e a lista
 * de amigos mostraria a mesma pessoa duas vezes — uma como pedido enviado e
 * outra como recebido. Ordenar o par no índice resolve sem exigir que a
 * aplicação lembre de conferir os dois sentidos.
 */
create unique index if not exists friendships_par_unico on friendships (
  least(requester_profile_id, addressee_profile_id),
  greatest(requester_profile_id, addressee_profile_id)
);

create index if not exists friendships_addressee_idx
  on friendships (addressee_profile_id, status);

comment on table friendships is
  'Amizade entre contas, de mão dupla. Atravessa academias: o Synse+ é do consumidor.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table friendships enable row level security;

/**
 * Sou uma das duas pontas desta amizade?
 *
 * `security definer` porque compara com `auth_profile_id()`, que já é definer —
 * e porque a política precisa da resposta mesmo quando a pessoa não enxerga a
 * outra ponta por nenhum outro caminho.
 */
create or replace function is_friendship_party(p_requester uuid, p_addressee uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth_profile_id() in (p_requester, p_addressee)
$$;

revoke all on function is_friendship_party(uuid, uuid) from public, anon;
grant execute on function is_friendship_party(uuid, uuid) to authenticated, service_role;

drop policy if exists friendships_read on friendships;
create policy friendships_read on friendships
  for select using (is_friendship_party(requester_profile_id, addressee_profile_id));

/*
 * Escrita só pelas funções abaixo, que são `security definer`.
 *
 * Sem política de insert/update/delete, o cliente não escreve direto — e é o
 * que se quer: aceitar um pedido é operação com regra (só o destinatário pode,
 * e só uma vez), e regra em política vira regra espalhada.
 */

-- ── Pedir, responder, desfazer ───────────────────────────────────────────────

/**
 * Pede amizade pelo Synse ID da outra pessoa.
 *
 * O Synse ID é o identificador público — `SYN-XXXXXXXX`, gerado na 0001 com
 * alfabeto sem caracteres ambíguos. Pedir por e-mail exigiria que a pessoa
 * revelasse o e-mail dela; pedir por nome esbarraria em homônimo.
 *
 * `security definer` porque precisa achar um perfil que quem pede não enxerga
 * por nenhuma política — é justamente o ponto de ter um identificador público.
 * Em troca, a função devolve **só o id da amizade**: nada do perfil alheio
 * vaza por aqui.
 *
 * Pedido repetido não duplica nem estoura: devolve a amizade que já existe.
 * Quem já foi recusado pode pedir de novo — recusar não é bloquear, e tratar
 * como bloqueio seria decidir pela pessoa uma coisa que ela não disse.
 */
create or replace function request_friendship(p_synse_id text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu     uuid := auth_profile_id();
  v_alvo   uuid;
  v_id     uuid;
begin
  if v_eu is null then
    raise exception 'Sessão sem perfil.' using errcode = '42501';
  end if;

  select id into v_alvo from user_profiles where synse_id = upper(trim(p_synse_id));
  if v_alvo is null then
    raise exception 'Não encontramos ninguém com esse Synse ID.' using errcode = 'P0002';
  end if;
  if v_alvo = v_eu then
    raise exception 'Esse Synse ID é o seu.' using errcode = '22023';
  end if;

  select id into v_id from friendships
   where least(requester_profile_id, addressee_profile_id) = least(v_eu, v_alvo)
     and greatest(requester_profile_id, addressee_profile_id) = greatest(v_eu, v_alvo);

  if v_id is not null then
    /*
     * Já existe. Se foi recusada, o novo pedido a reabre — e passa a ser deste
     * lado, senão quem recusou precisaria pedir para si mesmo responder.
     */
    update friendships set
      status = 'PENDING',
      requester_profile_id = v_eu,
      addressee_profile_id = v_alvo,
      responded_at = null
    where id = v_id and status = 'DECLINED';
    return v_id;
  end if;

  insert into friendships (requester_profile_id, addressee_profile_id)
  values (v_eu, v_alvo)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function request_friendship is
  'Pede amizade pelo Synse ID. Devolve só o id da amizade — nada do perfil alheio.';

revoke all on function request_friendship(text) from public, anon;
grant execute on function request_friendship(text) to authenticated, service_role;

/**
 * Responde a um pedido. Só o destinatário pode.
 *
 * A conferência é aqui e não na política porque a regra tem lado: quem pediu
 * não aceita o próprio pedido. Uma política de update não distingue isso sem
 * repetir a mesma condição em dois lugares.
 */
create or replace function respond_friendship(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu uuid := auth_profile_id();
  v_afetadas integer;
begin
  update friendships set
    status = case when p_accept then 'ACCEPTED' else 'DECLINED' end,
    responded_at = now()
  where id = p_friendship_id
    and addressee_profile_id = v_eu
    and status = 'PENDING';

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Pedido não encontrado, já respondido, ou não é seu.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function respond_friendship(uuid, boolean) from public, anon;
grant execute on function respond_friendship(uuid, boolean) to authenticated, service_role;

/** Desfaz a amizade. Qualquer uma das duas pontas pode, a qualquer momento. */
create or replace function remove_friendship(p_friendship_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_eu uuid := auth_profile_id();
  v_afetadas integer;
begin
  delete from friendships
   where id = p_friendship_id
     and v_eu in (requester_profile_id, addressee_profile_id);

  get diagnostics v_afetadas = row_count;
  if v_afetadas = 0 then
    raise exception 'Amizade não encontrada, ou não é sua.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function remove_friendship(uuid) from public, anon;
grant execute on function remove_friendship(uuid) to authenticated, service_role;

-- ── O consentimento ──────────────────────────────────────────────────────────

/**
 * A pessoa autorizou aparecer em ranking?
 *
 * Lê `consents`, que a 0003 já previa com `RANKING_VISIBILITY` e ninguém usava.
 * Vale a linha mais recente que não foi revogada — revogar é desmarcar, e
 * desmarcado significa **fora**, não "sem resposta".
 */
create or replace function consentiu_ranking(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select c.accepted
      from consents c
      where c.user_profile_id = p_profile_id
        and c.consent_type = 'RANKING_VISIBILITY'
        and c.revoked_at is null
      order by c.accepted_at desc nulls last, c.created_at desc
      limit 1
    ),
    false
  )
$$;

revoke all on function consentiu_ranking(uuid) from public, anon;
grant execute on function consentiu_ranking(uuid) to authenticated, service_role;

-- ── Quem é meu amigo ─────────────────────────────────────────────────────────

/**
 * A lista, dos dois lados, com o estado de cada uma.
 *
 * `sou_quem_pediu` existe porque a tela precisa saber a diferença: pedido
 * recebido tem botão de aceitar, pedido enviado tem "aguardando".
 *
 * `no_ranking` é o consentimento **da outra pessoa**, e vai junto de propósito:
 * a tela precisa poder dizer "fulano ainda não autorizou aparecer" em vez de
 * simplesmente sumir com ele e deixar quem olha achando que é defeito.
 */
create or replace function list_friends()
returns table (
  amizade_id     uuid,
  perfil_id      uuid,
  nome           text,
  synse_id       text,
  situacao       text,
  sou_quem_pediu boolean,
  no_ranking     boolean,
  desde          timestamptz
)
language sql stable security definer set search_path = public as $$
  with eu as (select auth_profile_id() as id)
  select
    f.id,
    outro.id,
    outro.name,
    outro.synse_id,
    f.status,
    f.requester_profile_id = eu.id,
    consentiu_ranking(outro.id),
    f.created_at
  from friendships f
  cross join eu
  join user_profiles outro
    on outro.id = case when f.requester_profile_id = eu.id
                       then f.addressee_profile_id
                       else f.requester_profile_id end
  where eu.id in (f.requester_profile_id, f.addressee_profile_id)
    -- Recusado some da lista: manter seria um lembrete de um "não".
    and f.status <> 'DECLINED'
  order by f.status, outro.name
$$;

revoke all on function list_friends() from public, anon;
grant execute on function list_friends() to authenticated, service_role;

-- ── O ranking ────────────────────────────────────────────────────────────────

/**
 * Você e seus amigos que autorizaram, por treinos concluídos no período.
 *
 * Duas trancas, e as duas precisam passar: **amizade aceita** e
 * **consentimento da pessoa**. Amigo que não autorizou não sai daqui — nem o
 * nome, nem o número.
 *
 * Você aparece sempre, independente do seu consentimento: o ranking é seu, e
 * seu próprio número não é publicação. O consentimento existe para o que os
 * outros veem.
 *
 * `security definer` porque precisa somar sessão de treino de outra conta, que
 * a RLS nega — e é por isso que as duas trancas estão escritas na cláusula, em
 * vez de delegadas. Quem confere que elas seguram é `tests/db/amigos.test.ts`.
 */
create or replace function friends_ranking(p_from timestamptz, p_to timestamptz)
returns table (
  posicao    integer,
  perfil_id  uuid,
  nome       text,
  sou_eu     boolean,
  treinos    integer,
  volume_kg  numeric
)
language sql stable security definer set search_path = public as $$
  with eu as (select auth_profile_id() as id),
  participantes as (
    select eu.id as perfil_id from eu
    union
    select case when f.requester_profile_id = eu.id
                then f.addressee_profile_id
                else f.requester_profile_id end
    from friendships f
    cross join eu
    where f.status = 'ACCEPTED'
      and eu.id in (f.requester_profile_id, f.addressee_profile_id)
      -- A tranca do consentimento, do lado de quem seria publicado.
      and consentiu_ranking(
            case when f.requester_profile_id = eu.id
                 then f.addressee_profile_id
                 else f.requester_profile_id end
          )
  ),
  numeros as (
    select
      p.perfil_id,
      count(distinct s.id)::integer as treinos,
      coalesce(sum(coalesce(l.weight, 0) * l.reps_completed), 0) as volume_kg
    from participantes p
    join user_profiles u on u.id = p.perfil_id
    left join students st on st.user_profile_id = p.perfil_id
    left join workout_sessions s
      on s.student_id = st.id
     and s.status = 'COMPLETED'
     and s.started_at >= p_from
     and s.started_at < p_to
    left join workout_set_logs l on l.session_id = s.id
    group by p.perfil_id
  )
  select
    rank() over (order by n.treinos desc, n.volume_kg desc)::integer,
    n.perfil_id,
    u.name,
    n.perfil_id = eu.id,
    n.treinos,
    n.volume_kg
  from numeros n
  join user_profiles u on u.id = n.perfil_id
  cross join eu
  order by 1, u.name
$$;

comment on function friends_ranking is
  'Você e os amigos que autorizaram. Sem consentimento, a pessoa não sai daqui.';

revoke all on function friends_ranking(timestamptz, timestamptz) from public, anon;
grant execute on function friends_ranking(timestamptz, timestamptz) to authenticated, service_role;

insert into schema_migrations (version) values ('0037_amigos.sql') on conflict do nothing;
