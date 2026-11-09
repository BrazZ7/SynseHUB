// swift-tools-version: 5.9
import PackageDescription

/*
 O Capacitor 8 integra plugins iOS por Swift Package Manager.

 ── O piso é 15, e precisa ser ──────────────────────────────────────────────

 Mesma regra que custou um build no `synse-workout-activity`: o SPM exige que o
 pacote dependente declare plataforma **maior ou igual** à da dependência, e o
 `CapApp-SPM` que o Capacitor gera declara `.iOS(.v15)`. Declarar 16 aqui faz o
 build morrer antes de compilar qualquer linha, com uma mensagem que fala de
 "minimum platform version" e não de plugin nenhum.

 15 é seguro porque StoreKit 2 — `Product`, `Transaction`, `AppStore` — é iOS
 15. Nada neste pacote usa API mais nova, e é por isso que não há `#available`
 em lugar algum dele.
*/
let package = Package(
    name: "SynsePlusBilling",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SynsePlusBilling",
            targets: ["SynsePlusBillingPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "SynsePlusBillingPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources"
        )
    ]
)
