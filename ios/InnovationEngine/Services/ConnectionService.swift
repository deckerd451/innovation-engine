import Foundation
import Supabase

final class ConnectionService {
    static let shared = ConnectionService()

    private let supabase = AppEnvironment.shared.supabaseClient

    private init() {}

    func createConnection(to communityId: String) async throws {
        guard let currentUser = AuthService.shared.currentUser else {
            throw ConnectionError.notAuthenticated
        }

        let connection: [String: AnyEncodable] = [
            "from_user_id": AnyEncodable(currentUser.id.uuidString),
            "to_user_id": AnyEncodable(communityId),
            "status": AnyEncodable("accepted")
        ]

        try await supabase
            .from("connections")
            .insert(connection)
            .execute()
    }

    func fetchConnections() async throws -> [ConnectionWithUser] {
        guard let currentUser = AuthService.shared.currentUser else {
            return []
        }

        struct ConnectionResponse: Codable {
            let id: UUID
            let connectedUserId: UUID
            let createdAt: Date
            let community: CommunityInfo

            enum CodingKeys: String, CodingKey {
                case id
                case connectedUserId = "to_user_id"
                case createdAt = "created_at"
                case community
            }

            struct CommunityInfo: Codable {
                let id: UUID
                let name: String
            }
        }

        let response: [ConnectionResponse] = try await supabase
            .from("connections")
            .select("id, to_user_id, created_at, community:to_user_id(id, name)")
            .eq("from_user_id", value: currentUser.id.uuidString)
            .eq("status", value: "accepted")
            .execute()
            .value

        return response.map { conn in
            ConnectionWithUser(
                id: conn.id,
                connectedUserId: conn.connectedUserId,
                connectedUserName: conn.community.name,
                createdAt: conn.createdAt
            )
        }
    }
}

enum ConnectionError: Error {
    case notAuthenticated
    case invalidQRCode
}

struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        _encode = { encoder in
            try value.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
