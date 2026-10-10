import ActivityKit
import Foundation

/*
 O que a Live Activity sabe sobre o treino.

 `ContentState` carrega instante de fim, e não texto de cronômetro: é isso que
 permite ao SwiftUI animar a contagem sozinho, com `Text(timerInterval:)`. Se
 viesse "01:18" pronto, o app teria de atualizar a atividade a cada segundo — e
 o iOS limita a frequência dessas atualizações, então o contador travaria.
*/
struct SynseWorkoutAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var exerciseName: String
        var setNumber: Int
        var totalSets: Int
        var reps: Int
        var weight: Double?
        /// "SET", "REST" ou "REST_FINISHED".
        var phase: String
        /// Fim do descanso. Nulo fora do descanso.
        var restEndsAt: Date?
        var progress: Double
    }

    /// Não muda durante o treino.
    var planName: String
}
