import Foundation
import Combine
import Supabase

@MainActor
final class EventJoinService: ObservableObject {

    static let shared = EventJoinService()

    @Published private(set) var currentEventID: String?
    @Published private(set) var currentEventName: String?
    @Published private(set) var isEventJoined: Bool = false
    @Published private(set) var joinError: String?

    private let supabase = AppEnvironment.shared.supabaseClient
    private let presence = EventPresenceService.shared
    private var heartbeatTask: Task<Void, Never>?
    private let heartbeatInterval: TimeInterval = 25.0

    private init() {}

    // MARK: - Join Event

    func joinEvent(eventID: String) async {
        #if DEBUG
        print("[EventJoin] 🎫 Joining event: \(eventID)")
        #endif

        guard let eventUUID = UUID(uuidString: eventID) else {
            joinError = "Invalid event ID"
            return
        }

        do {
            let profile = try await ensureProfile()

            let attendee = try await joinEventRPC(eventID: eventUUID)

            let event = try await fetchEvent(eventID: eventUUID)

            currentEventID = event.id.uuidString
            currentEventName = event.name
            isEventJoined = true

            presence.activateFromQRJoin(
                eventName: event.name,
                contextId: event.id,
                communityId: profile.id
            )

            BLEAdvertiserService.shared.startAdvertisingForEvent(communityId: profile.id)
            BLEScannerService.shared.startScanning()

            startHeartbeat(profileId: profile.id, eventId: event.id)

            #if DEBUG
            print("[EventJoin] ✅ Joined event: \(event.name)")
            #endif

        } catch {
            joinError = error.localizedDescription
            print("[EventJoin] ❌ Join failed: \(error)")
        }
    }

    // MARK: - Heartbeat (NEW)

    private func startHeartbeat(profileId: UUID, eventId: UUID) {
        heartbeatTask?.cancel()

        heartbeatTask = Task { [weak self] in
            guard let self else { return }

            #if DEBUG
            print("[Presence] ▶️ Starting event_attendees heartbeat")
            #endif

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.heartbeatInterval * 1_000_000_000))
                guard !Task.isCancelled else { break }

                do {
                    try await self.touchAttendance(eventId: eventId, profileId: profileId)
                    #if DEBUG
                    print("[Presence] ✅ Updated event_attendees heartbeat")
                    #endif
                } catch {
                    print("[Presence] ⚠️ Heartbeat failed: \(error)")
                }
            }

            #if DEBUG
            print("[Presence] ⏹️ Heartbeat loop exited")
            #endif
        }
    }

    private func touchAttendance(eventId: UUID, profileId: UUID) async throws {
        let nowISO = ISO8601DateFormatter().string(from: Date())

        try await supabase
            .from("event_attendees")
            .update([
                "last_seen_at": AnyJSON.string(nowISO)
            ])
            .eq("event_id", value: eventId.uuidString)
            .eq("profile_id", value: profileId.uuidString)
            .execute()
    }

    // MARK: - Leave Event

    func leaveEvent() {
        heartbeatTask?.cancel()

        BLEAdvertiserService.shared.stopEventAdvertising()
        BLEScannerService.shared.stopScanning()

        currentEventID = nil
        currentEventName = nil
        isEventJoined = false

        presence.reset()

        #if DEBUG
        print("[EventJoin] 👋 Left event")
        #endif
    }

    // MARK: - Backend

    private func ensureProfile() async throws -> NearifyProfile {
        let session = try await supabase.auth.session
        let email = session.user.email ?? ""

        let params = EnsureProfileParams(
            p_name: email,
            p_email: email,
            p_avatar_url: ""
        )

        return try await supabase
            .rpc("ensure_profile", params: params)
            .execute()
            .value
    }

    private func joinEventRPC(eventID: UUID) async throws -> NearifyAttendee {
        let params = JoinEventParams(p_event_id: eventID.uuidString)

        return try await supabase
            .rpc("join_event", params: params)
            .execute()
            .value
    }

    private func fetchEvent(eventID: UUID) async throws -> NearifyEvent {
        let events: [NearifyEvent] = try await supabase
            .from("events")
            .select("id,name")
            .eq("id", value: eventID.uuidString)
            .limit(1)
            .execute()
            .value

        guard let event = events.first else {
            throw NSError(domain: "Nearify", code: 404)
        }

        return event
    }
}

// MARK: - Models

private struct EnsureProfileParams: Encodable {
    let p_name: String
    let p_email: String
    let p_avatar_url: String
}

private struct JoinEventParams: Encodable {
    let p_event_id: String
}

private struct NearifyAttendee: Decodable {
    let id: UUID
    let event_id: UUID
    let profile_id: UUID
    let status: String
}

private struct NearifyEvent: Decodable {
    let id: UUID
    let name: String
}
