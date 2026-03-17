import Foundation
import Supabase

private struct InferBleEdgesParams: Encodable, Sendable {
    let p_group_id: String?
    let p_min_overlap_seconds: Int
    let p_lookback_minutes: Int
}

private struct PromoteEdgeToConnectionParams: Encodable, Sendable {
    let p_edge_id: String
}

final class SuggestedConnectionsService {
    static let shared = SuggestedConnectionsService()

    private let supabase = AppEnvironment.shared.supabaseClient

    // MARK: - Dedup Guard

    /// Minimum interval between RPC calls for the same group (seconds).
    private let inferenceSuppressionWindow: TimeInterval = 120 // 2 minutes

    /// Tracks the last successful inference call per group key.
    /// Key: group UUID string (or "global" for nil group).
    private var lastInferenceAt: [String: Date] = [:]

    private init() {}

    // MARK: - Inference

    /// Call infer_ble_edges RPC to generate suggestions.
    /// Includes a local dedup guard: suppresses repeated calls within
    /// `inferenceSuppressionWindow` for the same group.
    func generateSuggestions(
        groupId: UUID?,
        minOverlapSeconds: Int = 120,
        lookbackMinutes: Int = 240
    ) async throws -> Int {
        let groupKey = groupId?.uuidString ?? "global"

        // Time-based suppression: don't call RPC again within the window
        if let lastCall = lastInferenceAt[groupKey],
           Date().timeIntervalSince(lastCall) < inferenceSuppressionWindow {
            let ago = Int(Date().timeIntervalSince(lastCall))
            print("⏭️ Edge inference suppressed — last call \(ago)s ago (window: \(Int(inferenceSuppressionWindow))s)")
            return 0
        }

        let params = InferBleEdgesParams(
            p_group_id: groupId?.uuidString,
            p_min_overlap_seconds: minOverlapSeconds,
            p_lookback_minutes: lookbackMinutes
        )

        let response: Int = try await supabase
            .rpc("infer_ble_edges", params: params)
            .execute()
            .value

        lastInferenceAt[groupKey] = Date()
        print("✅ Generated \(response) suggested connections")
        return response
    }

    // MARK: - Fetch Suggestions

    /// Fetch suggested interaction edges for current user
    /// CRITICAL: interaction_edges stores community.id values (not auth.uid)
    func fetchSuggestions(for communityId: UUID) async throws -> [SuggestedConnection] {
        let edges: [InteractionEdge] = try await supabase
            .from("interaction_edges")
            .select()
            .or("from_user_id.eq.\(communityId.uuidString),to_user_id.eq.\(communityId.uuidString)")
            .eq("status", value: "suggested")
            .order("confidence", ascending: false)
            .order("overlap_seconds", ascending: false)
            .execute()
            .value

        let otherUserIds = edges.map { edge in
            edge.fromUserId == communityId ? edge.toUserId : edge.fromUserId
        }

        let userProfiles = await fetchUserProfiles(for: otherUserIds)

        var suggestions: [SuggestedConnection] = []
        for edge in edges {
            let otherUserId = edge.fromUserId == communityId ? edge.toUserId : edge.fromUserId
            let displayName = userProfiles[otherUserId] ?? String(otherUserId.uuidString.prefix(8)).uppercased()

            suggestions.append(
                SuggestedConnection(
                    edge: edge,
                    currentUserId: communityId,
                    displayName: displayName
                )
            )
        }

        return suggestions
    }

    // MARK: - Actions

    /// Accept a suggestion and promote to connection
    func acceptSuggestion(edgeId: UUID) async throws {
        let params = PromoteEdgeToConnectionParams(
            p_edge_id: edgeId.uuidString
        )

        try await supabase
            .rpc("promote_edge_to_connection", params: params)
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
            let filters = userIds.map { "id.eq.\($0.uuidString)" }.joined(separator: ",")

            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name")
                .or(filters)
                .execute()
                .value

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
        let session = try await supabase.auth.session
        let authUserId = session.user.id
        let userEmail = session.user.email

        do {
            let response: [CommunityProfile] = try await supabase
                .from("community")
                .select("id, name")
                .eq("user_id", value: authUserId.uuidString)
                .limit(1)
                .execute()
                .value

            if let profile = response.first {
                print("✅ Resolved community.id via user_id: \(profile.id)")
                return profile.id
            }
        } catch {
            print("⚠️ Failed to resolve via user_id: \(error)")
        }

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
