# @synse/workout-activity

Plugin Capacitor que leva o Treino Ativo para a tela bloqueada: Live Activity e
Dynamic Island no iOS, ongoing notification no Android.

## Estado

**O código deste diretório não é compilado pelo build da web.** Ele depende de
um invólucro Capacitor que o repositório ainda não tem — não existem `ios/` nem
`android/` gerados, nem conta de desenvolvedor configurada. O que está aqui é a
implementação pronta para quando o invólucro for criado, e o contrato que a web
já usa hoje: `src/features/active-workout/platform/native-bridge.ts` procura o
plugin na janela e cai no adaptador web quando não o encontra.

Ou seja: **a aplicação funciona hoje sem nada disto**, com o alcance menor que
a web permite. Ligar o nativo não exige mexer no engine nem na tela.

## Por que Capacitor, e não React Native

A decisão foi tomada olhando o que o projeto já é, não o que seria mais
moderno começar do zero.

O SynseHub é Next.js 15 com App Router, RSC e Server Actions. Painel da
academia e app do aluno compartilham o mesmo roteador, o mesmo design system,
a mesma camada de dados (`getDataSource`) e as mesmas server actions. Migrar
para React Native significaria reescrever a camada de apresentação inteira do
app do aluno e manter duas implementações da mesma regra — exatamente o que a
separação entre engine e interface existe para evitar.

Capacitor embrulha a aplicação web que já existe e dá acesso nativo por
plugins. O custo é um plugin por recurso nativo; o ganho é que nada da web
precisa mudar.

**O ponto que decidiu:** Live Activity e Dynamic Island não são componentes de
interface que um framework desenha. São uma extensão WidgetKit separada,
escrita em SwiftUI, que o sistema renderiza fora do processo do app. React
Native também exigiria essa extensão em Swift. Não há caminho que evite o
código nativo — então o critério passou a ser qual abordagem preserva mais do
que já funciona, e aí Capacitor ganha sem empate.

## Instalação, quando o invólucro existir

```bash
npm i @capacitor/core @capacitor/cli
npx cap init SynseHub br.com.synse.app
npx cap add ios && npx cap add android
```

Com `output: 'export'` desativado, a aplicação continua servida do domínio —
o invólucro aponta para `https://synse.com.br` via `server.url`. Isso mantém
uma publicação só e evita a revisão da Apple a cada correção de texto.

## Contrato

Registrado como `SynseWorkoutActivity`. Payload em
`src/features/active-workout/platform/types.ts` (`LiveWorkoutState`).

| Método | iOS | Android |
| --- | --- | --- |
| `isSupported()` | `ActivityAuthorizationInfo().areActivitiesEnabled`, iOS 16.1+ | sempre true, API 26+ |
| `requestPermission()` | Live Activities nos Ajustes + `UNUserNotificationCenter` | `POST_NOTIFICATIONS` (API 33+) |
| `start(state)` | `Activity.request(...)` | inicia o foreground service |
| `update(state)` | `activity.update(...)` | `notify()` com o mesmo id |
| `restFinished(state)` | `update` + alerta | `notify()` com som/vibração |
| `stop()` | `activity.end(dismissalPolicy: .immediate)` | encerra o service |
| evento `remoteAction` | App Intent (iOS 17+) | `PendingIntent` do botão |

### O cronômetro atravessa como instante, não como contagem

`restEndsAt` vai em epoch ms e vira `Date` nos dois lados. É o que permite ao
`Text(timerInterval:)` do SwiftUI e ao `setChronometerCountDown` do Android
animarem o contador **sozinhos**, sem o app acordar a cada segundo. Mandar a
string "01:18" exigiria uma atualização por segundo — o iOS limita a frequência
de atualização de Live Activity, e no Android gastaria bateria à toa.

## Limites reais, não contornáveis

- **Botão na Live Activity exige iOS 17+.** Em 16.1–16.4 o cartão aparece e
  informa, mas não recebe toque: tocar abre o app. Não há como contornar.
- **A Live Activity dura no máximo 8 horas** e o sistema pode encerrá-la antes.
  Treino longo demais perde o cartão — o app continua correto porque o estado
  vem do `restEndsAt` gravado, não do cartão.
- **A Dynamic Island só existe no iPhone 14 Pro em diante.** Nos demais o
  conteúdo aparece só na tela bloqueada. A mesma `ActivityConfiguration`
  atende os dois; não há código separado.
- **Android 12+ atrasa o início de foreground service** quando o app está em
  segundo plano. Por isso o service é iniciado no toque de "Começar treino",
  com o app em primeiro plano, e não quando o descanso começa.
- **Vibração no iOS** só sai por notificação; não há API de vibração
  arbitrária para um app em segundo plano.
