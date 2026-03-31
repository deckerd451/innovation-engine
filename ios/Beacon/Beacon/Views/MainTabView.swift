import SwiftUI
import Combine

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

    @StateObject private var deepLinkManager = DeepLinkManager.shared
    @State private var isConsumingPendingEvent = false

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
        .onAppear {
            #if DEBUG
            print("🚨 MainTabView appeared")
            #endif
            replayPendingEventIfNeeded(source: "onAppear")
        }
        .onReceive(deepLinkManager.$pendingEventId.removeDuplicates()) { pendingEventId in
            guard pendingEventId != nil else { return }
            #if DEBUG
            print("[DeepLink] 🟡 pendingEventId changed while MainTabView active: \(pendingEventId ?? "nil")")
            #endif
            replayPendingEventIfNeeded(source: "onReceive")
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            guard oldValue != newValue else { return }
            #if DEBUG
            print("[TAB-WRITE] \(oldValue) → \(newValue)")
            #endif
        }
    }

    // MARK: - Deep Link Replay

    private func replayPendingEventIfNeeded(source: String) {
        guard !isConsumingPendingEvent else {
            #if DEBUG
            print("[DeepLink] ⛔ Replay blocked (\(source)) — already consuming pending event")
            #endif
            return
        }

        guard let eventId = deepLinkManager.consumeEventId() else {
            #if DEBUG
            print("[DeepLink] 📭 No pending event to replay (\(source))")
            #endif
            return
        }

        isConsumingPendingEvent = true

        #if DEBUG
        print("[DeepLink] 🚨 Replaying pending event from \(source): \(eventId)")
        #endif

        selectedTab = .network

        Task {
            await EventJoinService.shared.joinEvent(eventID: eventId)

            await MainActor.run {
                self.isConsumingPendingEvent = false

                #if DEBUG
                if EventJoinService.shared.isEventJoined {
                    print("[DeepLink] ✅ Pending event replay succeeded: \(eventId)")
                } else {
                    print("[DeepLink] ❌ Pending event replay failed: \(eventId)")
                }
                #endif
            }
        }
    }
}
