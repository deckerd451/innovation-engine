import Foundation
import Combine
import Supabase

// MARK: - Active Attendee Model

struct EventAttendee: Identifiable, Equatable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    let bio: String?
    let skills: [String]?
    let interests: [String]?
    let energy: Double
    let lastSeen: Date

    var isActiveNow: Bool {
        Date().timeIntervalSince(lastSeen) < 60
    }

    var lastSeenText: String {
        let interval = Date().timeIntervalSince(lastSeen)
        if interval < 30 {
            return "Active now"
        } else if interval < 60 {
            return "\(Int(interval))s ago"
        } else if interval < 300 {
            return "\(Int(interval / 60))m ago"
        } else {
            return "Recently"
        }
    }

    var graphSubtitleText: String {
        if let skills = skills, !skills.isEmpty {
            return skills.prefix(2).joined(separator: " • ")
        }

        if let interests = interests, !interests.isEmpty {
            return interests.prefix(2).joined(separator: " • ")
        }

        if let bio = bio, !bio.isEmpty {
            let trimmed = bio.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count <= 40 {
                return trimmed
            } else {
                return String(trimmed.prefix(37)) + "..."
            }
        }

        return "Attending now"
    }

    var detailSubtitleText: String {
        if let bio = bio, !bio.isEmpty {
            let trimmed = bio.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count <= 60 {
                return trimmed
            } else {
                return String(trimmed.prefix(57)) + "..."
            }
        }

        if let skills = skills, !skills.isEmpty {
            return skills.prefix(3).joined(separator: " • ")
        }

        if let interests = interests, !interests.isEmpty {
            return interests.prefix(3).joined(separator: " • ")
        }

        return "Attending now"
    }

    var bioSnippet: String? {
        guard let bio = bio, !bio.isEmpty else { return nil }

        let trimmed = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 120 {
            return trimmed
        }

        return String(trimmed.prefix(117)) + "..."
    }

    var topTags: [String] {
        if let interests = interests, !interests.isEmpty {
            return Array(interests.prefix(3))
        }

        if let skills = skills, !skills.isEmpty {
            return Array(skills.prefix(3))
        }

        return []
    }

    var initials: String {
        let components = name.components(separatedBy: " ")
        if components.count >= 2 {
            let first = components[0].prefix(1)
            let last = components[1].prefix(1)
            return "\(first)\(last)".uppercased()
        } else {
            return String(name.prefix(2)).uppercased()
        }
    }
}

// MARK: - Event Attendees Service

@MainActor
final class EventAttendeesService: ObservableObject {

    static let shared = EventAttendeesService()

    @Published private(set) var attendees: [EventAttendee] = []
    @Published private(set) var isLoading = false
    @Published private(set) var attendeeCount: Int = 0
    @Published var debugStatus: String = "idle"

    private let presence = EventPresenceService.shared
    private let eventJoin = EventJoinService.shared
    private let supabase = AppEnvironment.shared.supabaseClient
    private var cancellables = Set<AnyCancellable>()

    private var refreshTask: Task<Void, Never>?

    private let refreshInterval: TimeInterval = 15.0
    private let activeWindow: TimeInterval = 300.0

    private var lastFetchSignature: String = ""

    private init() {
        observePresenceState()
    }

    // MARK: - Observation

    private func observePresenceState() {
        Publishers.CombineLatest3(
            presence.$currentEvent,
            presence.$lastPresenceWrite,
            eventJoin.$isEventJoined
        )
        .receive(on: RunLoop.main)
        .sink { [weak self] event, _, isJoined in
            guard let self else { return }

            let hasContext = self.presence.currentContextId != nil
            let hasUser = self.presence.currentCommunityId != nil
            let hasEvent = event != nil || isJoined

            #if DEBUG
            print("[Attendees] observePresenceState")
            print("[Attendees]   currentEvent: \(event ?? "nil")")
            print("[Attendees]   isEventJoined: \(isJoined)")
            print("[Attendees]   hasContext: \(hasContext)")
            print("[Attendees]   hasUser: \(hasUser)")
            print("[Attendees]   currentContextId: \(self.presence.currentContextId?.uuidString ?? "nil")")
            print("[Attendees]   currentProfileId: \(self.presence.currentCommunityId?.uuidString ?? "nil")")
            #endif

            if hasEvent && hasContext && hasUser {
                #if DEBUG
                let source = self.presence.isQRJoinActive ? "QR join" : "beacon"
                print("[Attendees] 🟢 Presence ready via \(source) — starting refresh")
                #endif
                self.startRefreshing()
            } else {
                #if DEBUG
                print("[Attendees] 🔴 Presence not ready — stopping refresh")
                #endif
                self.stopRefreshing()
            }
        }
        .store(in: &cancellables)
    }

    // MARK: - Refresh Loop

    private func startRefreshing() {
        guard presence.currentEvent != nil else {
            #if DEBUG
            print("[Attendees] startRefreshing aborted: currentEvent is nil")
            #endif
            return
        }

        if let task = refreshTask, !task.isCancelled {
            #if DEBUG
            print("[Attendees] Refresh loop already running")
            #endif
            return
        }

        refreshTask?.cancel()

        refreshTask = Task { [weak self] in
            guard let self else { return }

            #if DEBUG
            print("[Attendees] ▶️ Starting refresh loop")
            #endif

            await self.fetchAttendees()

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.refreshInterval * 1_000_000_000))
                guard !Task.isCancelled else { break }
                await self.fetchAttendees()
            }

            #if DEBUG
            print("[Attendees] ⏹️ Refresh loop exited")
            #endif
        }
    }

    private func stopRefreshing() {
        refreshTask?.cancel()
        refreshTask = nil
        attendees = []
        attendeeCount = 0
        isLoading = false
        debugStatus = "idle"
        lastFetchSignature = ""

        #if DEBUG
        print("[Attendees] Refresh stopped and attendee list cleared")
        #endif
    }

    // MARK: - Fetch Attendees

    private func fetchAttendees() async {
        guard let eventId = presence.currentContextId,
              let currentProfileId = presence.currentCommunityId else {
            #if DEBUG
            print("[Attendees] fetchAttendees aborted: missing eventId/profileId")
            print("[Attendees]   eventId: \(presence.currentContextId?.uuidString ?? "nil")")
            print("[Attendees]   currentProfileId: \(presence.currentCommunityId?.uuidString ?? "nil")")
            #endif
            return
        }

        isLoading = true

        do {
            #if DEBUG
            print("[Attendees] ─────────────────────────────────────────")
            print("[Attendees] Fetching attendees")
            print("[Attendees]   eventId: \(eventId.uuidString)")
            print("[Attendees]   currentProfileId: \(currentProfileId.uuidString)")
            print("[Attendees]   activeWindow: \(Int(activeWindow))s")
            #endif

            let rows: [AttendeeEventRow] = try await supabase
                .from("event_attendees")
                .select("id, event_id, profile_id, status, joined_at, last_seen_at")
                .eq("event_id", value: eventId.uuidString)
                .eq("status", value: "joined")
                .neq("profile_id", value: currentProfileId.uuidString)
                .order("last_seen_at", ascending: false)
                .limit(100)
                .execute()
                .value

            #if DEBUG
            print("[Attendees]   joined rows fetched: \(rows.count)")
            for row in rows {
                print("[Attendees]   row profile_id=\(row.profileId.uuidString) status=\(row.status) last_seen_at=\(row.lastSeenAt)")
            }
            #endif

            let recentCutoff = Date().addingTimeInterval(-activeWindow)
            let activeRows = rows.filter { $0.lastSeenAt >= recentCutoff }

            #if DEBUG
            print("[Attendees]   recent cutoff: \(recentCutoff)")
            print("[Attendees]   active rows after cutoff: \(activeRows.count)")
            for row in activeRows {
                print("[Attendees]   active profile_id=\(row.profileId.uuidString)")
            }
            #endif

            if activeRows.isEmpty {
                let sig = "0"
                if sig != lastFetchSignature {
                    lastFetchSignature = sig
                    #if DEBUG
                    print("[Attendees] No active attendees")
                    #endif
                }

                attendees = []
                attendeeCount = 0
                debugStatus = "No active attendees"
                isLoading = false
                return
            }

            let profileIds = Array(Set(activeRows.map(\.profileId)))

            #if DEBUG
            print("[Attendees]   requesting profiles for \(profileIds.count) id(s)")
            for id in profileIds {
                print("[Attendees]   requested profileId=\(id.uuidString)")
            }
            #endif

            let profilesById = try await fetchProfiles(for: profileIds)

            #if DEBUG
            print("[Attendees]   fetched profiles: \(profilesById.count)")
            for (id, profile) in profilesById {
                print("[Attendees]   profile \(id.uuidString) -> \(profile.name)")
            }
            #endif

            let newAttendees: [EventAttendee] = activeRows.map { row in
                let profile = profilesById[row.profileId]

                return EventAttendee(
                    id: row.profileId,
                    name: profile?.name ?? "User \(row.profileId.uuidString.prefix(8))",
                    avatarUrl: profile?.avatarUrl,
                    bio: profile?.bio,
                    skills: nil,
                    interests: nil,
                    energy: 1.0,
                    lastSeen: row.lastSeenAt
                )
            }

            #if DEBUG
            print("[Attendees]   built attendees: \(newAttendees.count)")
            for attendee in newAttendees {
                let hasImage = attendee.avatarUrl != nil ? "✓" : "–"
                print("[Attendees]   attendee -> \(attendee.name) (avatar:\(hasImage))")
            }
            #endif

            let signature = newAttendees
                .map { "\($0.id.uuidString)|\($0.lastSeen.timeIntervalSince1970)" }
                .joined(separator: ",")

            let changed = signature != lastFetchSignature
            lastFetchSignature = signature

            #if DEBUG
            if changed {
                print("[Attendees] ✅ Published \(newAttendees.count) attendee(s)")
            } else {
                print("[Attendees] ℹ️ No attendee list change")
            }
            #endif

            attendees = newAttendees
            attendeeCount = newAttendees.count
            debugStatus = "\(newAttendees.count) attendee(s)"

        } catch {
            debugStatus = "query failed: \(error.localizedDescription)"
            print("[Attendees] ❌ Query failed: \(error.localizedDescription)")
        }

        isLoading = false
    }

    // MARK: - Profile Resolution

    private func fetchProfiles(for profileIds: [UUID]) async throws -> [UUID: ProfileInfo] {
        guard !profileIds.isEmpty else { return [:] }

        let cappedIds = Array(profileIds.prefix(50))
        if profileIds.count > 50 {
            print("[Attendees] ⚠️ Capped profile fetch from \(profileIds.count) to 50 IDs")
        }

        let rows: [ProfileRow] = try await supabase
            .from("profiles")
            .select("id, name, avatar_url, bio")
            .in("id", values: cappedIds.map { $0.uuidString })
            .execute()
            .value

        #if DEBUG
        print("[Attendees] fetchProfiles returned \(rows.count) row(s)")
        if rows.count != cappedIds.count {
            print("[Attendees] ⚠️ Missing profiles for \(cappedIds.count - rows.count) attendee(s)")
        }
        #endif

        return Dictionary(uniqueKeysWithValues:
            rows.map {
                ($0.id, ProfileInfo(
                    name: $0.name,
                    avatarUrl: $0.avatarUrl,
                    bio: $0.bio
                ))
            }
        )
    }

    // MARK: - Public API

    func refresh() {
        Task {
            await fetchAttendees()
        }
    }
}

// MARK: - Database Models

private struct AttendeeEventRow: Codable {
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

private struct ProfileRow: Codable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    let bio: String?

    enum CodingKeys: String, CodingKey {
        case id, name, bio
        case avatarUrl = "avatar_url"
    }
}

private struct ProfileInfo {
    let name: String
    let avatarUrl: String?
    let bio: String?
}
