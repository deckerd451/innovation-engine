import Foundation
import Combine
import Supabase

/// Manages event joining via QR code scan.
/// This is the primary way users join events. BLE beacon detection is optional
/// and upgrades the experience with proximity features.
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
    /// The event ID currently being joined (in-flight guard).
    /// Prevents concurrent join attempts for the same event.
    private var joiningEventID: String?

    /// Maps raw event IDs to friendly display names.
    private static let eventDisplayNames: [String: String] = [
        "charlestonhacks": "CharlestonHacks",
    ]

    /// Returns a friendly display name for an event ID.
    static func displayName(for eventID: String) -> String {
        eventDisplayNames[eventID.lowercased()] ?? eventID.capitalized
    }

    private init() {}

    // MARK: - Join Event

    /// Join an event by its ID (from QR code scan).
    /// Creates a presence session and starts heartbeat.
    /// Ignores duplicate/concurrent calls for the same event.
    func joinEvent(eventID: String) async {
        // Already joined this event — nothing to do.
        if isEventJoined && currentEventID == eventID {
            #if DEBUG
            print("[EventJoin] ✅ Already joined \(eventID) — ignoring duplicate")
            #endif
            return
        }

        // Another join for this event is already in flight.
        if joiningEventID == eventID {
            #if DEBUG
            print("[EventJoin] ⏳ Join already in progress for \(eventID) — ignoring duplicate")
            #endif
            return
        }

        joiningEventID = eventID
        defer { joiningEventID = nil }
        #if DEBUG
        print("[EventJoin] 🎫 Joining event: \(eventID)")
        #endif
        joinError = nil

        // Resolve community ID
        guard let communityId = await resolveCommunityId() else {
            joinError = "Could not resolve your profile"
            print("[EventJoin] ❌ Failed to resolve community ID")
            return
        }

        // Resolve event context ID
        guard let contextId = await resolveEventContextId(eventID: eventID) else {
            joinError = "Event not found: \(eventID)"
            print("[EventJoin] ❌ Failed to resolve event context ID for: \(eventID)")
            return
        }

        // Write initial presence — this is the authoritative join action.
        do {
            try await writePresence(communityId: communityId, contextId: contextId)
            #if DEBUG
            print("[EventJoin] ✅ Presence write succeeded — join is confirmed")
            #endif
        } catch {
            // Only set error if the join hasn't already succeeded (race protection).
            if !isEventJoined || currentEventID != eventID {
                joinError = "Failed to join event"
            }
            print("[EventJoin] ❌ Presence write failed: \(error)")
            return
        }

        // Success — update state immediately, before any cleanup.
        currentEventID = eventID
        currentEventName = Self.displayName(for: eventID)
        isEventJoined = true
        joinError = nil  // Clear any stale error from a prior attempt

        // Best-effort cleanup of stale duplicate rows.
        // This runs AFTER join success so its failure cannot cause "Failed to join event".
        Task {
            do {
                try await deactivateStaleDuplicates(communityId: communityId, contextId: contextId)
            } catch {
                print("[EventJoin] ⚠️ Stale row cleanup failed (non-fatal): \(error.localizedDescription)")
            }
        }

        // Notify EventPresenceService so NetworkView/HomeView activate
        presence.activateFromQRJoin(
            eventName: Self.displayName(for: eventID),
            contextId: contextId,
            communityId: communityId
        )

        // Start BLE advertising with community ID for peer discovery
        #if DEBUG
        let expectedPrefix = String(communityId.uuidString.prefix(8)).lowercased()
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[EventJoin] 📡 Starting BLE identity layer")
        print("  Event ID: \(eventID)")
        print("  Context ID: \(contextId)")
        print("  Community ID: \(communityId)")
        print("  Expected BLE prefix: BCN-\(expectedPrefix)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        #endif
        
        BLEAdvertiserService.shared.startAdvertisingForEvent(communityId: communityId)
        BLEScannerService.shared.startScanning()
        
        // Verify advertising state after a short delay
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

        // Start heartbeat
        startHeartbeat(communityId: communityId, contextId: contextId)

        #if DEBUG
        print("[EventJoin] ✅ Joined event: \(eventID)")
        #endif
    }

    // MARK: - Leave Event

    func leaveEvent() {
        #if DEBUG
        print("[EventJoin] 👋 Leaving event: \(currentEventID ?? "nil")")
        #endif

        heartbeatTask?.cancel()
        heartbeatTask = nil
        joiningEventID = nil

        // Stop BLE
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

    // MARK: - Heartbeat

    private func startHeartbeat(communityId: UUID, contextId: UUID) {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(25.0 * 1_000_000_000))
                guard !Task.isCancelled, let self, self.isEventJoined else { break }
                do {
                    try await self.writePresence(communityId: communityId, contextId: contextId)
                    #if DEBUG
                    print("[EventJoin] 💓 Heartbeat")
                    #endif
                } catch {
                    print("[EventJoin] ⚠️ Heartbeat write failed: \(error)")
                }
            }
        }
    }

    // MARK: - Presence Write (Select-then-Update/Insert)

    /// Writes presence using a select-then-update/insert pattern.
    /// 1. SELECT the existing active row id for this user+context.
    /// 2. If found, UPDATE that row by primary key.
    /// 3. If not found, INSERT a new row.
    /// This prevents duplicate active rows from accumulating.
    private func writePresence(communityId: UUID, contextId: UUID) async throws {
        let now = Date()
        let expiresAt = now.addingTimeInterval(5 * 60)
        let nowISO = ISO8601DateFormatter().string(from: now)
        let expiresISO = ISO8601DateFormatter().string(from: expiresAt)

        // Step 1: Check for existing active row.
        let existing: [PresenceUpdateRow] = try await supabase
            .from("presence_sessions")
            .select("id")
            .eq("user_id", value: communityId.uuidString)
            .eq("context_type", value: "beacon")
            .eq("context_id", value: contextId.uuidString)
            .eq("is_active", value: true)
            .order("last_seen", ascending: false)
            .limit(1)
            .execute()
            .value

        if let rowId = existing.first?.id {
            // Step 2a: Update existing row by primary key.
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
            // Step 2b: No existing row — insert.
            try await supabase
                .from("presence_sessions")
                .insert(PresenceInsertPayload(
                    user_id: communityId,
                    context_type: "beacon",
                    context_id: contextId,
                    energy: 0.5,
                    expires_at: expiresAt,
                    last_seen: now,
                    is_active: true
                ))
                .execute()

            #if DEBUG
            print("[EventJoin] ✅ Presence inserted (new row)")
            #endif
        }
    }

    // MARK: - Duplicate Cleanup

    /// Deactivates stale duplicate presence rows, keeping only the most recent one.
    /// Uses a two-step approach: find the keeper, then deactivate others by exclusion.
    /// Runs as best-effort after join success — failure here is non-fatal.
    private func deactivateStaleDuplicates(communityId: UUID, contextId: UUID) async throws {
        // Step 1: Find the most recent active row (the one to keep).
        let keeper: [PresenceUpdateRow] = try await supabase
            .from("presence_sessions")
            .select("id")
            .eq("user_id", value: communityId.uuidString)
            .eq("context_type", value: "beacon")
            .eq("context_id", value: contextId.uuidString)
            .eq("is_active", value: true)
            .order("last_seen", ascending: false)
            .limit(1)
            .execute()
            .value

        guard let keeperId = keeper.first?.id else { return }

        // Step 2: Deactivate all OTHER active rows for this user+context.
        // This uses neq on a single ID instead of a massive OR filter.
        try await supabase
            .from("presence_sessions")
            .update(["is_active": AnyJSON.bool(false)])
            .eq("user_id", value: communityId.uuidString)
            .eq("context_type", value: "beacon")
            .eq("context_id", value: contextId.uuidString)
            .eq("is_active", value: true)
            .neq("id", value: keeperId.uuidString)
            .execute()

        #if DEBUG
        print("[EventJoin] 🧹 Deactivated stale duplicates (kept row \(keeperId.uuidString.prefix(8)))")
        #endif
    }

    // MARK: - Resolution Helpers

    private func resolveCommunityId() async -> UUID? {
        // Prefer cached from AuthService
        if let cached = AuthService.shared.currentUser?.id {
            return cached
        }

        // Fallback: query community table
        do {
            let session = try await supabase.auth.session
            let rows: [EventPresenceCommunityRow] = try await supabase
                .from("community")
                .select("id")
                .eq("user_id", value: session.user.id.uuidString)
                .limit(1)
                .execute()
                .value
            return rows.first?.id
        } catch {
            print("[EventJoin] ❌ resolveCommunityId error: \(error)")
            return nil
        }
    }

    /// Resolves the context UUID for an event ID string.
    /// Currently uses the hardcoded context ID (same as beacon presence).
    /// In the future this could query an events table.
    private func resolveEventContextId(eventID: String) async -> UUID? {
        // For now, all events use the same hardcoded context ID
        // that the beacon presence system uses.
        // This ensures QR-joined users appear in the same attendee pool.
        return UUID(uuidString: "8b7c40b1-0c94-497a-8f4e-a815f570cc25")
    }
}

// MARK: - Presence Write Models

/// Minimal row returned from an UPDATE ... RETURNING id query.
private struct PresenceUpdateRow: Decodable {
    let id: UUID
}

/// Payload for inserting a new presence row.
private struct PresenceInsertPayload: Encodable {
    let user_id: UUID
    let context_type: String
    let context_id: UUID
    let energy: Double
    let expires_at: Date
    let last_seen: Date
    let is_active: Bool
}
