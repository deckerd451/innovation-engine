import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {

        print("🚨 AppDelegate open url:", url.absoluteString)

        // ── Gate 1: OAuth callback ────────────────────────────────────────
        // beacon://callback ONLY — never reaches the code below.
        if url.absoluteString.hasPrefix("beacon://callback") {
            Task { await AuthService.shared.handleOAuthCallback(url: url) }
            return true
        }

        // ── Gate 2: All other beacon:// URLs ──────────────────────────────
        // Store in DeepLinkManager so MainTabView can replay on appear
        // (handles cold-launch / auth-not-yet-ready timing).
        DeepLinkManager.shared.handle(url: url)

        guard let payload = QRService.parse(from: url.absoluteString) else {
            print("🚨 AppDelegate could not parse URL")
            return true
        }

        switch payload {
        case .event(let eventId):
            print("🚨 AppDelegate event deep link:", eventId)
            Task {
                await EventJoinService.shared.joinEvent(eventID: eventId)
            }

        case .profile(let communityId):
            print("🚨 AppDelegate profile deep link:", communityId)
        }

        return true
    }
}
