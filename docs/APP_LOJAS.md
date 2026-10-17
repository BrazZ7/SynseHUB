# Synse nas lojas — o que está pronto e o que falta

O app é um invólucro Capacitor que carrega `https://synse.com.br`. A decisão e o
risco dela estão comentados em `capacitor.config.ts`; este documento é a parte
operacional.

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
- **`compilar`** — automático, a cada push ou PR que toque `android/`,
  `native/`, `mobile/` ou o Capacitor. Compila o debug, sem chave nenhuma, e
  não guarda nada. É só a pergunta "o Kotlin ainda compila?".

O segundo existe por causa do iOS: a Live Activity passou meses chamando um tipo
que não existia, e ninguém soube porque aquele código nunca era compilado. Com o
guarda, código nativo que não compila aparece no push, não na véspera de
publicar.

**Um commit, uma compilação.** Branch com PR aberto dispara `push` e
`pull_request` no mesmo commit — e no primeiro push deste arquivo saíram dois
runs idênticos, os dois verdes, compilando o mesmo debug em dois runners. O agrupamento do `concurrency` é por trabalho justamente por
isso: o guarda se cancela (só a cabeça do branch interessa, e o run duplicado
morre em segundos), e o `pacote` tem grupo próprio que **nunca** é cancelado,
para um push que chegue no meio não matar um pacote de loja.

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

**Ambas as lojas, pagamento digital.** Se a assinatura do aluno for vendida
dentro do app, Apple e Google exigem a compra pela loja delas, com a comissão
que vem junto. Essa decisão — compra dentro do app ou PIX pelo navegador — ainda
está em aberto, e ela muda o que precisa ser construído. Ver `docs/pre-producao.md`.

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
- **O trabalho `pacote` nunca rodou.** O guarda rodou: `compilar` passou num
  runner do GitHub em 2m47s, com `npm ci`, pacotes do SDK, `cap sync` e o build
  de debug verdes. O que o runner ainda não exercitou é o caminho da chave — o
  `base64 -d` do segredo, a assinatura e o artefato —, porque isso depende dos
  quatro segredos, que são seus. O build de release em si rodou aqui, com chave
  descartável, e a conferência de assinatura passou nos dois pacotes.
