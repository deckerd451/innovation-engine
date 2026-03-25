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
    @Binding var selectedTab: AppTab

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
        .task {
            // Replay any deep-link event join that arrived before this view
            // was mounted (e.g. cold launch, or URL delivered before auth
            // resolved).  consumeEventId() is idempotent — it clears the
            // stored ID on first call, so this fires at most once per link.
            if let eventId = DeepLinkManager.shared.consumeEventId() {
                #if DEBUG
                print("[DeepLink] 🔁 Replaying event join: '\(eventId)'")
                #endif
                selectedTab = .network
                await EventJoinService.shared.joinEvent(eventID: eventId)
            }
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            guard oldValue != newValue else { return }
            #if DEBUG
            print("[TAB-WRITE] \(oldValue) → \(newValue)")
            #endif
        }
    }
}
