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
      passando por cima de toda a RLS. Rotacionar em Supabase → Settings → API
      Keys, atualizar `.env.local` e a Vercel (como **Sensitive**), e só então
      revogar a antiga — nessa ordem, senão o webhook de pagamento fica sem
      chave válida no intervalo.
- [ ] `ASAAS_API_KEY` — pode esperar enquanto for sandbox. Ao criar a chave de
      produção, tratar como a de cima.
- [ ] `ASAAS_WEBHOOK_TOKEN` — trocar junto, e refletir a troca no painel do
      Asaas.
- [ ] Tokens da Vercel em https://vercel.com/account/tokens — apagar os que não
      estiverem em uso.

Para conferir o estado sem abrir o arquivo e expor tudo de novo:

```bash
npm run env:check
```

## Migrations

**Estado em 12/09/2026: 0001 a 0016 aplicadas em produção.** Faltam duas, nesta
ordem:

- **0017 (`0017_consentimento.sql`)** — sem ela a tela de privacidade do app
  aparece sem a lista de consentimentos, e o cadastro não registra o aceite dos
  termos.
- **0018 (`0018_reativacao_avisa.sql`)** — avisa o aluno quando a matrícula é
  reativada, e cria `schema_migrations`.
- **0019 (`0019_mensalidade_automatica.sql`)** — geração automática de
  mensalidade e marcação de cobrança vencida.
- **0020 (`0020_convite_de_equipe.sql`)** — convite de acesso ao painel para a
  equipe.

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
`db:set-password`, `env:check` e `test:asaas`. Nenhum deles é necessário no uso
normal; se um dia forem, é uma execução pontual, não uma rotina.

Consequência a não esquecer: com `PAYMENT_PROVIDER=asaas` e a URL de sandbox,
**produção emite cobranças de mentira**. O aviso amarelo de "provedor simulado"
some da tela, porque do ponto de vista do código o provedor é real — só a conta
do outro lado é de teste. Trocar para a chave e a URL de produção é item da
lista do Synse Pay, abaixo.

## Rotina diária de cobrança

A partir da 0019 a mensalidade se gera sozinha. O agendamento está em
`vercel.json`, às 9h UTC — 6h de Brasília, antes de a academia abrir.

- [ ] **`CRON_SECRET` na Vercel**, como *Sensitive*. Sem ele, o endereço
      `/api/cron/billing` recusa tudo e devolve 404: nenhuma cobrança é gerada,
      e nada na tela denuncia. Gere um valor longo e aleatório.
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

## Plataforma

- [ ] Plano da Vercel: o Hobby **proíbe uso comercial**. Precisa virar Pro
      (US$ 20/mês) antes do primeiro cliente pagante.
- [ ] Reativar "Confirm email" no Supabase, agora que o SMTP funciona.

## Synse Pay — bloqueado aguardando o provedor

**Estado atual:** a abertura de subconta responde **HTTP 403**. A chave é
válida; o que falta é o recurso de criar subcontas, que no Asaas pertence ao
produto white label e precisa ser liberado para a conta da plataforma.

Enquanto não for liberado, nenhuma academia conecta, e sem conta conectada não
há como emitir cobrança. O resto do SynseHub — alunos, check-in, treinos,
painel — não depende disso e segue funcionando.

**O que pedir ao Asaas:** habilitar a criação de subcontas via API
(`POST /accounts`) para a conta da plataforma. O caso de uso é marketplace: cada
academia opera na própria subconta, recebe a mensalidade nela, e o split desvia
a comissão do Synse. Vale dizer que o modelo foi escolhido justamente para o
dinheiro não passar pela plataforma.

**Alternativa avaliada e não escolhida:** cada academia criar a própria conta no
Asaas e colar a chave de API no SynseHub. O fluxo do dinheiro seria idêntico e
funcionaria hoje, sem depender de liberação — o custo é um passo manual na
entrada de cada academia. Fica registrado como saída caso a liberação demore ou
não venha.

## Synse Pay

- [ ] `SYNSE_PLATFORM_WALLET_ID` apontando para a carteira real da plataforma —
      é ela que recebe a comissão. Com o valor errado, o dinheiro vai inteiro
      para a academia e nada na tela indica isso.
- [ ] Webhook configurado no Asaas apontando para
      `https://synse.com.br/api/webhooks/payments/asaas`, com o mesmo token do
      `ASAAS_WEBHOOK_TOKEN`.
- [ ] Um pagamento de ponta a ponta no sandbox: emitir PIX, pagar, e ver a
      mensalidade virar "paga" sozinha. O webhook está escrito e testado
      unitariamente, mas nenhum pagamento real passou por ele ainda.
- [ ] Abertura de subconta em produção: o Asaas pede mais campos que no sandbox
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
- [ ] Preencher a identificação do controlador: `NEXT_PUBLIC_LEGAL_ENTITY`,
      `NEXT_PUBLIC_LEGAL_TAX_ID`, `NEXT_PUBLIC_LEGAL_ADDRESS` e
      `NEXT_PUBLIC_LEGAL_CONTACT`. Sem elas, as páginas dizem que a empresa está
      em constituição — o que é verdade hoje, e deixa de ser no dia em que houver
      CNPJ.
- [ ] Fazer o e-mail de privacidade existir de verdade. A política promete
      resposta em 15 dias; promessa de canal que ninguém lê é pior que canal
      nenhum.
- [ ] Encerramento de conta pela própria tela. Hoje é por e-mail, e a Apple
      exige exclusão dentro do aplicativo para quem permite criar conta nele.
