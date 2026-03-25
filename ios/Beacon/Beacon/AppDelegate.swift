import UIKit

/// UIKit AppDelegate — UIKit fallback for URL delivery.
///
/// Why this exists
/// ---------------
/// SwiftUI's `.onOpenURL` is the primary handler, but iOS doesn't guarantee
/// it fires in every lifecycle state (particularly when the app is already
/// running in the foreground or is transitioning from the background).
/// UIApplicationDelegate's `application(_:open:options:)` is the older,
/// lower-level hook that iOS has called reliably since iOS 9.  Adding it
/// gives us a second, unconditional delivery path without removing the
/// SwiftUI handler.
///
/// Routing rules (identical to BeaconApp.onOpenURL):
///   beacon://callback…  →  AuthService.handleOAuthCallback  (OAuth only)
///   beacon://event/…    →  DeepLinkManager + EventJoinService
///   anything else       →  DeepLinkManager (stores for MainTabView replay)
final class AppDelegate: NSObject, UIApplicationDelegate {

    func application(
        _ application: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {

        print("🚨 AppDelegate open url:", url.absoluteString)

        // ── Gate 1: OAuth callback ────────────────────────────────────────
        if url.absoluteString.hasPrefix("beacon://callback") {
            Task { await AuthService.shared.handleOAuthCallback(url: url) }
            return true
        }

        // ── Gate 2: All other beacon:// URLs ──────────────────────────────
        // Store for guaranteed replay in MainTabView, then attempt an
        // immediate join in case auth is already loaded.
        DeepLinkManager.shared.handle(url: url)

        if case .event(let eventId)? = QRService.parse(from: url.absoluteString) {
            Task { await EventJoinService.shared.joinEvent(eventID: eventId) }
        }

        return true
    }
}
