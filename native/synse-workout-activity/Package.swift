// swift-tools-version: 5.9
import PackageDescription

/*
 O Capacitor 8 integra plugins iOS por Swift Package Manager. O CocoaPods
 continua funcionando pelo podspec ao lado, para projetos que ainda usam Pods —
 os dois descrevem o mesmo código.

 ── O piso é 15, e precisa ser ──────────────────────────────────────────────

 Era `.iOS(.v16)`, e isso impedia o aplicativo de compilar. O SPM exige que o
 pacote dependente declare plataforma **maior ou igual** à da dependência, e o
 `CapApp-SPM` que o Capacitor gera declara `.iOS(.v15)` — igual ao
 `IPHONEOS_DEPLOYMENT_TARGET` do target App. Com 16 aqui, o build morria antes
 de compilar: "requires minimum platform version 16.0 ... but this target
 supports 15.0".

 Baixar para 15 é seguro porque todo uso de ActivityKit neste pacote é guardado
 por `#available(iOS 16.1, *)`, e `SynseWorkoutAttributes` tem `@available`.
 Quem desenha a Live Activity é a extensão do widget, cujo piso é 16.1 e vive
 no projeto Xcode, não aqui.

 Isto nunca apareceu porque nunca foi compilado: não há Mac no projeto.
*/
let package = Package(
    name: "SynseWorkoutActivity",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SynseWorkoutActivity",
            targets: ["SynseWorkoutActivityPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "SynseWorkoutActivityPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources"
        )
    ]
)
