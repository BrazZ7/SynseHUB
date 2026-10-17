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
| Assinatura de release | Configurada, lendo chave de fora do repositório |
| Versão | `SYNSE_VERSION_CODE` / `SYNSE_VERSION_NAME` por variável de ambiente |
| App Links | Manifesto declara o domínio; `/.well-known/assetlinks.json` serve o outro lado |
| Projeto iOS | Dois targets (app + extensão da Live Activity) e scheme compartilhado. **Nunca compilado** — o build é na CI, ver abaixo |
| Build do iOS sem Mac | `codemagic.yaml`: compila, assina e sobe ao TestFlight num Mac alugado por minuto |

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
falhar aqui impediria alguém de simplesmente compilar o projeto.

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
