-- =============================================================================
-- SynseHub · 0022 — Encerrar a própria conta
--
-- A Política de Privacidade promete, desde que foi publicada, que a pessoa pode
-- pedir a eliminação dos dados dela — e o único caminho era escrever um e-mail.
-- Promessa que depende de alguém ler uma caixa de entrada não é controle: é
-- intenção. A LGPD (art. 18, VI) trata isso como direito do titular, e a Apple
-- exige que quem cria conta dentro do aplicativo possa apagá-la lá dentro.
--
-- O que esta função faz é a parte difícil da exclusão: decidir o que sai e o
-- que fica, sem apagar o que não é só da pessoa.
--
-- **Sai, porque é dela e de mais ninguém:** corridas e seus trajetos, recordes,
-- desafios e medalhas, avisos, inscrições em programas, e a identificação no
-- perfil — nome, e-mail, telefone, foto, data de nascimento.
--
-- **Fica, e cada um por um motivo diferente:**
--
--   · **Consentimentos.** É a prova de que houve autorização, e de quando. Sem
--     ela não se responde depois "o tratamento em março tinha base?" — e é
--     justamente do controlador que a lei cobra essa resposta. A prova sobrevive
--     à conta, apontando para um perfil que não identifica mais ninguém.
--   · **Cobranças e pagamentos.** Registro fiscal da academia, com prazo legal
--     de guarda que não é do Synse decidir encurtar.
--   · **A ficha de aluno na academia.** Presenças, treinos e avaliações são
--     registro dela, não do Synse — ali somos operador, e apagar por conta
--     própria destruiria o histórico de um terceiro. A matrícula é encerrada e o
--     vínculo com a pessoa deixa de identificá-la.
--
-- O perfil é anonimizado em vez de apagado porque tudo acima aponta para ele:
-- apagar a linha derrubaria junto, por cascata, a prova de consentimento e o
-- histórico da academia.
-- =============================================================================

create or replace function close_own_account(p_confirmacao text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_auth uuid := auth.uid();
  v_profile uuid;
  v_bloqueio text;
  v_apagados jsonb;
begin
  if v_auth is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  /*
   * A confirmação também é conferida aqui, e não só na tela.
   *
   * É a última operação irreversível do produto: uma chamada acidental, um
   * clique duplicado ou um script de teste apontado para o ambiente errado não
   * podem apagar a conta de alguém porque a tela deixou de perguntar.
   */
  if upper(trim(coalesce(p_confirmacao, ''))) <> 'APAGAR' then
    raise exception 'Confirmação inválida.' using errcode = '22023';
  end if;

  select id into v_profile from user_profiles where auth_user_id = v_auth;
  if v_profile is null then
    raise exception 'Conta não encontrada.' using errcode = '22023';
  end if;

  /*
   * Dono de academia com gente dentro não pode sumir.
   *
   * A organização ficaria sem ninguém capaz de administrá-la, com alunos
   * matriculados e cobranças correndo — um estrago em terceiros, não na conta
   * de quem pediu. O caminho é passar a propriedade para outra pessoa antes.
   */
  select 'Você é o único responsável por ' || o.name ||
         '. Passe a propriedade para outra pessoa da equipe antes de encerrar a sua conta.'
    into v_bloqueio
  from organization_members m
  join organizations o on o.id = m.organization_id
  where m.user_profile_id = v_profile
    and m.role = 'OWNER'
    and m.status = 'ACTIVE'
    and not exists (
      select 1 from organization_members outro
      where outro.organization_id = m.organization_id
        and outro.user_profile_id <> v_profile
        and outro.role = 'OWNER'
        and outro.status = 'ACTIVE'
    )
    and exists (
      select 1 from students s
      where s.organization_id = m.organization_id
        and s.status in ('ACTIVE', 'OVERDUE', 'PENDING')
    )
  limit 1;

  if v_bloqueio is not null then
    raise exception '%', v_bloqueio using errcode = '42501';
  end if;

  -- ── O que é só da pessoa ───────────────────────────────────────────────────
  with
    corridas as (delete from activities where user_profile_id = v_profile returning 1),
    recordes as (delete from personal_records where user_profile_id = v_profile returning 1),
    entradas as (delete from challenge_entries where user_profile_id = v_profile returning 1),
    medalhas as (delete from challenge_medals where user_profile_id = v_profile returning 1),
    avisos   as (delete from notifications where user_profile_id = v_profile returning 1),
    inscricoes as (delete from program_enrollments where user_profile_id = v_profile returning 1),
    participacoes as (delete from challenge_participants where user_profile_id = v_profile returning 1)
  select jsonb_build_object(
    'atividades', (select count(*) from corridas),
    'recordes', (select count(*) from recordes),
    'desafios', (select count(*) from entradas),
    'medalhas', (select count(*) from medalhas),
    'avisos', (select count(*) from avisos),
    'programas', (select count(*) from inscricoes) + (select count(*) from participacoes)
  ) into v_apagados;

  -- ── O vínculo com academia termina, o histórico dela permanece ─────────────
  update students
  set status = 'CANCELLED', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
  where user_profile_id = v_profile and status <> 'CANCELLED';

  update organization_members set status = 'SUSPENDED' where user_profile_id = v_profile;

  /*
   * A ficha de profissional fica suspensa, não apagada: `workout_plans` aponta
   * para ela em `created_by_staff_id`, e apagar transformaria todo treino que a
   * pessoa prescreveu num treino sem autor.
   */
  update staff set status = 'SUSPENDED' where user_profile_id = v_profile;

  -- ── A identificação sai do perfil ──────────────────────────────────────────
  /*
   * `.invalid` é o domínio que a RFC 2606 reserva para nunca existir: o
   * endereço fica único, como o índice exige, e não há como alcançar ninguém
   * por ele nem por engano.
   */
  update user_profiles
  set name = 'Conta encerrada',
      email = 'apagado+' || replace(id::text, '-', '') || '@synse.invalid',
      phone = null,
      avatar_url = null,
      birth_date = null,
      gender = null,
      /*
       * Desligar do login é o que encerra a conta de fato. A remoção do usuário
       * de autenticação acontece em seguida, pela aplicação; se ela falhar, a
       * pessoa já não alcança mais nada — este campo é a tranca.
       */
      auth_user_id = null,
      updated_at = now()
  where id = v_profile;

  /*
   * O registro de que houve exclusão fica, sem dizer de quem: é o que permite
   * responder a uma auditoria sem reconstruir a identidade que acabou de ser
   * removida.
   */
  insert into audit_logs (actor_id, action, entity, entity_id, metadata)
  values (null, 'account.closed', 'user_profiles', v_profile, v_apagados);

  return v_apagados;
end;
$$;

comment on function close_own_account(text) is
  'Encerra a conta de quem chama: apaga o que é só dela, anonimiza o perfil e mantém consentimento e registro fiscal.';

revoke all on function close_own_account(text) from public, anon;
grant execute on function close_own_account(text) to authenticated;

insert into schema_migrations (version) values ('0022_encerrar_conta.sql')
on conflict (version) do nothing;
