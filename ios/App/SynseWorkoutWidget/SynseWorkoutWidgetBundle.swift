import SwiftUI
import WidgetKit

/*
 O ponto de entrada da extensão.

 ── Por que este arquivo precisou existir ───────────────────────────────────

 `SynseWorkoutLiveActivity` é um `Widget`, e um `Widget` não roda sozinho: a
 extensão é um binário, e binário precisa de `@main`. O código da Live Activity
 estava completo e sem entrada — compilava para dentro do aplicativo, onde
 nenhum widget é carregado, e a tela bloqueada nunca mostrava nada.

 ── Por que um `WidgetBundle` e não `@main` na própria Live Activity ────────

 Porque vai ter mais de um. O jardim e a meta da semana são widget de tela
 inicial, que é outra coisa que a extensão vai hospedar — e `WidgetBundle` é o
 lugar onde eles entram, uma linha cada. Pôr o `@main` na Live Activity
 obrigaria a mexer nela para acrescentar o segundo.

 O `body` não precisa de `if #available`: o piso da extensão é iOS 16.1, o mesmo
 que o `ActivityConfiguration` exige.
*/
@main
struct SynseWorkoutWidgetBundle: WidgetBundle {
    var body: some Widget {
        SynseWorkoutLiveActivity()
    }
}
