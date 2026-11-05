-- =============================================================================
-- 0052 — A série do gráfico de peso agrupada pelo banco
--
-- ── O defeito ───────────────────────────────────────────────────────────────
--
-- `listBodyMeasurements` e `listSharedBodyMeasurements` liam as pesagens da
-- janela escolhida **sem teto**, e o PostgREST corta a resposta no teto
-- configurado no servidor sem dar erro.
--
-- Aqui o corte dói diferente das outras leituras deste projeto. A ordem é
-- **decrescente** por data, então o que o corte descarta é o **mais antigo**:
--
--   o gráfico começava depois do começo real — quem acompanha peso há dois
--     anos via a linha nascer no meio do caminho, sem nada dizendo que faltava;
--   "Últimas N medições" e "N pesagens" diziam um número menor que o real,
--     com cara de contagem;
--   o histórico ficava incompleto em silêncio.
--
-- O mais novo sobrevivia por sorte da ordem, então o peso de hoje e a variação
-- desde a anterior continuavam certos — que é justamente o que tornava o
-- defeito invisível: a parte que a pessoa confere batia.
--
-- ── Paginar não resolve gráfico ─────────────────────────────────────────────
--
-- O histórico vira lista paginada, e isso basta para ele. O gráfico não tem
-- página: ele mostra a janela inteira. E mandar duas mil linhas para desenhar
-- trezentos pixels é o que fazia o teto ficar perto — quem pesa três vezes ao
-- dia gera três pontos onde cabe um, e a diferença entre eles é hidratação.
--
-- Então o gráfico passa a ser um valor derivado como qualquer outro, e quem
-- deriva é o banco: **um ponto por balde**, com o número de pontos dependendo
-- do tamanho da janela em vez da frequência de quem pesa.
--
-- ── A última do balde, nunca a média ────────────────────────────────────────
--
-- `distinct on` com ordem decrescente dentro do balde escolhe a **última**
-- pesagem dele. Média seria um número que ninguém viu na balança, num gráfico
-- cujo ponto inteiro é mostrar o que a balança disse. `medicoes` acompanha
-- cada ponto para a tela poder avisar que resumiu.
--
-- ── O balde vem por argumento ───────────────────────────────────────────────
--
-- Dia, semana ou mês é régua de produto, e mora em
-- `src/features/synse-body/baldes-da-serie.ts`. Decidir aqui dentro criaria
-- uma segunda definição da mesma régua, que envelheceria calada.
--
-- ── `security invoker`, de propósito ────────────────────────────────────────
--
-- `body_measurements_self` (0032) já diz quem pode ler o quê:
-- `user_profile_id = auth_profile_id() or body_shared_with_me(user_profile_id)`.
-- Uma regra, dois casos — a própria pessoa e o professor autorizado — e a
-- função não repete nenhum dos dois. Perfil nulo quer dizer "o meu", resolvido
-- por `auth_profile_id()` como `record_body_measurement` faz.
--
-- Nenhuma tabela nova, nenhuma política nova, nenhum índice novo:
-- `body_measurements (user_profile_id, measured_at desc)` (0032) é exatamente
-- o que esta consulta e a lista paginada pedem.
-- =============================================================================

/**
 * A série do gráfico de peso, um ponto por balde.
 *
 * `p_user_profile_id` nulo é "o meu". Passar o de outra pessoa é legítimo e é
 * o caso do professor: quem decide se ele enxerga é a RLS, não esta função.
 *
 * `p_desde` nulo é "tudo" — a janela sem corte do seletor.
 *
 * `instante` é o momento da pesagem escolhida, e não o início do balde: o
 * rótulo do gráfico aponta um dia em que a pessoa de fato subiu na balança.
 *
 * Sem nenhuma pesagem a função devolve **zero linhas**, e não uma linha zerada:
 * aqui o vazio é um gráfico que não existe, não um número que vale zero.
 */
create or replace function serie_de_peso(
  p_user_profile_id uuid,
  p_desde           timestamptz,
  p_balde           text
)
returns table (
  instante  timestamptz,
  peso      numeric,
  medicoes  bigint
)
language sql stable security invoker set search_path = public as $$
  with alvo as (
    select coalesce(p_user_profile_id, auth_profile_id()) as perfil,
           /*
            * Balde desconhecido cai em 'day' em vez de estourar. A régua vem
            * da aplicação, e um valor novo lá não deve derrubar a tela aqui —
            * no pior caso o gráfico fica mais detalhado do que o pretendido.
            */
           case lower(coalesce(p_balde, 'day'))
             when 'week'  then 'week'
             when 'month' then 'month'
             else 'day'
           end as unidade
  ),
  por_balde as (
    select distinct on (date_trunc(a.unidade, m.measured_at))
           m.measured_at as instante,
           m.weight_kg   as peso,
           count(*) over (partition by date_trunc(a.unidade, m.measured_at)) as medicoes
      from body_measurements m
      cross join alvo a
     where m.user_profile_id = a.perfil
       and (p_desde is null or m.measured_at >= p_desde)
     order by date_trunc(a.unidade, m.measured_at), m.measured_at desc
  )
  select b.instante, b.peso, b.medicoes
    from por_balde b
   order by b.instante
$$;

revoke all on function serie_de_peso(uuid, timestamptz, text) from public, anon;
grant execute on function serie_de_peso(uuid, timestamptz, text) to authenticated, service_role;

insert into schema_migrations (version) values ('0052_serie_de_peso.sql') on conflict do nothing;
