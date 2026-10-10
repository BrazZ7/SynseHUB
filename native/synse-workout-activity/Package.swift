// swift-tools-version: 5.9
import PackageDescription

/*
 O Capacitor 8 integra plugins iOS por Swift Package Manager. O CocoaPods
 continua funcionando pelo podspec ao lado, para projetos que ainda usam Pods —
 os dois descrevem o mesmo código.

 `iOS(.v16)` é o piso: o ActivityKit, que desenha a Live Activity, não existe
 antes do 16.1. O código verifica `#available` para não quebrar em 16.0.
*/
let package = Package(
    name: "SynseWorkoutActivity",
    platforms: [.iOS(.v16)],
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
