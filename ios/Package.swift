// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "InnovationEngine",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "InnovationEngine",
            targets: ["InnovationEngine"]
        )
    ],
    dependencies: [
        .package(
            url: "https://github.com/supabase/supabase-swift",
            from: "2.0.0"
        )
    ],
    targets: [
        .target(
            name: "InnovationEngine",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift")
            ],
            path: "InnovationEngine"
        )
    ]
)
