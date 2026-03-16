import SwiftUI

enum AppTab: Int {
    case home = 0
    case myQR = 1
    case scan = 2
    case eventMode = 3
    case network = 4
}

struct MainTabView: View {
    let currentUser: User
    @State private var selectedTab: AppTab = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(AppTab.home)

            MyQRView(currentUser: currentUser)
                .tabItem {
                    Label("My QR", systemImage: "qrcode")
                }
                .tag(AppTab.myQR)

            ScanView(selectedTab: $selectedTab)
                .tabItem {
                    Label("Scan", systemImage: "camera")
                }
                .tag(AppTab.scan)

            EventModeView()
                .tabItem {
                    Label("Diagnostics", systemImage: "waveform")
                }
                .tag(AppTab.eventMode)

            NetworkView()
                .tabItem {
                    Label("Network", systemImage: "circle.hexagongrid")
                }
                .tag(AppTab.network)
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            guard oldValue != newValue else { return }
            #if DEBUG
            print("[TAB-WRITE] \(oldValue) → \(newValue)")
            #endif
        }
    }
}
