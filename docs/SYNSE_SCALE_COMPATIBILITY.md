# Synse Scale — compatibilidade de balanças

O que o Synse fala hoje, o que ele não fala, e por quê. Este documento existe
para evitar duas coisas: prometer compatibilidade que não foi testada, e
reescrever a mesma investigação daqui a seis meses.

## O que está implementado

O Synse implementa os **dois perfis padronizados do Bluetooth SIG** para
balança. Nada aqui é protocolo de fabricante, e nada foi inventado.

| Serviço | UUID | Característica | UUID |
| --- | --- | --- | --- |
| Weight Scale (WSS) | `0x181D` | Weight Measurement (notify) | `0x2A9D` |
| | | Weight Scale Feature (read) | `0x2A9E` |
| Body Composition (BCS) | `0x181B` | Body Composition Measurement (indicate) | `0x2A9C` |
| | | Body Composition Feature (read) | `0x2A9B` |
| Device Information | `0x180A` | Fabricante / modelo / firmware | `0x2A29` / `0x2A24` / `0x2A26` |

Uma balança que implemente WSS ou BCS conversa com o Synse **sem nenhuma linha
de código específica dela**. O parser está em
`src/features/synse-body/engine/ble.ts`, com os bytes documentados campo a
campo.

### Campos que o padrão entrega

Peso, IMC e altura (WSS); percentual de gordura, metabolismo basal, percentual
e massa muscular, massa livre de gordura, massa magra mole, massa de água,
impedância, peso e altura (BCS).

**Gordura visceral e massa óssea não existem no padrão.** Quando o app de um
fabricante mostra esses números, eles vêm de protocolo proprietário. No Synse
eles ficam ausentes — e ausente é um estado explícito, diferente de zero.

### As duas armadilhas do padrão

1. **Metabolismo basal trafega em quilojoule.** Está na especificação, não é
   escolha do fabricante. Mostrar o número cru multiplicaria o metabolismo de
   alguém por 4,184: 1.600 kcal virariam 6.694, e a meta alimentar inteira
   sairia errada. O parser converte.
2. **`0xFFFF` significa "não consegui", não zero.** Uma balança que não
   conseguiu passar corrente (pé seco, meia, pessoa subindo e descendo rápido)
   manda `0xFFFF` no percentual de gordura. O peso, nesse caso, continua bom: a
   célula de carga funcionou. O Synse guarda o peso e recusa a composição.

Há uma terceira, menos óbvia: **o relógio da balança**. O ano `0` significa
"desconhecido" na própria especificação, e balança que perde energia volta de
fábrica com uma data qualquer. Carimbo implausível é descartado e vale o
relógio do celular — sem isso, a pesagem de hoje entraria no gráfico em 2001.

## O que NÃO está implementado

- **Protocolos proprietários.** Xiaomi/Mi Body Composition, Withings, Renpho,
  Tanita, Garmin Index e vários outros usam formato próprio, às vezes cifrado,
  às vezes com pareamento pelo app do fabricante. Cada um exige o aparelho na
  mesa para engenharia de protocolo. **Nenhum deles foi testado, e nenhum é
  suportado.**
- **Nuvem de fabricante.** Withings e Garmin têm API com OAuth. É o caminho
  mais confiável para essas marcas, e é trabalho de integração, não de BLE. O
  enum `body_measurement_source` já prevê `VENDOR_CLOUD`.
- **Apple Health e Health Connect.** Previstos no enum (`APPLE_HEALTH`,
  `HEALTH_CONNECT`) e ainda não implementados. São a via mais provável para
  balanças de protocolo fechado, porque o app do fabricante já escreve nelas.

Uma balança de protocolo proprietário **aparece na varredura** (ela anuncia
algum serviço) e, se não expuser WSS nem BCS, o pareamento falha com "este
aparelho não expõe nenhum serviço de balança conhecido". É recusa explícita, e
não silêncio.

## Como adicionar um fabricante

Implementar `ScaleDeviceProvider`
(`src/features/synse-body/engine/types.ts`) num arquivo novo em
`src/features/synse-body/providers/`. O contrato é o mesmo para todos, e o
resto do sistema — telas, fila offline, normalização, banco — não muda.

O campo `provider` de `user_devices` é **texto e não enum** exatamente por
isso: acrescentar fabricante não pode exigir migration.

Sem o aparelho na mesa, não faça. Protocolo deduzido de post de fórum é
protocolo que grava o peso errado no histórico de alguém.

## O identificador do aparelho

`platform_device_identifier` guarda **o que a plataforma dá**, e a plataforma
dá coisas diferentes:

- **iOS** — um `UUID` do CoreBluetooth, estável para aquele aparelho naquele
  iPhone. O CoreBluetooth não expõe MAC. Reinstalar o app pode gerar um
  identificador novo: a pessoa revincula.
- **Android** — o endereço que o rádio anunciou, normalmente o MAC. Aparelho
  que use endereço privado rotativo muda de identificador e precisa ser
  revinculado. Balança costuma usar endereço público estático, então na prática
  isso é raro — mas é uma limitação real, não um detalhe.

Por isso o vínculo é `unique (user_profile_id, platform_device_identifier)` e
não único global: a mesma balança de família é um vínculo por morador.

## Onde a leitura da balança funciona

| Ambiente | Lê balança? | Como |
| --- | --- | --- |
| **App Android** (Capacitor) | Sim | Varredura contínua: lista ao vivo, com RSSI |
| **App iOS** (Capacitor) | Sim | Idem |
| **Chrome/Edge no Android** | Sim | Seletor do próprio navegador, um aparelho por vez, sem RSSI |
| **Chrome/Edge no computador** | Depende | Seletor do navegador, se o Web Bluetooth estiver habilitado |
| **Safari** (iOS e macOS) | Não | Não implementa Web Bluetooth |
| **Firefox** | Não | Não implementa Web Bluetooth |

Onde não dá, a tela de aparelhos diz isso **antes** da tentativa e oferece a
entrada manual — em vez de deixar a pessoa tocar em *Procurar* para receber uma
falha.

### Por que o navegador usa o seletor, e o app usa a varredura

`requestLEScan` — a varredura contínua, que devolve lista ao vivo e potência de
sinal — está atrás de `chrome://flags/#enable-experimental-web-platform-features`
e não existe num Chrome comum. O que existe é `requestDevice`, que abre o
seletor do próprio navegador: a pessoa escolhe ali dentro e volta um aparelho
só, sem RSSI. É menos rico que o caminho nativo, e é o que a plataforma dá.

Duas outras diferenças do navegador, que o provider contorna:

- **`discoverServices` não existe no web.** A descoberta é implícita em
  `getPrimaryServices`, então a chamada explícita é best-effort — sem isso, o
  pareamento morria logo no primeiro passo.
- **`readRssi` não existe no web.** O botão *Identificar* cai para a leitura da
  característica de fabricante, que atravessa o mesmo GATT e prova a mesma
  coisa: o aparelho respondeu.

No navegador, tudo o que a página vai ler precisa ser declarado no momento da
escolha (`optionalServices`) — o Web Bluetooth tranca o acesso ao que não foi
pedido ali.

## Permissões

**Android 12+** — `BLUETOOTH_SCAN` com `neverForLocation` e
`BLUETOOTH_CONNECT`. A flag declara que a varredura não serve para descobrir
onde a pessoa está, e é o que dispensa a permissão de localização.

**Android 11 e abaixo** — `BLUETOOTH`, `BLUETOOTH_ADMIN` e localização. Ali a
varredura BLE exige localização por limitação da plataforma; o app já pede
localização para o SynseRun.

**iOS** — `NSBluetoothAlwaysUsageDescription` (e a `Peripheral`, que iOS 12
ainda exige).

## Comportamento em segundo plano

Testado no aparelho, por cenário. O que este produto faz hoje: **a pessoa abre
a tela de pesagem e sobe na balança**. Não há reconexão com o app fechado, e
isso é escolha, não omissão — ver adiante.

| Cenário | Android | iOS |
| --- | --- | --- |
| **A. App aberto, tela de pesagem** | Funciona. É o caminho previsto. | Funciona. |
| **B. App aberto, outra tela** | A assinatura é cancelada ao sair da tela (`useEffect` de limpeza): conexão BLE aberta drena bateria dos dois lados. | Igual. |
| **C. App em segundo plano** | A conexão sobrevive por algum tempo e o sistema pode encerrá-la a qualquer momento; sem serviço em primeiro plano, não há garantia nenhuma. | Sem `bluetooth-central` declarado, o CoreBluetooth suspende junto com o app. Não chega notificação. |
| **D. Tela bloqueada** | Igual a C. | Igual a C. |
| **E. App encerrado (pelo sistema ou pela pessoa)** | Nada chega. | Nada chega. |

**O que acontece na prática:** a balança guarda a pesagem e a entrega na
próxima conexão — as que implementam carimbo de tempo mandam o instante real, e
o Synse o respeita quando é plausível. A pesagem feita fora do app não se
perde; ela chega quando a pessoa abre a tela.

**Por que não declarar `bluetooth-central` no iOS e um serviço em primeiro
plano no Android:** os dois pedem justificativa na revisão das lojas, e a
justificativa aqui seria fraca — a pessoa abre o app antes de subir na balança.
Declarar modo de segundo plano que não se usa é pedir rejeição. Se um dia o
produto quiser pesagem passiva, isto muda, com o custo de revisão declarado.

**Sem rede:** a pesagem é gravada no aparelho antes de qualquer tentativa de
envio (`storage/local-measurements.ts`) e a tela mostra *pendente de
sincronização*. Sobe na próxima abertura do app. O `client_id` gerado no
aparelho é o que torna o reenvio inofensivo.

## Testar sem hardware

`createMockScaleProvider` (`src/features/synse-body/providers/mock.ts`) monta
bytes no layout do padrão e os entrega aos parsers de verdade. Ele reproduz a
pessoa se equilibrando, a balança em libras, a medição malsucedida, o aparelho
que some no meio, a varredura vazia e a permissão negada.

É também o que roda no **modo de demonstração** — lá não existe balança, e a
tela precisa mostrar o que o produto faz.
