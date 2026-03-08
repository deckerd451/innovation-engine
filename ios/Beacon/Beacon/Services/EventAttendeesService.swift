import Foundation
import Combine
import Supabase

// MARK: - Active Attendee Model

struct EventAttendee: Identifiable, Equatable {
    let id: UUID
    let name: String
    let avatarUrl: String?
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
}

// MARK: - Event Attendees Service

@MainActor
final class EventAttendeesService: ObservableObject {
    
    static let shared = EventAttendeesService()
    
    @Published private(set) var attendees: [EventAttendee] = []
    @Published private(set) var isLoading = false
    @Published private(set) var attendeeCount: Int = 0
    
    private let presence = EventPresenceService.shared
    private let supabase = AppEnvironment.shared.supabaseClient
    private var cancellables = Set<AnyCancellable>()
    
    private var refreshTask: Task<Void, Never>?
    private var currentContextId: UUID?
    private var currentUserId: UUID?
    
    private let refreshInterval: TimeInterval = 15.0  // Refresh every 15 seconds
    
    private init() {
        observePresenceState()
    }
    
    // MARK: - Observation
    
    private func observePresenceState() {
        // Observe when presence service has an active event
        presence.$currentEvent
            .receive(on: RunLoop.main)
            .sink { [weak self] event in
                if event != nil {
                    self?.startRefreshing()
                } else {
                    self?.stopRefreshing()
                }
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Refresh Loop
    
    private func startRefreshing() {
        // Get current context from presence service
        guard let contextId = presence.currentContextId,
              let userId = presence.currentCommunityId else {
            print("[Attendees] ❌ Cannot start: missing context_id or user_id")
            print("[Attendees]    context_id: \(presence.currentContextId?.uuidString ?? "nil")")
            print("[Attendees]    user_id: \(presence.currentCommunityId?.uuidString ?? "nil")")
            return
        }
        
        // Check if already refreshing same context
        if currentContextId == contextId && refreshTask != nil {
            print("[Attendees] ℹ️ Already refreshing same context, skipping")
            return
        }
        
        currentContextId = contextId
        currentUserId = userId
        
        print("[Attendees] ✅ Starting attendee refresh")
        print("[Attendees]    Current user community.id: \(userId)")
        print("[Attendees]    Current event/beacon context_id: \(contextId)")
        print("[Attendees]    Refresh interval: \(refreshInterval)s")
        
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            guard let self else { return }
            
            // Initial fetch
            await self.fetchAttendees()
            
            // Periodic refresh
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(self.refreshInterval * 1_000_000_000))
                guard !Task.isCancelled else { break }
                print("[Attendees] 🔄 Periodic refresh triggered")
                await self.fetchAttendees()
            }
        }
    }
    
    private func stopRefreshing() {
        print("[Attendees] Stopping attendee refresh")
        
        refreshTask?.cancel()
        refreshTask = nil
        currentContextId = nil
        currentUserId = nil
        
        attendees = []
        attendeeCount = 0
        isLoading = false
    }
    
    // MARK: - Fetch Attendees
    
    private func fetchAttendees() async {
        guard let contextId = currentContextId,
              let userId = currentUserId else {
            print("[Attendees] ⚠️ fetchAttendees called but context/user missing")
            return
        }
        
        isLoading = true
        
        let now = Date()
        let fiveMinutesAgo = now.addingTimeInterval(-300)
        let fiveMinutesAgoISO = ISO8601DateFormatter().string(from: fiveMinutesAgo)
        
        print("[Attendees] 📊 Query parameters:")
        print("[Attendees]    context_type: beacon")
        print("[Attendees]    context_id: \(contextId)")
        print("[Attendees]    exclude user_id: \(userId)")
        print("[Attendees]    created_at >= \(fiveMinutesAgoISO)")
        print("[Attendees]    (5 minutes ago from now)")
        
        do {
            // Query presence_sessions for active users in this beacon context
            let sessions: [AttendeePresenceRow] = try await supabase
                .from("presence_sessions")
                .select("user_id, energy, created_at")
                .eq("context_type", value: "beacon")
                .eq("context_id", value: contextId.uuidString)
                .neq("user_id", value: userId.uuidString)  // Exclude current user
                .gte("created_at", value: fiveMinutesAgoISO)  // Last 5 minutes
                .order("created_at", ascending: false)
                .execute()
                .value
            
            print("[Attendees] 📥 Raw query results:")
            print("[Attendees]    Total rows returned: \(sessions.count)")
            
            if sessions.isEmpty {
                print("[Attendees]    ℹ️ No rows matched query")
            } else {
                print("[Attendees]    Raw user_ids returned:")
                for (index, session) in sessions.enumerated() {
                    let age = now.timeIntervalSince(session.createdAt)
                    print("[Attendees]      [\(index)] user_id: \(session.userId)")
                    print("[Attendees]          created_at: \(session.createdAt)")
                    print("[Attendees]          age: \(Int(age))s ago")
                    print("[Attendees]          energy: \(String(format: "%.2f", session.energy))")
                }
            }
            
            // Get unique users (most recent session per user)
            var uniqueSessions: [UUID: AttendeePresenceRow] = [:]
            for session in sessions {
                if uniqueSessions[session.userId] == nil {
                    uniqueSessions[session.userId] = session
                }
            }
            
            let uniqueUserIds = Array(uniqueSessions.keys)
            
            print("[Attendees] 🔍 After deduplication:")
            print("[Attendees]    Unique user_ids: \(uniqueUserIds.count)")
            
            if sessions.count != uniqueUserIds.count {
                print("[Attendees]    ℹ️ Dropped \(sessions.count - uniqueUserIds.count) duplicate rows")
            }
            
            guard !uniqueUserIds.isEmpty else {
                print("[Attendees] ✅ Final attendee count: 0 (no other users)")
                attendees = []
                attendeeCount = 0
                isLoading = false
                return
            }
            
            // Fetch community profiles
            print("[Attendees] 👤 Fetching community profiles for \(uniqueUserIds.count) user(s)")
            let profiles = try await fetchCommunityProfiles(for: uniqueUserIds)
            
            print("[Attendees] 📋 Profile resolution:")
            print("[Attendees]    Profiles found: \(profiles.count)")
            
            if profiles.count != uniqueUserIds.count {
                print("[Attendees]    ⚠️ Missing profiles for \(uniqueUserIds.count - profiles.count) user(s)")
                for userId in uniqueUserIds {
                    if profiles[userId] == nil {
                        print("[Attendees]       Missing profile for: \(userId)")
                    }
                }
            }
            
            // Build attendee list
            var newAttendees: [EventAttendee] = []
            
            for (userId, session) in uniqueSessions {
                let profile = profiles[userId]
                let name = profile?.name ?? "User \(userId.uuidString.prefix(8))"
                
                let attendee = EventAttendee(
                    id: userId,
                    name: name,
                    avatarUrl: profile?.avatarUrl,
                    energy: session.energy,
                    lastSeen: session.createdAt
                )
                
                print("[Attendees]    ✓ Added attendee: \(name) (\(userId))")
                newAttendees.append(attendee)
            }
            
            // Sort by most recent first
            newAttendees.sort { $0.lastSeen > $1.lastSeen }
            
            attendees = newAttendees
            attendeeCount = newAttendees.count
            
            print("[Attendees] ✅ Final attendee count: \(attendeeCount)")
            
        } catch {
            print("[Attendees] ❌ Query failed: \(error)")
            print("[Attendees]    Error details: \(error.localizedDescription)")
        }
        
        isLoading = false
    }
    
    // MARK: - Profile Resolution
    
    private func fetchCommunityProfiles(for userIds: [UUID]) async throws -> [UUID: CommunityProfileInfo] {
        guard !userIds.isEmpty else { return [:] }
        
        let filters = userIds
            .map { "id.eq.\($0.uuidString)" }
            .joined(separator: ",")
        
        print("[Attendees] 🔍 Community query filter: \(filters)")
        
        let profiles: [AttendeeCommunityRow] = try await supabase
            .from("community")
            .select("id, name, avatar_url")
            .or(filters)
            .execute()
            .value
        
        print("[Attendees] 📥 Community profiles returned: \(profiles.count)")
        for profile in profiles {
            print("[Attendees]    ✓ \(profile.name) (\(profile.id))")
        }
        
        return Dictionary(uniqueKeysWithValues:
            profiles.map {
                ($0.id, CommunityProfileInfo(name: $0.name, avatarUrl: $0.avatarUrl))
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
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case createdAt = "created_at"
    }
}

private struct AttendeeCommunityRow: Codable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatarUrl = "avatar_url"
    }
}

private struct CommunityProfileInfo {
    let name: String
    let avatarUrl: String?
}
