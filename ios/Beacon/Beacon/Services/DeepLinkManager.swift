import Foundation
import Combine

@MainActor
final class DeepLinkManager: ObservableObject {

    static let shared = DeepLinkManager()

    @Published private(set) var pendingEventId: String?

    private init() {}

    func handle(url: URL) {
        let urlString = url.absoluteString

        #if DEBUG
        print("🚨 DeepLinkManager.handle called: \(urlString)")
        #endif

        guard let payload = QRService.parse(from: urlString) else {
            #if DEBUG
            print("[DeepLink] ❓ Unrecognized URL: \(urlString)")
            #endif
            return
        }

        switch payload {
        case .event(let eventId):
            pendingEventId = eventId
            #if DEBUG
            print("[DeepLink] 📥 Stored pending event: \(eventId)")
            #endif

        case .profile(let communityId):
            #if DEBUG
            print("[DeepLink] 👤 Profile URL received: \(communityId)")
            #endif
        }
    }

    func consumeEventId() -> String? {
        guard let id = pendingEventId else {
            #if DEBUG
            print("[DeepLink] 📭 No pending event to consume")
            #endif
            return nil
        }

        pendingEventId = nil

        #if DEBUG
        print("[DeepLink] 📤 Consumed pending event: \(id)")
        #endif

        return id
    }

    func clear() {
        #if DEBUG
        if let pendingEventId {
            print("[DeepLink] 🧹 Clearing pending event: \(pendingEventId)")
        }
        #endif
        pendingEventId = nil
    }
}
