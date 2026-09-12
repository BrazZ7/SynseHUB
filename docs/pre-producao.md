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

## Migrations a aplicar no SQL Editor

**Estado em 12/09/2026: 0012 a 0015 aplicadas em produção** — conferido em
`/api/health?deep=1`, com `pendingMigrations` vazio.

Com o trabalho sem terminal, migração nova só entra em produção quando alguém
cola o arquivo no SQL Editor do Supabase. O histórico do que foi aplicado nesta
rodada, na ordem:

- [x] `0012_notification_events.sql` — sem ela o sino continua vazio, mas nada
      quebra: a leitura de notificações falha em silêncio e a tela mostra
      "nada por aqui ainda".
- [x] `0013_synse_solo.sql` — sem ela, quem escolher "treino por conta própria"
      recebe erro ao concluir. O resto do cadastro segue funcionando.
- [x] `0014_baseline_experience.sql` — sem ela, a tela de desafios não abre.
      Treino base e plano alimentar base não dependem de banco e continuam de pé.
- [x] `0015_professional_unlock.sql` — sem ela, o cartão do perfil profissional
      aparece desligado e "abrir espaço" recusa. Nada mais é afetado.

**Pendente agora: `0016_synse_run.sql`** — sem ela o SynseRun mede e grava a
corrida no aparelho, mas não guarda histórico nem recorde; as telas avisam isso
em vez de quebrar.

As quatro anteriores estão reunidas, na ordem, em `docs/migrations-pendentes.sql` — uma
colagem só no SQL Editor, em vez de quatro chances de pular uma ou trocar a
ordem. O arquivo é gerado a partir de `src/db/migrations`, que continua sendo a
fonte da verdade.

Aplicar duas vezes é inofensivo: são `create or replace`, `if not exists`,
`on conflict do nothing` e `drop ... if exists`. Nenhum comando exige rodar
fora de transação, então o editor pode executar tudo de uma vez — ou entra
tudo, ou não entra nada.

Para liberar o Synse+ numa conta de teste, com a chave de serviço:

```sql
select set_user_tier('<id do user_profiles>', 'PRO');            -- Synse+
select set_professional_plan('<id do user_profiles>', true);     -- perfil profissional
```

A função é a única porta para mudar o plano — pela tela, nem o dono da conta
consegue, e é de propósito: senão bastaria um PATCH em `user_profiles` para
virar assinante sem pagar.

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
- [ ] Termos de Uso e Política de Privacidade publicados e linkados no cadastro.
