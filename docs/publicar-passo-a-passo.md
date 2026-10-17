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

## Fase 0 — O site no ar. Isto vem primeiro, sem exceção

**O aplicativo é um invólucro: ele carrega `https://synse.com.br`.** Se o site
não estiver no ar e funcionando quando o revisor abrir o app, ele vê uma tela de
erro — e isso é recusa nas duas lojas, não "quase".

### 0.1 Supabase **VOCÊ**

1. Criar o projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, colar as migrations de `src/db/migrations/` **em ordem
   numérica, uma por vez**, de `0001` até `0060`. Cada uma se registra sozinha
   em `schema_migrations`; colar fora de ordem quebra dependência de tabela.
3. As de `0053` a `0060` são as mais recentes e nunca foram aplicadas em lugar
   nenhum.

> **Por que à mão.** A Vercel publica o código no push; o SQL não vai com ele.
> Entre um e outro, o código novo fala com o banco velho — por isso toda leitura
> tolera coluna ausente. Mas tolerar não é funcionar.

### 0.2 Variáveis na Vercel **VOCÊ**

Em *Settings → Environment Variables*, os nomes estão em `.env.example`. Os que
travam publicação se faltarem:

| Variável | Onde consegue |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → *Project Settings → API* |
| `SUPABASE_SERVICE_ROLE_KEY` | idem — **só no servidor**, nunca em `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | `https://synse.com.br` |
| `NEXT_PUBLIC_LEGAL_ENTITY`, `NEXT_PUBLIC_LEGAL_TAX_ID`, `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_LEGAL_CONTACT` | seus dados — **as duas lojas exigem identificação legal na política de privacidade** |
| `CRON_SECRET` | você sorteia |

`PAYMENT_PROVIDER` fica em `mock`: não há provedor escolhido, e não há cobrança
real para fazer ainda.

### 0.3 Conferir **VOCÊ**

```
https://synse.com.br/api/health?deep=1
```

Tem de voltar `pendingMigrations` **vazio**. Se vier com números, falta colar
aquelas migrations — volte ao 0.1 antes de seguir.

E abrir `https://synse.com.br/privacidade` no celular: precisa carregar e
precisa ter sua identificação legal. É o endereço que as duas lojas pedem no
formulário.

**Só depois disto a Fase 1 faz sentido.**

---

## Fase 1 — Android: a chave de assinatura

**Uma vez na vida do produto.** Perder esta chave é não poder mais atualizar o
app. Vazá-la é outra pessoa poder assinar em seu nome.

### 1.1 Gerar **VOCÊ**

Precisa de um computador com Java — **qualquer sistema**, Windows ou Linux
serve. Isto é a única coisa aqui que não é problema de Mac.

```bash
keytool -genkey -v -keystore synse-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 -alias synse
```

Ele pergunta uma senha e alguns dados de identificação. Guarde `synse-release.jks`
**e as duas senhas** num gerenciador de senhas, com cópia. Não no Drive sem
senha, não em anexo de e-mail, não no repositório.

> **Se você não tem nenhum computador:** peça emprestado por dez minutos, ou use
> Termux no Android com `pkg install openjdk-17`. O que não vale é a chave passar
> por um chat ou aparecer num log de build público — e logs deste repositório são
> públicos.

### 1.2 Virar texto **VOCÊ**

Segredo do GitHub é texto; keystore é binário.

```bash
base64 -w 0 synse-release.jks    # Linux/Termux
base64 -i synse-release.jks      # macOS
```

### 1.3 Os quatro segredos **VOCÊ**

GitHub → *Settings → Secrets and variables → Actions → New repository secret*:

| Segredo | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | a saída do comando acima, inteira |
| `ANDROID_KEYSTORE_PASSWORD` | a senha do keystore |
| `ANDROID_KEY_ALIAS` | `synse` |
| `ANDROID_KEY_PASSWORD` | a senha da chave (igual à do keystore, se você deixou igual) |

O GitHub guarda cifrado e não devolve. **Isto serve para assinar, não é cópia de
segurança.** A cópia é sua, no gerenciador de senhas.

Em repositório público, o segredo não é entregue a workflow disparado por pull
request de fork — ninguém abre um PR para roubar a chave.

---

## Fase 2 — Android: gerar o pacote **VOCÊ**, dois cliques

1. GitHub → aba **Actions** → workflow **Android — pacote assinado** → botão
   **Run workflow**.
2. Esperar ~4 minutos.
3. Baixar o artefato `synse-android-…` no fim da página do run. Dentro:
   `app-release.aab` (o que a Play aceita) e `app-release.apk` (para instalar
   num aparelho e testar).

O workflow **confere a assinatura dos dois pacotes antes de guardá-los**, e para
com erro se o segredo da chave estiver faltando. Isso existe porque sem chave o
Gradle termina em **verde** e entrega um pacote sem assinatura — que a Play
recusa depois, longe daqui.

**O `versionCode` sai do contador de execuções do Actions**, que nunca repete. A
Play recusa `versionCode` repetido e não aceita voltar atrás, então não há o que
controlar à mão.

Antes de subir, instale o APK num Android e abra: é a hora mais barata de
descobrir que a Fase 0 ficou pela metade.

```bash
adb install -r app-release.apk
```

---

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

## A decisão que ainda está em aberto, e ela muda código

**Se a assinatura do aluno for vendida dentro do app, Apple e Google exigem a
compra pela loja delas, com a comissão que vem junto.** Se a compra for fora —
PIX pelo navegador — não pode haver botão, link nem menção a pagamento dentro do
app, e as duas lojas verificam isso.

Hoje o provedor é `mock` e o Synse Pay está engavetado, então **nada vende dentro
do app** e você pode publicar sem decidir. Mas essa é a última hora em que isso é
verdade de graça: no dia em que houver cobrança real, a decisão muda o que
precisa ser construído. Ver `docs/pre-producao.md`.

---

## Resumo em uma tabela

| # | O quê | Quem | Custo | Trava o quê |
| --- | --- | --- | --- | --- |
| 0.1 | Supabase + migrations 0001–0060 | VOCÊ | grátis | **tudo** |
| 0.2 | Variáveis na Vercel | VOCÊ | grátis | tudo |
| 0.3 | `/api/health?deep=1` limpo | VOCÊ | — | tudo |
| 1 | Chave de assinatura + 4 segredos | VOCÊ | grátis | Fase 2 |
| 2 | Rodar o workflow, baixar o AAB | VOCÊ | grátis | Fase 3 |
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

---

## O que ainda não existe, e você vai perguntar

Honestidade sobre o que este roteiro **não** entrega:

- **Botões da Live Activity** (pular descanso, +30 s). Não implementados:
  exigem `LiveActivityIntent` e um App Group criado no portal da Apple. Fazer
  antes de ver o cartão num iPhone é escrever contra uma suposição.
- **Widget de tela inicial.** Não existe. Entra numa linha do `WidgetBundle`
  quando houver.
- **A notificação de treino no Android nunca foi vista em aparelho.** O serviço
  compila e está no manifesto; ninguém abriu.
- **Nenhum commit desta etapa foi revisado pelo Codex** — o binário não está
  instalado neste contêiner.
