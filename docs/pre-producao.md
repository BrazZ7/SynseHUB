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

## Ambiente separado

- [ ] Criar um projeto Supabase só para desenvolvimento, com as mesmas
      migrations e seed. Hoje `.env.local` guarda credencial de produção, e é
      isso que torna arriscado mostrar a tela para pedir ajuda. Com ambientes
      separados, o arquivo local passa a conter só credencial descartável.

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
