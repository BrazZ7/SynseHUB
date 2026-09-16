import ActivityKit
import SwiftUI
import WidgetKit

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
                    if let fim = context.state.restEndsAt, context.state.phase == "REST" {
                        Text(timerInterval: Date.now...fim, countsDown: true)
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Self.cyan)
                            .multilineTextAlignment(.center)
                    } else if context.state.phase == "REST_FINISHED" {
                        Text("Descanso concluído")
                            .font(.headline)
                            .foregroundStyle(Self.mint)
                    } else {
                        Text(resumoDaSerie(context.state))
                            .font(.headline)
                            .foregroundStyle(.primary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    // Botão só a partir do iOS 17. Antes disso o cartão informa
                    // e o toque abre o app — não há como contornar.
                    if #available(iOS 17.0, *) {
                        BotoesDaAtividade(phase: context.state.phase)
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.strengthtraining.traditional")
                    .foregroundStyle(Self.cyan)
            } compactTrailing: {
                if let fim = context.state.restEndsAt, context.state.phase == "REST" {
                    Text(timerInterval: Date.now...fim, countsDown: true)
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
        VStack(alignment: .leading, spacing: 10) {
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

            if state.phase == "REST", let fim = state.restEndsAt {
                Text("DESCANSO")
                    .font(.caption2.weight(.semibold))
                    .tracking(1.5)
                    .foregroundStyle(.secondary)
                Text(timerInterval: Date.now...fim, countsDown: true)
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Self.cyan)
                Text("Próxima: série \(state.setNumber + 1)/\(state.totalSets)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if state.phase == "REST_FINISHED" {
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

            if #available(iOS 17.0, *) {
                BotoesDaAtividade(phase: state.phase)
            }
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
 Os botões usam App Intents, disponíveis a partir do iOS 17. O intent roda no
 processo da extensão e grava a ação num App Group; o app lê e repassa ao
 engine. É o único caminho: a extensão não conversa com o WebView diretamente.
*/
@available(iOS 17.0, *)
private struct BotoesDaAtividade: View {
    let phase: String

    var body: some View {
        HStack(spacing: 8) {
            if phase == "REST" {
                Button(intent: SynseWorkoutIntent(action: "SKIP_REST")) { Text("Pular") }
                Button(intent: SynseWorkoutIntent(action: "ADD_REST")) { Text("+30s") }
            } else if phase == "REST_FINISHED" {
                Button(intent: SynseWorkoutIntent(action: "NEXT_SET")) { Text("Iniciar série") }
            } else {
                Button(intent: SynseWorkoutIntent(action: "COMPLETE_SET")) { Text("Concluir série") }
            }
        }
        .buttonStyle(.bordered)
        .tint(Color(red: 0.09, green: 0.77, blue: 0.65))
    }
}
