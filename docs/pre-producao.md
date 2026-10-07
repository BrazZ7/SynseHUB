# Antes do primeiro cliente pagante

Lista do que precisa estar resolvido antes de cobrar dinheiro de alguém.
Enquanto o SynseHub está em construção, boa parte disto pode esperar — mas
esperar é uma decisão, e decisão adiada some. Por isso está escrita.

## Credenciais a rotacionar

Credencial que apareceu em print, chamada de vídeo ou mensagem deve ser trocada
antes de ir ao ar. Estão listadas aqui porque, durante a construção, foi comum
mostrar tela para pedir ajuda.

- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **a mais urgente, e não pode esperar o
      final.** Ela aponta para o projeto de produção, não para um ambiente de
      teste: quem a tem lê, altera e apaga os dados de todas as academias,
      passando por cima de toda a RLS.

      **Não regenere o JWT secret.** Ele invalida `anon` e `service_role` no
      mesmo instante, e tudo que está no ar cai junto — inclusive o webhook de
      pagamento, que é onde cair dói. O Supabase hoje tem um caminho sem essa
      janela: as chaves novas (`sb_publishable_…` e `sb_secret_…`) convivem com
      as antigas, e dá para virar uma e depois desligar a outra.

      Ordem segura, em Settings → API Keys:

      1. *Create new API key* → **Secret key**. Copiar o `sb_secret_…` — ela
         aparece uma vez.
      2. Pôr em `SUPABASE_SERVICE_ROLE_KEY` na Vercel, nos três ambientes,
         como **Sensitive**, e em `.env.local`.
      3. Publicar de novo. Variável só entra em build nova.
      4. Conferir `/api/health?deep=1` respondendo, e um pagamento de teste
         passando pelo webhook — é ele que usa a chave de serviço.
      5. **Só então** desligar as chaves antigas (*Disable legacy API keys*,
         que é um botão separado: criar as novas não revoga nada).

      A chave nova não exige mudança no código: ela vai nos mesmos cabeçalhos
      `apikey`/`Authorization`, e nada aqui decodifica a chave como JWT —
      conferido. O `NEXT_PUBLIC_SUPABASE_ANON_KEY` pode virar
      `sb_publishable_…` pelo mesmo caminho, e as sondas de `/api/health`
      continuam valendo (401 segue sendo "existe e recusa o anônimo").

      Fonte: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- [x] `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` — não se aplicam mais. O adapter
      do Asaas foi removido. **Apagar as duas da Vercel**, junto com
      `ASAAS_API_URL`, `ASAAS_TEST_WALLET_ID` e `PAYMENT_PROVIDER` — variável
      que sobra vira credencial esquecida, e `PAYMENT_PROVIDER=asaas` pede um
      provedor que esta build não tem.
- [ ] Tokens da Vercel em https://vercel.com/account/tokens — apagar os que não
      estiverem em uso.

Para conferir o estado sem abrir o arquivo e expor tudo de novo:

```bash
npm run env:check
```

## Migrations

**Estado em 03/10/2026: 0001 a 0048 aplicadas em produção, nada pendente**,
confirmado por `/api/health?deep=1` (`appliedMigrations: 42`,
`pendingMigrations: []`).

Esta linha envelhece a cada migration e por isso não é a fonte da verdade: a
sonda é. Quem quiser saber o que falta abre o endereço, não este arquivo. O que
segue abaixo é o registro do que cada uma resolve — útil para entender por que
existem, não para conferir se subiram.

- **0017 (`0017_consentimento.sql`)** — sem ela a tela de privacidade do app
  aparece sem a lista de consentimentos, e o cadastro não registra o aceite dos
  termos.
- **0018 (`0018_reativacao_avisa.sql`)** — avisa o aluno quando a matrícula é
  reativada, e cria `schema_migrations`.
- **0019 (`0019_mensalidade_automatica.sql`)** — geração automática de
  mensalidade e marcação de cobrança vencida.
- **0020 (`0020_convite_de_equipe.sql`)** — convite de acesso ao painel para a
  equipe.
- **0021 (`0021_biblioteca_de_exercicios.sql`)** — os 132 exercícios da
  plataforma, com músculo alvo, região, padrão de movimento e apelidos. Sem
  ela, a tela de montar treino não tem o que oferecer.
- **0022 (`0022_encerrar_conta.sql`)** — exclusão da conta pela própria tela.
  Sem ela, o botão existe e a operação falha.
- **0023 (`0023_avaliacao_fisica.sql`)** — avaliação física com dobras
  cutâneas. Traz as equações de Jackson & Pollock e o gatilho que recalcula
  IMC, densidade corporal e percentual de gordura a cada escrita. Sem ela, a
  tela de avaliação grava as colunas que não existem e falha; com ela, nenhum
  desses três números pode chegar pronto do formulário.
- **0024 (`0024_agenda.sql`)** — a agenda de aulas: grade semanal, a aula de cada
  dia e as reservas, com a lotação conferida sob trava (`select ... for update`)
  e a lista de espera andando por gatilho. Sem ela, a tela de agenda não tem
  onde gravar. A grade se repõe sozinha na leitura das telas, então ela não
  depende do agendamento `/api/cron/schedule` — que existe como reforço, para a
  academia que fica dias sem abrir o painel. Nenhuma rotina da agenda apaga
  aula ou presença antiga: a materialização só insere.
- **0025 (`0025_agenda_autorizacao.sql`)** — conserta os bancos que receberam a
  primeira versão da 0024, publicada antes de ser revisada. Fecha o furo em que
  uma academia reservava em nome de aluno de outra (`is_org_staff` devolve NULL,
  e `if not null` não dispara), dá à equipe a função de materializar a própria
  grade, e traz a reposição na leitura. Só `create or replace`: nenhuma tabela é
  tocada. As duas versões da 0024 registram a mesma linha, então o registro não
  distingue qual rodou — quem distingue é a sonda `agendaAutossuficiente` em
  `/api/health?deep=1`.
- **0026 (`0026_treino_ativo.sql`)** — o Treino Ativo: sessão, passagem por
  exercício e série. `workout_logs` continua intacta; ela é achatada demais para
  série-a-série e é o que o histórico já lê. A garantia contra o toque duplo é
  do banco, em dois níveis: `unique (session_id, client_id)` absorve o reenvio
  da mesma ação, e `unique (session_id, exercise_id, set_number)` impede duas
  "série 2" ainda que venham com ids diferentes.
- **0027 (`0027_relatorios.sql`)** — a agregação dos relatórios. Todas as funções
  são SECURITY INVOKER, ao contrário das de escrita: sem nada a gravar, o
  `security definer` só criaria superfície nova de vazamento entre academias, e
  a RLS que já existe filtra melhor que qualquer checagem escrita à mão.
- **0028 (`0028_crm.sql`)** — o CRM. `leads` existia desde a 0003 e nunca teve
  tela. Acrescenta o histórico de etapa, sem o qual não há taxa de conversão —
  `leads.stage` guarda onde a pessoa está, e sobrescrever a coluna apaga por
  onde ela passou. `convert_lead_to_student` cria perfil, aluno e matrícula numa
  transação só: em três chamadas da aplicação, a falha da segunda deixaria aluno
  criado com lead aberto.
- **0029 (`0029_desafios_da_academia.sql`)** — os desafios da academia.
  `challenges` existia desde a 0003 com `metric` em texto livre e o comentário
  "CHECKINS, STEPS, HYDRATION…"; passos e hidratação nunca entraram, porque
  seriam número digitado pelo aluno. As cinco métricas são as que o sistema mede
  sozinho, e três delas só passaram a existir com a 0026. O ranking exige dois
  consentimentos: a academia liga no desafio, e cada aluno decide se aparece.
- **0030 (`0030_nutricao.sql`)** — nutrição. As quatro tabelas existem desde a
  0003 e a RLS delas desde a 0004; faltavam macros, meta diária e publicação com
  versão. A RLS **não foi alterada**: `meals_scoped` escapa por uma dependência
  sutil — a subconsulta do `using` é avaliada sob a RLS de `nutrition_plans` —, o
  que foi verificado antes de escrever a migration e está fixado em
  `tests/db/nutricao.test.ts`. Junto, `nutrition:read/write` saiu do papel
  MANAGER no app: a RLS já restringia a NUTRITIONIST e OWNER, e o menu mostrava
  uma tela que o banco devolvia vazia.
- **0031 (`0031_conteudos.sql`)** — conteúdos, e o conserto de dois furos que a
  RLS da 0004 tinha e que os testes confirmaram antes de a migration ser
  escrita. Rascunho aparecia para o aluno, porque a política não olhava
  `published_at`. E o pior: conteúdo de academia marcado `FREE` era entregue a
  outras academias **e ao visitante anônimo** — o rótulo é a armadilha, porque
  "grátis" lê como "sem custo para os meus alunos". FREE passa a exigir
  `organization_id is null`, e uma restrição impede a escolha na origem.
- **0032 (`0032_synse_body.sql`)** — Synse Body, a balança inteligente ligada ao
  app. Tabela separada de `assessments` de propósito: a avaliação é documento
  profissional, com responsável técnico e adipômetro, e acontece três vezes por
  ano; a pesagem é leitura de aparelho, acontece toda semana, e o número de
  composição vem de bioimpedância — que é estimativa. Misturá-las faria cem
  pesagens inundarem o gráfico da avaliação e daria à leitura da balança a
  mesma autoridade do adipômetro.

  A medição pertence a `user_profiles` e **não** a `students`: quem cancela a
  matrícula, troca de academia e volta um ano depois continua dono do próprio
  histórico. E pertencer à mesma academia não dá acesso nenhum — nem para o
  professor, nem para o dono. A abertura é nominal, por pessoa, e revogável
  (`body_measurement_shares`). `insert` e `update` em `body_measurements` ficam
  revogados: quem grava é `record_body_measurement`, que resolve a pessoa pelo
  `auth.uid()` e confere se o aparelho é dela — numa balança de família, gravar
  a pesagem de um no histórico do outro é o erro mais fácil de cometer.
- **0033 (`0033_foto_de_perfil.sql`)** — foto de perfil. A coluna `avatar_url`
  existia desde a 0001 e nunca teve quem a preenchesse: faltava onde guardar o
  arquivo. O balde é **privado**, e não público como é padrão para avatar — é o
  rosto de alguém, fica ao lado de dado de saúde, e uma URL pública continuaria
  funcionando para sempre, em captura de tela, log de proxy e histórico do
  navegador. O custo é uma URL assinada a cada exibição, e ele é pequeno perto
  de explicar por que a foto de um aluno seguiu acessível meses depois de ele
  encerrar a conta.

  Escrita só na própria pasta (`<auth.uid()>/<arquivo>`); leitura pela pessoa e
  pela equipe da academia dela — aluno não vê foto de aluno. O primeiro
  rascunho da política de leitura tinha um defeito que só o teste pegou: dentro
  do `exists`, o `name` do objeto colidia com a coluna `name` de
  `user_profiles`, e o Postgres mandava o *nome da pessoa* para um cast de
  uuid.
- **0034 (`0034_super_admin.sql`)** — a conta de plataforma. O papel
  `SUPER_ADMIN` existe desde a 0001 e a RLS já o reconhecia desde a 0004
  (`is_super_admin()` está dentro de `is_org_member`, `is_org_staff` e
  `is_org_admin`); o que nunca existiu foi **como criar a conta** e **onde ela
  mora**. Uma segunda organização reservada, `...0002`, hospeda o papel — sem
  encostar na dos alunos solo, cuja promessa é justamente não ter equipe.

  `grant_super_admin` e `revoke_super_admin` só executam como `service_role`,
  ou seja, pelo SQL Editor: se a aplicação pudesse promover, um defeito numa
  tela criaria uma conta que lê o banco inteiro.

  E há trilha. Essa conta lê dado de saúde de qualquer aluno de qualquer
  academia, e sem registro não há como responder "quem abriu aquela ficha, e
  quando". `platform_access_log` é lida só por conta de plataforma e não aceita
  update nem delete de ninguém — trilha que o auditado apaga não é trilha.

- **0035 (`0035_aderencia.sql`)** — `workout_adherence`, o planejado contra o
  feito por sessão. A 0026 grava `reps_planned` ao lado de `reps_completed`
  desde sempre e **nenhuma consulta lia a coluna**; a 0027 trouxe carga, volume
  e recorde, e deixou aderência de fora. Sem ela a análise do Synse+ não tem o
  número que o professor olha primeiro: a série em que a pessoa parou antes do
  previsto, que é sinal de fadiga ou de carga alta demais.

  Devolve uma linha por sessão, e não um número só, porque a pergunta útil é a
  comparação — 78% nas últimas três sessões contra 96% antes delas — e a mesma
  porcentagem do mês serviria para essa leitura e para a oposta. Série sem
  `reps_planned` (treino livre, série extra) fica fora dos dois lados: contá-la
  como falha puniria quem fez além do combinado.

  `SECURITY INVOKER`, como toda a 0027 — a RLS filtra sozinha, e
  `tests/db/aderencia.test.ts` confere que o aluno de uma academia não lê a
  aderência do aluno de outra.

- **0036 (`0036_assinatura_plus.sql`)** — a assinatura do Synse+: `plus_status`
  (`NONE`, `TRIAL`, `ACTIVE`, `CANCELED`, `EXPIRED`), `plus_until`,
  `plus_provider` e `plus_provider_ref` em `user_profiles`, mais
  `set_plus_subscription` e `expire_plus_subscriptions`, as duas revogadas a
  todo mundo menos a chave de serviço.

  O modelo é primeiro mês a R$ 0,00 com renovação automática pelo preço cheio,
  então quem manda é a **data**, não o rótulo: `resumoDaAssinatura` decide por
  `plus_until`, e um `plus_status` que diga `ACTIVE` com a data vencida não
  libera nada. É a mesma regra de nunca confiar no cliente para confirmar
  pagamento, aplicada ao próprio banco.

  Duas coisas que essa migration ensinou, e que vão custar caro para quem
  repetir:

  - **A primeira versão protegia uma função morta.** Ela estendia
    `guard_user_tier`, que é o nome da 0014 — a 0015 já o havia trocado por
    `guard_paid_columns`. O gatilho continuava existindo com o nome antigo e
    não guardava nada, então um `update` vindo do cliente marcava
    `plus_status = 'ACTIVE'` com `plus_until` em 2036. Synse+ vitalício de
    graça, e o SQL subia sem erro nenhum. Quem achou foi a sonda de mutação,
    não a leitura.
  - **O SQL Editor do Supabase corta colagem grande em silêncio.** Das 213
    linhas chegaram 100, e o erro que apareceu — `unterminated /* comment` na
    linha 97 — parecia defeito do SQL. Desde então vai sempre uma versão enxuta
    junto da documentada, conferida pelos mesmos testes.

- **0037 (`0037_amigos.sql`)** — amigos e o ranking entre eles, a última
  promessa do Synse+ que dava para cumprir com código.

  Amizade é o único eixo do sistema que **atravessa academia**: o Synse+ é
  assinatura de consumidor, e quem treina na Alpha quer disputar com o primo
  que treina em outro lugar. As políticas daqui não olham organização, olham a
  própria linha de amizade — não é exceção ao isolamento, é outro eixo.

  O ranking tem duas trancas independentes, e as duas precisam passar: amizade
  `ACCEPTED` **e** consentimento `RANKING_VISIBILITY` vigente da outra pessoa.
  Aceitar alguém como amigo não é autorizar a publicação do próprio número, e
  juntar as duas decisões seria transformar "oi, somos amigos" em "pode mostrar
  meu desempenho para ele". Você aparece sempre no seu próprio ranking: o
  consentimento é sobre ser visto pelos outros.

  `friendships` só tem política de `select`. Pedir, responder e desfazer passam
  por funções `security definer`, porque aceitar um pedido é operação com regra
  — só o destinatário pode, e só uma vez — e regra em política vira regra
  espalhada.

  Um detalhe que a sonda de saúde descobriu: ler `friendships` com a chave
  pública responde 401, e não lista vazia. A política chama
  `is_friendship_party`, que é revogada do anônimo. Não é grant faltando na
  tabela — quem barra é a função —, e por isso a sonda da 0037 pergunta por
  `list_friends`, não pela tabela.

- **0038 (`0038_cadeado_do_plus.sql`)** — o cadeado do Synse+ passa a conferir a
  porta certa, e as receitas e programas guiados param de ficar abertos.

  Duas políticas liberavam conteúdo `SYNSE_PLUS` consultando
  `consumer_subscriptions` — tabela da 0002 em que **nada nunca escreveu**. A
  assinatura mora em `user_profiles.plus_status` e `plus_until` desde a 0036.
  O cadeado não estava frouxo: estava trancado para todo mundo, e o sintoma
  teria aparecido só no dia do primeiro e-book, como "o app não mostra o que eu
  paguei" — com o pagamento em dia e a RLS fazendo o que estava escrito.

  O segundo furo abria para o outro lado: `recipes`, `programs` e
  `program_steps` nasceram na 0003 com coluna `visibility` — `programs` com
  padrão `SYNSE_PLUS` — e receberam na 0004 políticas `for select using (true)`.
  A coluna estava lá e a RLS a ignorava. Como as três estão vazias e nada no
  app as lê, apertar agora não muda comportamento nenhum; apertar depois seria
  mexer numa trava sob uso.

  `tem_synse_plus()` é a fonte única, e repete a regra de `resumoDaAssinatura`:
  **a data manda, não o rótulo** — `plus_status` envelhece, e um ciclo vencido
  continua `ACTIVE` até a rotina de expiração rodar. `CANCELED` conta como
  vigente enquanto o período pago não acabou, porque cancelar interrompe a
  renovação seguinte e não o que já foi pago, que é o que os Termos prometem.

  Concedida ao anônimo de propósito: devolve `false` para ele, e revogar
  transformaria "nenhuma linha" em `permission denied for function` na leitura
  de conteúdo público — a mesma pegadinha que a sonda da 0037 encontrou com
  `is_friendship_party`.

  `tests/db/cadeado-do-plus.test.ts`: 13 testes, conferidos por mutação.
  Restaurar a tabela morta derruba 5; tirar a data derruba 1; tirar o
  `CANCELED` derruba 1; reabrir os passos do programa derruba 1.

  `consumer_subscriptions` fica no schema, sem uso e sem nada conferindo-a.

- **0039 (`0039_acervo_synse.sql`)** — o acervo Synse ganha porta de entrada.

  A 0038 consertou o cadeado e sobrou o outro lado: **não havia como criar**
  conteúdo de plataforma. A política de escrita da 0004 exige dono
  (`organization_id is not null and is_org_staff(...)`), e conteúdo de acervo é
  justamente o que não tem. O cadeado estava certo e a porta não existia.

  `save_synse_content` e `delete_synse_content`, as duas `security definer`,
  com três travas em série: a rota é de conta de plataforma, a função confere
  `is_super_admin()` **no banco** — sessão é cookie e cookie se edita — e o
  `update` e o `delete` só alcançam linha **sem dono**, para que esta porta
  nunca sirva de atalho para editar o conteúdo de uma academia.

  Uma política `or (organization_id is null and is_super_admin())` seria uma
  linha só e deixaria escrever `visibility` livre, inclusive `ORGANIZATION` em
  linha sem academia — estado que o `check` da 0031 recusa e que a tela
  ofereceria até o banco reclamar. A regra tem condição, e condição em política
  vira regra espalhada.

  A trilha em `platform_access_log` é escrita pela função, com contexto
  `ACERVO`. Registro que depende de a aplicação lembrar de chamar é registro
  que um dia falta — e "quem pôs esse e-book no ar, e quando" precisa ter
  resposta, do mesmo jeito que a troca de contexto da 0034.

  A política de leitura ganhou `or (organization_id is null and
  is_super_admin())`: sem isso quem escreve o acervo escreveria às cegas, já
  que rascunho sem dono não cai em nenhum dos outros ramos.

  `tests/db/acervo-synse.test.ts`: 15 testes, conferidos por mutação. Tirar a
  guarda de super admin derruba 2; deixar o `update` ou o `delete` alcançarem
  linha com dono derruba 1 cada; tirar a trilha de qualquer uma das duas
  funções derruba 1 cada.

- **0040 (`0040_push.sql`)** — a inscrição de push, para o aviso chegar com o
  app fechado.

  Até aqui o sino só funcionava para quem já tinha aberto o app — e é
  justamente quem já abriu que não precisa ser lembrado.

  Uma linha por **aparelho**, não por pessoa: a mesma conta usa celular e
  computador, cada um com seu `endpoint`. Guardar um só apagaria o outro a
  cada login, e a pessoa pararia de receber no celular por ter aberto o app no
  trabalho, sem nada na tela explicando.

  A tabela **não tem política de leitura nenhuma**. O que ela guarda é
  capacidade, não informação: quem tem o endpoint e as duas chaves escreve na
  tela de alguém. Nem a dona do aparelho lê a própria linha pela API — ela não
  precisa, porque o endpoint é do navegador dela. Quem envia é o servidor, com
  a chave de serviço, como em `payment_account_secrets`.

  `remove_push_subscription` só alcança a linha de quem pede. Sem essa
  cláusula, conhecer o endpoint alheio — que é o que um aparelho emprestado
  revela — bastaria para silenciar a conta de outra pessoa, que deixaria de
  receber aviso de cobrança sem nunca saber por quê.

  `tests/db/push.test.ts`: 11 testes, conferidos por mutação. Deixar o
  `remove` alcançar linha alheia derruba 1; dar política de leitura à tabela
  derruba 3; fazer `has_push_subscription` ignorar o dono derruba 1.

  **Precisa de chave VAPID para funcionar.** `npx web-push generate-vapid-keys`,
  e as três variáveis em `.env.example`. Sem elas o cartão de avisos não
  aparece — em vez de oferecer um botão que falha no clique.

- **0041 (`0041_vitrine_do_cadeado.sql`)** — a vitrine do cadeado.

  A 0038 trancou o conteúdo do Synse+ e a 0039 abriu a porta para publicá-lo.
  Sobrou o efeito colateral: quem não assina não fica sabendo que aquilo
  existe. A RLS não devolve a linha, e item invisível não vende — o aluno do
  plano grátis conclui que o Synse+ não tem acervo.

  `acervo_trancado(p_id)` devolve a prateleira trancada com uma projeção
  estreita: tipo, título, resumo, capa e data. **Nunca `body` nem
  `media_url`** — são o conteúdo pago e o link do arquivo, e expor qualquer um
  dos dois entregaria o produto na vitrine. É por isso que é função e não um
  ramo a mais em `content_read`: política governa a linha inteira.

  `organization_id is null` é a garantia multi-inquilino, não detalhe: o que
  uma academia escreve nunca vira anúncio para os alunos das concorrentes, por
  mais que alguém marque a visibilidade errada.

  `not tem_synse_plus()` dentro da função, e não na tela: quem assina já vê
  esses itens pela lista normal, e a conferência no banco é o que dispensa a
  tela de ser confiável.

  Concedida ao anônimo de propósito — vitrine serve para ser vista antes de
  entrar.

  `tests/db/vitrine-do-cadeado.test.ts`: 12 testes, conferidos por mutação.

- **0042 (`0042_vitrine_nao_anuncia_a_quem_ja_le.sql`)** — conserta a 0041.

  A 0041 escondia a vitrine de quem assina e esqueceu o outro jeito de poder
  ler: desde a 0039 a política dá o acervo inteiro — pago incluído — a
  `is_super_admin()`. O mesmo e-book saía duas vezes para a conta de
  plataforma sem assinatura: legível na lista, e trancado logo abaixo, com um
  convite para assinar o que ela acabou de ler.

  Apareceu tarde porque é o estado de **quem publica**, e quem publica é a
  primeira pessoa a conferir o resultado no app. Os testes da 0041 cobriam o
  assinante e o visitante; não cobriam o publicador.

  Só `create or replace`: a condição passa a dizer "não pode ler" inteiro —
  `not tem_synse_plus() and not is_super_admin()` — em vez de metade.

  Mais 2 testes no mesmo arquivo, com asserção de controle provando que a
  conta de fato lê o conteúdo pago. Tirar o `not is_super_admin()` derruba 1.

- **0043 (`0043_programas_guiados.sql`)** — os programas guiados, dos dois
  lados.

  `programs`, `program_steps` e `program_enrollments` existiam desde a 0003 e
  **nunca foram lidas por uma linha de aplicação**. A tabela de planos chegou
  a anunciá-los, e o comparativo teve de tirar a promessa porque não havia
  nada atrás dela.

  **O furo que ela fecha:** a 0004 deu ao aluno `for all` em
  `program_enrollments` com `user_profile_id = auth_profile_id()`, e nada ali
  conferia se ele pode **ler** o programa. Quem não assina conseguia se
  matricular num programa `SYNSE_PLUS`. Os passos seguiam trancados pela 0038,
  então não vazava conteúdo — vazava estado: a tela diria "você está no
  programa de 90 dias" para quem nunca pagou.

  A política virou só leitura e as quatro escritas passam por função:
  `iniciar_programa`, `concluir_dia`, `desfazer_dia`, `abandonar_programa`.
  Elas conferem visibilidade a cada chamada, não só na entrada — assinatura
  que vence no meio do programa para de render progresso.

  `current_day` é o **menor dia ainda não concluído**, e não "o último mais
  um": quem pula o dia 3 e faz o 4 continua devendo o 3, e a tela precisa
  apontar para lá.

  `save_program`, `save_program_step` e `delete_program` exigem
  `is_super_admin()` e registram em `platform_access_log` com contexto
  `'PROGRAMA'`. `programas_trancados()` é a vitrine, pelo mesmo motivo da
  0041 — sem ela a tela de programas abriria vazia no plano grátis.

  `tests/db/programas-guiados.test.ts`: 26 testes, conferidos por mutação.
  Tirar a conferência de visibilidade do início derruba 1; tirá-la do dia,
  1; devolver a escrita à política, 1; trocar o menor dia pelo último mais
  um, 1; tirar o `is_super_admin`, 1; tirar a faixa do dia, 2.

- **0044 (`0044_biblioteca_de_receitas.sql`)** — a biblioteca de receitas.

  `recipes` nasceu na 0003 junto com `content_library`, `programs` e
  `program_steps`. As outras três foram construídas — o acervo na 0039, a
  vitrine na 0041, os programas na 0043 — e esta ficou: tabela completa, com
  RLS desde a 0004 e visibilidade corrigida na 0038, e **zero leituras** no
  aplicativo. Era a última daquela leva.

  **O que isso custava:** a linha "Plano alimentar base" do comparativo dizia
  a mesma coisa nos dois lados, porque não havia o que o Synse+ acrescentasse
  ali. Honesta e vazia, numa tabela que descreve o que a pessoa compra.

  A migration não cria tabela: dá a porta de autoria e a vitrine, o mesmo par
  que a 0039 e a 0041 deram ao acervo. `save_recipe` e `delete_recipe` exigem
  `is_super_admin()` e registram em `platform_access_log` com contexto
  `'RECEITA'`; `receitas_trancadas()` é a vitrine; `recipes_read` ganha o
  `or is_super_admin()` sem o qual a conta de plataforma publicaria o que não
  consegue reler.

  **Onde fica a linha entre anúncio e conteúdo:** a vitrine devolve título,
  descrição, categoria, tempo, porções e **a foto** — nunca os ingredientes,
  nunca o preparo, nunca os macros. A foto sai, e é a única escolha que não se
  repete do acervo: lá a capa é ilustração, aqui o prato é o anúncio.

  `save_recipe` recusa visibilidade `ORGANIZATION`, como `save_program`:
  `recipes` não tem `organization_id`, e a linha marcada assim não casaria
  nenhum ramo da política — ficaria gravada e invisível, inclusive para quem a
  escreveu.

  `tests/db/receitas.test.ts`: 19 testes, conferidos por mutação. Pôr os
  ingredientes na vitrine derruba 1; tirar o `not tem_synse_plus()` dela, 1;
  tirar o `is_super_admin` da gravação, 1; tirar o `or is_super_admin()` da
  política, 1; tirar a trava de `ORGANIZATION`, 1.

- **0045 (`0045_quem_o_aluno_pode_autorizar.sql`)** — o controle de
  privacidade do corpo ganha porta.

  A 0032 criou `body_measurement_shares` com o desenho certo: autorização
  nominal, por pessoa, revogável, nunca por academia inteira. As server
  actions que a operam existem desde então, e **nenhuma tela as chamava** —
  elas revalidavam `/app/corpo/compartilhamento`, uma rota que não estava no
  repositório. Bioimpedância diz gordura visceral e água corporal; o controle
  existir no banco e não ter porta é a pessoa sem como exercer um direito que
  o sistema diz respeitar.

  **O que faltava tecnicamente:** para oferecer "autorize alguém", a tela
  precisa listar quem. `staff_read` (0004) exige `is_org_staff`, e o aluno não
  lê `staff` — está certo que não leia. Abrir a política para `is_org_member`
  resolveria a tela e daria a todo aluno o CREF, as especialidades e a
  situação de contrato de toda a equipe.

  `equipe_para_autorizar()` devolve perfil, nome, papel e academia — e nada
  além. Só equipe ativa das academias em que a conta é aluno ativo, menos quem
  já está autorizado (a unicidade da 0032 faria o botão sempre falhar).

  `autorizar_corpo(uuid)` fecha o outro lado: `body_shares_owner` impede
  autorizar **em nome de outro**, mas não confere **para quem** — um insert
  direto autorizava qualquer perfil do banco. A função exige que a pessoa seja
  da equipe de uma academia desta conta, e o `on conflict` reabre quem foi
  revogado, porque trocar de professor e voltar é o caso comum.

  `tests/db/compartilhamento-do-corpo.test.ts`: 14 testes, conferidos por
  mutação. Pôr o CREF na projeção derruba 1; tirar o filtro pela academia do
  aluno, 4; tirar a conferência de equipe do `autorizar_corpo`, 1; trocar o
  `on conflict do update` por `do nothing`, 1.

  **Fora do banco, no mesmo assunto:** `updateActivityPrivacyAction` e
  `deleteActivityAction` devolviam `void` e engoliam a exceção. Para
  privacidade isso é pior que não ter o controle — a tela diria "escondida" e
  a corrida seguiria pública, com o traçado que mostra onde a pessoa mora.
  Passaram a devolver resultado.

- **0046 (`0046_fechando_a_auditoria.sql`)** — nove furos de uma auditoria,
  cada um reproduzido como ataque antes de ser fechado.

  **Rode esta antes de qualquer outra coisa.** Enquanto ela não estiver
  aplicada, a dona de qualquer academia cliente vira conta de plataforma com
  um `update` de uma linha, pelo PostgREST, com a chave que já está no
  navegador dela.

  | | O que estava aberto |
  | --- | --- |
  | **A0** | `organization_members_write` restringia a academia, não o papel, e `is_super_admin()` aceitava a linha em qualquer organização. Auto-promoção a plataforma. |
  | **F1** | `student_active_memberships` (0001) sem `security_invoker`: o anônimo lia `student_id`, plano, **preço** e dia de cobrança de toda academia. |
  | **F2** | A 0008 trocou a lista de papéis por `staff_organization_ids()`, que inclui a recepção — dado de saúde ficou legível, editável e apagável por ela. |
  | **F3** | A 0008 tirou `is_org_member(organization_id)` do check-in: o aluno registrava presença em academia alheia. |
  | **F4** | `meals_scoped` era `for all` com `using` de existência: o paciente apagava a própria prescrição. |
  | **F5** | `activities_self` não validava `organization_id`: a corrida entrava no feed de academia alheia. |
  | **F6** | `claim_personal_records` agia sobre id de atividade sem conferir dono. |
  | **F7** | A 0045 comprou a garantia "só autoriza quem a tela oferece" e não revogou a escrita da tabela, que a contornava inteira. |
  | **A1** | `convert_lead_to_student` procurava perfil **por e-mail em todo o banco** e matriculava como ACTIVE: sequestro de conta alheia, com PII, cobrança e o app da vítima abrindo na academia do atacante. |
  | **A2/A3** | Plano alimentar e treino gravados para `student_id` de outra academia; publicar o plano forjado **arquivava a prescrição real** da vítima. |

  Três deles nasceram de reescritas que se declararam neutras — a 0008 diz "a
  regra de negócio é idêntica" e mudou três coisas. É por isso que
  `tests/db/auditoria-de-seguranca.test.ts` são **ataques**, não asserções
  sobre o texto das políticas: asserção sobre texto envelhece junto com a
  reescrita que ela deveria pegar.

  `tests/db/auditoria-de-seguranca.test.ts`: 28 testes. Os 17 que
  reproduziam ataque falhavam antes desta migration e passam depois; os
  outros 11 são controles, que provam que o produto continua funcionando —
  o lead de balcão ainda converte, a dona ainda administra a equipe, o
  paciente ainda lê o plano, quem treina sozinho ainda grava corrida.

  Fora do banco, no mesmo commit: `saveNutritionPlanAction` e
  `assignWorkoutAction` passaram a conferir que o aluno é da academia (o
  banco já recusa; a conferência é pela mensagem), e a ficha do aluno parou
  de mostrar peso a quem não tem `assessments:read` e mensalidade a quem não
  tem `finance:read` — condicionando a **busca**, não só a renderização.

- **0047 (`0047_treino_fantasma.sql`)** — o treino que ninguém fechou.

  `start_workout_session` (0026) devolve a sessão já aberta em vez de criar
  outra, e isso está certo para quem voltou ao app dez minutos depois. O que
  ela não olhava era **quando** aquela sessão abriu.

  Sessão fica pendurada com facilidade: o app morre no meio da série, a
  bateria acaba, a fila offline esgota as tentativas do FINISH. Na próxima vez
  que o aluno treina, as séries novas entram naquela sessão — `started_at` de
  três dias atrás, duração de 72 horas, volume dos dois treinos somado, e o
  dia de hoje sem nada no histórico. Sem erro em lugar nenhum.

  A função passa a abandonar o que passou de oito horas antes de procurar a
  sessão aberta, e a migration traz a limpeza única das que já estão
  penduradas. O `completed_at` recebe `started_at + 8h`, e não `now()`:
  carimbar agora inventaria no relatório o treino de três dias que a migration
  existe para impedir.

  **Não tem sonda em `/api/health?deep=1`,** e é o único caso assim até agora:
  ela só faz `create or replace` numa função que já existe, então não há
  objeto novo cuja ausência denuncie que ela não subiu. Quem confere é
  `pendingMigrations`, pelo registro em `schema_migrations`.

  `tests/db/treino-ativo.test.ts`: a reprodução (sessão de três dias atrás
  engolindo o treino de hoje) falhava antes e passa depois, o controle
  (sessão de dez minutos continua sendo reaproveitada) continua passando, e um
  terceiro roda o arquivo inteiro sobre uma sessão pendurada para provar a
  limpeza.

- **0048 (`0048_fila_de_avaliacao.sql`)** — a fila de avaliação ordenada no
  banco.

  `/avaliações` promete "uma linha por aluno ativo, da avaliação mais antiga
  para a mais recente" — a fila de trabalho do professor. Ela era montada de
  duas leituras que cortam em silêncio: `listStudents` para em 100
  (`Math.min(100, …)` nos dois data sources) e `listLatestAssessments` lê 500
  avaliações e deduplica na aplicação.

  Numa academia com 478 ativos, a tela ordenava os 100 primeiros em ordem
  alfabética e chamava aquilo de fila. Quem ficasse de fora não aparecia **nem
  nunca tendo sido avaliado** — exatamente quem a fila existe para achar. E o
  corte das 500 avaliações é pior que o dos 100 alunos: ele deixa de fora as
  mais antigas, que são as vencidas.

  Paginar a lista alfabética não resolveria: a ordem por tempo sem avaliar só
  existe sobre o conjunto inteiro. Ordenar depois de cortar é ordenar outra
  coisa.

  Entram duas funções, as duas `security invoker` para a RLS filtrar sozinha
  (`students_staff` da 0001 e `assessments_professional` da 0046, que exclui a
  recepção do dado de saúde): `fila_de_avaliacao(org, limite, deslocamento)`,
  com `total_geral` junto, e `resumo_das_avaliacoes(org, dias)` para os três
  cartões, que contavam a página em vez da academia — diziam "100 alunos
  ativos" numa academia de 478.

  Sonda: `filaDeAvaliacao` em `/api/health?deep=1`. Revogada do anônimo, então
  401/403 é "existe" e 404 é "não existe", sem `executa`.

  `tests/db/fila-de-avaliacao.test.ts`: 9 testes. O que mais importa prova que
  a ordem é **sobre todos** e não sobre a página — é ele que impede o conserto
  de virar "paginar o alfabeto", que é o defeito com outro nome.

- **0049 (`0049_alunos_sem_corte.sql`)** — a lista de alunos sem corte: a
  decoração da página e a aba "Sumidos".

  `/alunos` mostra duas colunas que não vêm de `students`: "Próxima
  mensalidade" e "Última presença". Elas eram montadas por `decorateStudents`,
  que lia `charges` e `check_ins` **sem teto** para os alunos da página e
  guardava a primeira linha de cada um na aplicação. Cem alunos com um ano de
  frequência são quinze mil linhas pela rede para preencher cem células — mas
  o desperdício não é o defeito.

  O PostgREST corta a resposta no teto configurado no servidor **sem dar
  erro**. Como os check-ins vinham do mais recente para o mais antigo, o corte
  descartava justamente a presença mais velha: quem não aparece há meses
  chegava à tela com "Última presença: —", como se nunca tivesse entrado na
  academia.

  E esse valor cortado **alimenta um filtro**. A aba "Sumidos"
  (`?status=DORMANT`) era `!lastCheckInAt || dias >= 21` aplicada sobre a
  página já lida. É a lista para telefonar para quem parou de vir: errar nela
  é ligar para quem treinou ontem e não ligar para quem está saindo.

  Dois defeitos vizinhos vieram no mesmo conserto, os dois por filtrar depois
  de paginar:

  - o rodapé lia o `count` da consulta **sem** o filtro, então a tela dizia
    "478 alunos" e mostrava três;
  - o recorte por plano era `rows.filter(r => r.planName != null)` — "tem
    algum plano", não "tem *este* plano" —, então escolher "Mensal" no seletor
    trazia quem estava no trimestral. Agora o recorte vai ao servidor, com
    `memberships!inner` e `.eq('memberships.plan_id', …)`. Sem o `!inner` o
    PostgREST aceita o filtro e não recorta nada, porque a junção é à esquerda.

  Nos três casos a demonstração já fazia certo — filtra e só então conta —, o
  que torna isto uma divergência entre os dois caminhos, não uma escolha de
  produto.

  Entram duas funções, as duas `security invoker` para a RLS filtrar sozinha
  (`students_staff`/`check_ins_staff` da 0001/0003 e `charges_staff` da 0002):

  - `decoracao_dos_alunos(org, ids[])` — uma linha por aluno pedido, com a
    próxima cobrança em aberto e a última presença. Não há o que cortar: o
    número de linhas é o número de alunos da página.
  - `alunos_dormentes(org, dias, busca, professor, plano, limite, deslocamento)`
    — a aba decidida no banco, com `total_geral` junto. Devolve só ids, para o
    `select` grande do aluno e o `mapStudent` continuarem num lugar só.

  A aba continua **sem filtro de situação**, como sempre foi nos dois
  caminhos: ela também lista quem já cancelou. Mudar isso é decisão de produto,
  e não entrou escondida numa correção de corte.

  Enquanto a migration não estiver colada, `decorateStudents` volta ao caminho
  antigo e a aba volta a filtrar na aplicação (`isPendingMigration`): errado
  como sempre foi, mas de pé — publicar não é migrar, e devolver coluna vazia
  nessa janela mentiria mais do que a leitura que pode cortar. Erro que **não**
  é migration continua subindo: engolir "permission denied" transformaria uma
  política mal configurada no mesmo defeito por outra porta.

  Sonda: `listaDeAlunosSemCorte` em `/api/health?deep=1`, sobre
  `decoracao_dos_alunos` — revogada do anônimo, então 401/403 é "existe" e 404
  é "não existe", sem `executa`. Como a migration só cria funções, e função
  some mais fácil que tabela (um `drop function` solto, um backup anterior a
  ela), a sonda também reinsere a 0049 em `pendingMigrations` quando o registro
  diz que ela subiu e a função não está lá.

  `tests/db/lista-de-alunos.test.ts`: 15 testes contra Postgres, o principal
  provando que a decoração devolve **uma linha por aluno** e não uma por
  presença — um aluno com sessenta check-ins não faz a resposta crescer.
  `tests/unit/students/lista-sem-corte.test.ts`: 12 testes do lado da
  aplicação, com um cliente de mentira que anota qual consulta saiu; eles
  provam a ligação (a junção obrigatória, o total vindo da função, a ordem da
  fila reimposta, a volta ao caminho antigo sem a migration), e a semântica do
  SQL fica com os testes de banco.

- **0050 (`0050_numero_derivado_no_banco.sql`)** — contagem e soma feitas pelo
  banco, não sobre uma resposta que pode vir cortada.

  Três números da tela eram calculados somando linhas na aplicação, sem teto
  em nenhuma das leituras: `countStudentsByPlan` (alunos por plano),
  `countAssignments` (fichas atribuídas) e `summarizeActivities` (distância,
  tempo e calorias de corrida). Somar sobre uma resposta cortada não devolve um
  número aproximado: devolve um número errado com cara de certo — "34 alunos"
  num plano de 120, ou 180 km em quem correu 400. É a mesma família da 0049, e
  a regra do projeto já dizia o que fazer com número derivado: quem calcula é
  o banco. Faltava valer também para contagem.

  `countUnreadNotifications` já fazia certo, com
  `select('id', { count: 'exact', head: true })` — nenhuma linha viaja. Para
  contagem simples é o que basta; estas três são agrupadas ou somadas em várias
  colunas, e o PostgREST não agrupa. Daí as funções: `alunos_por_plano(org)`,
  `treinos_por_plano(org)` e `resumo_de_corridas(perfil, desde)`, as três
  `security invoker`.

  No mesmo conserto, **a rota de uma corrida passou a ser lida por páginas**.
  `saveActivity` já gravava os pontos em lotes de 500 e o comentário dele dizia
  por quê — "uma corrida de uma hora tem milhares de pontos" —, mas a leitura
  pedia tudo numa requisição só: o mapa desenhava a linha até onde o corte
  alcançasse e parava no meio, parecendo uma corrida mais curta. Aqui um teto
  não serve, porque a rota inteira *é* o conteúdo da tela. O laço avança pelo
  que **veio** e não pelo que foi pedido, e para quando uma página volta vazia:
  é isso que o torna indiferente ao valor do teto do servidor, que não foi
  conferido.

  Sem a migration, as três voltam a contar na aplicação (`isPendingMigration`).
  Erro que não é migration continua subindo: engolir "permission denied" aqui
  devolveria zero em todos os planos — número com cara de certo, o defeito
  reaparecendo por outra porta.

  Sonda: `numeroDerivadoNoBanco` em `/api/health?deep=1`, sobre
  `alunos_por_plano`, e a 0050 volta a `pendingMigrations` se o registro disser
  que subiu e a função não estiver lá.

  `tests/db/numero-derivado.test.ts`: 10 testes contra Postgres (7 mutações na
  migration). `tests/unit/synse-run/rota-paginada.test.ts`: 12 de unidade, o
  principal provando que o laço avança pelo que veio — avançar pelo que pediu
  faria a linha do mapa dar um salto por onde a pessoa não passou.

  Entrou junto o guarda `tests/unit/leitura-sem-teto.test.ts`, que varre o data
  source e exige **decisão registrada** para cada leitura de lista sem teto:
  `LIMITADA_PELO_DOMINIO` (26 entradas, "não precisa"), `PAGINACAO_PENDENTE`
  (15, "precisa e não foi feito") e `CAMINHO_ANTIGO` (4, os retornos ao
  caminho de antes das migrations). Leitura nova sem entrada falha, e entrada
  que não corresponde mais a nada também — lista de dívida que não encolhe
  sozinha vira decoração. As 15 pendentes estão nomeadas no próprio arquivo,
  com o motivo de cada uma; as de maior risco são o CRM (`listLeads`), o
  histórico de treino e o de cobranças de um aluno, e os três acervos.

- **0051 (`0051_inadimplencia_sem_corte.sql`)** — o resumo de inadimplência
  contado no banco, e a lista de vencidas por página. Fecha a quarta entrada da
  lista de dívida do guarda `tests/unit/leitura-sem-teto.test.ts` (12 → 11).

  `/finance/inadimplentes` lia **todas** as cobranças vencidas da academia, sem
  teto, e calculava cinco números em cima da lista: alunos em atraso
  (distintos), valor em aberto, atraso médio, acima de 30 dias e a contagem de
  cada faixa do filtro. Cobrança vencida acumula mês a mês e ninguém apaga —
  era a leitura mais perto de encostar no corte silencioso do PostgREST, e a
  que erra na direção mais cara: os cinco números vêm **menores**. A academia
  vê "R$ 8.400 em aberto" quando tem R$ 23.000 a receber, e nada na tela diz
  que falta linha.

  `resumo_de_inadimplencia(org, hoje, cortes)` devolve uma linha por faixa
  presente mais uma de total (`faixa = 0`), com `grouping sets`. Total não é a
  soma das faixas: um aluno com dois meses atrasados conta duas vezes em
  "cobranças" e uma só em "alunos", e é essa diferença que os dois cartões da
  tela existem para mostrar. A função devolve `dias_total`, não a média — quem
  divide é a tela, com o mesmo arredondamento de antes.

  **Os cortes vêm por argumento, e nenhuma faixa aparece em SQL.** As faixas
  são régua de produto e já moram em `src/features/payments/faixas-de-atraso.ts`
  — a tela rotula por elas, e o data source as traduz em janela de vencimento
  para o Postgres filtrar a lista. Repeti-las no SQL criaria uma segunda
  definição da mesma régua, que envelheceria em silêncio: a tela diria "7 dias"
  numa linha que a contagem pôs na faixa de 1 a 5. Pelo mesmo motivo `p_hoje`
  vem de fora: o selo de cada linha é desenhado com o relógio da aplicação, e
  `current_date` poderia discordar dele na virada.

  A lista passou a ser paginada com `count: 'exact'`, e o filtro de faixa vai
  para a consulta — filtrar a página já lida devolveria três linhas dizendo
  "de 60". O tamanho da página é preso entre 5 e 200: `?pageSize=100000` traria
  a leitura sem corte de volta pela porta dos fundos.

  Sem a migration, o resumo volta a somar na aplicação
  (`inadimplenciaPelaAplicacao`, registrada em `CAMINHO_ANTIGO`). Erro que não é
  migration continua subindo.

  Sonda: `inadimplenciaSemCorte` em `/api/health?deep=1`, sobre
  `resumo_de_inadimplencia` — revogada do anônimo, então 401/403 é "existe" e
  404 é "não existe". Como a migration só cria função, a sonda também reinsere
  a 0051 em `pendingMigrations` quando o registro diz que ela subiu e a função
  não está lá.

  `tests/db/inadimplencia.test.ts`: 8 testes contra Postgres (5 mutações na
  migration, uma delas cega na primeira volta — o piso em zero do atraso não
  muda a faixa, só a soma dos dias, e foi lá que a asserção teve de ir).
  `tests/unit/inadimplencia-sem-corte.test.ts`: 11 de unidade com o cliente de
  mentira (5 mutações), provando que o filtro de faixa sai para o servidor na
  direção certa, que o total vem da contagem e não do tamanho da página, e que
  os cortes e o dia que vão para a função são os mesmos que a tela usa.

  Com esta, restavam **11** entradas em `PAGINACAO_PENDENTE`; a 0052 levou duas
  e o número está em **9**. As de maior peso hoje são o histórico de avaliações
  de um aluno e os três acervos que crescem com o catálogo (`listExercises`,
  `listContent`/`listSynseContent`, `listRecipes`). As nove estão nomeadas no
  próprio arquivo do guarda, com o motivo de cada uma.

- **0052 (`0052_serie_de_peso.sql`)** — o gráfico de peso agrupado pelo banco,
  e o histórico de pesagens por página. Fecha a quinta e a sexta entradas da
  lista de dívida do guarda `tests/unit/leitura-sem-teto.test.ts` (11 → 9).

  `listBodyMeasurements` e `listSharedBodyMeasurements` liam a janela inteira
  sem teto. Aqui o corte do PostgREST dói diferente do resto do projeto: a
  ordem é **decrescente**, então o que ele descarta é o **mais antigo**. O peso
  de hoje e a variação desde a anterior continuavam certos — a parte que a
  pessoa confere — enquanto o gráfico nascia no meio do caminho, "Últimas N
  medições" dizia um N menor que o real, e o histórico ficava incompleto em
  silêncio. Era o defeito invisível justamente onde se olha.

  **Paginar resolve a lista e não resolve o gráfico.** Gráfico não tem página:
  mostra a janela inteira. E mandar duas mil linhas para desenhar trezentos
  pixels é o que fazia o teto ficar perto — quem pesa três vezes ao dia gera
  três pontos onde cabe um, e a diferença entre eles é hidratação, não
  progresso. Então a série virou valor derivado como qualquer outro:
  `serie_de_peso(perfil, desde, balde)` devolve **um ponto por balde**, e o
  número de pontos passa a depender do tamanho da janela em vez da frequência
  de quem pesa — no máximo ~92 num trimestre e ~53 por ano daí para cima.

  **"Tudo" ficou em semana, e não em mês.** Mês dá o melhor teto para quem tem
  anos de casa e um gráfico ruim para quem não tem: alguém com quinze pesagens
  em quatro meses via **quatro pontos**, pior que o gráfico de antes. Seria
  trocar um defeito que aparece em muito dado por outro que aparece em pouco,
  que é o caso de quase todo mundo agora. Semana dá dezessete pontos para
  esses quatro meses e 520 para dez anos — muito ponto para a largura de um
  gráfico, mas um teto que **não cresce com a frequência de quem pesa**, que
  era o problema. Quem pesa três vezes ao dia por dez anos tem onze mil
  pesagens e continua com 520 pontos.

  **A última pesagem do balde, nunca a média.** `distinct on` com ordem
  decrescente dentro do balde. Média seria um número que ninguém viu na
  balança, num gráfico cujo ponto inteiro é mostrar o que a balança disse.
  `medicoes` acompanha cada ponto, e é o que deixa a tela dizer "21 medições,
  resumidas em 7 pontos" em vez de fingir que houve sete.

  **O balde vem por argumento**, de `src/features/synse-body/baldes-da-serie.ts`
  — mesma razão dos cortes da 0051: régua repetida em SQL envelhece calada.

  `security invoker`: `body_measurements_self` (0032) já diz quem lê o quê numa
  regra só — `user_profile_id = auth_profile_id() or body_shared_with_me(…)` —
  e cobre os dois casos, a própria pessoa e o professor autorizado. Perfil nulo
  é "o meu", resolvido por `auth_profile_id()` como `record_body_measurement`
  faz. Nenhum índice novo: `body_measurements (user_profile_id, measured_at desc)`
  (0032) serve à função e à lista paginada.

  **As duas telas ficaram diferentes de propósito.** `/app/corpo` ganhou a
  primeira paginação do app do aluno. A ficha em `/students/[id]` **não**: ela
  não tem nenhum `searchParams` e as abas são de cliente, então um `?page=`
  atravessaria todas elas. Lá a tabela mostra as 30 mais recentes e **diz o
  total** — "As 30 mais recentes de 412 no último ano" —, que é o que impede o
  professor de concluir que o histórico acaba onde a tabela acaba.

  Sem a migration, a série volta a ser agrupada na aplicação, sobre uma leitura
  com teto **escrito** (1000) em vez de herdado do servidor: o corte deixa de
  ser silencioso e vira um número que o código conhece. Erro que não é
  migration continua subindo.

  Sonda: `serieDePeso` em `/api/health?deep=1`, que também reinsere a 0052 em
  `pendingMigrations` se o registro disser que ela subiu e a função não estiver
  lá.

  `tests/db/serie-de-peso.test.ts`: 11 testes contra Postgres, 7 mutações na
  migration. Uma delas "passou" com o banco fora do ar — 11 pulados em verde,
  que é exatamente a armadilha que o `CLAUDE.md` descreve; refeita com SQL
  válido, pegou. `tests/unit/serie-de-peso-sem-corte.test.ts`: 11 de unidade
  com o cliente de mentira, 7 mutações, provando que o total vem da contagem,
  que desenhar o gráfico não lê linha nenhuma da tabela, e que o balde que vai
  para a função é o mesmo que a tela usa.

### O CRM paginado, sem migration

Não é migration — entra aqui porque fecha a primeira entrada da lista de
dívida que o guarda `tests/unit/leitura-sem-teto.test.ts` nomeou.

`/crm` lia **todos** os leads da academia e montava com eles três coisas: os
quatro cartões, o funil e a lista "Já decididos". Lead entra no CRM e não sai,
e a leitura não tinha teto. O corte do PostgREST caía no pior lugar possível:
a ordem põe o retorno mais atrasado primeiro, então o que sobrava na resposta
eram justamente os contatos vencidos, e sumia quem ainda estava morno —
"Retorno atrasado" acertava por acidente e os outros três erravam.

O conserto não precisou de função no banco, e por isso não há SQL para colar:

- `listLeads(org, { decided, page, pageSize })` devolve `Paginated<Lead>`, com
  `count: 'exact'` trazendo o total **do filtro**. Os dois conjuntos paginam
  separados porque crescem diferente: o funil é trabalho em aberto, "Já
  decididos" é histórico que nunca encolhe.
- `getCrmSummary(org)` conta os quatro números com
  `select('id', { count: 'exact', head: true })` — quatro consultas em paralelo
  que não trazem linha nenhuma. É o mesmo jeito que `countUnreadNotifications`
  já usava, e que a 0050 citou como o certo para contagem simples.
- O funil não pagina (arrastar entre colunas sobre uma página é pior que uma
  tela cheia), mas também não mente: acima de 150 em negociação a tela diz
  quantos ficaram de fora.
- "Retorno atrasado" passou a excluir quem já decidiu. Retorno vencido de um
  lead perdido não é trabalho pendente, é resíduo — e enchia o cartão de alarme
  que nunca zera, porque ninguém volta para desmarcar o retorno de quem
  desistiu.

Junto veio um defeito da barra de paginação, que vale para `/alunos`,
`/avaliações` e o CRM: ela se escondia sempre que havia **uma página só**. Quem
chegasse em `?page=2` de uma lista que encolheu — link antigo, item que mudou de
lista, `?page=` editado na mão — via a seção vazia e **sem botão de voltar**. E
se a barra aparecesse com a conta antiga, diria "25–9 de 9", porque fora da
faixa o `de` passa o `até`.

Agora `estadoDaPaginacao` (em `pagination-state.ts`, fora do módulo `'use
client'`) devolve três casos — oculta, fora da faixa, visível — e a barra
oferece "Voltar ao início". Duas telas diziam a frase errada no caminho:
`/avaliações` anunciava "Nenhum aluno ativo para avaliar" em `?page=99` de uma
academia com 478 ativos (a condição olhava as linhas da página, não o total da
fila), e `/alunos` convidava a "cadastrar o primeiro" numa academia com 534.

Verificação: 13 testes do CRM (6 da demonstração como especificação, 7 do
caminho do Supabase com o cliente de mentira; 5 mutações nos dois data sources,
todas pegas) e 6 da aritmética da paginação (3 mutações, todas pegas). As três
telas conferidas no Chromium em `page=1` e fora da faixa.

### As cobranças de um aluno: três perguntas, três consultas

Também sem migration. Fecha a segunda entrada da lista de dívida do guarda
`tests/unit/leitura-sem-teto.test.ts`, e no caminho um defeito que não era de
corte.

`getChargesForStudent` lia o histórico inteiro de cobranças, sem teto, ordenado
do vencimento mais novo para o mais antigo — e respondia por três perguntas:

| pergunta | como era respondida |
| --- | --- |
| qual cobrança o aluno paga agora | a mais antiga em aberto, achada na lista |
| esta cobrança de id X é dele? | `charges.find(...)` na action do PIX |
| o que já foi pago | as últimas doze, por `slice` |

O corte do PostgREST descarta o **fim** da ordem, ou seja o vencimento mais
antigo — e as duas primeiras perguntas são justamente sobre o mais antigo. O
aluno quitando uma dívida velha recebia **"cobrança não encontrada"** para algo
que a tela estava mostrando a ele, e a tela oferecia pagar a cobrança errada.
Só a terceira sobrevivia, por sorte da ordem.

E havia um defeito independente do corte: a mesma pergunta era respondida de
dois jeitos. A ficha no painel fazia `find` sobre a ordem decrescente e pegava
a cobrança **mais nova** em aberto; o app do aluno ordenava de novo e pegava a
**mais antiga**. Aluno com dois meses atrasados ouvia um valor na recepção e
via outro no celular. A mais antiga é a certa: é a que está vencendo há mais
tempo, e quitar na ordem é o que zera a dívida.

Cada pergunta ganhou a sua consulta:

- `getNextOpenCharge(org, aluno)` — uma linha, `in('status', ['PENDING',
  'OVERDUE'])` com `order('due_date', asc).limit(1).maybeSingle()`. Cancelada
  não entra: oferecer para pagar cobraria de novo algo que a academia desfez.
- `getStudentCharge(org, aluno, id)` — uma linha, com `organization_id` **e**
  `student_id` na cláusula. A conferência de dono passou a ser da consulta em
  vez de uma varredura sobre o que chegou; é ela que decide se alguém pode
  gerar um PIX no valor de uma cobrança.
- `getChargesForStudent(org, aluno, { status, page, pageSize })` — só
  histórico, paginado, com o total do filtro. A aba Financeiro da ficha
  continua mostrando as 24 mais recentes, mas agora **diz** que são 24 de N.

O app do aluno e o `app-service` deixaram de ler o histórico: pedem a cobrança
em aberto direto. A ficha no painel idem.

Verificação: 14 testes (6 mutações nos dois data sources, todas pegas). O teste
da "mais antiga em aberto" varre os 100 alunos da semente em vez de olhar um,
porque a maioria tem **uma** cobrança em aberto — e com uma só, "a mais antiga"
e "a mais nova" são a mesma linha, então o teste passaria com a regra errada. A
asserção final conta quantos alunos puderam distinguir as duas regras (hoje 3)
e falha se um dia der zero, para o teste não ficar verde sem olhar nada.

Conferido no Chromium: a ficha de Ana Cardoso, a coluna "Próxima mensalidade"
da lista de alunos (que vem da 0049) e `/app/finance` mostram a mesma cobrança,
12/11/2026 por R$ 109,90.

### O histórico de treino: janela, contagem e as duas pontas

Sem migration. Fecha a terceira entrada da lista de dívida do guarda
`tests/unit/leitura-sem-teto.test.ts` (13 → 12).

`listWorkoutLogs` lia a tabela inteira de um aluno, sem teto, em ordem
**crescente** de data. O corte do PostgREST descarta o fim da resposta — e numa
ordem crescente o fim é o registro **mais recente**, o oposto do que se perde
nas outras leituras deste projeto. Três coisas se alimentavam dela:

| o que | usava | errava assim |
| --- | --- | --- |
| "Ganho de carga" na home do aluno | a primeira e a última carga | congelava num valor antigo |
| cartão "Treinos" | `logs.length` | dizia menos do que é |
| os dois gráficos de carga | um ponto por linha | paravam antes do presente |

As duas primeiras saíram para consultas próprias: `getLoadProgress` (duas
linhas, uma por consulta, com `order` oposta e `limit(1)`) e
`countWorkoutLogs` (`head: true`, nenhuma linha viaja). O gráfico ficou com a
janela de noventa dias — que é o que a própria tela anuncia ao lado, em
"Últimos 90 dias" — e teto de 500.

**Duas coisas que NÃO consertei, porque são decisão de produto:**

- [ ] Os dois gráficos e o cartão "Carga atual" dizem **"Supino reto"** na
      legenda, e plotam `load != null` de **qualquer** exercício. A legenda é
      fixa no código, em três lugares. Conserto possível:
      `getExerciseProgress(aluno, exercício, semanas)` já existe desde a 0027 e
      faz a série de um exercício só — mas escolher *qual* exercício a tela
      mostra é escolha de produto.
- [ ] "Ganho de carga" compara a primeira carga registrada em qualquer
      exercício com a última em qualquer exercício. Uma rosca de 20 kg seguida
      de um agachamento de 100 aparece como "+80 kg de ganho". Trocar por
      ganho no mesmo exercício muda o que o número significa.

Deixei as duas como estavam de propósito: corrigir o corte e trocar o
significado do número são coisas diferentes, e a segunda não é minha para
escolher. Cheguei a mudar — fiz o ganho sumir quando os exercícios diferem — e
desfiz antes de commitar, porque era mudar o produto por conta própria depois
de ter dito que não mudaria.

Verificação: 10 testes. Um deles documenta o que **não** prova: "a contagem
conta tudo, não a janela" não é verificável na demonstração, porque nenhum
aluno da semente tem registro além de noventa dias — a janela e o histórico
inteiro são o mesmo conjunto, e a mutação que troca a contagem pela janela
passa sem quebrar nada. Essa asserção vive no caminho do Supabase, onde dá
para exigir que a consulta de contagem **não** leve filtro de data. Quatro
mutações no data source, todas pegas depois de a primeira versão deixar duas
escapar.

A partir da 0018 a sonda para de adivinhar. Até aqui ela deduzia pelo formato
do schema — "existe a coluna `tier`? então a 0014 subiu" —, o que só funciona
enquanto toda migration cria algo visível pela API. A 0018 não cria: ela troca
o corpo de um gatilho. Com o registro, `/api/health?deep=1` lê a lista do banco.

**Toda migration nova precisa terminar inserindo a própria versão:**

```sql
insert into schema_migrations (version) values ('00NN_nome.sql')
on conflict (version) do nothing;
```

`tests/db/schema-migrations.test.ts` cobra isso: arquivo novo sem essa linha
falha o teste, em vez de deixar a sonda cega e o sintoma aparecer em produção.

Com o trabalho sem terminal, migração nova só entra quando alguém cola o
arquivo no SQL Editor do Supabase. Duas coisas que essa rotina ensinou, e que
valem para a próxima:

- **O SQL Editor executa SQL, não abre endereço.** Colar o link do arquivo
  devolve `syntax error at or near "https"`. O caminho é abrir o link no
  navegador, copiar o texto que aparece, e colar o texto.
- **Publicar não aplica migration.** Entre o deploy e a colagem existe uma
  janela em que o código novo fala com o banco velho, e ela derrubou o login
  uma vez. Desde então toda leitura tolera coluna ausente, e a sonda de schema
  em `/api/health?deep=1` diz o que falta.

Para liberar planos numa conta de teste, com a chave de serviço:

```sql
select set_user_tier('<id do user_profiles>', 'PRO');            -- Synse+
select set_professional_plan('<id do user_profiles>', true);     -- perfil profissional
```

Essas funções são a única porta: pela tela, nem o dono da conta muda o próprio
plano — senão bastaria um PATCH em `user_profiles` para virar assinante.

## Quando aparecer "não foi possível concluir esta operação"

A tela mostra uma referência de oito dígitos e nada mais — é o certo para quem
usa o produto. O outro lado dessa referência fica no log da Vercel, que não faz
parte deste fluxo de trabalho.

Logo depois de ver o erro, abra:

    https://synse.com.br/api/health/errors

Responde com os erros das **suas** requisições nesta instância: rota, mensagem
e as primeiras linhas de pilha. Erro de outra conta aparece só como contagem,
porque mensagem de erro carrega o que a requisição estava fazendo.

A lista vive na memória da instância: some no reinício e não atravessa as
instâncias serverless. Se vier vazia, provoque o erro de novo e recarregue em
seguida — assim as duas requisições caem na mesma instância.

## Ambiente separado — decidido: não

Avaliado e descartado. Um projeto Supabase só para desenvolvimento resolveria a
raiz do problema — `.env.local` passaria a guardar apenas credencial
descartável — mas custa manutenção dobrada de migrations, seed e configuração,
e o projeto tem um desenvolvedor.

A consequência de conviver com isso: **o `.env.local` contém credencial de
produção**. Ele não aparece em print, em chamada compartilhada nem em mensagem.
Para conferir o que está preenchido, use `npm run env:check`, que mostra estado
sem mostrar valor.

## Como se trabalha neste projeto

Decidido: **sem terminal**. O ciclo é publicar, deixar a Vercel implantar e
testar no navegador. Migração de banco vai pelo SQL Editor do Supabase.

O que fica indisponível nesse modo são os scripts locais — `db:seed`,
`db:set-password` e `env:check`. Nenhum deles é necessário no uso normal; se um
dia forem, é uma execução pontual, não uma rotina.

Uma armadilha que existiu aqui e vale guardar: com `PAYMENT_PROVIDER=asaas` e a
URL de sandbox, **produção emitia cobranças de mentira** sem o aviso amarelo de
"provedor simulado" na tela — do ponto de vista do código o provedor era real,
só a conta do outro lado era de teste. Hoje não há provedor real nenhum, e o
aviso voltou a aparecer. Quem ligar o próximo precisa lembrar que "o provedor
responde" e "o dinheiro é real" são duas perguntas diferentes.

## Rotina diária de cobrança

A partir da 0019 a mensalidade se gera sozinha. O agendamento está em
`vercel.json`, às 9h UTC — 6h de Brasília, antes de a academia abrir.

- [x] **`CRON_SECRET` na Vercel**, como *Sensitive*. Sem ele, o endereço
      `/api/cron/billing` recusa tudo e devolve 404: nenhuma cobrança é gerada,
      e nada na tela denuncia. Conferido em produção: `/api/health?deep=1`
      devolve `cobrancaAgendada: true`, que é `Boolean(process.env.CRON_SECRET)`
      — a variável existe. Se ela está *correta*, só a primeira execução diz, e
      isso é o item abaixo.
- [ ] Conferir a primeira execução no dia seguinte: `/api/health?deep=1` mostra
      as migrations aplicadas, e a lista de cobranças do painel mostra o
      resultado.

O que a rotina faz, nesta ordem: cria as mensalidades que vencem nos próximos
cinco dias, e depois marca como vencida toda cobrança PENDING com data passada,
avisando o aluno uma única vez. A ordem importa — cobrança criada hoje com
vencimento de ontem, o que acontece quando o job ficou um dia fora do ar, já sai
marcada em vez de esperar mais 24 horas.

Chamar duas vezes é seguro: a unicidade de `billing_reference` no banco é quem
garante uma mensalidade por ciclo.

**Decisão em aberto: cobrança proporcional.** Hoje, quem se matricula depois do
dia de vencimento só é cobrado no mês seguinte — treina de graça nesses dias. O
contrário (cobrar o mês inteiro de quem entrou no dia 28) é pior, então essa é a
escolha provisória. Proporcional é decisão de negócio.

## Convite de equipe

O convite sai por e-mail pelo SMTP do Supabase e **também aparece como link na
tela**, para mandar por WhatsApp. Isso não é plano B improvisado: caixa de spam
e endereço digitado errado são a regra, e o que não pode é o convite existir e
ninguém conseguir alcançá-lo.

- [ ] **Lista de endereços permitidos no Supabase** (Authentication → URL
      Configuration → Redirect URLs) precisa conter
      `https://synse.com.br/auth/callback*`, **com o curinga**. O e-mail aponta
      para essa rota com `?next=/convite/<token>`, e sem o curinga o Supabase
      recusa o retorno por causa da query — o clique no link não faz nada e o
      token nem é consumido. Já aconteceu neste projeto, com o link de
      confirmação de cadastro.

Enquanto isso não estiver configurado, o convite continua funcionando pelo link
copiado da tela.

## O limitador de tentativas

Era um `Map` em memória, e **cada instância serverless tinha o próprio
contador**: "5 tentativas de login por minuto" virava 5 × o número de
instâncias — e quem ataca é justamente quem gera carga. O tipo de proteção que
parece existir; um relatório que listasse "rate limiting: sim" estaria errado.

Resolvido: `src/lib/rate-limit/` escolhe entre Upstash (compartilhado) e
memória (reserva), com a mesma assinatura de antes. Dezoito chamadas em treze
arquivos passaram a `await`; nenhuma outra mudou.

**Uma operação só, via `EVAL`.** O `/pipeline` do Upstash não é atômico, e com
`INCR` e `PEXPIRE` separados existe o estado em que a chave é criada e fica
**sem prazo** — o contador nunca zera e a pessoa fica barrada para sempre.
Num caminho de login, isso é conta travada. O script também evita depender do
`NX` do `PEXPIRE`, que pede Redis 7.

**Redis fora do ar não derruba nada.** A contagem cai para a memória da
instância e o motivo vai para o log. A escolha tem custo e foi deliberada:
falhar fechado trocaria limite frouxo por indisponibilidade total — ninguém
faz login, ninguém paga. O desempate é o que o limitador é: proteção em
profundidade, não autorização. Quem barra escrita indevida é
`requirePermission` e a RLS, e nenhum dos dois depende do Redis.

**A memória se limpa sozinha** (03/10/2026). `limparExpirados` era chamado
pelos handlers, e contando estava em **3 dos 20** caminhos que limitam alguma
coisa: login, recuperação de senha, convite de equipe e a busca de aluno não
limpavam nada. Não é vazamento grave — cada bucket são dois números —, mas
depender de o chamador lembrar é a forma como ele esquece. A varredura passou
para dentro de `contarNaMemoria`, e só roda quando o mapa passa de 5.000
chaves, para não cobrar trabalho de todo login.

**A sonda deixou de medir a configuração e passou a medir o efeito**
(03/10/2026). `rateLimitCompartilhado` responde "as duas variáveis não estão
vazias" — e eu publicava isso como se fosse "o limite vale para todas as
instâncias". Token errado, **token somente-leitura** (o painel do Upstash
oferece os dois, e o de leitura vem primeiro) ou banco apagado passavam como
pronto, e todo pedido caía para a memória em silêncio: o defeito que o campo
existe para pegar, acontecendo dentro do campo.

Agora `rateLimit` em `/api/health?deep=1` escreve pelo **mesmo caminho do
limitador** — o `EVAL` do script, numa chave própria que vence em dez
segundos — e devolve `{ configurado, respondendo, latenciaMs }`. Um `PING`
não serviria: ele passa com token somente-leitura, e aprovaria justamente a
credencial que não funciona.

`tests/unit/rate-limit.test.ts`: 28 testes, conferidos por mutação — tirar o
`if atual == 1` do script derruba 1; fazer a falha de rede lançar, 1; aceitar
só a URL sem o token, 1; errar a comparação do limite, 1; empurrar a janela a
cada acesso, 1; trocar a sonda por um `PING`, 3; fazer a sonda responder
sempre "sim", 2; tirar a varredura automática, 1; e fazê-la limpar demais, 1.

`tests/unit/rate-limit-fio.test.ts`: 4 testes contra um servidor HTTP que fala
o protocolo do Upstash com contador real — a contagem compartilhada valendo de
ponta a ponta, e a sonda recusando o token errado **e o somente-leitura**. Um
teste assim existiu em 01/10 e eu decidi não guardá-lo por abrir porta; voltei
atrás, porque o token somente-leitura é o erro mais provável de quem for ligar
isso, e com `fetch` injetado eu só provava que a sonda lida com a resposta de
recusa, não que ela chega a recusar de verdade.

### Ligar — o que falta, e é só isto

- [ ] **Criar o banco no Upstash** em https://console.upstash.com → *Create
      Database*. Região **sa-east-1 (São Paulo)**, a mesma do Supabase e das
      funções da Vercel: o limitador entra no caminho de cada login e de cada
      pagamento, e um salto para a Virgínia custa ~150 ms neles.
- [ ] **Copiar a URL e o token de escrita** em *REST API*. O painel mostra
      dois tokens e o **somente-leitura vem primeiro** — ele não serve, o
      limitador conta. É este o erro que a sonda nova pega.
- [ ] **Pôr na Vercel** (Settings → Environment Variables), nos três
      ambientes, com o token marcado como **Sensitive**:
      `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. E em `.env.local`
      para o desenvolvimento, que não é versionado.
- [ ] **Publicar de novo** — variável de ambiente só entra numa build nova.
- [ ] **Conferir** em `/api/health?deep=1`:
      `rateLimit: { configurado: true, respondendo: true, latenciaMs: <baixo> }`.
      `latenciaMs` acima de ~50 ms quer dizer que o banco ficou em outra
      região.

      `respondendo: false` vem com `motivo` e `urlParece`, porque sem eles
      sobram quatro consertos diferentes para adivinhar:

      | motivo | o que é | conserto |
      | --- | --- | --- |
      | `http_401` / `http_403` | token errado, ou de outro banco | copiar de novo em *REST API* |
      | `redis: NOPERM …` | token **somente-leitura** — ele autentica e recusa só na escrita | pegar o segundo token, o de escrita |
      | `sem_resposta: TypeError: Failed to parse URL…` com `urlParece: 'com_aspas'` | o valor foi colado **com as aspas em volta** | apagar as aspas na Vercel |
      | `sem_resposta: TimeoutError…` com `urlParece: 'tcp'` | colaram a URL `rediss://` no lugar da REST | usar a `https://….upstash.io` |
      | `sem_resposta: …` com `urlParece: 'rest'` | banco apagado, pausado, ou rede | conferir se o banco ainda existe |

      Isto entrou depois de a sonda acusar `respondendo: false` em produção e
      não haver como saber qual dos quatro era sem abrir o painel. E a primeira
      resposta dela foi o caso das aspas — não o token somente-leitura, que era
      a aposta óbvia. A lição não é sobre o Upstash: **sintoma de rede não
      prova problema de rede**, e adivinhar a causa mais provável custou um
      palpite errado que o diagnóstico resolveu em um minuto.

      **Por que `.env.local` não pega isso.** O carregador do projeto trata
      aspas em volta como delimitador e as remove — que é a semântica certa de
      arquivo `.env`. O painel da Vercel não: lá o valor é literal, aspas
      incluídas. Então `npm run env:check` passa e a produção quebra, e o par
      "local funciona, no ar não" é exatamente o que torna este erro confuso.

      Cheguei a acrescentar a conferência de aspas no `env:check` e desfiz:
      ela nunca dispararia, porque o valor chega lá já sem as aspas. Quem pega
      é a sonda, contra o ambiente de verdade.

      O texto do erro sai com o endereço substituído por `<url>`. `/api/health`
      é público, e o `TypeError` do `fetch` traz a URL inteira na mensagem: o
      endereço não é segredo — sem o token ele não serve —, mas `urlParece`
      existe para falar da URL sem mostrá-la, e deixar o erro contrariar isso
      seria cuidado só na aparência.

Plano gratuito do Upstash: 10.000 comandos por dia. O limitador gasta um por
pedido limitado — login, check-in, PIX, busca de aluno. Uma academia média não
chega perto; se chegar, o aviso vem do painel deles antes de qualquer sintoma
aqui.

## Plataforma

- [ ] Plano da Vercel: o Hobby **proíbe uso comercial**. Precisa virar Pro
      (US$ 20/mês) antes do primeiro cliente pagante.
- [ ] Reativar "Confirm email" no Supabase, agora que o SMTP funciona.

## Synse Pay — engavetado, sem provedor

**Decidido em 24/09/2026: sair do Asaas, por causa da taxa.** O adapter, a rota
de webhook e os testes dele foram removidos. O marketplace fica engavetado até
haver substituto — não apagado: as telas, o split, a régua de cobrança e o
schema continuam de pé, e o que sumiu foi só o que dependia de conhecer o
gateway.

Hoje o único provedor é o simulado. Nenhum centavo se move, em nenhum ambiente,
e as telas dizem isso em vez de fingir que operam. O resto do SynseHub — alunos,
check-in, treinos, painel — nunca dependeu disso.

**O que sobreviveu à remoção, e por quê.** A carteira da plataforma e o
percentual vindo do banco são regra do marketplace, não do Asaas. Continuam em
`getSplitForOrganization`, com os testes: entregar ao próximo provedor um
caminho sem essa tranca seria perigoso, porque a falta dela não dá erro nenhum
na tela — a cobrança sai inteira para a academia e o painel segue exibindo os
2% como se tivessem sido retidos.

**O que o substituto precisa ter.** Além de PIX, boleto, cartão e assinatura
recorrente, a interface `PaymentProvider` pede `createPaymentAccount` (subconta
por academia) e `configureSplit`. Provedor sem marketplace atende a assinatura
do Synse+ e não atende o Synse Pay — e essa é a decisão que vem antes de
qualquer linha de código.

**Aprendizado do Asaas que vale para a escolha.** A abertura de subconta via API
respondia HTTP 403: a chave era válida, e o que faltava era o recurso pertencer
ao produto white label, liberado caso a caso. Perguntar isso **antes** de
escrever o adapter — "criar subconta via API está liberado para a minha conta,
ou depende de aprovação comercial?" — economiza a integração inteira.

**Alternativa que continua na mesa:** cada academia cria a própria conta no
provedor e cola a chave de API no SynseHub. O fluxo do dinheiro é idêntico e não
depende de liberação de marketplace; o custo é um passo manual na entrada de
cada academia.

### Quando houver provedor

- [ ] `SYNSE_PLATFORM_WALLET_ID` apontando para a carteira real da plataforma —
      é ela que recebe a comissão. Com o valor errado, o dinheiro vai inteiro
      para a academia e nada na tela indica isso.
- [ ] Adapter em `src/lib/payments/providers/` e a rota de webhook que vem com
      ele. O filtro por `provider` na leitura da chave da subconta sai do `id`
      do adapter, não escrito à mão — foi assim que o nome do gateway vazou
      para fora do adapter da última vez.
- [ ] Um pagamento de ponta a ponta: emitir PIX, pagar, e ver a mensalidade
      virar "paga" sozinha. O mecanismo de webhook está escrito e testado
      unitariamente, mas nenhum pagamento real passou por ele ainda.
- [ ] Abertura de subconta em produção costuma pedir mais campos que em sandbox
      (endereço, faturamento estimado, telefone). Validar antes de prometer a
      alguma academia.

## Jurídico e fiscal

- [ ] Conversar com contador sobre o modelo de split antes de faturar. A
      escolha foi marketplace — o dinheiro do aluno cai na conta da academia e
      só a comissão vem para o Synse —, justamente para o Synse não operar como
      repasse. Vale confirmar com quem responde por isso.
- [x] Termos de Uso e Política de Privacidade publicados em `/termos` e
      `/privacidade`, linkados no cadastro e no login, com versão e data.
- [ ] **Revisão dos dois documentos por advogado.** O texto que está no ar foi
      escrito a partir do que o sistema realmente faz — não é modelo genérico
      copiado — mas descrever a prática certa não é o mesmo que redigir contrato
      que se sustenta. Revisar antes do primeiro cliente pagante.
- [x] **Identificação do controlador — decidido em 01/10/2026: fica como está.**

      As páginas de Termos e Privacidade dizem "o Synse está em constituição",
      e isso é a verdade: a empresa não existe. Preencher
      `NEXT_PUBLIC_LEGAL_ENTITY` e `NEXT_PUBLIC_LEGAL_TAX_ID` com qualquer
      coisa seria publicar identificação falsa num documento que promete
      tratamento de dados pessoais — pior do que a ausência.

      **`identificacaoLegal: false` em `/api/health?deep=1` é o estado
      esperado, não defeito.** Esta linha existe porque o booleano vermelho
      convida a reabrir o assunto a cada leitura da sonda, e já o fez.

      Reabre quando houver CNPJ: as quatro variáveis na Vercel e um redeploy —
      elas são `NEXT_PUBLIC_`, então entram no pacote em tempo de build.
      `npm run env:check` confere as quatro, e acusa razão social sem CNPJ,
      que é o estado em que a página continua dizendo "em constituição" sem
      dizer por quê.

      Nada disso bloqueia cobrança: o Mercado Pago ativou credenciais de
      produção com este campo em `false`.
- [ ] Fazer o e-mail de privacidade existir de verdade. A política promete
      resposta em 15 dias; promessa de canal que ninguém lê é pior que canal
      nenhum.
- [x] Encerramento de conta pela própria tela, em Perfil → Privacidade e em
      Configurações → Privacidade. Apaga o que é só da pessoa, anonimiza o
      perfil e mantém consentimento e registro fiscal. Dono único de academia
      com alunos é impedido, com o motivo na tela.
