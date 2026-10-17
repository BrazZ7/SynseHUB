import ActivityKit
import SwiftUI
import WidgetKit

/*
 A fase que a tela deve desenhar, que nem sempre é a que o app mandou.

 O descanso vence enquanto o celular está bloqueado. Nesse momento o app está
 suspenso — o `setTimeout` do WebView não roda em segundo plano — e a atividade
 continua com `phase: "REST"` e um `restEndsAt` que já passou.

 Isso importa por dois motivos. O visual: o cartão ficaria mostrando "descanso"
 depois de o descanso acabar. E o grave: `Text(timerInterval:)` recebe um
 `ClosedRange<Date>`, e formar `agora...fim` com `fim` no passado **encerra o
 processo** — a extensão morre e a Live Activity some da tela bloqueada.

 Decidir aqui deixa o widget se corrigir sozinho, sem depender de o app acordar.
*/
@available(iOS 16.1, *)
func faseVisivel(_ estado: SynseWorkoutAttributes.ContentState, agora: Date = .now) -> String {
    if estado.phase == "REST", let fim = estado.restEndsAt, fim <= agora {
        return "REST_FINISHED"
    }
    return estado.phase
}

/** O intervalo do contador, nunca invertido. */
@available(iOS 16.1, *)
func intervaloDoDescanso(_ fim: Date, agora: Date = .now) -> ClosedRange<Date> {
    agora...max(fim, agora)
}

/*
 O cartão da tela bloqueada e a Dynamic Island.

 Uma `ActivityConfiguration` atende os dois: o sistema escolhe o que desenhar
 conforme o aparelho. Em iPhone sem Dynamic Island, os blocos `dynamicIsland`
 simplesmente não são usados — não há código separado nem verificação de modelo.

 As cores acompanham a identidade Synse. Live Activity não carrega o CSS da
 aplicação, então elas estão declaradas aqui; mudá-las na web não muda aqui.
*/
@available(iOS 16.1, *)
struct SynseWorkoutLiveActivity: Widget {
    private static let cyan = Color(red: 0.09, green: 0.77, blue: 0.65)
    private static let mint = Color(red: 0.56, green: 0.96, blue: 0.85)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SynseWorkoutAttributes.self) { context in
            LockScreenView(state: context.state, planName: context.attributes.planName)
                .activityBackgroundTint(Color.black.opacity(0.75))
                .activitySystemActionForegroundColor(Self.cyan)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.exerciseName, systemImage: "figure.strengthtraining.traditional")
                        .font(.caption)
                        .foregroundStyle(Self.cyan)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Série \(context.state.setNumber)/\(context.state.totalSets)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                DynamicIslandExpandedRegion(.center) {
                    if let fim = context.state.restEndsAt, faseVisivel(context.state) == "REST" {
                        Text(timerInterval: intervaloDoDescanso(fim), countsDown: true)
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Self.cyan)
                            .multilineTextAlignment(.center)
                    } else if faseVisivel(context.state) == "REST_FINISHED" {
                        Text("Descanso concluído")
                            .font(.headline)
                            .foregroundStyle(Self.mint)
                    } else {
                        Text(resumoDaSerie(context.state))
                            .font(.headline)
                            .foregroundStyle(.primary)
                    }
                }
                /*
                 Aqui entram os botões — e eles ainda não existem.

                 O código deles estava escrito e chamava `SynseWorkoutIntent`,
                 que **não existe em nenhum lugar do repositório**. O arquivo
                 não compilava, e ninguém soube porque nada aqui jamais foi
                 compilado: não há Mac no projeto.
                 Ver `docs/evolucao-synse.md`, seção do iOS.

                 O que falta, na ordem: um `LiveActivityIntent` (iOS 17+), o
                 App Group `group.br.com.synse.app` criado no portal da Apple e
                 habilitado nos dois App IDs, e o `entitlements` nos dois
                 targets. Nada disso dá para verificar sem aparelho, e com o
                 entitlement no projeto e a capacidade ausente no portal a
                 assinatura falha — o build nem chega a compilar.

                 Sem botão, a atividade continua inteira: cartão, Dynamic
                 Island e o cronômetro do descanso. O toque abre o app, que é o
                 comportamento de qualquer iPhone antes do iOS 17.
                */
            } compactLeading: {
                Image(systemName: "figure.strengthtraining.traditional")
                    .foregroundStyle(Self.cyan)
            } compactTrailing: {
                if let fim = context.state.restEndsAt, faseVisivel(context.state) == "REST" {
                    Text(timerInterval: intervaloDoDescanso(fim), countsDown: true)
                        .monospacedDigit()
                        .frame(width: 44)
                        .foregroundStyle(Self.cyan)
                } else {
                    Text("\(context.state.setNumber)/\(context.state.totalSets)")
                        .monospacedDigit()
                        .foregroundStyle(Self.cyan)
                }
            } minimal: {
                Image(systemName: "figure.strengthtraining.traditional")
                    .foregroundStyle(Self.cyan)
            }
            .keylineTint(Self.cyan)
        }
    }

    private func resumoDaSerie(_ s: SynseWorkoutAttributes.ContentState) -> String {
        let carga = s.weight.map { " • \(Int($0)) kg" } ?? ""
        return "\(s.reps) reps\(carga)"
    }
}

@available(iOS 16.1, *)
private struct LockScreenView: View {
    let state: SynseWorkoutAttributes.ContentState
    let planName: String

    private static let cyan = Color(red: 0.09, green: 0.77, blue: 0.65)
    private static let mint = Color(red: 0.56, green: 0.96, blue: 0.85)

    var body: some View {
        let fase = faseVisivel(state)

        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("SYNSE")
                    .font(.caption2.weight(.bold))
                    .tracking(2)
                    .foregroundStyle(Self.cyan)
                Spacer()
                Text(planName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text(state.exerciseName)
                .font(.title3.weight(.semibold))
                .lineLimit(1)

            if fase == "REST", let fim = state.restEndsAt {
                Text("DESCANSO")
                    .font(.caption2.weight(.semibold))
                    .tracking(1.5)
                    .foregroundStyle(.secondary)
                Text(timerInterval: intervaloDoDescanso(fim), countsDown: true)
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Self.cyan)
                if state.setNumber < state.totalSets {
                    // Sem o guarda, a última série anunciava uma "série 4/3".
                    Text("Próxima: série \(state.setNumber + 1)/\(state.totalSets)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Última série deste exercício")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if fase == "REST_FINISHED" {
                Text("DESCANSO CONCLUÍDO")
                    .font(.headline)
                    .foregroundStyle(Self.mint)
                Text("Série \(state.setNumber)/\(state.totalSets) pronta.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                HStack(spacing: 14) {
                    Rotulo(titulo: "Série", valor: "\(state.setNumber)/\(state.totalSets)")
                    if let peso = state.weight {
                        Rotulo(titulo: "Carga", valor: "\(Int(peso)) kg")
                    }
                    Rotulo(titulo: "Reps", valor: "\(state.reps)")
                }
            }

            ProgressView(value: state.progress)
                .tint(Self.cyan)

            // Os botões entram aqui quando o intent existir. Ver a nota na
            // `ActivityConfiguration`, acima.
        }
        .padding(16)
    }
}

@available(iOS 16.1, *)
private struct Rotulo: View {
    let titulo: String
    let valor: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(titulo).font(.caption2).foregroundStyle(.secondary)
            Text(valor).font(.headline.monospacedDigit())
        }
    }
}

/*
 ── Os botões saíram daqui, e o que estava escrito ──────────────────────────

 Havia um `BotoesDaAtividade` com `Button(intent: SynseWorkoutIntent(...))`
 para pular o descanso, somar 30 segundos, iniciar a próxima série e concluir
 a série. `SynseWorkoutIntent` não existe no repositório — quatro chamadas,
 nenhuma implementação. O arquivo não compilava, e isso passou por não haver
 Mac que o compilasse.

 Não foi reimplementado agora de propósito. Fazer certo exige:

   1. um tipo conformando `LiveActivityIntent` (iOS 17+), visível para a
      extensão **e** para o app — o sistema executa esse intent no processo do
      aplicativo, que é o que permite a ação chegar ao engine;
   2. o App Group `group.br.com.synse.app` criado no portal da Apple e
      habilitado nos dois App IDs, porque é por ele que
      `SynseWorkoutActivityPlugin.lerAcaoPendente()` lê a ação;
   3. o arquivo de `entitlements` nos dois targets.

 O item 2 é o que impede fazer isto às cegas: com o entitlement no projeto e a
 capacidade ausente no portal, a assinatura falha antes de compilar — e quem
 for depurar isso sem Mac vai depurar uma mensagem de assinatura.

 O caminho é: primeiro este widget no TestFlight, visto num iPhone. Depois os
 botões, com o App Group já criado.
*/
