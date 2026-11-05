-- =============================================================================
-- SynseHub · 0033 — Foto de perfil
--
-- A coluna `avatar_url` existe desde a 0001 e nunca teve quem a preenchesse:
-- faltava onde guardar o arquivo. Esta migration cria esse lugar.
--
-- ── Balde privado, e não público ─────────────────────────────────────────────
--
-- Um balde público entrega o arquivo a quem tiver a URL, para sempre, sem
-- passar por autenticação nenhuma. É o padrão da indústria para avatar, e é
-- uma escolha que não combina com este produto: a foto é do rosto de alguém,
-- fica ao lado de dado de saúde, e uma URL vaza em captura de tela, em log de
-- proxy e no histórico do navegador.
--
-- Privado custa uma URL assinada a cada exibição. É o preço, e ele é pequeno
-- perto de explicar depois por que a foto de um aluno continuou acessível
-- meses após ele encerrar a conta.
--
-- ── Quem pode o quê ──────────────────────────────────────────────────────────
--
-- Escrever: só a própria pessoa, e só dentro da pasta dela. O caminho é
-- `<auth.uid()>/<arquivo>`, então a política confere a primeira pasta.
--
-- Ler: a própria pessoa e a equipe da academia dela — o professor precisa
-- reconhecer quem chega. Aluno não vê foto de aluno.
-- =============================================================================

/*
 * O balde. `on conflict` porque criar balde é idempotente por natureza: rodar
 * a migration de novo num banco que já a recebeu não pode falhar.
 *
 * Limite de 2 MB no próprio balde, além da validação na aplicação: o servidor
 * é quem decide, e o cliente pode mentir sobre o tamanho.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/** O perfil dono daquela pasta. A pasta é o `auth.uid()` de quem subiu. */
create or replace function avatar_owner(caminho text) returns uuid
language plpgsql immutable as $$
begin
  /*
   * Caminho fora do formato devolve nulo em vez de estourar. A política é
   * avaliada contra toda linha do balde, e um objeto com nome inesperado —
   * upload antigo, arquivo posto à mão pelo painel — derrubaria a consulta
   * inteira com erro de cast em vez de simplesmente não casar.
   */
  return nullif((string_to_array(caminho, '/'))[1], '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- ── Escrita: só na própria pasta ─────────────────────────────────────────────
drop policy if exists avatars_insert_self on storage.objects;
create policy avatars_insert_self on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and avatar_owner(name) = auth.uid());

drop policy if exists avatars_update_self on storage.objects;
create policy avatars_update_self on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and avatar_owner(name) = auth.uid())
  with check (bucket_id = 'avatars' and avatar_owner(name) = auth.uid());

/*
 * Apagar é da pessoa. Trocar de foto apaga a anterior, e encerrar a conta
 * apaga tudo — a 0022 já zera `avatar_url`, e sem esta política o arquivo
 * ficaria órfão no balde depois de a linha sumir.
 */
drop policy if exists avatars_delete_self on storage.objects;
create policy avatars_delete_self on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and avatar_owner(name) = auth.uid());

-- ── Leitura: a pessoa, e a equipe da academia dela ───────────────────────────
/**
 * A equipe da academia onde o dono daquela foto é aluno.
 *
 * Função, e não subconsulta dentro da política: escrita inline, o `name` do
 * objeto colidia com a coluna `name` de `user_profiles`, e o Postgres resolvia
 * para a coluna mais próxima — mandando o *nome da pessoa* para um cast de
 * uuid. A política falhava com "invalid input syntax for type uuid".
 */
create or replace function avatar_visivel_para_equipe(caminho text) returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (
    select 1
    from user_profiles p
    join students s on s.user_profile_id = p.id
    where p.auth_user_id = avatar_owner(caminho)
      and is_org_staff(s.organization_id) is true
  )
$$;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      avatar_owner(name) = auth.uid()
      -- O professor precisa reconhecer quem chega. Aluno não vê foto de aluno.
      or avatar_visivel_para_equipe(name)
    )
  );

/**
 * Registra a foto no perfil.
 *
 * Existe para a aplicação não precisar escrever `avatar_url` direto: a função
 * resolve a pessoa pelo `auth.uid()` e confere que o caminho é da pasta dela.
 * Sem isso, um caminho de outra pessoa colado na chamada apontaria o perfil
 * para a foto alheia — o arquivo continuaria protegido, mas o nome ficaria
 * errado, e a tela mostraria a pessoa errada para a equipe.
 */
create or replace function set_profile_avatar(p_caminho text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_perfil uuid;
begin
  select id into v_perfil from user_profiles where auth_user_id = auth.uid();
  if v_perfil is null then
    raise exception 'Sessão não identificada.' using errcode = '42501';
  end if;

  -- Nulo apaga a foto: é como a tela remove sem precisar de outra função.
  if p_caminho is not null and avatar_owner(p_caminho) is distinct from auth.uid() then
    raise exception 'Este caminho não é seu.' using errcode = '42501';
  end if;

  update user_profiles
     set avatar_url = p_caminho,
         updated_at = now()
   where id = v_perfil;
end;
$$;

revoke all on function set_profile_avatar(text) from public, anon;
grant execute on function set_profile_avatar(text) to authenticated, service_role;

insert into schema_migrations (version) values ('0033_foto_de_perfil.sql') on conflict do nothing;
