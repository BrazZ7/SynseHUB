# Synse nas lojas — o que está pronto e o que falta

O app é um invólucro Capacitor que carrega `https://synse.com.br`. A decisão e o
risco dela estão comentados em `capacitor.config.ts`; este documento é a parte
operacional.

> **Procurando o que fazer, na ordem?**
> [`docs/publicar-passo-a-passo.md`](publicar-passo-a-passo.md) é o roteiro de
> execução, fase por fase, do Supabase até o envio nas duas lojas. Aqui é como
> cada peça funciona e por quê.

## O que já funciona

| Item | Estado |
| --- | --- |
| Projeto Android | Compila. `app-debug.apk`, `app-release-unsigned.apk` e `app-release.aab` saem |
| Ícones e splash | Gerados em todas as densidades |
| Tela sem conexão | `server.errorPath` → `mobile/www/index.html`, com botão de tentar de novo |
| Botão voltar do Android | Anda no histórico; só encerra numa raiz |
| Volta do segundo plano | `router.refresh()`, para a tela não ficar congelada em dado de ontem |
| Permissões | GPS (SynseRun), notificação e serviço em primeiro plano (Treino Ativo), Bluetooth (Synse Body) |
| Assinatura de release | Configurada e **verificada**: `app-release.aab` e `app-release.apk` saem assinados (esquema v2), `versionCode` e `versionName` como pedidos |
| Versão | `SYNSE_VERSION_CODE` / `SYNSE_VERSION_NAME` por variável de ambiente |
| App Links | Manifesto declara o domínio; `/.well-known/assetlinks.json` serve o outro lado |
| Projeto iOS | Dois targets (app + extensão da Live Activity) e scheme compartilhado. **Nunca compilado** — o build é na CI, ver abaixo |
| Build do iOS sem Mac | `codemagic.yaml`: compila, assina e sobe ao TestFlight num Mac alugado por minuto |
| Build do Android | `.github/workflows/android.yml`: AAB e APK assinados, com a assinatura conferida antes de publicar o artefato |
| Guarda do código nativo | O mesmo workflow compila o debug a cada push que toca `android/`, `native/` ou o Capacitor. **Já rodou verde** num runner do GitHub |
| O app se identifica ao servidor | `appendUserAgent: 'SynseApp/1'`, conferido dentro do `capacitor.config.json` que vai no APK |
| Cobrança pelas lojas | Plugin, verificação de recibo e notificações construídos (155 testes). **Nenhuma compra executada** — ver abaixo |

## A cobrança do Synse+ pelas lojas

O Synse+ destrava só conteúdo digital, e isso Apple e Google reservam para a
cobrança **delas**. A auditoria de 17/10 encontrou o app vendendo por fora, e o
caminho escolhido foi oferecer a cobrança da loja ao lado do Mercado Pago.

| Peça | Onde |
| --- | --- |
| Plugin nativo | `native/synse-plus-billing` — StoreKit 2 e Play Billing 7.1.1 |
| Rota da compra | `/api/plus/loja` |
| Notificações | `/api/webhooks/lojas/apple` e `/api/webhooks/lojas/google` |
| Três origens na mesma conta | migration `0061` |
| O que cada mundo oferece | `src/lib/plans/oferta-do-plus.ts` |

**O botão não aparece.** `LOJA_DISPONIVEL` é `false`, e enquanto for, o app não
vende Synse+ de jeito nenhum — o que, de propósito, **permite publicar**: sem
caminho de compra não há infração, e a venda segue na web, sem comissão.

Três coisas que valem saber antes de mexer nisso:

- **A mensalidade da academia não entra nesta regra.** Ela é serviço físico,
  consumido fora do app, e as duas lojas abrem exceção explícita. O PIX do
  `/app/finance` fica como está.
- **Dentro do app não aparece preço**, nem botão. A regra alcança *levar* à
  compra, e preço sem botão é instrução para ir procurar onde pagar.
- **A `Apple Root CA - G3` está fixada no repositório**, em
  `src/lib/plans/lojas/apple-raiz.pem`, com a impressão digital num teste. Sem
  ela, "verificar o recibo" seria conferir a assinatura contra um certificado
  que vem dentro do próprio recibo.

O que falta para ligar está na Fase 6 de
[`docs/publicar-passo-a-passo.md`](publicar-passo-a-passo.md), e termina em
**ver uma compra funcionar num aparelho**.

## Gerar a chave de assinatura

**Uma vez na vida do produto.** Perder esta chave significa não poder mais
atualizar o app; vazá-la significa outra pessoa poder assinar em seu nome.

```bash
keytool -genkey -v -keystore synse-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 -alias synse
```

Guarde o `.jks` e as senhas num cofre de senhas — **não** no repositório, não no
Drive da empresa sem senha, não num anexo de e-mail. O `.gitignore` do Android
já bloqueia `*.jks`, `*.keystore` e `keystore.properties`, mas o bloqueio não
protege de um upload para outro lugar.

Depois crie `android/keystore.properties` (ignorado pelo git):

```properties
storeFile=/caminho/absoluto/synse-release.jks
storePassword=…
keyAlias=synse
keyPassword=…
```

Numa esteira de build, as mesmas quatro coisas vão como
`SYNSE_KEYSTORE_FILE`, `SYNSE_KEYSTORE_PASSWORD`, `SYNSE_KEY_ALIAS` e
`SYNSE_KEY_PASSWORD`.

Sem nenhum dos dois caminhos, o build avisa e sai sem assinatura — de propósito:
falhar aqui impediria alguém de simplesmente compilar o projeto. **É também o
defeito mais perigoso desta parte**, porque o build fica verde: por isso o
workflow confere a assinatura do pacote antes de publicá-lo, e por isso ele para
quando o segredo da chave está faltando em vez de entregar um pacote que a Play
recusa depois.

### A chave no GitHub Actions

O keystore é binário, e segredo do GitHub é texto. Em base64:

```bash
base64 -w 0 synse-release.jks   # Linux
base64 -i synse-release.jks     # macOS
```

Em *Settings → Secrets and variables → Actions*, quatro segredos:

| Segredo | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | a saída do comando acima |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` |
| `ANDROID_KEY_ALIAS` | `keyAlias` |
| `ANDROID_KEY_PASSWORD` | `keyPassword` |

O GitHub guarda cifrado e não devolve: isto serve para assinar, **não** como
cópia de segurança da chave. A cópia é sua, no cofre de senhas.

Em repositório público, o segredo não é entregue a workflow disparado por pull
request de fork — ninguém abre um PR para roubar a chave. Mas o log do build é
público, e nenhum passo do workflow imprime segredo; há teste que falha se
alguém escrever um.

## Gerar o pacote

```bash
SYNSE_VERSION_CODE=2 SYNSE_VERSION_NAME=1.0.1 npm run mobile:build:aab
# android/app/build/outputs/bundle/release/app-release.aab
```

O `versionCode` **precisa subir a cada envio** e nunca pode voltar atrás — a
Play Console recusa repetido. O `versionName` é o que a pessoa lê na loja.

Para instalar na mão num aparelho de teste, `npm run mobile:build:apk` e depois
`adb install -r`.

## Fazer o link abrir no app

Duas pontas, e uma só não vale:

1. **O manifesto** já declara `synse.com.br` com `autoVerify` — feito.
2. **O domínio** precisa servir `/.well-known/assetlinks.json` com a impressão
   digital do certificado. A rota existe e responde **404 enquanto não houver
   digital configurada**.

Configure `ANDROID_CERT_FINGERPRINTS` na Vercel com o SHA-256 que a Play Console
mostra em **Integridade do app → Assinatura de apps**.

> A digital certa é a do certificado que **assina o APK entregue ao aparelho**.
> Com o App Signing da Play ligado — o padrão hoje —, essa é a chave *dela*, não
> a sua chave de upload. Trocar as duas é o erro mais comum, e o sintoma é
> silencioso: o link simplesmente continua abrindo no navegador.

Conferir depois de publicar:

```bash
curl https://synse.com.br/.well-known/assetlinks.json
adb shell pm get-app-links br.com.synse.app   # espera-se "verified"
```

## O que depende de você, e não de código

| Pendência | Onde | Custo |
| --- | --- | --- |
| Conta Google Play Console | play.google.com/console | US$ 25, uma vez |
| Conta Apple Developer | developer.apple.com | US$ 99/ano |
| Chave da App Store Connect API | App Store Connect → Users and Access → Integrations | Grátis; vai no Codemagic, não no repositório |
| Os quatro segredos do Android | GitHub → Settings → Secrets → Actions | Grátis; ver "A chave no GitHub Actions" |
| Conta Codemagic | codemagic.io | 500 min de macOS/mês grátis na conta individual |
| Formulário de Segurança dos Dados | Play Console | Declarar saúde, localização e Bluetooth |
| Política de privacidade publicada | `/privacidade` já existe | Falta a identificação legal |
| Capturas de tela e descrição | Ambas as lojas | — |
| Produto `synse_plus_mensal` | Ambas as lojas | Grátis; id idêntico nos dois |
| Conta de serviço do Google | Google Cloud + Play Console | Grátis; vai em `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| Endereço das notificações | Ambas as lojas | Grátis; ver Fase 6 do roteiro |

## iOS sem Mac

O compilador do iOS roda em hardware Apple por licença — e é só isso que exige
macOS. `codemagic.yaml` aluga essa máquina por minuto: a conta individual do
Codemagic tem 500 minutos de macOS por mês, e um build aqui deve ficar em
10–15.

O arquivo tem no cabeçalho os quatro pré-requisitos, na ordem. O resumo:

1. Programa de Desenvolvedor da Apple ativo. **Sem CNPJ, a inscrição é como
   pessoa física** — conta de organização exige número D-U-N-S. O nome do
   vendedor na loja fica sendo o seu, e a conversão para empresa depois existe,
   leva semanas e pede o D-U-N-S.
2. Chave da App Store Connect API com acesso *App Manager*, cadastrada no
   Codemagic em *Team integrations → Developer Portal → Manage keys*. O nome que
   você der ali vai em `integrations.app_store_connect` do yaml.
3. O app criado na App Store Connect com o id `br.com.synse.app`, e o id
   numérico dele em `APP_STORE_APPLE_ID`.
4. Repositório ligado ao Codemagic. O build sai do `codemagic.yaml`.

**A chave e o certificado não passam pelo repositório nem por mim.** Eles vão
de você para o Codemagic.

O que ainda precisa de um Mac, e não é o build: abrir o simulador e depurar
crash nativo. Para isso existe Mac por hora (MacinCloud, MacStadium, EC2 Mac),
e nada disso bloqueia publicar.

O que precisa de **iPhone** — não de Mac: ver a Live Activity na tela
bloqueada. Não há outro jeito de verificar, e o TestFlight instala no aparelho
de qualquer pessoa que você convidar.

## Android sem máquina local

Android compila em Linux, então não há o problema do iOS: o
`.github/workflows/android.yml` faz tudo num runner do GitHub, e **em
repositório público o Actions não tem cota** — é grátis sem limite de minutos.

Dois trabalhos no mesmo arquivo, com propósitos diferentes:

- **`pacote`** — só no botão (*Actions → Android → Run workflow*). Gera o
  `app-release.aab` e o `app-release.apk` assinados, confere a assinatura dos
  dois, e guarda como artefato por 14 dias. Gerar pacote de loja é decidir
  publicar, e essa decisão é humana.
- **`compilar`** — automático, a cada push que toque `android/`, `native/`,
  `mobile/` ou o Capacitor. Compila o debug, sem chave nenhuma, e não guarda
  nada. É só a pergunta "o Kotlin ainda compila?".

O segundo existe por causa do iOS: a Live Activity passou meses chamando um tipo
que não existia, e ninguém soube porque aquele código nunca era compilado. Com o
guarda, código nativo que não compila aparece no push, não na véspera de
publicar.

**Um commit, uma compilação — e isso custou duas correções.** O primeiro push
deste arquivo gerou **dois** runs do mesmo commit, os dois verdes: branch com PR
aberto dispara `push` e `pull_request` juntos.

A primeira tentativa foi agrupar os dois runs no mesmo `concurrency` para um
cancelar o outro. Não funcionou, e o motivo vale saber: **`github.ref` não é a
mesma coisa nos dois eventos** — `refs/heads/<branch>` no push,
`refs/pull/<n>/merge` no pull_request. Grupos diferentes, nada se cancelou. Dá
para costurar com `github.head_ref || github.ref_name`, mas aí quem morre
depende de qual evento chegou primeiro, e no dia em que o run do PR perde a
corrida o check dele fica *cancelado* — que não é verde e segura o merge.

O que ficou foi mais simples: **só `push`**, em todo branch. Conferido no PR #1,
com os dois runs no ar: os jobs do run de `push` já aparecem como check do pull
request, então o `pull_request` não acrescentava cobertura — acrescentava um
build. O que se perde é PR vindo de fork, que nenhum `push` alcança; o
repositório nunca teve um, e está escrito no workflow onde isso volta quando
tiver.

O `concurrency` continua, agora por trabalho e com outro propósito: o guarda é
cancelado por um push mais novo no mesmo branch, e o `pacote` tem grupo próprio
que **nunca** é cancelado, para um push que chegue no meio não matar um pacote
de loja.

**O `versionCode`** sai do contador de execuções do Actions, que nunca repete —
é o que a Play exige. Se algum dia o contador ficar atrás do que já subiu
(recriar o workflow zera), defina a variável `ANDROID_VERSION_CODE_OFFSET` em
*Settings → Variables* para levantar o piso sem mexer no arquivo.

**O que foi conferido rodando, e não só escrito.** O build de release rodou
neste contêiner, com uma chave descartável gerada só para isso:

```
package: name='br.com.synse.app' versionCode='42' versionName='0.1.42' compileSdkVersion='36'
Verified using v2 scheme (APK Signature Scheme v2): true
AAB assinado.
```

E o controle que justifica a conferência: o **mesmo build sem as variáveis da
chave termina em verde**, com um `AVISO:` no log e um arquivo chamado
`app-release-unsigned.apk`. É exatamente o pacote que a Play Console recusa
depois. Por isso o workflow para quando o segredo falta, e por isso ele exige
que o arquivo assinado exista pelo nome que ele tem quando é assinado.

**O envio para a Play Console não está automatizado**, e isso é deliberado: a
primeira versão de um app novo não pode subir por API — a Play exige o painel,
com a ficha da loja preenchida. O passo está escrito e desligado no fim do
arquivo, com as três coisas que faltam.

## As duas revisões que podem recusar

**Apple, diretriz 4.2 — "app que é só um site".** É o risco real de um
invólucro. A resposta do Synse não é retórica: Live Activity com a série e o
cronômetro de descanso na Dynamic Island, GPS em segundo plano do SynseRun, e a
balança Bluetooth do Synse Body. Nenhuma delas existe num site. O plugin de
`native/synse-workout-activity` precisa estar **funcionando no aparelho** antes
da primeira submissão — não basta compilar.

**Ambas as lojas, pagamento digital.** Era o risco em aberto; hoje está
resolvido para a primeira submissão, e vale saber como.

A auditoria de 17/10 encontrou o Synse+ sendo vendido dentro do app por
assinatura no Mercado Pago, destravando só conteúdo digital — exatamente o que
as duas reservam para a cobrança delas, e recusa certa na revisão.

A saída não foi tirar a venda, foi **separar os dois mundos**: o app e o site
são o mesmo site, e o servidor agora sabe por onde está sendo aberto. Na web a
venda segue igual, sem comissão; dentro do app não há preço nem botão. Sem
caminho de compra não há o que recusar.

A cobrança pela loja está construída e desligada, esperando produto cadastrado
e um aparelho — ver "A cobrança do Synse+ pelas lojas", acima. A mensalidade da
academia nunca entrou nesta regra: serviço físico, consumido fora do app.

## O que não foi verificado

- **iOS nunca foi compilado.** O projeto agora está descrito para compilar — e
  descrever não é compilar. O primeiro build na CI é que vai dizer.
- **A extensão da Live Activity nunca foi carregada.** O target existe, o
  `.appex` é embutido e o `codemagic.yaml` confere que ele entrou no `.ipa`. Se
  o cartão aparece na tela bloqueada, só um iPhone diz.
- **O plugin nativo nunca rodou num aparelho.** Compila no Android; se a Live
  Activity aparece de verdade na Dynamic Island, ninguém viu ainda.
- **App Links não foi verificado de ponta a ponta**, porque depende de um app
  publicado e de uma digital real.
- **Nenhuma compra pela loja foi processada.** O código existe inteiro e tem
  155 testes — inclusive com cadeias de certificados geradas de verdade para
  provar a verificação da Apple. O que ele não tem é uma execução real: sem
  produto cadastrado e sem aparelho, não há como saber se a loja manda os
  campos que este código espera.
- **O trabalho `pacote` nunca rodou.** O guarda rodou: `compilar` passou num
  runner do GitHub em 2m47s, com `npm ci`, pacotes do SDK, `cap sync` e o build
  de debug verdes. O que o runner ainda não exercitou é o caminho da chave — o
  `base64 -d` do segredo, a assinatura e o artefato —, porque isso depende dos
  quatro segredos, que são seus. O build de release em si rodou aqui, com chave
  descartável, e a conferência de assinatura passou nos dois pacotes.
