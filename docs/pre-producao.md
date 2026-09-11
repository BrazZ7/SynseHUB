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
