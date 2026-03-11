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
    @Published var debugStatus: String = "idle"
    
    private let presence = EventPresenceService.shared
    private let supabase = AppEnvironment.shared.supabaseClient
    private var cancellables = Set<AnyCancellable>()
    
    private var refreshTask: Task<Void, Never>?
    
    private let refreshInterval: TimeInterval = 15.0  // Refresh every 15 seconds
    
    private init() {
        observePresenceState()
    }
    
    // MARK: - Observation
    
    private func observePresenceState() {
        // Wait for both event AND actual presence write to ensure context is ready
        Publishers.CombineLatest(
            presence.$currentEvent,
            presence.$lastPresenceWrite
        )
        .receive(on: RunLoop.main)
        .sink { [weak self] event, _ in
            guard let self else { return }
            
            // Only start refreshing when:
            // 1. Event is active
            // 2. Context ID is ready
            // 3. User ID is ready
            if event != nil,
               self.presence.currentContextId != nil,
               self.presence.currentCommunityId != nil {
                print("[Attendees] 🟢 Presence context ready - starting refresh")
                print("[Attendees]    Event: \(event!)")
                print("[Attendees]    Context ID: \(self.presence.currentContextId!)")
                print("[Attendees]    User ID: \(self.presence.currentCommunityId!)")
                self.startRefreshing()
            } else {
                print("[Attendees] 🔴 Presence context not ready - stopping refresh")
                print("[Attendees]    Event: \(event ?? "nil")")
                print("[Attendees]    Context ID: \(self.presence.currentContextId?.uuidString ?? "nil")")
                print("[Attendees]    User ID: \(self.presence.currentCommunityId?.uuidString ?? "nil")")
                self.stopRefreshing()
            }
        }
        .store(in: &cancellables)
    }
    
    // MARK: - Refresh Loop
    
    private func startRefreshing() {
        print("[Attendees] Attempting to start attendee refresh")
        
        guard presence.currentEvent != nil else {
            print("[Attendees] ❌ Cannot start: no active event")
            return
        }
        
        if let task = refreshTask, !task.isCancelled {
            print("[Attendees] ℹ️ Refresh task already running")
            return
        }
        
        print("[Attendees] ✅ Starting attendee refresh loop")
        print("[Attendees]    currentEvent: \(presence.currentEvent ?? "nil")")
        print("[Attendees]    currentContextId: \(presence.currentContextId?.uuidString ?? "nil")")
        print("[Attendees]    currentCommunityId: \(presence.currentCommunityId?.uuidString ?? "nil")")
        print("[Attendees]    Refresh interval: \(refreshInterval)s")
        
        refreshTask?.cancel()
        
        refreshTask = Task { [weak self] in
            guard let self else { return }
            
            await self.fetchAttendees()
            
            while !Task.isCancelled {
                try? await Task.sleep(
                    nanoseconds: UInt64(self.refreshInterval * 1_000_000_000)
                )
                guard !Task.isCancelled else { break }
                await self.fetchAttendees()
            }
        }
    }
    
    private func stopRefreshing() {
        print("[Attendees] Stopping attendee refresh")
        
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
            print("[Attendees] ⚠️ fetchAttendees called but context/user missing")
            print("[Attendees]    presence.currentContextId: \(presence.currentContextId?.uuidString ?? "nil")")
            print("[Attendees]    presence.currentCommunityId: \(presence.currentCommunityId?.uuidString ?? "nil")")
            return
        }
        
        print("[Attendees] 🔍 Live presence values:")
        print("[Attendees]    presence.currentEvent: \(presence.currentEvent ?? "nil")")
        print("[Attendees]    presence.currentContextId: \(presence.currentContextId?.uuidString ?? "nil")")
        print("[Attendees]    presence.currentCommunityId: \(presence.currentCommunityId?.uuidString ?? "nil")")
        print("[Attendees]    Querying context_id: \(contextId.uuidString)")
        print("[Attendees]    Excluding user_id: \(userId.uuidString)")
        
        isLoading = true
        
        
        
        
        print("[Attendees] 📊 Query parameters:")
        print("[Attendees]    context_type: beacon")
        print("[Attendees]    context_id: \(contextId)")
        print("[Attendees]    exclude user_id: \(userId)")
        print("[Attendees]    NO TIME FILTER - fetching all rows")
        
        do {
            // SIMPLIFIED: Query presence_sessions without time filters
            let sessions: [AttendeePresenceRow] = try await supabase
                .from("presence_sessions")
                .select("user_id, energy, created_at, expires_at")
                .eq("context_type", value: "beacon")
                .eq("context_id", value: contextId.uuidString)
                .neq("user_id", value: userId.uuidString)
                .order("created_at", ascending: false)
                .limit(50)
                .execute()
                .value
            
            debugStatus = "raw sessions count = \(sessions.count), contextId = \(contextId.uuidString), userId = \(userId.uuidString)"
            
            let now = Date()
            
            print("[Attendees] 📥 Raw query results:")
            print("[Attendees]    Total rows returned: \(sessions.count)")
            print("[Attendees]    debugStatus: \(debugStatus)")
            
            if sessions.isEmpty {
                print("[Attendees]    ℹ️ No rows matched query")
            } else {
                print("[Attendees]    Raw user_ids returned:")
                for (index, session) in sessions.enumerated() {
                    let age = now.timeIntervalSince(session.createdAt)
                    let timeUntilExpiry = session.expiresAt.timeIntervalSince(now)
                    print("[Attendees]      [\(index)] user_id: \(session.userId)")
                    print("[Attendees]          created_at: \(session.createdAt)")
                    print("[Attendees]          age: \(Int(age))s ago")
                    print("[Attendees]          expires_at: \(session.expiresAt)")
                    print("[Attendees]          expires_in: \(Int(timeUntilExpiry))s")
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
                    avatarUrl: profile?.imageUrl,
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
            debugStatus = "query failed: \(error.localizedDescription)"
            print("[Attendees] ❌ Query failed: \(error)")
            print("[Attendees]    Error details: \(error.localizedDescription)")
            print("[Attendees]    debugStatus: \(debugStatus)")
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
            .select("id, name, image_url")
            .or(filters)
            .execute()
            .value
        
        print("[Attendees] 📥 Community profiles returned: \(profiles.count)")
        for profile in profiles {
            print("[Attendees]    ✓ \(profile.name) (\(profile.id))")
        }
        
        return Dictionary(uniqueKeysWithValues:
            profiles.map {
                ($0.id, CommunityProfileInfo(name: $0.name, imageUrl: $0.imageUrl))
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
    let expiresAt: Date
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }
}

private struct AttendeeCommunityRow: Codable {
    let id: UUID
    let name: String
    let imageUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case imageUrl = "image_url"
    }
}

private struct CommunityProfileInfo {
    let name: String
    let imageUrl: String?
}
