import Foundation

/// Stores incoming deep-link payloads so they can be replayed once the
/// authenticated UI is fully mounted.
///
/// Problem this solves
/// -------------------
/// SwiftUI's `.onOpenURL` fires as soon as iOS delivers the URL, which can
/// happen before the authenticated root view has appeared (e.g. cold launch
/// from a beacon://event/ link, or a URL arriving while auth state is still
/// being resolved).  In those cases the immediate `EventJoinService.joinEvent`
/// call in `BeaconApp.onOpenURL` either races with auth or completes before
/// `MainTabView` is alive to react to the state change.
///
/// `DeepLinkManager` acts as a short-lived buffer:
///   1. `BeaconApp.onOpenURL` calls `handle(url:)` for every non-OAuth URL.
///   2. `MainTabView` calls `consumeEventId()` in its `.task { }` modifier,
///      which fires once the view is mounted and auth is confirmed ready.
///   3. `EventJoinService.joinEvent` already guards against duplicate joins
///      for the same event, so a double-fire is safe.
@MainActor
final class DeepLinkManager: ObservableObject {

    static let shared = DeepLinkManager()

    // MARK: - State

    /// The most recently received event ID that has not yet been consumed.
    private(set) var pendingEventId: String?

    private init() {}

    // MARK: - API

    /// Parse `url` and store any event payload for later replay.
    /// Profile URLs are accepted but have no pending storage yet.
    func handle(url: URL) {
        let urlString = url.absoluteString

        guard let payload = QRService.parse(from: urlString) else {
            #if DEBUG
            print("[DeepLink] ❓ DeepLinkManager: unrecognised URL: \(urlString)")
            #endif
            return
        }

        switch payload {
        case .event(let eventId):
            #if DEBUG
            print("[DeepLink] 📥 DeepLinkManager stored pending event: '\(eventId)'")
            #endif
            pendingEventId = eventId

        case .profile:
            // No pending storage for profile links yet.
            break
        }
    }

    /// Return the pending event ID and clear it atomically.
    /// Returns `nil` if nothing is pending.
    func consumeEventId() -> String? {
        guard let id = pendingEventId else { return nil }
        pendingEventId = nil
        #if DEBUG
        print("[DeepLink] 📤 DeepLinkManager consumed pending event: '\(id)'")
        #endif
        return id
    }
}
