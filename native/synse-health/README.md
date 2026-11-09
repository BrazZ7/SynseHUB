# @synse/health

Plugin Capacitor que lê peso e composição corporal do **Apple Saúde**
(HealthKit) e do **Health Connect**.

## Estado — leia isto primeiro

**Nenhuma linha do Swift ou do Kotlin deste diretório foi compilada ou
executada.** Não existe máquina com Xcode no circuito, o módulo Android nunca
entrou num build, e nenhum aparelho real foi testado. O que está aqui é a
implementação escrita contra a documentação das duas plataformas, pronta para
quando houver aparelho — e o contrato que a aplicação web já usa hoje.

O que **está** provado é o outro lado: a remontagem das amostras, as unidades,
a janela de importação e a regra de reimportação. São módulos puros em
`src/features/synse-body/health/`, com 35 testes de unidade, mais 9 de banco
para a migration 0053.

Enquanto não houver nativo, a tela de aparelhos diz que a sincronização está
disponível no aplicativo do celular, e não tenta.

## Por que isto existe

A maior parte das balanças de mercado — Xiaomi, Withings, Renpho, Tanita,
Garmin — fala protocolo proprietário e **nunca** vai conversar por Bluetooth
com o Synse sem engenharia de protocolo aparelho por aparelho. Mas quase todas
escrevem no Apple Saúde ou no Health Connect pelo app do próprio fabricante, e
ali o formato é padronizado.

Ou seja: esta é a via mais barata para as balanças que o caminho Bluetooth não
alcança. Uma integração, muitas marcas.

## O que cada plataforma entrega

| Grandeza | Apple Saúde | Health Connect |
| --- | --- | --- |
| Peso | `bodyMass` | `WeightRecord` |
| Gordura corporal | `bodyFatPercentage` — **fração** (0,22) | `BodyFatRecord` — **percentual** (22,0) |
| Massa magra | `leanBodyMass` | `LeanBodyMassRecord` |
| IMC | `bodyMassIndex` | — não existe |
| Massa óssea | — não existe | `BoneMassRecord` |
| Água corporal | — não existe | `BodyWaterMassRecord` — **massa**, não percentual |
| Metabolismo basal | — não existe¹ | `BasalMetabolicRateRecord` — **potência** |

¹ `basalEnergyBurned` existe e **não serve**: é energia *acumulada* num
período, não taxa metabólica basal. Somar o dia e chamar de metabolismo basal
daria um número parecido e errado, que é o pior tipo.

O resultado prático: a mesma pessoa, com a mesma balança, vê **mais campos no
Android**. Não é defeito — é o que cada plataforma guarda.

### As armadilhas de unidade

Nenhuma delas falha de forma visível. Todas gravam um número errado no
histórico de saúde de alguém.

1. **Gordura corporal.** Apple em fração, Health Connect em percentual. Tratar
   os dois igual publica 0,22% de gordura para metade dos usuários e 2.200%
   para a outra metade. A conversão fica no **nativo**, perto da plataforma que
   erra, e não na web.
2. **Água corporal.** Chega em quilo; o Synse guarda percentual. A divisão pelo
   peso é conta do Synse, e por isso o campo sai marcado como *calculado*,
   nunca como *estimado pela balança*.
3. **Metabolismo basal.** `inKilocaloriesPerDay`, nunca `inWatts` — a diferença
   é um fator de cinquenta.

## A permissão, que é assimétrica

O **Health Connect** devolve a lista do que foi concedido. Quando o plugin diz
que não tem acesso, ele sabe: `authoritative: true`.

O **HealthKit não revela negativa de leitura.** É decisão de projeto da Apple —
se o app soubesse que a pessoa escondeu um tipo, deduziria a condição de saúde
dela pelo próprio silêncio. Na prática: depois da folha de permissão, consultar
é a única forma de descobrir, e voltar vazio é ambíguo entre "negou" e "não tem
dado". O plugin devolve `authoritative: false`, e a tela leva essa ambiguidade
até o texto: em vez de "nenhuma pesagem encontrada", ela diz *"se você tem
pesagens lá, confira no Saúde se o Synse está autorizado"*.

## O que falta para ligar

### iOS

- [ ] Capacidade **HealthKit** no alvo do app (Signing & Capabilities).
- [ ] `NSHealthShareUsageDescription` no `Info.plist`, em português e dizendo o
      uso real. A App Review reprova texto genérico.
- [ ] `NSHealthUpdateUsageDescription` **só** quando o Synse passar a escrever
      no Saúde. Hoje ele não escreve; pedir escrita sem usar é reprovação.
- [ ] Compilar. Nada disto passou por um compilador.

### Android

- [ ] As permissões já estão no `AndroidManifest.xml` deste módulo.
- [ ] Falta, **no manifesto do app**, a activity que responde a
      `ACTION_SHOW_PERMISSIONS_RATIONALE`. Sem ela a Play Console reprova: é a
      tela que explica por que o app quer dados de saúde.
- [ ] Declaração de uso de dados de saúde no formulário da Play Console.
- [ ] `minSdk 28` deste módulo é maior que o 26 do app. Abaixo de 28 o
      `isAvailable()` devolve `UNSUPPORTED_PLATFORM`, em vez de o app não
      instalar.

### Os dois

- [ ] Rodar com uma balança de verdade e conferir o número contra o app do
      fabricante. Protocolo lido na documentação é protocolo não testado.

## Como o resto do sistema usa

A aplicação nunca importa este pacote direto. Ela fala com
`src/features/synse-body/health/ponte.ts`, que procura o plugin na janela e
diz "aqui não dá" quando não o encontra — o mesmo desenho da ponte do Treino
Ativo.

O contrato está escrito duas vezes, aqui e lá, porque este pacote é publicável
sozinho e não pode importar da aplicação.
`tests/unit/synse-body/saude-contrato.test.ts` compara os dois.
