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
        Date().timeIntervalSince(lastSeen) < 60  // Active if seen within last 60 seconds
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
    
    // MARK: - Display Helpers
    
    /// Compact subtitle for network graph nodes - never shows full bio
    var graphSubtitleText: String {
        // Show first 1-2 skills
        if let skills = skills, !skills.isEmpty {
            let joined = skills.prefix(2).joined(separator: " • ")
            return joined
        }
        
        // Show first 1-2 interests
        if let interests = interests, !interests.isEmpty {
            let joined = interests.prefix(2).joined(separator: " • ")
            return joined
        }
        
        // Fallback
        return "Attending now"
    }
    
    /// Richer subtitle for detail views (FindAttendeeView, cards)
    var detailSubtitleText: String {
        // Prefer short bio if present
        if let bio = bio, !bio.isEmpty {
            let trimmed = bio.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.count <= 60 {
                return trimmed
            } else {
                // Truncate long bio
                let truncated = String(trimmed.prefix(57))
                return truncated + "..."
            }
        }
        
        // Build from skills
        if let skills = skills, !skills.isEmpty {
            let joined = skills.prefix(3).joined(separator: " • ")
            return joined
        }
        
        // Build from interests
        if let interests = interests, !interests.isEmpty {
            let joined = interests.prefix(3).joined(separator: " • ")
            return joined
        }
        
        // Fallback
        return "Attending now"
    }
    
    /// Short bio snippet for detail views (2-3 lines max)
    var bioSnippet: String? {
        guard let bio = bio, !bio.isEmpty else { return nil }
        
        let trimmed = bio.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // If bio is short enough, return as-is
        if trimmed.count <= 120 {
            return trimmed
        }
        
        // Truncate to ~120 chars
        let truncated = String(trimmed.prefix(117))
        return truncated + "..."
    }
    
    /// Returns up to 3 tags for display (from interests or skills)
    var topTags: [String] {
        // Prefer interests for tags
        if let interests = interests, !interests.isEmpty {
            return Array(interests.prefix(3))
        }
        
        // Fall back to skills
        if let skills = skills, !skills.isEmpty {
            return Array(skills.prefix(3))
        }
        
        return []
    }
    
    /// Returns initials for avatar placeholder
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
    
    // Log dedup: only log full fetch details when results change.
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
        guard presence.currentEvent != nil else { return }
        
        if let task = refreshTask, !task.isCancelled { return }
        
        refreshTask?.cancel()
        
        refreshTask = Task { [weak self] in
            guard let self else { return }
            
            await self.fetchAttendees()
            
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.refreshInterval * 1_000_000_000))
                guard !Task.isCancelled else { break }
                await self.fetchAttendees()
            }
        }
    }
    
    private func stopRefreshing() {
        refreshTask?.cancel()
        refreshTask = nil
        attendees = []
        attendeeCount = 0
        isLoading = false
    }
    
    // MARK: - Fetch Attendees
    
    private func fetchAttendees() async {
        guard let contextId = presence.currentContextId,
              let userId = presence.currentCommunityId else {
            return
        }
        
        isLoading = true
        
        let now = Date()
        let nowISO = ISO8601DateFormatter().string(from: now)
        
        // Also filter by last_seen recency to reduce stale duplicate rows.
        // The heartbeat writes new rows every ~60s; rows older than 10 min
        // are effectively stale even if expires_at hasn't passed yet.
        let recencyCutoff = now.addingTimeInterval(-10 * 60)
        let recencyISO = ISO8601DateFormatter().string(from: recencyCutoff)
        
        do {
            let sessions: [AttendeePresenceRow] = try await supabase
                .from("presence_sessions")
                .select("user_id, energy, last_seen, expires_at, is_active")
                .eq("context_type", value: "beacon")
                .eq("context_id", value: contextId.uuidString)
                .eq("is_active", value: true)
                .gt("expires_at", value: nowISO)
                .gt("last_seen", value: recencyISO)
                .neq("user_id", value: userId.uuidString)
                .order("last_seen", ascending: false)
                .limit(100)
                .execute()
                .value
            
            let totalRows = sessions.count
            
            if sessions.isEmpty {
                let sig = "0"
                if sig != lastFetchSignature {
                    lastFetchSignature = sig
                    #if DEBUG
                    print("[Attendees] No active presence rows")
                    #endif
                }
                debugStatus = "No active attendees"
                attendees = []
                attendeeCount = 0
                isLoading = false
                return
            }
            
            // Deduplicate by user_id, keeping most recent last_seen.
            // This is a defensive fallback — the recency filter above
            // should already reduce duplicates significantly.
            var uniqueSessions: [UUID: AttendeePresenceRow] = [:]
            for session in sessions {
                if let existing = uniqueSessions[session.userId] {
                    if session.lastSeen > existing.lastSeen {
                        uniqueSessions[session.userId] = session
                    }
                } else {
                    uniqueSessions[session.userId] = session
                }
            }
            
            let uniqueCount = uniqueSessions.count
            let duplicatesRemoved = totalRows - uniqueCount
            
            // Build a signature to avoid repeating identical log output.
            let sig = "\(totalRows)|\(uniqueCount)|\(duplicatesRemoved)"
            let changed = sig != lastFetchSignature
            lastFetchSignature = sig
            
            #if DEBUG
            if changed {
                if duplicatesRemoved > 0 {
                    print("[Attendees] Fetched \(totalRows) rows → \(uniqueCount) unique (\(duplicatesRemoved) duplicates collapsed)")
                } else {
                    print("[Attendees] Fetched \(totalRows) rows → \(uniqueCount) unique")
                }
            }
            #endif
            
            debugStatus = "\(totalRows) rows → \(uniqueCount) unique"
            
            guard !uniqueSessions.isEmpty else {
                attendees = []
                attendeeCount = 0
                isLoading = false
                return
            }
            
            // Fetch community profiles for unique users.
            let uniqueUserIds = Array(uniqueSessions.keys)
            let profiles = try await fetchCommunityProfiles(for: uniqueUserIds)
            
            // Build attendee list.
            var newAttendees: [EventAttendee] = []
            
            for (userId, session) in uniqueSessions {
                let profile = profiles[userId]
                let name = profile?.name ?? "User \(userId.uuidString.prefix(8))"
                
                newAttendees.append(EventAttendee(
                    id: userId,
                    name: name,
                    avatarUrl: profile?.imageUrl,
                    bio: profile?.bio,
                    skills: profile?.skills,
                    interests: profile?.interests,
                    energy: session.energy,
                    lastSeen: session.lastSeen
                ))
            }
            
            newAttendees.sort { $0.lastSeen > $1.lastSeen }
            
            #if DEBUG
            // Log individual attendees only when the set changes.
            let newIds = Set(newAttendees.map(\.id))
            let oldIds = Set(attendees.map(\.id))
            if newIds != oldIds {
                for a in newAttendees {
                    let hasImg = a.avatarUrl != nil ? "✓" : "–"
                    print("[Attendees]   \(a.name) (avatar:\(hasImg), skills:\(a.skills?.count ?? 0), interests:\(a.interests?.count ?? 0))")
                }
            }
            #endif
            
            attendees = newAttendees
            attendeeCount = newAttendees.count
            
        } catch {
            debugStatus = "query failed: \(error.localizedDescription)"
            print("[Attendees] ❌ Query failed: \(error.localizedDescription)")
        }
        
        isLoading = false
    }
    
    // MARK: - Profile Resolution
    
    private func fetchCommunityProfiles(for userIds: [UUID]) async throws -> [UUID: CommunityProfileInfo] {
        guard !userIds.isEmpty else { return [:] }

        // Guardrail: cap to 50 IDs to avoid building an excessively long OR filter.
        let cappedIds = Array(userIds.prefix(50))
        if userIds.count > 50 {
            print("[Attendees] ⚠️ Capped profile fetch from \(userIds.count) to 50 IDs")
        }

        // Use .in() filter instead of building a manual OR string.
        // PostgREST supports in.(val1,val2,...) which is more compact.
        let profiles: [AttendeeCommunityRow] = try await supabase
            .from("community")
            .select("id, name, image_url, bio, skills, interests")
            .in("id", values: cappedIds.map { $0.uuidString })
            .execute()
            .value
        
        #if DEBUG
        if profiles.count != cappedIds.count {
            print("[Attendees] ⚠️ Missing profiles for \(cappedIds.count - profiles.count) user(s)")
        }
        #endif
        
        return Dictionary(uniqueKeysWithValues:
            profiles.map {
                ($0.id, CommunityProfileInfo(
                    name: $0.name,
                    imageUrl: $0.imageUrl,
                    bio: $0.bio,
                    skills: $0.skills,
                    interests: $0.interests
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

private struct AttendeePresenceRow: Codable {
    let userId: UUID
    let energy: Double
    let lastSeen: Date
    let expiresAt: Date
    let isActive: Bool
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case lastSeen = "last_seen"
        case expiresAt = "expires_at"
        case isActive = "is_active"
    }
}

private struct AttendeeCommunityRow: Codable {
    let id: UUID
    let name: String
    let imageUrl: String?
    let bio: String?
    let skills: [String]?
    let interests: [String]?
    
    enum CodingKeys: String, CodingKey {
        case id, name, bio, skills, interests
        case imageUrl = "image_url"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        
        // Flexible decoding: database stores skills/interests as TEXT or JSON array
        if let arr = try? container.decodeIfPresent([String].self, forKey: .skills) {
            skills = arr
        } else if let str = try? container.decodeIfPresent(String.self, forKey: .skills) {
            skills = FlexibleStringArray.parse(str)
        } else {
            skills = nil
        }
        
        if let arr = try? container.decodeIfPresent([String].self, forKey: .interests) {
            interests = arr
        } else if let str = try? container.decodeIfPresent(String.self, forKey: .interests) {
            interests = FlexibleStringArray.parse(str)
        } else {
            interests = nil
        }
    }
}

private struct CommunityProfileInfo {
    let name: String
    let imageUrl: String?
    let bio: String?
    let skills: [String]?
    let interests: [String]?
}
