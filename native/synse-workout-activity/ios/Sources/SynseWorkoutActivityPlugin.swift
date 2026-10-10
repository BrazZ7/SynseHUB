import ActivityKit
import Capacitor
import Foundation

/*
 A ponte entre o WebView e o ActivityKit.

 Uma atividade por vez, guardada aqui: o treino é um só, e `Activity.request`
 sem controle deixaria cartões órfãos na tela bloqueada depois de um
 recarregamento do WebView.
*/
@objc(SynseWorkoutActivityPlugin)
public class SynseWorkoutActivityPlugin: CAPPlugin {
    private var atividade: Any?
    /// App Group compartilhado com a extensão: é por onde os botões respondem.
    private let grupo = "group.br.com.synse.app"

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        /*
         Live Activity não tem diálogo de permissão: é uma chave nos Ajustes,
         ligada por padrão. O que se pede aqui é a permissão de notificação, que
         é o que faz o alerta de fim de descanso tocar com o app fechado.
        */
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { ok, _ in
            if #available(iOS 16.1, *) {
                let ativadas = ActivityAuthorizationInfo().areActivitiesEnabled
                call.resolve(["granted": ok && ativadas])
            } else {
                call.resolve(["granted": false])
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else { return call.resolve() }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return call.resolve() }

        // Encerra a anterior: recarregar o WebView não pode deixar dois cartões.
        encerrarAtual()

        let atributos = SynseWorkoutAttributes(planName: call.getString("planName") ?? "Treino")
        do {
            let nova = try Activity.request(
                attributes: atributos,
                content: .init(state: estado(de: call), staleDate: nil)
            )
            atividade = nova
            observarAcoes()
            call.resolve()
        } catch {
            // Limite de atividades, permissão revogada, sistema sob pressão.
            // O treino segue; só o cartão não aparece.
            call.resolve()
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let atual = atividade as? Activity<SynseWorkoutAttributes> else {
            return call.resolve()
        }
        Task {
            await atual.update(.init(state: estado(de: call), staleDate: nil))
            call.resolve()
        }
    }

    @objc func restFinished(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *),
              let atual = atividade as? Activity<SynseWorkoutAttributes> else {
            return call.resolve()
        }
        Task {
            /*
             `alertConfiguration` é o que faz o aparelho tocar e vibrar com a
             tela bloqueada. Sem ela a atividade atualiza em silêncio, e quem
             está descansando não percebe que a série está pronta.
            */
            await atual.update(
                .init(state: estado(de: call), staleDate: nil),
                alertConfiguration: .init(
                    title: "Descanso concluído",
                    body: "Próxima série pronta.",
                    sound: .default
                )
            )
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        encerrarAtual()
        call.resolve()
    }

    // MARK: - Interno

    @available(iOS 16.1, *)
    private func estado(de call: CAPPluginCall) -> SynseWorkoutAttributes.ContentState {
        let fimMs = call.getDouble("restEndsAt")
        return .init(
            exerciseName: call.getString("exerciseName") ?? "",
            setNumber: call.getInt("setNumber") ?? 1,
            totalSets: call.getInt("totalSets") ?? 1,
            reps: call.getInt("reps") ?? 0,
            weight: call.getDouble("weight"),
            phase: call.getString("phase") ?? "SET",
            // Epoch em milissegundos na ponte, `Date` aqui.
            restEndsAt: fimMs.map { Date(timeIntervalSince1970: $0 / 1000) },
            progress: call.getDouble("progress") ?? 0
        )
    }

    private func encerrarAtual() {
        guard #available(iOS 16.1, *),
              let atual = atividade as? Activity<SynseWorkoutAttributes> else { return }
        Task { await atual.end(nil, dismissalPolicy: .immediate) }
        atividade = nil
    }

    /*
     Os botões da Live Activity rodam na extensão, em outro processo. Eles
     gravam a ação no App Group e o app a lê aqui, repassando ao WebView.
     Darwin notification é o que avisa entre processos sem polling.
    */
    private func observarAcoes() {
        let centro = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterAddObserver(
            centro,
            Unmanaged.passUnretained(self).toOpaque(),
            { _, observador, _, _, _ in
                guard let observador else { return }
                let plugin = Unmanaged<SynseWorkoutActivityPlugin>
                    .fromOpaque(observador).takeUnretainedValue()
                plugin.lerAcaoPendente()
            },
            "br.com.synse.workout.action" as CFString,
            nil,
            .deliverImmediately
        )
    }

    private func lerAcaoPendente() {
        guard let defaults = UserDefaults(suiteName: grupo),
              let acao = defaults.string(forKey: "pendingAction") else { return }
        defaults.removeObject(forKey: "pendingAction")
        notifyListeners("remoteAction", data: ["action": acao])
    }
}
