# Publicar o Synse — o passo a passo completo

Este é o roteiro de execução, na ordem que funciona. `docs/APP_LOJAS.md` explica
**como** cada peça técnica funciona; aqui é **o que fazer, quando, e por quê
nessa ordem**.

Tudo que está marcado **VOCÊ** depende de conta, cartão ou aparelho seu e não
pode ser feito daqui. Tudo que está marcado **CÓDIGO** já está pronto no
repositório.

> **Nada de chave, senha ou token colado no chat.** Os segredos vão de você
> direto para o GitHub, o Codemagic e a Vercel. Eu não preciso deles para
> nenhum passo deste documento, e se eu precisasse, o jeito certo continuaria
> sendo não me dar.

---

## O caminho crítico, antes de qualquer coisa

Duas esperas longas que não dependem de esforço, só de calendário. **Comece por
elas**, porque tudo o mais cabe dentro desse tempo:

| Espera | Quanto | Começa quando |
| --- | --- | --- |
| Teste fechado da Play (12 testadores, 14 dias) | **14 dias, no mínimo** | Depois da Fase 3 |
| Inscrição na Apple | horas a dias | Fase 4, pode rodar em paralelo |

A regra dos 12 testadores vale para **conta pessoal** criada depois de
13/11/2023 — que é o seu caso, sem CNPJ. São 12 pessoas que precisam estar
inscritas no teste fechado **continuamente pelos 14 dias anteriores** ao pedido
de acesso à produção. Se alguém sai e volta, o contador *dessa pessoa* reinicia.
Junte as 12 pessoas antes de precisar delas.

Confira a regra no próprio painel antes de contar com ela: o número já foi 20
antes de virar 12, e quem decide é a Play, não este documento.

---

## Fase 0 — O site no ar: **já está**, menos uma coisa

Conferido em 17/10/2026 contra `https://synse.com.br/api/health?deep=1`:

| Item | Estado |
| --- | --- |
| Site no ar | **Sim**, HTTP 200, `environment: production` |
| Supabase ligado | **Sim**, projeto `SynseHUB` em `sa-east-1` |
| Migrations | **54 aplicadas, `pendingMigrations: []`** |
| Sondas de schema | Todas presentes |
| Cobrança agendada, limitador | Ligados |
| **Identificação legal** | **Não** — `identificacaoLegal: false` |

Quem escreveu este documento (eu) supôs que faltava colar as migrations e que o
provedor de pagamento estava em `mock`. **As duas coisas estavam erradas** — o
banco está completo e o Mercado Pago está configurado em produção, com token e
segredo de webhook válidos. O jeito de descobrir isso foi perguntar ao site em
vez de confiar no documento, e é o que você deve fazer sempre que este arquivo
disser algo sobre o estado atual:

```
https://synse.com.br/api/health?deep=1
```

### 0.1 O que falta: a identificação legal **VOCÊ**

`identificacaoLegal: false` significa que a página `/privacidade` está no ar sem
dizer **quem** opera o serviço. **As duas lojas exigem isso** — é um dos
motivos mais comuns de recusa no formulário de privacidade, e some em cinco
minutos.

Na Vercel, *Settings → Environment Variables*, quatro variáveis:

| Variável | O que é |
| --- | --- |
| `NEXT_PUBLIC_LEGAL_ENTITY` | seu nome completo (ou a razão social, se um dia houver CNPJ) |
| `NEXT_PUBLIC_LEGAL_TAX_ID` | CPF, ou CNPJ quando houver |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | endereço que você aceita publicar |
| `NEXT_PUBLIC_LEGAL_CONTACT` | e-mail de contato |

Depois **Redeploy**, e `identificacaoLegal` vira `true`.

> **Isto é público, não é segredo** — o prefixo `NEXT_PUBLIC_` quer dizer
> exatamente que vai para o navegador de quem abrir a página. É a informação
> que a lei manda publicar, não dado para esconder. Ainda assim, quem decide
> qual endereço aparece é você, não eu.

## Fase 1 — Android: a chave de assinatura

**Uma vez na vida do produto.** Perder esta chave é não poder mais atualizar o
app. Vazá-la é outra pessoa poder assinar em seu nome.

Existe um script que faz os três passos e imprime exatamente o que colar:

```bash
bash scripts/android/preparar-a-chave.sh
```

Ele pergunta seu nome e uma senha (duas vezes, sem aparecer na tela), gera o
keystore, escreve o base64 num arquivo e lista os quatro segredos com os nomes
certos. Depois é copiar e colar no navegador.

**Testado de ponta a ponta neste projeto:** a chave que ele gera, passada pelo
mesmo caminho do workflow (base64 → `base64 -d` → Gradle), produziu um APK cujo
certificado tem a digital que o script imprimiu. Ele também recusa sobrescrever
chave existente, recusa senha curta ou digitada diferente nas duas vezes, e não
cria nada quando recusa.

### Onde rodar, se você não tem computador

| Onde | Como |
| --- | --- |
| Windows/Linux com Android Studio | o Java já está lá; use o terminal do Studio |
| Ubuntu/WSL | `sudo apt install -y openjdk-17-jdk-headless` |
| Android, no próprio celular | Termux: `pkg install openjdk-17` |
| **Só um navegador** | GitHub → botão **Code → Codespaces → Create**. Roda no navegador, já tem Java, e é a sua conta |

O Codespace é a saída honesta para "não tenho computador": a chave nasce dentro
da sua conta, não num log de build público nem num chat. **Baixe o `.jks` antes
de apagar o Codespace** — ele é descartável, a chave não.

Se o script não rodar por algum motivo, o comando cru é:

```bash
keytool -genkey -v -keystore synse-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 -alias synse
base64 -w 0 synse-release.jks     # macOS: base64 -i
```

### Os quatro segredos **VOCÊ**

[github.com/BrazZ7/SynseHUB/settings/secrets/actions](https://github.com/BrazZ7/SynseHUB/settings/secrets/actions)
→ *New repository secret*, quatro vezes:

| Segredo | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | o conteúdo do arquivo `.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | a senha que você digitou |
| `ANDROID_KEY_ALIAS` | `synse` |
| `ANDROID_KEY_PASSWORD` | a mesma senha |

O GitHub guarda cifrado e **não devolve**: isto serve para assinar, não como
cópia de segurança. A cópia é sua, no gerenciador de senhas.

---

## Fase 2 — Android: gerar o pacote

**Isto eu consigo disparar daqui** — e disparei, em 17/10/2026, para descobrir
se os segredos já existiam. Não existiam, e o workflow fez o que devia:

```
✓ 1–6  checkout, Node, Java, npm ci, pacotes do SDK
✗ 7    A chave de assinatura  →  "Falta o segredo ANDROID_KEYSTORE_BASE64."
–  8–12  pulados
✓ 13   Apagar a chave  (roda mesmo com o build falhando)
```

Ele **parou** em vez de entregar um pacote sem assinatura — que é o defeito que
a Play só recusaria horas depois. Era o único caminho do workflow que ainda não
havia sido exercitado num runner de verdade.

Depois de colar os quatro segredos, me avise e eu disparo de novo, ou você faz:

1. *Actions → **Android — pacote assinado** → Run workflow*;
2. esperar ~4 minutos;
3. baixar o artefato `synse-android-…` no fim da página do run — `app-release.aab`
   para a Play, `app-release.apk` para instalar num aparelho.

O `versionCode` sai do contador de execuções do Actions, que nunca repete. A
Play recusa repetido e não aceita voltar atrás, então não há o que controlar à
mão.

Antes de subir, instale o APK num Android e abra — é a hora mais barata de
descobrir um problema:

```bash
adb install -r app-release.apk
```

## Fase 3 — Play Console **VOCÊ**

### 3.1 Conta — US$ 25, uma vez

[play.google.com/console](https://play.google.com/console). Sem CNPJ, é conta
**pessoal** — e é ela que cai na regra dos 12 testadores.

### 3.2 Criar o app

*Create app*, nome **Synse**, e nas declarações iniciais o app é gratuito.

### 3.3 Os formulários que travam a publicação

Nenhum é opcional, e é aqui que a maioria dos atrasos acontece:

- **Política de privacidade** — a URL `https://synse.com.br/privacidade`.
- **Segurança dos dados** (*Data safety*) — declarar com honestidade:
  **dados de saúde** (peso, medidas, avaliação física), **localização** (GPS do
  SynseRun) e **Bluetooth** (balança do Synse Body). Declarar menos do que o app
  coleta é o tipo de erro que vira suspensão depois, não recusa agora.
- **Classificação de conteúdo** — questionário.
- **Público-alvo** — não é app infantil.

### 3.4 Subir o AAB no teste fechado

*Testing → Closed testing* → criar uma faixa → subir o `app-release.aab`.

**Agora o relógio dos 14 dias começa.** Convide as 12 pessoas (lista de e-mails
ou grupo do Google), confirme que cada uma **aceitou** o convite — convite não
aceito não conta — e não deixe ninguém sair.

### 3.5 Fazer o link abrir no app

Enquanto os 14 dias passam, resolva isto:

1. Play Console → **Integridade do app → Assinatura de apps** → copiar o
   **SHA-256**.
2. Vercel → `ANDROID_CERT_FINGERPRINTS` = esse valor → **redeploy**.
3. Conferir:

```bash
curl https://synse.com.br/.well-known/assetlinks.json
adb shell pm get-app-links br.com.synse.app   # espera-se "verified"
```

> **O erro mais comum do projeto inteiro, e ele é silencioso.** Com o App
> Signing da Play ligado — o padrão —, a digital certa é a da chave **da
> Google**, não a da sua chave de upload. Trocar as duas não dá erro nenhum: o
> link simplesmente continua abrindo no navegador, para sempre.

### 3.6 Pedir produção

Passados os 14 dias com 12 testadores inscritos, *Apply for production access*.
Depois disso é a revisão normal da Play — dias, não semanas.

---

## Fase 4 — iOS: a conta e a esteira **VOCÊ**

**Pode rodar em paralelo com a Fase 3** — não espere o Android acabar.

### 4.1 Apple Developer Program — US$ 99/ano

[developer.apple.com](https://developer.apple.com/programs/). **Sem CNPJ, a
inscrição é como pessoa física**: conta de organização exige número D-U-N-S. O
nome do vendedor na loja fica sendo o seu. Converter para empresa depois existe,
leva semanas e pede o D-U-N-S de qualquer forma.

### 4.2 Chave da App Store Connect API

App Store Connect → *Users and Access → Integrations → App Store Connect API* →
gerar chave com papel **App Manager**.

**O arquivo `.p8` só pode ser baixado uma vez.** Guarde no gerenciador de senhas
junto com o *Key ID* e o *Issuer ID*.

### 4.3 Codemagic

[codemagic.io](https://codemagic.io) — conta individual, 500 minutos de macOS por
mês, grátis. Um build aqui deve ficar em 10–15.

1. *Team integrations → Developer Portal → Manage keys → Add key* — subir o
   `.p8`, o Key ID e o Issuer ID.
2. **O nome que você der a essa chave tem de ser exatamente
   `Synse App Store Connect`**, que é o que está em `integrations.app_store_connect`
   no `codemagic.yaml`. Se você usar outro nome, me diga e eu troco no arquivo —
   não adivinhe, porque o erro aparece só no fim de um build pago.
3. Ligar o repositório `BrazZ7/SynseHUB` no Codemagic.

### 4.4 Criar o app na App Store Connect

*My Apps → +* → plataforma iOS, nome **Synse**, bundle id **`br.com.synse.app`**
(tem de ser idêntico — é o que o projeto declara).

Copie o **Apple ID numérico** do app (aparece em *App Information*) e ponha em
`APP_STORE_APPLE_ID`, nas variáveis do workflow no Codemagic. Sem ele o build
usa `1` como número de build e a Apple recusa o segundo envio.

### 4.5 O primeiro build

Disparar o workflow `ios-testflight` no Codemagic.

**Este build nunca rodou.** O projeto iOS foi escrito aqui, de dentro de um
contêiner Linux, e descrever não é compilar — três defeitos já apareceram só de
descrever. Se o primeiro build falhar, **me manda o log**: é informação, não
problema, e é exatamente o que ele existe para descobrir.

### 4.6 Ver a Live Activity num iPhone

O build sobe sozinho para o TestFlight. Instale num iPhone — seu, ou de alguém
que você convide — comece um treino e **olhe a tela bloqueada**.

**Isto não tem substituto.** Não há simulador aqui, não há Mac, e nenhum teste
automatizado diz se o cartão aparece. É o único passo do roteiro que exige um
iPhone de verdade, e ele vem antes de falar com a Apple sobre a diretriz 4.2.

---

## Fase 5 — A revisão da App Store **VOCÊ**

### 5.1 A diretriz 4.2 — "app que é só um site"

É o risco real de um invólucro, e a Apple recusa por isso com frequência. A
resposta do Synse não é retórica, mas **só vale se estiver funcionando**:

- Live Activity com a série e o cronômetro de descanso na Dynamic Island;
- GPS em segundo plano do SynseRun;
- balança Bluetooth do Synse Body.

Nenhuma das três existe num site. Escreva isso nas *Notas para o revisor*, e
confirme no aparelho antes de enviar — por isso a 4.6 vem antes desta fase.

### 5.2 Privacidade do app

A *App Privacy* da Apple é o equivalente do formulário da Play: declarar saúde,
localização e Bluetooth, com a mesma honestidade.

### 5.3 Capturas e descrição

As duas lojas pedem. Use uma academia de demonstração, **nunca dado de aluno
real** numa captura.

---

## Pagamento dentro do app — auditado em 17/10/2026

Conferido tela por tela no app do aluno. **São dois fluxos de pagamento, e eles
têm respostas opostas.**

### A) Mensalidade da academia — pode ficar como está

`/app/finance` → `StudentPixPanel` → PIX de uma cobrança aberta.

Isto **não** cai na regra de compra dentro do app, e a razão é simples: o que a
pessoa está pagando é o acesso à academia — um serviço físico, consumido fora do
app. As duas lojas abrem exceção explícita para isso; é o mesmo caso de pagar
academia, estacionamento ou aluguel por aplicativo. Nenhuma comissão, nenhuma
mudança.

O código já está do lado certo em duas coisas que importam: o botão não aparece
quando o provedor não faz PIX ou está simulado, e o status só muda pelo webhook
— nunca pelo navegador.

### B) Synse+ — **não** pode ficar como está

| | |
| --- | --- |
| Onde | `/app/synse` → `AssinarPlusButton` → `assinarPlusAction` |
| O que faz | cria assinatura recorrente de **R$ 29/mês** no cartão, no Mercado Pago, e manda a pessoa para o checkout dele |
| O que destrava | **só conteúdo digital dentro do app**: programas guiados, biblioteca de receitas, 6 desafios por ciclo em vez de 1, 36 meses de histórico em vez de 3 |

Conteúdo digital destravado dentro do app é exatamente o que as duas lojas
reservam para a cobrança **delas**. E não é um botão só — **oito pontos do app
empurram para essa página**:

| Tela | Onde |
| --- | --- |
| Hoje (card em destaque) | `app/page.tsx:491` |
| Desafios | `app/challenges/page.tsx:195` |
| Histórico de corrida | `app/run/history/page.tsx:111` e `:132` |
| Análise do progresso | `app/progress/analise/page.tsx:228` |
| Amigos | `app/friends/page.tsx:44` |
| Corpo | `app/corpo/page.tsx:167` |
| Seletor de período do corpo | `features/synse-body/period-selector.tsx:50` |
| Vitrine de conteúdo | `features/content/vitrine.tsx:79` |

Tirar o botão de assinar e deixar os oito caminhos não resolve: a regra das
lojas alcança também **levar** à compra, não só efetuá-la.

> **O lado da academia está limpo.** O hub não vende nada dentro do app — a
> taxa da plataforma sai do recebível da academia, não é uma compra. Conferido.

### A boa notícia, e ela é de junho deste ano

O Brasil é um dos poucos lugares onde isto deixou de ser proibido — mas **não
ficou de graça**:

**Apple**, desde **18/06/2026** (iOS 26.5, por acordo com o CADE): dá para
vender por outra plataforma de pagamento dentro do app. Duas condições que
mudam o projeto: a opção externa tem de aparecer **lado a lado** com a da
Apple, e a Apple continua cobrando comissão de serviços de loja — **15%**, ou
**10%** para quem está no programa de pequenos negócios e para assinaturas
depois do primeiro ano. Pela compra dela: 10% (ou 21%) **mais 5%** de
processamento.

**Google Play**: o Brasil **está** na lista oficial de países onde app que não
é jogo pode oferecer faturamento alternativo — mas a página da Google diz
"**além do** sistema de faturamento do Google Play", não em vez dele. Ela não
diz como fica a taxa no Brasil, e as fontes de terceiros se contradizem (uma
afirma que a cobrança alternativa dentro do app só chega ao Brasil em setembro
de 2027). **Isto precisa ser confirmado no próprio Play Console**, com a conta
criada — não dá para resolver daqui.

### Faça a conta antes de decidir

R$ 29 com 15% de comissão da Apple **mais** a taxa do Mercado Pago não são
R$ 29. Com 10%, muda de novo. E pela compra dentro do app a comissão é de
10% a 21%, mais 5% de processamento.

O preço do Synse+ foi escolhido sem nada disso na conta, e **continua assim**:
construir a cobrança não revisou o valor. É decisão comercial, não de código,
e segue em aberto.

### A decisão, e o que ela custou construir

**Caminho escolhido: a cobrança da loja ao lado do Mercado Pago** — o que Apple
e Google exigem hoje no Brasil para conteúdo digital vendido dentro do app.

Os outros dois eram publicar sem vender dentro do app (comissão zero, pior
conversão) e usar só o pagamento externo nos termos novos (credenciamento nos
dois programas, e a redação da Google sugere que sozinho pode não ser
permitido). Ficam registrados porque a decisão pode ser revista.

Construído entre 17 e 19/10/2026, **155 testes**:

| Camada | Onde | Estado |
| --- | --- | --- |
| Banco com três origens | migration `0061` | **Aplicada em produção**, regras exercitadas contra ela |
| Trava da compra dupla | `src/lib/plans/pode-assinar.ts` | Recusa comprar quando já há assinatura viva, dizendo onde ela vive |
| O app se identifica | `appendUserAgent: 'SynseApp/1'` | Lido no servidor; dentro do app, **nunca** o Mercado Pago |
| Plugin nativo | `native/synse-plus-billing` | StoreKit 2 e Play Billing 7.1.1. O Kotlin compila na CI e entra no APK; **o Swift nunca foi compilado** |
| Verificação de recibo da Apple | `apple-jws.ts` | Cadeia conferida contra a `Apple Root CA - G3` fixada no repositório |
| Verificação no Google | `google-api.ts` | Consulta à Play Developer API com conta de serviço |
| Notificações das duas lojas | `/api/webhooks/lojas/…` | Renovação, cancelamento, estorno e expiração |

### As três coisas que mais custaram acertar

Valem ser lidas por quem for mexer nisso, porque são erros que **não falham**:

**1. O recibo emprestado.** Um recibo da App Store é um documento válido que
qualquer pessoa extrai do próprio aparelho. Verificar a assinatura e parar aí o
transforma em senha de Synse+: uma pessoa assina, publica o texto num grupo, e
todos que colarem recebem acesso. O que fecha é a referência da conta, que o
plugin manda na compra e a loja devolve no recibo — ela tem de ser o perfil de
quem está pedindo.

**2. A raiz fixada.** A cadeia de certificados vem **dentro** da JWS. Conferir
"a assinatura combina com o certificado do `x5c`" é conferir que quem assinou
assinou. Só a comparação com a raiz da Apple guardada no repositório dá valor
ao resto.

**3. Quem é dono da assinatura.** Com três origens escrevendo na mesma linha,
uma notificação atrasada da Apple derrubava quem pagava pela web, e uma
renovação velha do Mercado Pago dava Synse+ de graça a quem já cancelara na
loja. As três regras da 0061 — fora de ordem não escreve, quem não é dono não
mexe, compra nova ganha — existem por isso.

### Fase 6 — Ligar a cobrança da loja **VOCÊ**

Só depois das Fases 3 e 4, porque tudo aqui depende das duas contas.

| # | O quê | Onde |
| --- | --- | --- |
| 6.1 | Criar o produto `synse_plus_mensal` como assinatura mensal | App Store Connect **e** Play Console. O id tem de ser idêntico nos dois |
| 6.2 | Conta de serviço do Google Cloud, com a Play Developer API habilitada, convidada na Play Console | JSON inteiro em `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` na Vercel |
| 6.3 | Notificações da App Store → `https://synse.com.br/api/webhooks/lojas/apple` | App Store Connect → *App Information → App Store Server Notifications* (V2) |
| 6.4 | RTDN do Google → tópico Pub/Sub → push para `https://synse.com.br/api/webhooks/lojas/google`, com `Authorization: Bearer <segredo>` | Play Console → *Monetização → Configuração* |
| 6.5 | O mesmo segredo em `GOOGLE_RTDN_SECRET` na Vercel | Sem ele definido, a rota **recusa tudo** |
| 6.6 | **Ver uma compra funcionar num aparelho** | TestFlight no iPhone, faixa de teste na Play |
| 6.7 | Virar `LOJA_DISPONIVEL` para `true` | `src/lib/plans/oferta-do-plus.ts` — e há teste que falha nessa hora, de propósito |

> **A 6.6 não tem substituto.** Nenhuma compra deste código jamais foi
> executada: não há produto cadastrado, não há conta de serviço, e ninguém viu
> a folha de pagamento abrir. Virar a chave da 6.7 é afirmar que viu.

**E nada disto bloqueia publicar.** Com `LOJA_DISPONIVEL` em `false` o app não
oferece compra nenhuma — sem caminho de compra não há infração —, e a venda
segue inteira na web, onde não há comissão.

Dentro do app, a tela do Synse+ mostra a comparação e **não** mostra preço nem
botão. Esconder o valor parece exagero, já que ninguém compra ali, mas a regra
alcança *levar* à compra: preço sem botão é instrução para ir procurar onde
pagar. Netflix e Spotify não mostram valor dentro do app, e não é timidez.

## Resumo em uma tabela

| # | O quê | Quem | Custo | Trava o quê |
| --- | --- | --- | --- | --- |
| 0 | Supabase, migrations, site no ar | ✅ **feito** | — | — |
| 0.1 | As quatro variáveis `NEXT_PUBLIC_LEGAL_*` na Vercel | VOCÊ | grátis | formulários das duas lojas |
| 1 | `bash scripts/android/preparar-a-chave.sh` + colar 4 segredos | VOCÊ | grátis | Fase 2 |
| 2 | Rodar o workflow, baixar o AAB | VOCÊ **ou eu** | grátis | Fase 3 |
| 3.1 | Conta Play Console | VOCÊ | US$ 25 | Fase 3 |
| 3.4 | Teste fechado, 12 testadores | VOCÊ | — | **14 dias** |
| 3.5 | Digital SHA-256 → Vercel | VOCÊ | — | App Links |
| 3.6 | Pedir produção | VOCÊ | — | loja Android |
| 4.1 | Apple Developer | VOCÊ | US$ 99/ano | Fase 4 |
| 4.2 | Chave `.p8` | VOCÊ | grátis | Fase 4 |
| 4.3 | Codemagic | VOCÊ | grátis | Fase 4 |
| 4.4 | App na App Store Connect | VOCÊ | — | Fase 4 |
| 4.5 | Primeiro build iOS | VOCÊ (botão) | ~12 min de cota | Fase 5 |
| 4.6 | Live Activity num iPhone | VOCÊ + iPhone | — | Fase 5 |
| 5 | Formulários e envio | VOCÊ | — | loja iOS |
| 6.1 | Produto `synse_plus_mensal` nos dois painéis | VOCÊ | — | vender no app |
| 6.2 | Conta de serviço do Google na Vercel | VOCÊ | grátis | Android |
| 6.3–6.5 | Notificações das duas lojas + `GOOGLE_RTDN_SECRET` | VOCÊ | grátis | renovação e cancelamento |
| 6.6 | **Ver uma compra funcionar num aparelho** | VOCÊ + aparelho | — | 6.7 |
| 6.7 | Virar `LOJA_DISPONIVEL` | VOCÊ | — | o botão aparecer |

---

## O que ainda não existe, e você vai perguntar

Honestidade sobre o que este roteiro **não** entrega:

- **Nenhuma compra pela loja jamais foi processada.** O código existe inteiro e
  tem 155 testes; o que ele não tem é uma única execução real. Os testes da
  Apple geram cadeias de certificados de verdade e provam a lógica — eles não
  provam que a Apple manda os campos que este código espera.
- **O Swift do plugin nunca foi compilado.** Não há Mac. O Kotlin compila na CI
  a cada push; o primeiro build do Codemagic é que vai dizer do outro lado.
- **Botões da Live Activity** (pular descanso, +30 s). Não implementados:
  exigem `LiveActivityIntent` e um App Group criado no portal da Apple. Fazer
  antes de ver o cartão num iPhone é escrever contra uma suposição.
- **Widget de tela inicial.** Não existe. Entra numa linha do `WidgetBundle`
  quando houver.
- **A notificação de treino no Android nunca foi vista em aparelho.** O serviço
  compila e está no manifesto; ninguém abriu.
- **Nenhum commit desta etapa foi revisado pelo Codex** — o binário não está
  instalado neste contêiner.
