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
        // Query presence_sessions
        let presenceSessions: [PresenceSessionRow] = try await supabase
            .from("presence_sessions")
            .select("user_id, energy, expires_at")
            .eq("context_type", value: "beacon")
            .eq("context_id", value: beaconId.uuidString)
            .gt("expires_at", value: ISO8601DateFormatter().string(from: Date()))
            .execute()
            .value
        
        guard !presenceSessions.isEmpty else {
            return []
        }
        
        // Collect user IDs
        let userIds = presenceSessions.map { $0.userId }
        
        // Batch fetch user profiles from community table
        let profiles = await fetchUserProfiles(for: userIds)
        
        // Build attendee list
        var attendees: [ActiveAttendee] = []
        for session in presenceSessions {
            let profile = profiles[session.userId]
            attendees.append(ActiveAttendee(
                id: session.userId,
                name: profile?.name ?? "User \(session.userId.uuidString.prefix(8))",
                avatarUrl: profile?.avatarUrl,
                energy: session.energy
            ))
        }
        
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
            // Build OR filter for batch query
            let filters = userIds.map { "id.eq.\($0.uuidString)" }.joined(separator: ",")
            
            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name, avatar_url")
                .or(filters)
                .execute()
                .value
            
            // Map id -> profile
            return Dictionary(uniqueKeysWithValues: response.map {
                ($0.id, UserProfile(name: $0.name, avatarUrl: $0.avatarUrl))
            })
        } catch {
            print("⚠️ Failed to fetch user profiles: \(error)")
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
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case energy
        case expiresAt = "expires_at"
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
