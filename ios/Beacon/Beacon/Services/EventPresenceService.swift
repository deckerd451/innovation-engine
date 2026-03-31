import Foundation
import Combine
import Supabase

// MARK: - Supabase Row Types

struct EventAttendanceRow: Codable, Identifiable {
    let id: UUID
    let eventId: UUID
    let profileId: UUID
    let status: String
    let joinedAt: Date
    let lastSeenAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case eventId = "event_id"
        case profileId = "profile_id"
        case status
        case joinedAt = "joined_at"
        case lastSeenAt = "last_seen_at"
    }
}

struct NearifyProfileRow: Decodable {
    let id: UUID
    let authUserId: UUID

    enum CodingKeys: String, CodingKey {
        case id
        case authUserId = "auth_user_id"
    }
}

// MARK: - Event Presence Service

@MainActor
final class EventPresenceService: ObservableObject {

    static let shared = EventPresenceService()

    @Published private(set) var currentEvent: String?
    @Published private(set) var isWritingPresence = false
    @Published private(set) var lastPresenceWrite: Date?
    @Published private(set) var debugStatus: String = "Idle"

    // Exposed for other services/views
    var currentContextId: UUID? { _currentEventId }
    var currentCommunityId: UUID? { _currentProfileId } // kept for compatibility; now means profile id

    private let supabase = AppEnvironment.shared.supabaseClient

    private var heartbeatTask: Task<Void, Never>?
    private var _currentProfileId: UUID?
    private var _currentEventId: UUID?

    private let heartbeatInterval: TimeInterval = 25.0

    /// True when context was established via QR join.
    private(set) var isQRJoinActive = false

    private init() {}

    // MARK: - Public API

    func reset() {
        #if DEBUG
        print("[Presence] manual reset")
        #endif
        stopHeartbeat(clearContext: true)
    }

    /// Called by EventJoinService when a user joins an event.
    /// This activates presence state and starts the heartbeat loop.
    func activateFromQRJoin(eventName: String, contextId eventId: UUID, communityId profileId: UUID) {
        #if DEBUG
        print("[Presence] 🎫 Activating from QR join — \(eventName)")
        #endif

        isQRJoinActive = true
        _currentEventId = eventId
        _currentProfileId = profileId
        currentEvent = eventName
        debugStatus = "QR join active: \(eventName)"
        lastPresenceWrite = Date()

        startHeartbeat()
    }

    func leaveCurrentEvent() async {
        guard let eventId = _currentEventId, let profileId = _currentProfileId else {
            debugStatus = "No active event to leave"
            return
        }

        await setAttendanceStatus(
            eventId: eventId,
            profileId: profileId,
            status: "left"
        )

        stopHeartbeat(clearContext: true)
    }

    func debugWritePresenceNow() async {
        guard let eventId = _currentEventId, let profileId = _currentProfileId else {
            debugStatus = "FAILED: no active event/profile"
            return
        }

        await touchAttendance(eventId: eventId, profileId: profileId)
    }

    // MARK: - Heartbeat

    private func startHeartbeat() {
        guard heartbeatTask == nil else { return }
        guard let eventId = _currentEventId, let profileId = _currentProfileId else {
            debugStatus = "Cannot start heartbeat: missing event/profile"
            return
        }

        heartbeatTask = Task { [weak self] in
            guard let self else { return }

            #if DEBUG
            print("[Presence] ▶️ Starting event_attendees heartbeat")
            #endif

            await self.touchAttendance(eventId: eventId, profileId: profileId)

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.heartbeatInterval * 1_000_000_000))
                guard !Task.isCancelled else { break }

                let shouldContinue = await MainActor.run { self.isQRJoinActive }
                guard shouldContinue else { break }

                await self.touchAttendance(eventId: eventId, profileId: profileId)
            }

            #if DEBUG
            print("[Presence] ⏹️ Heartbeat loop exited")
            #endif
        }
    }

    private func stopHeartbeat(clearContext: Bool) {
        heartbeatTask?.cancel()
        heartbeatTask = nil

        isWritingPresence = false
        isQRJoinActive = false

        if clearContext {
            _currentEventId = nil
            _currentProfileId = nil
            currentEvent = nil
            debugStatus = "Stopped"
        } else {
            debugStatus = "Heartbeat stopped"
        }
    }

    // MARK: - Presence via event_attendees

    /// Upserts attendance presence by setting status='joined' and refreshing last_seen_at.
    private func touchAttendance(eventId: UUID, profileId: UUID) async {
        await MainActor.run {
            isWritingPresence = true
            debugStatus = "Writing attendance heartbeat..."
        }

        let now = Date()
        let nowISO = ISO8601DateFormatter().string(from: now)

        do {
            let existing: [EventAttendanceRow] = try await supabase
                .from("event_attendees")
                .select("id, event_id, profile_id, status, joined_at, last_seen_at")
                .eq("event_id", value: eventId.uuidString)
                .eq("profile_id", value: profileId.uuidString)
                .limit(1)
                .execute()
                .value

            if let existingRow = existing.first {
                try await supabase
                    .from("event_attendees")
                    .update([
                        "status": AnyJSON.string("joined"),
                        "last_seen_at": AnyJSON.string(nowISO)
                    ])
                    .eq("id", value: existingRow.id.uuidString)
                    .execute()

                await MainActor.run {
                    lastPresenceWrite = now
                    debugStatus = "Heartbeat updated at \(now.formatted(date: .omitted, time: .standard))"
                }

                #if DEBUG
                print("[Presence] ✅ Updated event_attendees heartbeat")
                #endif
            } else {
                try await supabase
                    .from("event_attendees")
                    .insert([
                        [
                            "event_id": AnyJSON.string(eventId.uuidString),
                            "profile_id": AnyJSON.string(profileId.uuidString),
                            "status": AnyJSON.string("joined"),
                            "joined_at": AnyJSON.string(nowISO),
                            "last_seen_at": AnyJSON.string(nowISO)
                        ]
                    ])
                    .execute()

                await MainActor.run {
                    lastPresenceWrite = now
                    debugStatus = "Attendance inserted at \(now.formatted(date: .omitted, time: .standard))"
                }

                #if DEBUG
                print("[Presence] ✅ Inserted event_attendees row")
                #endif
            }
        } catch {
            let isCancellation: Bool
            if let nsError = error as NSError?,
               nsError.domain == NSURLErrorDomain,
               nsError.code == NSURLErrorCancelled {
                isCancellation = true
            } else {
                isCancellation = false
            }

            if isCancellation {
                #if DEBUG
                print("[Presence] ⚠️ Attendance write cancelled")
                #endif
                await MainActor.run {
                    debugStatus = "Write cancelled"
                }
            } else {
                #if DEBUG
                print("[Presence] ❌ Attendance heartbeat failed: \(error.localizedDescription)")
                #endif
                await MainActor.run {
                    debugStatus = "FAILED write: \(error.localizedDescription)"
                }
            }
        }

        await MainActor.run {
            isWritingPresence = false
        }
    }

    private func setAttendanceStatus(eventId: UUID, profileId: UUID, status: String) async {
        await MainActor.run {
            isWritingPresence = true
            debugStatus = "Updating attendance status..."
        }

        let nowISO = ISO8601DateFormatter().string(from: Date())

        do {
            try await supabase
                .from("event_attendees")
                .update([
                    "status": AnyJSON.string(status),
                    "last_seen_at": AnyJSON.string(nowISO)
                ])
                .eq("event_id", value: eventId.uuidString)
                .eq("profile_id", value: profileId.uuidString)
                .execute()

            await MainActor.run {
                lastPresenceWrite = Date()
                debugStatus = "Status set to \(status)"
            }

            #if DEBUG
            print("[Presence] ✅ Attendance status updated to \(status)")
            #endif
        } catch {
            #if DEBUG
            print("[Presence] ❌ Failed to set attendance status: \(error.localizedDescription)")
            #endif
            await MainActor.run {
                debugStatus = "FAILED status update: \(error.localizedDescription)"
            }
        }

        await MainActor.run {
            isWritingPresence = false
        }
    }

    // MARK: - Helpers

    /// Use this if you ever need to recover the current profile id from auth.
    func resolveProfileId() async -> UUID? {
        do {
            let session = try await supabase.auth.session
            let authUserId = session.user.id

            let rows: [NearifyProfileRow] = try await supabase
                .from("profiles")
                .select("id, auth_user_id")
                .eq("auth_user_id", value: authUserId.uuidString)
                .limit(1)
                .execute()
                .value

            return rows.first?.id
        } catch {
            #if DEBUG
            print("[Presence] ❌ Error resolving profiles.id from auth.uid(): \(error)")
            #endif
            return nil
        }
    }
}
