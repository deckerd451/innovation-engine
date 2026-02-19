import Foundation
import Supabase

final class ConnectionService {
    static let shared = ConnectionService()

    private let supabase = AppEnvironment.shared.supabaseClient

    private init() {}

    // MARK: - createConnection

    /// Inserts a new accepted connection from the current user to `communityId`.
    func createConnection(to communityId: String) async throws {
        guard let currentUser = AuthService.shared.currentUser else {
            throw ConnectionError.notAuthenticated
        }
        guard let toId = UUID(uuidString: communityId) else {
            throw ConnectionError.invalidQRCode
        }

        struct ConnectionInsert: Encodable {
            let fromUserId: UUID
            let toUserId: UUID
            let status: String

            enum CodingKeys: String, CodingKey {
                case fromUserId = "from_user_id"
                case toUserId   = "to_user_id"
                case status
            }
        }

        let payload = ConnectionInsert(
            fromUserId: currentUser.id,
            toUserId: toId,
            status: "accepted"
        )

        try await supabase
            .from("connections")
            .insert(payload)
            .execute()
    }

    // MARK: - fetchConnections

    /// Returns every accepted connection involving the current user,
    /// with both community profiles embedded via their FK constraint names.
    ///
    /// Call `conn.otherUser(for:)` in the UI to get the remote user's data.
    func fetchConnections() async throws -> [Connection] {
        guard let currentUser = AuthService.shared.currentUser else {
            return []
        }

        let userId = currentUser.id.uuidString

        let selectClause = """
            id,
            from_user_id,
            to_user_id,
            created_at,
            from_profile:community!connections_from_user_id_fkey(id, name),
            to_profile:community!connections_to_user_id_fkey(id, name)
            """

        return try await supabase
            .from("connections")
            .select(selectClause)
            .or("from_user_id.eq.\(userId),to_user_id.eq.\(userId)")
            .eq("status", value: "accepted")
            .execute()
            .value
    }
}

// MARK: - ConnectionError

enum ConnectionError: Error {
    case notAuthenticated
    case invalidQRCode
}
