import Foundation
import Supabase

// MARK: - CommunityProfile

/// One embedded community row, decoded from a PostgREST FK embed.
struct CommunityProfile: Codable {
    let id: UUID
    let name: String
}

// MARK: - Connection

/// A row from the `connections` table with both side's community profiles embedded.
///
/// PostgREST select used to decode this type:
///
///   id,
///   from_user_id,
///   to_user_id,
///   created_at,
///   from_profile:community!connections_from_user_id_fkey(id, name),
///   to_profile:community!connections_to_user_id_fkey(id, name)
struct Connection: Codable, Identifiable {
    let id: UUID
    let fromUserId: UUID
    let toUserId: UUID
    let createdAt: Date
    let fromProfile: CommunityProfile
    let toProfile: CommunityProfile

    enum CodingKeys: String, CodingKey {
        case id
        case fromUserId  = "from_user_id"
        case toUserId    = "to_user_id"
        case createdAt   = "created_at"
        case fromProfile = "from_profile"
        case toProfile   = "to_profile"
    }

    /// Returns the id and name of the user on the other side of this connection.
    func otherUser(for currentUserId: UUID) -> (id: UUID, name: String) {
        let profile = fromUserId == currentUserId ? toProfile : fromProfile
        return (id: profile.id, name: profile.name)
    }
}

// MARK: - ConnectionService

final class ConnectionService {
    static let shared = ConnectionService()

    private let supabase = AppEnvironment.shared.supabaseClient

    private init() {}

    // MARK: createConnection

    func createConnection(to communityId: String) async throws {
        guard let currentUser = AuthService.shared.currentUser else {
            throw ConnectionError.notAuthenticated
        }
        guard let toId = UUID(uuidString: communityId) else {
            throw ConnectionError.invalidQRCode
        }

        struct Payload: Encodable {
            let fromUserId: UUID
            let toUserId: UUID
            let status: String
            enum CodingKeys: String, CodingKey {
                case fromUserId = "from_user_id"
                case toUserId   = "to_user_id"
                case status
            }
        }

        try await supabase
            .from("connections")
            .insert(Payload(fromUserId: currentUser.id, toUserId: toId, status: "accepted"))
            .execute()
    }

    // MARK: fetchConnections

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
