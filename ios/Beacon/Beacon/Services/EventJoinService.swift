import Foundation
import Combine
import Supabase

/// Manages event joining via QR code scan / deep link.
/// Nearify v1 source of truth:
/// - ensure_profile RPC
/// - join_event RPC
/// - events table
///
/// BLE / presence are still started after a successful join so the rest
/// of the live event experience can continue to function.
@MainActor
final class EventJoinService: ObservableObject {

    static let shared = EventJoinService()

    // MARK: - Published State

    @Published private(set) var currentEventID: String?
    @Published private(set) var currentEventName: String?
    @Published private(set) var isEventJoined: Bool = false
    @Published private(set) var joinError: String?

    // MARK: - Private

    private let supabase = AppEnvironment.shared.supabaseClient
    private let presence = EventPresenceService.shared
    private var heartbeatTask: Task<Void, Never>?
    private let heartbeatInterval: TimeInterval = 25.0

    /// Prevents concurrent join attempts for the same event.
    private var joiningEventID: String?

    private init() {}

    // MARK: - Join Event

    /// Join an event by its real Nearify event UUID.
    /// Primary authoritative join action:
    /// 1. ensure_profile
    /// 2. join_event
    /// 3. fetch event row
    /// 4. update local state
    /// 5. start BLE / presence
    func joinEvent(eventID: String) async {
        if isEventJoined && currentEventID == eventID {
            #if DEBUG
            print("[EventJoin] ✅ Already joined \(eventID)")
            #endif
            return
        }

        if joiningEventID == eventID {
            #if DEBUG
            print("[EventJoin] ⏳ Join already in progress for \(eventID)")
            #endif
            return
        }

        joiningEventID = eventID
        defer { joiningEventID = nil }

        #if DEBUG
        print("[EventJoin] 🎫 Joining Nearify event: \(eventID)")
        #endif

        joinError = nil

        guard let eventUUID = UUID(uuidString: eventID) else {
            joinError = "Invalid event ID"
            print("[EventJoin] ❌ Invalid event UUID: \(eventID)")
            return
        }

        do {
            let profile = try await ensureProfile()
            #if DEBUG
            print("[EventJoin] ✅ Profile ensured: \(profile.id)")
            #endif

            let attendee = try await joinEventRPC(eventID: eventUUID)
            #if DEBUG
            print("[EventJoin] ✅ Event joined: \(attendee.id)")
            #endif

            let event = try await fetchEvent(eventID: eventUUID)

            currentEventID = event.id.uuidString
            currentEventName = event.name
            isEventJoined = true
            joinError = nil

            // Notify presence / UI layer using real Nearify IDs.
            presence.activateFromQRJoin(
                eventName: event.name,
                contextId: event.id,
                communityId: profile.id
            )

            // Start BLE using the Nearify profile ID as the identity anchor.
            #if DEBUG
            let expectedPrefix = String(profile.id.uuidString.prefix(8)).lowercased()
            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print("[EventJoin] 📡 Starting BLE identity layer")
            print("  Event ID: \(event.id.uuidString)")
            print("  Event Name: \(event.name)")
            print("  Profile ID: \(profile.id)")
            print("  Expected BLE prefix: BCN-\(expectedPrefix)")
            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            #endif

            BLEAdvertiserService.shared.startAdvertisingForEvent(communityId: profile.id)
            BLEScannerService.shared.startScanning()

            #if DEBUG
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                let advState = BLEAdvertiserService.shared.isAdvertising
                let scanState = BLEScannerService.shared.isScanning
                let advPrefix = BLEAdvertiserService.shared.advertisedCommunityPrefix
                print("[EventJoin] 🔍 Post-join BLE verification:")
                print("  Advertiser active: \(advState)")
                print("  Advertised prefix: \(advPrefix ?? "nil")")
                print("  Scanner active: \(scanState)")
                if !advState {
                    print("  ⚠️ Advertiser NOT active — BT may still be initializing")
                }
            }
            #endif

            // Keep heartbeat behavior for now, but use the real event UUID as context.
            startHeartbeat(profileId: profile.id, eventId: event.id)

            #if DEBUG
            print("[EventJoin] ✅ Joined Nearify event: \(event.name)")
            #endif
        } catch {
            joinError = error.localizedDescription
            print("[EventJoin] ❌ joinEvent failed: \(error)")
        }
    }

    // MARK: - Leave Event

    func leaveEvent() {
        #if DEBUG
        print("[EventJoin] 👋 Leaving event: \(currentEventID ?? "nil")")
        #endif

        heartbeatTask?.cancel()
        heartbeatTask = nil
        joiningEventID = nil

        BLEAdvertiserService.shared.stopEventAdvertising()
        BLEScannerService.shared.stopScanning()

        currentEventID = nil
        currentEventName = nil
        isEventJoined = false
        joinError = nil

        presence.reset()

        #if DEBUG
        print("[EventJoin] ✅ Left event")
        #endif
    }

    // MARK: - Nearify Backend Helpers

    private func ensureProfile() async throws -> NearifyProfile {
        let session = try await supabase.auth.session
        let user = session.user

        let name =
            metadataString(user: user, key: "full_name") ??
            metadataString(user: user, key: "name") ??
            user.email ??
            "Nearify User"

        let email = user.email
        let avatarURL = metadataString(user: user, key: "avatar_url")

        let profile: NearifyProfile = try await supabase
            .rpc(
                "ensure_profile",
                params: [
                    "p_name": name,
                    "p_email": email as Any,
                    "p_avatar_url": avatarURL as Any
                ]
            )
            .execute()
            .value

        return profile
    }

    private func joinEventRPC(eventID: UUID) async throws -> NearifyAttendee {
        let attendee: NearifyAttendee = try await supabase
            .rpc(
                "join_event",
                params: [
                    "p_event_id": eventID.uuidString
                ]
            )
            .execute()
            .value

        return attendee
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
            throw NSError(
                domain: "Nearify",
                code: 404,
                userInfo: [NSLocalizedDescriptionKey: "Event not found"]
            )
        }

        return event
    }

    // MARK: - Heartbeat

    private func startHeartbeat(profileId: UUID, eventId: UUID) {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(heartbeatInterval * 1_000_000_000))
                guard !Task.isCancelled, let self, self.isEventJoined else { break }

                do {
                    try await self.writePresence(profileId: profileId, eventId: eventId)
                    #if DEBUG
                    print("[EventJoin] 💓 Heartbeat")
                    #endif
                } catch {
                    print("[EventJoin] ⚠️ Heartbeat write failed: \(error)")
                }
            }
        }
    }

    // MARK: - Presence Write (kept for live event layer)

    /// Writes presence using the Nearify profile ID and event UUID as context.
    /// This is no longer the primary join action; it is now supportive runtime state.
    private func writePresence(profileId: UUID, eventId: UUID) async throws {
        let now = Date()
        let expiresAt = now.addingTimeInterval(5 * 60)
        let nowISO = ISO8601DateFormatter().string(from: now)
        let expiresISO = ISO8601DateFormatter().string(from: expiresAt)

        let existing: [PresenceUpdateRow] = try await supabase
            .from("presence_sessions")
            .select("id")
            .eq("user_id", value: profileId.uuidString)
            .eq("context_type", value: "beacon")
            .eq("context_id", value: eventId.uuidString)
            .eq("is_active", value: true)
            .order("last_seen", ascending: false)
            .limit(1)
            .execute()
            .value

        if let rowId = existing.first?.id {
            try await supabase
                .from("presence_sessions")
                .update([
                    "energy": AnyJSON.double(0.5),
                    "last_seen": AnyJSON.string(nowISO),
                    "expires_at": AnyJSON.string(expiresISO),
                    "is_active": AnyJSON.bool(true)
                ])
                .eq("id", value: rowId.uuidString)
                .execute()

            #if DEBUG
            print("[EventJoin] ✅ Presence updated (row \(rowId.uuidString.prefix(8)))")
            #endif
        } else {
            try await supabase
                .from("presence_sessions")
                .insert(
                    PresenceInsertPayload(
                        user_id: profileId,
                        context_type: "beacon",
                        context_id: eventId,
                        energy: 0.5,
                        expires_at: expiresAt,
                        last_seen: now,
                        is_active: true
                    )
                )
                .execute()

            #if DEBUG
            print("[EventJoin] ✅ Presence inserted (new row)")
            #endif
        }
    }

    // MARK: - Metadata Helper

    private func metadataString(user: User, key: String) -> String? {
        // userMetadata is typically [String: AnyJSON] in Supabase Swift.
        // This helper safely extracts a string without assuming too much.
        if let raw = user.userMetadata[key] {
            let text = String(describing: raw)
            if text == "null" { return nil }

            // Common AnyJSON string rendering includes quotes.
            let trimmed = text.trimmingCharacters(in: CharacterSet(charactersIn: "\""))
            return trimmed.isEmpty ? nil : trimmed
        }
        return nil
    }
}

// MARK: - Models

private struct NearifyProfile: Decodable {
    let id: UUID
    let user_id: UUID
    let name: String?
    let email: String?
    let avatar_url: String?
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

private struct PresenceUpdateRow: Decodable {
    let id: UUID
}

private struct PresenceInsertPayload: Encodable {
    let user_id: UUID
    let context_type: String
    let context_id: UUID
    let energy: Double
    let expires_at: Date
    let last_seen: Date
    let is_active: Bool
}
