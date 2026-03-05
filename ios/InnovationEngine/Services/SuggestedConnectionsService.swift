import Foundation
import Supabase

final class SuggestedConnectionsService {
    static let shared = SuggestedConnectionsService()
    
    private let supabase = AppEnvironment.shared.supabaseClient
    
    private init() {}
    
    // MARK: - Inference
    
    /// Call infer_ble_edges RPC to generate suggestions
    func generateSuggestions(groupId: UUID?, minOverlapSeconds: Int = 120, lookbackMinutes: Int = 240) async throws -> Int {
        let params: [String: Any] = [
            "p_group_id": groupId?.uuidString as Any,
            "p_min_overlap_seconds": minOverlapSeconds,
            "p_lookback_minutes": lookbackMinutes
        ]
        
        let response: Int = try await supabase
            .rpc("infer_ble_edges", params: params)
            .execute()
            .value
        
        print("✅ Generated \(response) suggested connections")
        return response
    }
    
    // MARK: - Fetch Suggestions
    
    /// Fetch suggested interaction edges for current user
    /// CRITICAL: interaction_edges stores community.id values (not auth.uid)
    func fetchSuggestions(for communityId: UUID) async throws -> [SuggestedConnection] {
        // Query interaction_edges where user is involved and status is 'suggested'
        let edges: [InteractionEdge] = try await supabase
            .from("interaction_edges")
            .select()
            .or("from_user_id.eq.\(communityId.uuidString),to_user_id.eq.\(communityId.uuidString)")
            .eq("status", value: "suggested")
            .order("confidence", ascending: false)
            .order("overlap_seconds", ascending: false)
            .execute()
            .value
        
        // Collect all other user IDs
        let otherUserIds = edges.map { edge in
            edge.fromUserId == communityId ? edge.toUserId : edge.fromUserId
        }
        
        // Batch resolve display names from community table
        let userProfiles = await fetchUserProfiles(for: otherUserIds)
        
        // Build suggestions
        var suggestions: [SuggestedConnection] = []
        for edge in edges {
            let otherUserId = edge.fromUserId == communityId ? edge.toUserId : edge.fromUserId
            let displayName = userProfiles[otherUserId] ?? otherUserId.uuidString.prefix(8).uppercased()
            
            suggestions.append(SuggestedConnection(
                edge: edge,
                currentUserId: communityId,
                displayName: String(displayName)
            ))
        }
        
        return suggestions
    }
    
    // MARK: - Actions
    
    /// Accept a suggestion and promote to connection
    func acceptSuggestion(edgeId: UUID) async throws {
        try await supabase
            .rpc("promote_edge_to_connection", params: ["p_edge_id": edgeId.uuidString])
            .execute()
        
        print("✅ Promoted edge \(edgeId) to connection")
    }
    
    /// Ignore a suggestion
    func ignoreSuggestion(edgeId: UUID) async throws {
        try await supabase
            .from("interaction_edges")
            .update(["status": "ignored"])
            .eq("id", value: edgeId.uuidString)
            .execute()
        
        print("✅ Ignored edge \(edgeId)")
    }
    
    /// Block a suggestion
    func blockSuggestion(edgeId: UUID) async throws {
        try await supabase
            .from("interaction_edges")
            .update(["status": "blocked"])
            .eq("id", value: edgeId.uuidString)
            .execute()
        
        print("✅ Blocked edge \(edgeId)")
    }
    
    // MARK: - User Profile Resolution
    
    /// Fetch user profiles from community table
    /// CRITICAL: community.id is the foreign key, NOT auth.uid
    private func fetchUserProfiles(for userIds: [UUID]) async -> [UUID: String] {
        guard !userIds.isEmpty else { return [:] }
        
        do {
            // Build OR filter for batch query
            let filters = userIds.map { "id.eq.\($0.uuidString)" }.joined(separator: ",")
            
            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name")
                .or(filters)
                .execute()
                .value
            
            // Map id -> name
            return Dictionary(uniqueKeysWithValues: response.map { ($0.id, $0.name) })
        } catch {
            print("⚠️ Failed to fetch user profiles: \(error)")
            return [:]
        }
    }
    
    // MARK: - Current User Community ID Resolution
    
    /// Resolve current user's community.id from auth session
    /// CRITICAL: Must map auth.uid() → community.id
    func resolveCurrentUserCommunityId() async throws -> UUID {
        // Get current auth session
        let session = try await supabase.auth.session
        let authUserId = session.user.id
        let userEmail = session.user.email
        
        // Prefer: community.auth_user_id = auth.uid()
        do {
            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name")
                .eq("auth_user_id", value: authUserId.uuidString)
                .limit(1)
                .execute()
                .value
            
            if let profile = response.first {
                print("✅ Resolved community.id via auth_user_id: \(profile.id)")
                return profile.id
            }
        } catch {
            print("⚠️ Failed to resolve via auth_user_id: \(error)")
        }
        
        // Fallback: community.email = session.user.email
        if let email = userEmail {
            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name")
                .eq("email", value: email)
                .limit(1)
                .execute()
                .value
            
            if let profile = response.first {
                print("✅ Resolved community.id via email: \(profile.id)")
                return profile.id
            }
        }
        
        throw NSError(
            domain: "SuggestedConnectionsService",
            code: 404,
            userInfo: [NSLocalizedDescriptionKey: "Could not resolve community.id for current user"]
        )
    }
}
