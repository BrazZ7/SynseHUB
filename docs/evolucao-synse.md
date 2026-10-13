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

### Medição final, no fim da etapa

Mesma máquina, mesmos comandos, commit `a320c7b`. A comparação existe para não
prometer melhoria que não houve: **esta etapa não foi de desempenho**, e os
números confirmam que ela também não custou desempenho.

| O quê | Antes (`e560a01`) | Depois (`a320c7b`) | Diferença |
| --- | --- | --- | --- |
| Build de produção | 1m49,7s | 1m39,4s | −10s (ruído de máquina) |
| Suíte | 169 arq. / 2031 testes / 112,8s | **184 arq. / 2243 testes** / 122,1s | +15 arquivos, **+212 testes** |
| JS compartilhado | 102 kB | 102 kB | igual |
| Middleware | 151 kB | 151 kB | igual |
| `/app` (home) | 6,12 kB · 156 kB | 6,11 kB · 156 kB | igual |
| `/app/workout/active` | 13,8 kB · 131 kB | 13,0 kB · 133 kB | **+2 kB** de primeira carga |
| `/app/workout` | 4,11 kB · 117 kB | 1,97 kB · 117 kB | −2,1 kB na rota |
| `/app/progress` | 3,97 kB · 231 kB | 4,25 kB · 232 kB | +1 kB |
| Rotas | 101 | 101 | igual |

Os +2 kB do Treino Ativo são o desfazer, o aviso entre abas e o painel de
"aberto em outra aba". É o custo de três recursos, e não uma regressão.

**O que continua não medido:** tempo de resposta em aparelho e em rede móvel.
Nada aqui autoriza afirmar quanto a tela demora na mão de alguém — a tabela mede
bytes de JavaScript. Medir isso exige aparelho, e está na lista de bloqueios.

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

## Os 26 aceites, um por um

Onde cada um está, e o que ele ainda não cobre. "Automatizado" é teste que roda
em `npm test`; "em aparelho" é o que exige celular e não foi feito aqui.

### Motor de treino

| # | Aceite | Onde | Como foi verificado |
| --- | --- | --- | --- |
| 1 | Conclusão inicia um único descanso | `tests/unit/active-workout/engine.test.ts` | Automatizado |
| 2 | Dois toques rápidos, uma conclusão | idem + `use-active-workout.ts:77` | Automatizado (engine); a trava de interface não |
| 3 | Reenvio continua idempotente | `sync.test.ts`, `tests/db/treino-ativo.test.ts` | Automatizado, inclusive no banco |
| 4 | "+15 s" altera o término | `engine.test.ts` (o produto usa 30 s) | Automatizado |
| 5 | Retomada antecipada segue a transição | `engine.test.ts` | Automatizado |
| 6 | Fim do descanso não registra a próxima série | `engine.test.ts` | Automatizado |
| 7 | Última série avança para o exercício certo | `engine.test.ts` | Automatizado |
| 8 | Último exercício conclui o treino uma vez | `engine.test.ts` + `encerramento.test.ts` | Automatizado |
| 9 | Desfazer restaura e corrige efeito derivado | `engine.test.ts`, `tests/db/desfazer-serie.test.ts` | Automatizado, 17 testes de banco |
| 10 | Recarregar no descanso mantém o tempo | `engine.test.ts` (`reidratar`) | Automatizado |
| 11 | Reabrir depois do descanso recupera o estado | idem | Automatizado |
| 12 | Offline sobrevive ao fechamento e não duplica | `armazenamento-local.test.ts`, `sync.test.ts` | Automatizado com IndexedDB de verdade |
| 13 | Duas abas/dispositivos seguem a política | `comando.test.ts`, `tests/db/serie-de-dois-lugares.test.ts` | Automatizado; o canal entre abas, não |
| 14 | Sessão expirada não apaga o não sincronizado | `armazenamento-local.test.ts` | Automatizado |
| 15 | Troca de conta não expõe registro alheio | `escopo.test.ts`, `armazenamento-local.test.ts` | Automatizado |

O 2 e o 13 têm a mesma ressalva: a parte que depende de navegador —
`setTimeout` de 400 ms e `BroadcastChannel` — não é exercitada em teste. O que
está coberto é a regra por baixo dela.

### Widgets

| # | Aceite | Situação |
| --- | --- | --- |
| 16 | Ações chegam à sessão correta | `plugin-contract.test.ts` cobre o contrato; **nenhuma ação nativa chega ao servidor hoje** |
| 17 | Comando obsoleto não altera outra série | Mesma situação do 16 |
| 18 | Tela bloqueada e segundo plano | **BLOQUEADO**: iOS sem target de extensão; Android tem o serviço e não foi visto em aparelho |
| 19 | Permissão negada mantém alternativa | `platform/web-adapter.ts` existe e a tela funciona sem Live Activity; não validado em aparelho |
| 20 | Finalização encerra a atividade | `use-active-workout.ts` chama `liveActivity.stop()`; não validado em aparelho |

### Produto

| # | Aceite | Onde | Situação |
| --- | --- | --- | --- |
| 21 | Aluno e academia chegam ao destino autorizado | `entrada-das-duas-portas.test.ts`, `tests/db/signup.test.ts` | Automatizado |
| 22 | Usuário sem treino recebe orientação útil | `src/app/(student)/app/page.tsx:155` já trata | **Não auditado tela a tela** |
| 23 | Resumo respeita datas, fuso e correções | `janelas.test.ts` | Automatizado; "sem registro" vs "nenhuma atividade" não |
| 24 | Jardim não concede recompensa duplicada | `jardim-sem-recompensa-dupla.test.ts` | Automatizado, pela estrutura |
| 25 | Compartilhamento não inclui dado privado | `share-card.test.ts` (zona de casa) | Automatizado |
| 26 | Academia alheia inacessível por id | `tests/db/auditoria-de-seguranca.test.ts` (F3, F5, F7, A1), `rls.test.ts` | Automatizado, já existia |

## Classificação de cada requisito

### IMPLEMENTADO E TESTADO

- Entrada do aluno e da academia, com o texto que não manda o aluno embora.
- Troca de contexto para quem administra e treina.
- Escopo dos dados locais por matrícula, e descarte do que não tem dono.
- Desfazer a série, com reversão de progresso do exercício, placar do desafio e
  medalha.
- Retrato da prescrição na sessão (a ficha editada no meio do treino não muda a
  sessão em andamento).
- Encerramento do treino chegando ao servidor.
- Política de duas abas e de dois aparelhos.
- Fuso e janelas da home; meta semanal contando dias treinados.
- Zona de casa no cartão de compartilhar.
- Instrumentação de produto, com catálogo, indicadores e coorte explícita.
- Marco de conteúdo (`<main>`) no app do aluno.
- Isolamento entre academias por manipulação de identificador (já existia).

### IMPLEMENTADO, VALIDAÇÃO PENDENTE

- Notificação de treino em andamento no Android: 342 linhas de Kotlin, serviço e
  permissões no manifesto. Nunca rodou em aparelho.
- Estados da Home (primeiro acesso, dia de descanso, erro de conexão, dados
  aguardando sincronização): a tela trata vários, e **não foram auditados um a
  um** nesta etapa.
- Recursos de comunidade (amigos, desafios, agenda, eventos): existem e têm
  teste próprio; não foram revisados contra os incrementos do item 11.

### BLOQUEADO POR DEPENDÊNCIA EXTERNA

- Live Activity no iPhone: falta o target de Widget Extension, que exige macOS
  com Xcode. Os passos estão na seção "O que falta no iOS".
- Migrations 0053–0060: precisam ser colada no SQL editor do Supabase.
- Medição de desempenho em aparelho e rede móvel.
- Revisão do Codex: o binário não existe neste ambiente (`command -v codex`
  vazio). **Nenhum commit desta etapa foi revisado por ele.**

### NÃO IMPLEMENTADO

- **Widget de tela inicial** (iOS e Android). Não existe `AppWidgetProvider` nem
  WidgetKit de home. É escopo próprio, e não um ajuste do que existe.
- **Exercício por duração.** `workout_exercises` tem `sets`, `reps` (texto) e
  `rest_seconds`, e nenhum campo de duração. Implementar exige coluna nova,
  migration e decisão de produto sobre como a série de tempo se conclui.
- **Circuitos e superséries.** Investigados, como o pedido pede: não existe
  agrupamento no modelo. Mudar isso é mexer na prescrição, não no motor.
- **Fonte temporal monotônica.** O descanso usa instante de parede
  (`restEndsAt`). Mudança de relógio do aparelho desloca o fim do descanso — e
  é por isso que a ordem da fila passou a usar identificador, e não carimbo de
  tempo. Tratar o relógio exigiria `performance.now()` ancorado, com
  reconciliação na volta do segundo plano.
- **"Sem registro" diferente de "nenhuma atividade"** no resumo semanal.
- **XP por volume.** `XP_POR_TREINO = 100` sem teto premia quantidade de
  treinos, e o item 10 diz "não premiar volume ilimitado de exercícios". É
  divergência confirmada e **não foi alterada**: mexer na régua de recompensa
  muda o nível de todo mundo que já usa o produto, e isso é decisão do dono.
- **Indicação de usuários** (nenhum convite ou código), e portanto o indicador
  de indicações convertidas.

## A entrega

Os dez itens pedidos, na ordem em que foram pedidos.

### 1. Resumo das mudanças reais

Nove commits. Cada um fecha um defeito confirmado ou entrega um requisito:

| Commit | O que mudou |
| --- | --- |
| `67bdd5c` | Dados locais do treino escopados por matrícula; versão 2 do banco local descarta o que não tem dono |
| `418be49` | 0057 e 0058: retrato da prescrição na sessão, e `desfazer_serie` com reversão de efeito derivado |
| `0b7bce1` | Desfazer no cliente; e o encerramento do treino, que não tinha chamador alcançável |
| `7bc188d` | 0059 e `comando.ts`: a política de duas abas e de dois aparelhos |
| `9069aed` | A entrada do aluno e da academia; a porta entre os dois lados |
| `f887c47` | 0060: eventos do produto, catálogo e indicadores |
| `02ffb32` | Zona de casa no cartão de corrida; trava do jardim contra recompensa dupla |
| `8299433` | Fuso e janelas da home; meta semanal contando dias treinados |
| `a320c7b` | `<main>` no app do aluno |

Mais `6abd03f`, que é este documento, e `80c224e`, que corrige um teste frágil
de receitas encontrado na rodada final.

### 2. Arquivos e módulos principais alterados

- `src/features/active-workout/` — `storage/escopo.ts`, `storage/ordem.ts`,
  `storage/comando.ts`, `encerramento.ts` (novos); `storage/local-workout.ts`,
  `sync.ts`, `use-active-workout.ts`, `engine/`, `actions.ts`,
  `active-workout-screen.tsx`, `state.ts`.
- `src/features/analytics/` — `eventos.ts`, `actions.ts`,
  `registrar-visita.tsx` (novos).
- `src/features/auth/` — `portas.ts`, `outra-porta.tsx` (novos).
- `src/features/students/` — `janelas.ts` (novo), `app-service.ts`.
- `src/features/synse-run/share-card.ts`, `src/features/share/cards.ts`,
  `share-button.tsx`.
- `src/lib/database/` — interface, fonte Supabase e fonte de demonstração.
- `src/app/(auth)/login/page.tsx`, `src/app/page.tsx`,
  `src/app/(student)/layout.tsx`, `(hub)/layout.tsx`, `onboarding/page.tsx`.

### 3. Migrações e configurações necessárias

**Quatro migrations novas, nenhuma aplicada** — e as 0053 a 0056 continuam
pendentes de antes:

```
0053_reimportar_saude.sql
0054_resumo_das_academias.sql
0055_ganho_de_carga.sql
0056_eventos.sql
0057_exercicios_da_sessao.sql     ← novo
0058_desfazer_serie.sql           ← novo
0059_serie_de_dois_lugares.sql    ← novo
0060_eventos_do_produto.sql       ← novo
```

Colar **na ordem**, no SQL editor do Supabase. `/api/health?deep=1` lista o que
falta em `pendingMigrations`. Nenhuma variável de ambiente nova.

O código tolera o banco antigo: `registrar_evento` ausente devolve `PGRST202` e
é engolida (instrumentação não derruba operação), e `desfazer_serie` ausente faz
o desfazer ficar na fila. **O que não é tolerável é o inverso** — colar a 0059
antes da 0057 deixa `log_workout_set` sem a garantia da linha de sessão.

### 4. Como executar e reproduzir os testes

```bash
# o banco de teste precisa estar no ar, senão 53 arquivos pulam em silêncio
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/synse-pgdata -o '-p 5433 -k /tmp' start"

npm test            # tudo
npm run test:db     # só banco
npm run test:unit   # só lógica pura
npm run typecheck
npm run lint
npm run build
```

Conferir o **número de arquivos**, não a cor: suíte com arquivos pulados termina
em verde.

### 5. Resultados dos testes, incluindo falhas

- **Final: 184 arquivos, 2243 testes, 0 pulados, 0 falhas.** Build: 101 rotas.
- **Falhas reais durante o trabalho**, todas corrigidas:
  - `tests/db/treino-ativo.test.ts` pegou a 0057 apagando a regra do treino
    pendurado de oito horas que a 0047 havia acrescentado.
  - O mesmo arquivo falhou de novo, de propósito, quando a 0059 mudou a política
    de série repetida: o teste foi reescrito com o registro do que havia antes.
  - `tests/db/receitas.test.ts` falhou por sorteio de UUID (`…9a1c-460f…`
    casando com a busca por '460'). Era fragilidade pré-existente; corrigida.
  - Dois testes meus nasceram com expectativa errada e o código me corrigiu: a
    janela de sete dias em Lisboa (`21T23:00Z`, não `22T00:00Z`) e a rota curta
    que sobra com um ponto só.
- **Mutações: 57 aplicadas.** Na primeira rodada, sete sobreviveram: cinco
  cobraram teste novo, uma cobrou um teste mais forte (o deslocamento por
  exercício, que com uma série só dava o mesmo número dos dois jeitos), e uma
  era equivalente — revelou uma conferência redundante na 0059, que saiu do
  código. Depois disso, nenhuma sobrevive.

  Por arquivo: escopo 6, migrations 0057/0058 9, desfazer no cliente 11,
  duas abas e 0059 7, eventos 8, janelas 6, share-card 5, portas 4, marco 1.

### 6. Evidências visuais sem dados pessoais

**Não há.** Capturar tela exige o aplicativo no ar com uma conta, e este
ambiente não tem navegador contra o Supabase de produção — e usar dado de aluno
real numa captura é exatamente o que o pedido proíbe. O que existe de evidência
é a saída dos testes e da build, reproduzível pelos comandos acima.

O caminho honesto para as capturas: `npm run dev` em modo de demonstração, que
usa persona fictícia e não toca em dado de ninguém.

### 7. Plataformas e versões efetivamente testadas

| Onde | O que rodou |
| --- | --- |
| Node + Vitest | 2243 testes, incluindo IndexedDB de verdade (`fake-indexeddb`) |
| PostgreSQL 16 | 53 arquivos de teste contra banco real, com RLS |
| Next 15 (build de produção) | 101 rotas compilando |
| Navegador | **nada** — nenhuma tela foi aberta |
| iOS | **nada** — sem macOS |
| Android | **nada** — sem aparelho |

### 8. Limitações e pendências exatas

Estão nas duas seções acima: "BLOQUEADO POR DEPENDÊNCIA EXTERNA" e "NÃO
IMPLEMENTADO". As três que mais importam:

1. Live Activity do iPhone não tem onde rodar (falta o target).
2. Nenhuma superfície nativa envia ação ao servidor, então o uso de widget não é
   medível — e por isso não é medido.
3. XP por volume divergindo do item 10, deixado para o dono decidir.

### 9. Próxima ação para cada bloqueio

| Bloqueio | Próxima ação | De quem |
| --- | --- | --- |
| Migrations pendentes | Colar 0053→0060 na ordem; conferir `/api/health?deep=1` | Dono do produto |
| Target de Widget Extension | Os seis passos da seção do iOS, em macOS com Xcode | Quem tiver Mac |
| Validação em Android | Rodar `npx cap run android` e ver a notificação | Quem tiver aparelho |
| Desempenho real | Lighthouse ou WebPageTest em 4G, nas três rotas mais pesadas | Qualquer um com aparelho |
| Revisão do Codex | Instalar o binário e `codex login status` | Dono do produto |
| XP por volume | Decidir a régua: teto por semana, ou recompensa por meta cumprida | Dono do produto |
| Política de privacidade | Uma linha na seção "O que é coletado" sobre os eventos de produto | Advogado |

### 10. Estratégia de implantação e recuperação

**A ordem importa, e ela é esta:**

1. **Primeiro o SQL, depois o deploy.** A Vercel publica no push; o SQL é colado
   à mão. Toda leitura nova tolera coluna ausente, mas as escritas novas —
   desfazer, evento — só funcionam depois da migration. Publicar antes de colar
   deixa o desfazer na fila e a instrumentação muda; nenhuma das duas derruba
   nada.
2. **Conferir `/api/health?deep=1`** antes e depois: `pendingMigrations` vazio é
   o sinal de que o banco e o código estão no mesmo ponto.
3. **Um treino de teste completo** numa conta de teste: começar, concluir série,
   desfazer, encerrar, e abrir o histórico. É o caminho que esta etapa mais
   mexeu, e o que o histórico mostra é a prova de que o encerramento chegou.

**Recuperação, por tipo de problema:**

- **O deploy.** `vercel rollback` volta para a publicação anterior em segundos.
  O código antigo convive com o banco novo: as funções novas simplesmente não
  são chamadas.
- **As migrations 0057 e 0059** substituem corpos de função. Para voltar, basta
  colar a versão anterior daquela função — está no histórico de cada migration,
  e o cabeçalho de cada uma diz de qual ela parte. **Atenção:** voltar a 0057 à
  versão da 0026 apaga a regra das oito horas da 0047; a 0059 é o ponto de
  partida correto hoje.
- **A 0058 e a 0060** só acrescentam: dá para desfazê-las com
  `drop function desfazer_serie`, `drop function descontar_desafio`,
  `drop table product_events cascade` — sem perder dado de treino.
- **A coluna `sets_planned` da 0057** é aditiva e nula para sessão antiga; o
  gatilho tem `coalesce` para o banco sem ela. Não precisa voltar.
- **O IndexedDB versão 2** não tem volta: o código antigo abre o banco na versão
  2 e lê as chaves que não entende como vazias — ou seja, o treino em andamento
  de quem estiver no meio de um treino **no instante do rollback** se perde. É o
  único ponto sem rede de segurança, e por isso o rollback, se precisar, é
  melhor fora do horário de pico da academia.
