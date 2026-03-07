import Foundation
import Supabase

// MARK: - EventModeDataService

/// Fetches active attendees and suggested edges for Event Mode radar visualization
final class EventModeDataService {
    static let shared = EventModeDataService()
    
    private let supabase = AppEnvironment.shared.supabaseClient
    
    private init() {}
    
    // MARK: - Active Attendees
    
    /// Fetch active attendees at a beacon
    /// Query: presence_sessions where context_type='beacon', context_id=beaconId, expires_at > now()
    /// Join: community.id = presence_sessions.user_id
    func fetchActiveAttendees(beaconId: UUID) async throws -> [ActiveAttendee] {
        // Get current user for diagnostic logging
        let currentUserId = AuthService.shared.currentUser?.id
        
        print("🔍 [ATTENDEE QUERY] Starting attendee fetch")
        print("  📍 Beacon ID: \(beaconId.uuidString)")
        print("  👤 Current User ID: \(currentUserId?.uuidString ?? "none")")
        
        // Get beacon info for context
        let beaconInfo = try? await supabase
            .from("beacons")
            .select("label, group_id")
            .eq("id", value: beaconId.uuidString)
            .single()
            .execute()
            .value as? [String: Any]
        
        if let beaconLabel = beaconInfo?["label"] as? String {
            print("  🏷️  Beacon Name: \(beaconLabel)")
        }
        
        // Query presence_sessions
        let now = Date()
        let isoFormatter = ISO8601DateFormatter()
        let nowString = isoFormatter.string(from: now)
        
        print("  ⏰ Query Time: \(nowString)")
        print("  🔎 Query Filters:")
        print("     - context_type = 'beacon'")
        print("     - context_id = '\(beaconId.uuidString)'")
        print("     - expires_at > '\(nowString)'")
        
        let presenceSessions: [PresenceSessionRow] = try await supabase
            .from("presence_sessions")
            .select("user_id, energy, expires_at, last_seen, is_active, created_at")
            .eq("context_type", value: "beacon")
            .eq("context_id", value: beaconId.uuidString)
            .gt("expires_at", value: nowString)
            .execute()
            .value
        
        print("  📊 Raw Presence Rows Returned: \(presenceSessions.count)")
        
        // Log raw presence data for debugging
        if presenceSessions.isEmpty {
            print("  ⚠️  NO PRESENCE ROWS FOUND")
            print("  💡 Debug: Checking if ANY presence rows exist for this beacon...")
            
            // Debug query: fetch ALL rows for this beacon (no time filter)
            let allRows: [PresenceSessionRow] = try await supabase
                .from("presence_sessions")
                .select("user_id, energy, expires_at, last_seen, is_active, created_at")
                .eq("context_type", value: "beacon")
                .eq("context_id", value: beaconId.uuidString)
                .execute()
                .value
            
            print("  🔍 Total rows for beacon (no time filter): \(allRows.count)")
            
            if !allRows.isEmpty {
                print("  📋 Sample rows (showing expiration status):")
                for (index, row) in allRows.prefix(5).enumerated() {
                    let isExpired = row.expiresAt < now
                    let timeDiff = row.expiresAt.timeIntervalSince(now)
                    print("     [\(index + 1)] user_id: \(row.userId.uuidString.prefix(8))...")
                    print("         expires_at: \(isoFormatter.string(from: row.expiresAt))")
                    print("         status: \(isExpired ? "❌ EXPIRED" : "✅ ACTIVE") (\(Int(timeDiff))s)")
                    print("         energy: \(row.energy)")
                }
            }
            
            return []
        }
        
        // Log each raw presence row
        print("  📋 Raw Presence Rows:")
        for (index, session) in presenceSessions.enumerated() {
            let isCurrentUser = session.userId == currentUserId
            let userMarker = isCurrentUser ? "👤 (YOU)" : ""
            print("     [\(index + 1)] \(userMarker)")
            print("         user_id: \(session.userId.uuidString)")
            print("         energy: \(session.energy)")
            print("         expires_at: \(isoFormatter.string(from: session.expiresAt))")
        }
        
        // Collect user IDs
        let userIds = presenceSessions.map { $0.userId }
        print("  🔑 User IDs to resolve: \(userIds.count)")
        
        // Batch fetch user profiles from community table
        print("  🔄 Fetching community profiles...")
        let profiles = await fetchUserProfiles(for: userIds)
        
        print("  ✅ Profiles resolved: \(profiles.count) / \(userIds.count)")
        
        // Log profile resolution results
        for userId in userIds {
            if let profile = profiles[userId] {
                print("     ✓ \(userId.uuidString.prefix(8))... → \(profile.name)")
            } else {
                print("     ✗ \(userId.uuidString.prefix(8))... → FAILED TO RESOLVE")
            }
        }
        
        // Build attendee list
        var attendees: [ActiveAttendee] = []
        for session in presenceSessions {
            let profile = profiles[session.userId]
            let attendee = ActiveAttendee(
                id: session.userId,
                name: profile?.name ?? "User \(session.userId.uuidString.prefix(8))",
                avatarUrl: profile?.avatarUrl,
                energy: session.energy
            )
            attendees.append(attendee)
            
            let isCurrentUser = session.userId == currentUserId
            let userMarker = isCurrentUser ? "👤 (YOU)" : ""
            print("     + Added attendee: \(attendee.name) \(userMarker)")
        }
        
        print("  🎯 Final Attendee Count: \(attendees.count)")
        print("  ✅ [ATTENDEE QUERY] Complete\n")
        
        return attendees
    }
    
    // MARK: - Suggested Edges
    
    /// Fetch top suggested edges for a beacon
    /// Query: interaction_edges where status='suggested', beacon_id=beaconId
    /// Limit: top 5 by confidence
    func fetchSuggestedEdges(beaconId: UUID, limit: Int = 5) async throws -> [SuggestedEdge] {
        let edges: [InteractionEdgeRow] = try await supabase
            .from("interaction_edges")
            .select("id, from_user_id, to_user_id, confidence, overlap_seconds")
            .eq("status", value: "suggested")
            .eq("beacon_id", value: beaconId.uuidString)
            .order("confidence", ascending: false)
            .limit(limit)
            .execute()
            .value
        
        return edges.map { edge in
            SuggestedEdge(
                id: edge.id,
                fromUserId: edge.fromUserId,
                toUserId: edge.toUserId,
                confidence: edge.confidence ?? 0.0,
                overlapSeconds: edge.overlapSeconds ?? 0
            )
        }
    }
    
    // MARK: - User Profile Resolution
    
    private func fetchUserProfiles(for userIds: [UUID]) async -> [UUID: UserProfile] {
        guard !userIds.isEmpty else { return [:] }
        
        do {
            print("  🔍 [PROFILE RESOLUTION] Fetching profiles for \(userIds.count) users")
            
            // Build OR filter for batch query
            let filters = userIds.map { "id.eq.\($0.uuidString)" }.joined(separator: ",")
            
            print("  📝 Query: community table with filter: \(filters)")
            
            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name, avatar_url")
                .or(filters)
                .execute()
                .value
            
            print("  ✅ Profiles fetched: \(response.count) / \(userIds.count)")
            
            // Log any missing profiles
            let fetchedIds = Set(response.map { $0.id })
            let missingIds = Set(userIds).subtracting(fetchedIds)
            
            if !missingIds.isEmpty {
                print("  ⚠️  Missing profiles for \(missingIds.count) users:")
                for missingId in missingIds.prefix(5) {
                    print("     - \(missingId.uuidString)")
                }
            }
            
            // Map id -> profile
            return Dictionary(uniqueKeysWithValues: response.map {
                ($0.id, UserProfile(name: $0.name, avatarUrl: $0.avatarUrl))
            })
        } catch {
            print("  ❌ [PROFILE RESOLUTION] Failed to fetch user profiles: \(error)")
            print("  📋 Error details: \(error.localizedDescription)")
            return [:]
        }
    }
}

// MARK: - Data Models

struct ActiveAttendee: Identifiable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    let energy: Double
}

struct SuggestedEdge: Identifiable {
    let id: UUID
    let fromUserId: UUID
    let toUserId: UUID
    let confidence: Double
    let overlapSeconds: Int
}

struct UserProfile {
    let name: String
    let avatarUrl: String?
}

// MARK: - Database Row Models

private struct PresenceSessionRow: Codable {
    let userId: UUID
    let energy: Double
    let expiresAt: Date
    let lastSeen: Date?
    let isActive: Bool?
    let createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case expiresAt = "expires_at"
        case lastSeen = "last_seen"
        case isActive = "is_active"
        case createdAt = "created_at"
    }
}

private struct InteractionEdgeRow: Codable {
    let id: UUID
    let fromUserId: UUID
    let toUserId: UUID
    let confidence: Double?
    let overlapSeconds: Int?
    
    enum CodingKeys: String, CodingKey {
        case id
        case fromUserId = "from_user_id"
        case toUserId = "to_user_id"
        case confidence
        case overlapSeconds = "overlap_seconds"
    }
}

private struct CommunityProfile: Codable {
    let id: UUID
    let name: String
    let avatarUrl: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case avatarUrl = "avatar_url"
    }
}
