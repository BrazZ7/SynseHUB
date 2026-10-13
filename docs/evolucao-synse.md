# Evolução do Synse — acompanhamento

Documento de trabalho da evolução pedida em 13/10/2026: entrada clara para
aluno e academia, Home "Seu dia", execução confiável de treino, widgets e tela
bloqueada, resumo semanal, jardim pessoal, recursos de comunidade e
instrumentação.

Ele não é um plano: é o registro do que foi **medido**, do que foi **mudado** e
do que **continua pendente**. Atualizado durante o trabalho, não no fim.

## Como ler

Três marcações, e a diferença entre elas é o ponto deste documento:

- **FATO** — observado no código, no banco ou numa execução. Tem arquivo e
  linha, ou saída de comando.
- **HIPÓTESE** — plausível e não verificada. Não serve de base para afirmar
  que algo funciona nem que algo falta.
- **BLOQUEIO** — depende de acesso, credencial ou ambiente que não existe aqui.

Status de cada requisito, conforme pedido:

| Status | Significa |
| --- | --- |
| `IMPLEMENTADO E TESTADO` | existe, e há teste automatizado que falha se for removido |
| `IMPLEMENTADO, VALIDAÇÃO PENDENTE` | existe e roda, sem teste que o proteja ou sem validação no ambiente que importa |
| `BLOQUEADO POR DEPENDÊNCIA EXTERNA` | o código local está feito, falta algo fora deste ambiente |
| `NÃO IMPLEMENTADO` | não existe |

## Medição inicial

Tirada **antes** de qualquer alteração desta etapa, no commit `e560a01`, para
que a comparação depois seja honesta. Máquina: contêiner da sessão, Node local,
sem rede para o Supabase de produção.

| O quê | Como foi medido | Resultado |
| --- | --- | --- |
| Build de produção | `rm -rf .next && time npm run build` | **1m49,7s**, 101 rotas, sem erro |
| Suíte completa | `time npm test`, com Postgres de teste no ar | **169 arquivos, 2031 testes, 0 pulados, 112,75s** |
| JS compartilhado por todas as rotas | tabela do `next build` | **102 kB** |
| Middleware | idem | **151 kB** |
| Home do aluno (`/app`) | idem | 6,12 kB · **156 kB** de primeira carga |
| Treino ativo (`/app/workout/active`) | idem | 13,8 kB · **131 kB** |
| Rotas mais pesadas | idem | `/app/run/[id]` **252 kB**, `/app/corpo` **246 kB**, `/app/progress` **231 kB** |

**FATO** — as três rotas mais pesadas do app do aluno passam de 230 kB de
primeira carga; a mediana das outras fica perto de 117 kB. O gargalo é o pacote
de gráficos, não o jardim (o jardim é SVG inline, `src/features/students/plant.ts`).

**HIPÓTESE** — não há medição de tempo de resposta em aparelho real nem em rede
móvel. Nada aqui autoriza falar de "tempo de carregamento no celular": a tabela
acima mede bytes de JavaScript, não segundos na mão de ninguém. Medir isso exige
aparelho e rede, e está registrado como bloqueio.

## Matriz da auditoria

Colunas conforme pedido. Os casos confirmados têm detalhamento logo abaixo da
tabela; a tabela é índice, não é o laudo.

| REQUISITO | EXISTE? | ARQUIVOS/FLUXO | PROBLEMA CONFIRMADO | AÇÃO | TESTE DE ACEITE |
| --- | --- | --- | --- | --- | --- |
| 1. Entrada "sou aluno" | **Corrigido** | `src/app/(auth)/login/page.tsx`, `src/app/page.tsx` | Sim — D1: o `/login` só falava de academia | Texto reescrito; fluxo intacto | 21 ✔ |
| 1. Entrada "tenho uma academia" | Sim | idem | Não | — | 21 |
| 1. Escolha visual não concede permissão | Sim | `account-type-picker.tsx` só navega; papel vem de `organization_members` | Não | — | 21, 26 |
| 1. Troca de contexto para quem tem vários papéis | **Corrigido** | `src/features/auth/portas.ts`, `outra-porta.tsx` | Sim — D2: só conta de plataforma via o seletor | `OutraPorta` nas duas cascas | 21 ✔ |
| 1. Destino após login respeita vínculo | Sim | `src/lib/auth/require-session.ts`, `login/page.tsx:18` | Não | — | 21 |
| 1. Recuperação de acesso | Sim | `src/features/auth/recuperar-senha-form.tsx`, `nova-senha-form.tsx` | Não | — | 21 |
| 2. Home "Seu dia" | Sim | `src/app/(student)/app/page.tsx:121` | Não confirmado | Revisar estados vazios | 22 |
| 2. Atalhos sem tela vazia | Sim | idem — Treino, Correr, Alimentação | Não; **não** existe atalho de Sono, e isso está certo (não há recurso de sono) | — | 22 |
| 3. Máquina de estados do treino | Sim | `src/features/active-workout/engine/` (7 estados) | Não | — | 1–8 |
| 3. Uma conclusão por toque | Sim | `use-active-workout.ts:77` + `clientId` + `unique (session_id, client_id)` | Não | — | 2, 3 |
| 3. Snapshot do treino na sessão | **Corrigido** | `engine/types.ts:75` (cliente) + 0057 (servidor) | Sim — D9: o servidor não tinha retrato, e `workout_session_exercises` estava vazia | Retrato gravado na abertura | — |
| 3. Treino concluído chega ao histórico | **Corrigido** | `encerramento.ts`, `active-workout-screen.tsx` | Sim — D10: `finish_workout_session` não tinha chamador alcançável | "Fechar" encerra; a recuperação também | — |
| 3. Desfazer conclusão | **Corrigido** | `engine` (`UNDO_SET`), 0058, `ordem.ts` | Sim — D3: não existia | Desfazer com reversão no banco | 9 ✔ |
| 7. Dados locais separados por usuário | **Corrigido** | `storage/escopo.ts`, `local-workout.ts` | Sim — D4: chave única para todos | Escopo por matrícula; versão 2 descarta o sem dono | 14 ✔, 15 ✔ |
| 7. Política de duas abas/dispositivos | **Corrigido** | `storage/comando.ts`, 0059 | Sim — D5: não havia política | Manda quem abriu a tela; série de outro lugar desloca | 13 ✔ |
| 7. Tempo de descanso por instante de término | Sim | `restEndsAt`, `reidratar` | Não | — | 10, 11 |
| 7. Fila offline durável | Sim | `storage/local-workout.ts`, `sync.ts` | Não | — | 12 |
| 4. Live Activity iOS (código) | Sim | `native/synse-workout-activity/ios/` (414 linhas Swift) | Sim — D6: **não há target de Widget Extension** no Xcode | Criar o target | 18 |
| 4. Notificação em andamento Android | Sim | `native/.../WorkoutService.kt` (342 linhas), manifest `:48` | Não confirmado | Validar em aparelho | 18, 20 |
| 4. Widget de tela inicial (iOS/Android) | **Não** | — | Sim — D7: não existe `AppWidgetProvider` nem WidgetKit de home | Decidir escopo | 16–20 |
| 5. Resumo semanal | Parcial | `src/app/(student)/app/page.tsx:175`, `progress/page.tsx` | Não confirmado | Auditar fuso e contagem dupla | 23 |
| 6. Jardim pessoal | Sim | `src/features/students/plant.ts`, `components/plant-panel.tsx` | Não confirmado | Auditar recompensa dupla | 24 |
| 7/11. Comunidade | Parcial | `app/friends`, `app/challenges`, `app/schedule`, eventos (0056) | Não confirmado | Incrementos por recurso | 25 |
| 8. Instrumentação | **Não** | — | Sim — D8: nenhum evento, em nenhum lugar | Implementar com consentimento | — |
| Isolamento entre academias | Sim | RLS em todas as tabelas + `tests/db/` | Não | — | 26 |
| Autorização no servidor | Sim | `requirePermission` + RLS | Não | — | 26 |
| `service_role` fora do cliente | Sim | `src/lib/database/supabase-admin.ts` é `server-only` | Não | — | — |

### D1 — o `/login` só fala de academia

**FATO.** `src/app/(auth)/login/page.tsx:41-43` escreve "Acesse o painel da sua
academia para acompanhar alunos, pagamentos e treinos", e o único convite a
criar conta é "Cadastre sua academia" (`:60`). O `/signup` da linha seguinte já
é neutro — "você diz apenas se tem uma academia ou se vai treinar"
(`signup/page.tsx:34`) — e o `AccountTypePicker` oferece as duas portas.

Ou seja: o fluxo está certo e **o texto da porta de entrada está errado**. Quem
chega como aluno lê uma tela de software de gestão e conclui que errou o
endereço. Isto bate com a observação externa citada no pedido, e o diagnóstico
dela ("a área autenticada enfatiza gestão") não se sustenta: a área autenticada
do aluno existe e é inteira.

### D2 — a troca de contexto só aparece para conta de plataforma

**FATO.** `context-bar.tsx:21` começa com `if (!session.isPlatformAccount) return null`.
A dona de uma academia que também é aluna dela tem papel de hub em
`organization_members` **e** `studentId` na sessão: `requireHubSession` aceita,
`requireStudentSession` também. As duas portas abrem e nenhuma tela oferece a
passagem — só funciona digitando a URL.

### D3 — desfazer não existe

**FATO.** `grep -rn "desfazer\|undo\|UNDO" src/features/active-workout/` não
devolve nenhuma implementação. O `WorkoutEvent` (`engine/types.ts:102`) tem
`COMPLETE_SET` e não tem o inverso. Uma conclusão acidental fica registrada: na
tela, na fila de sincronização e no banco.

### D4 — os dados locais do treino não têm dono

**FATO.** `storage/local-workout.ts:22-26` guarda a sessão num banco
(`synse-workout`) e numa chave (`atual`) iguais para qualquer pessoa, e
`WorkoutSession` (`engine/types.ts:75`) não tem campo de dono. A recuperação
(`use-active-workout.ts:91`) restaura o que encontrar, conferindo só se o treino
não terminou.

Consequência em aparelho compartilhado — e também no celular de quem troca de
conta: quem entra depois vê o treino de quem entrou antes, com nome do plano,
exercícios, cargas e séries. E a fila pendente, que também é global, sobe para o
servidor pela sessão de **quem está logado agora**: as séries de A entram no
histórico de B. É dado de saúde atribuído à pessoa errada.

Este é o item de maior risco da auditoria e por isso é o primeiro a ser
corrigido.

### D9 — `workout_session_exercises` nunca recebeu uma linha

**FATO.** A tabela existe desde a 0026 e nada no repositório insere nela —
conferido com `grep -rn workout_session_exercises src/`. O gatilho
`workout_set_progress`, cuja razão de existir é marcar o exercício como
concluído quando a última série prevista entra, procurava a linha, não achava, e
atualizava zero linhas. Sem erro e sem log.

Encontrado ao escrever a reversão do desfazer: a reversão desfazia algo que
nunca era feito. Corrigido na 0057, que também resolve o retrato da prescrição
pedido no item 6 — o treinador que edita a ficha no meio do treino não muda mais
o que a sessão em andamento considera previsto.

### D10 — o treino concluído não chegava ao histórico

**FATO.** `encerrar('COMPLETED')` tinha um único chamador na tela: o botão
"Concluir treino", no painel de fim de exercício, no ramo "não há próximo
exercício". Esse ramo é inalcançável — a última série do último exercício vai
direto para `WORKOUT_COMPLETED`, então `EXERCISE_COMPLETED` só existe quando
**há** próximo exercício. Provado em `tests/unit/active-workout/engine.test.ts`.

`finish_workout_session` nunca era chamada no caminho normal. A sessão ficava
`IN_PROGRESS` no servidor até a regra das oito horas (0047) marcá-la como
`ABANDONED`, e `listWorkoutSessions` filtra `status = 'COMPLETED'`: a pessoa
treinava uma hora, apertava "Fechar" no resumo — que só limpava o aparelho — e o
histórico dela continuava vazio.

É o defeito mais caro dos encontrados nesta etapa, e ele não aparecia na
demonstração, onde a semente já traz treinos concluídos.

### D5 — duas abas não têm política

**FATO.** Nada no código trata duas abas ou dois aparelhos. Duas abas abertas
compartilham o mesmo IndexedDB e nenhuma delas sabe da outra: a última a gravar
vence, e pode sobrescrever uma sessão com séries que a outra registrou.

### D6 — o Live Activity não tem onde rodar

**FATO.** `native/synse-workout-activity/ios/Sources/SynseWorkoutLiveActivity.swift`
tem 229 linhas com `struct SynseWorkoutLiveActivity: Widget` e
`ActivityConfiguration`. `ios/App/App.xcodeproj/project.pbxproj` tem um único
target de aplicativo (`App`) e nenhuma ocorrência de `WidgetExtension` nem de
`com.apple.widgetkit-extension`. Live Activity exige extensão própria: o Swift
existe e **compila para nada**.

**BLOQUEIO.** Criar o target é editável aqui; compilar e ver na tela bloqueada
exige macOS com Xcode e um iPhone. Fica separado no relatório final.

### D7 — não há widget de tela inicial

**FATO.** `grep -rln "AppWidgetProvider\|appwidget" android/ native/` não devolve
nada. O que existe no Android é notificação de serviço em primeiro plano
(`WorkoutService.kt`), que é a superfície de "treino em andamento" — não é
widget de tela inicial.

### D8 — não há instrumentação

**FATO.** `grep -rln "analytics\|posthog\|plausible\|gtag(" src/` não devolve
nada. Existe `logger` técnico (`src/lib/logger.ts`), usado para erro e evento de
sistema, e nenhum indicador de produto: não há como responder "quantos treinos
iniciados viram concluídos".

## Decisões

### 2026-10-13 — o dado local sem dono é descartado, não adotado

Ao escopar o armazenamento local por aluno, o que já estava gravado no aparelho
não tem como ser atribuído: nada no registro antigo diz de quem ele é.

Adotá-lo para quem abrir o app primeiro seria cometer de novo, uma última vez, o
defeito que a mudança corrige — e num aparelho compartilhado isso poria as
séries de uma pessoa no histórico de outra. Descartar perde, no pior caso, um
treino não sincronizado.

Descarta. Atribuição errada em dado de saúde é pior que registro perdido, e o
produto ainda não está nas lojas (`docs/APP_LOJAS.md`, `docs/pre-producao.md`),
então o pior caso é hipotético. A limpeza acontece no `onupgradeneeded` da
versão 2 do IndexedDB: roda uma vez por aparelho, dentro da transação de
atualização, sem nenhum caminho de leitura precisar saber que ela existiu.

Alternativa considerada e recusada: perguntar à pessoa ("encontramos um treino
não enviado neste aparelho; é seu?"). É a resposta ideal de produto para uma
tela que nunca mais apareceria depois da atualização.

### 2026-10-13 — a série que chega de dois lugares desloca, não é recusada

`unique (session_id, exercise_id, set_number)` recusava a segunda "série 3" do
mesmo exercício. A restrição está certa no que quer dizer; o jeito de aplicá-la
estava errado, porque a segunda série tem `client_id` próprio, de um toque que
aconteceu — duas abas, ou o celular e o tablet, cada um contando por conta
própria. Recusada, a fila insistia oito vezes e a tela dizia "uma série não pôde
ser enviada" para uma série que a pessoa fez.

Agora ela entra no próximo número livre daquele exercício. Isso **muda uma
política que estava testada**: o teste que exigia a recusa foi reescrito, com o
registro do que havia antes.

Considerado e recusado: comparar `completed_at` para adivinhar se é a mesma
série física. Heurística que descarta errado apaga em silêncio uma série real, e
o item 7 do pedido é explícito sobre isso.

### 2026-10-13 — o custo do lado da academia não entrou na entrada

O item 4 pede explicar o que é gratuito e o que exige contratação "com base nas
regras reais". O código conhece o percentual sobre os pagamentos
(`organization_billing_settings`) e não conhece mensalidade de painel. A entrada
afirma apenas o que se sustenta — o aplicativo do aluno é gratuito — e nada
sobre preço de academia: publicar uma descrição do modelo comercial é decisão do
dono do produto.

### 2026-10-13 — `create or replace` parte sempre da versão mais recente

A 0057 reescreveu `start_workout_session` a partir do corpo da 0026 e apagou em
silêncio a regra que a 0047 havia acrescentado (abandonar treino pendurado de
oito horas). Quem pegou foi `tests/db/treino-ativo.test.ts`.

O histórico de cada função redefinida agora está no cabeçalho da migration que a
redefine — 0026 → 0047 → 0057 → 0059 para `log_workout_session` e
`log_workout_set` — com o aviso explícito de partir da última.

## Pendências e bloqueios

| Item | Natureza | Próxima ação |
| --- | --- | --- |
| Migrations 0053–0056 | BLOQUEIO (acesso ao Supabase) | Colar no SQL editor, na ordem; `/api/health?deep=1` confirma |
| Target de Widget Extension no iOS | BLOQUEIO (macOS + Xcode) | Ver "O que falta no iOS", abaixo |
| Validação em Android | BLOQUEIO (aparelho) | `WorkoutService` roda; falta ver em aparelho |
| Medição em rede móvel | BLOQUEIO (aparelho) | Sem isto, não se afirma tempo de carregamento |
| Revisão do Codex | BLOQUEIO (binário ausente) | `codex login status` quando existir; nenhum commit desta etapa foi revisado |

## O que falta no iOS, exatamente

**FATO.** `ios/App/App/Info.plist` já declara `NSSupportsLiveActivities` e
`NSSupportsLiveActivitiesFrequentUpdates`. O Swift da Live Activity existe e
está completo: `native/synse-workout-activity/ios/Sources/` tem o `Widget` com
`ActivityConfiguration` (229 linhas), o plugin Capacitor (157) e os atributos
(28). `ios/App/App.xcodeproj/project.pbxproj` tem **um** target de aplicativo
(`App`) e nenhuma ocorrência de `WidgetExtension` nem de
`com.apple.widgetkit-extension`.

Live Activity exige uma extensão própria. Sem o target, o Swift compila para
nada: não há como a atividade aparecer na tela bloqueada.

**Por que não foi criado aqui.** O `project.pbxproj` é um grafo de objetos com
identificadores de 24 dígitos hexadecimais e referências cruzadas entre
`PBXNativeTarget`, `PBXBuildFile`, `XCConfigurationList` e os
`embedAppExtensions`. Editá-lo à mão sem Xcode para validar produziria, no
melhor caso, um projeto que abre com erro — e aí o aplicativo inteiro para de
compilar, não só o widget. Um projeto quebrado é pior que um widget ausente.

**Os passos, para quem tiver macOS:**

1. Xcode → File → New → Target → **Widget Extension**, nome
   `SynseWorkoutWidget`, com "Include Live Activity" marcado.
2. Apagar os arquivos de exemplo do target e adicionar, por referência, os três
   de `native/synse-workout-activity/ios/Sources/`.
3. `SynseWorkoutAttributes.swift` precisa estar nos **dois** targets (o
   aplicativo e a extensão): é o contrato entre eles.
4. App Group igual nos dois, para o plugin e o widget se encontrarem.
5. Conferir que o `Info.plist` da extensão tem
   `NSExtensionPointIdentifier = com.apple.widgetkit-extension`.
6. Rodar em aparelho físico. Live Activity não aparece no simulador de forma
   confiável, e "funciona com a tela bloqueada" é afirmação que exige aparelho.
