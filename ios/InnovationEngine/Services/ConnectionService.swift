import Foundation
import Supabase

final class ConnectionService {
    static let shared = ConnectionService()

    private let supabase = AppEnvironment.shared.supabaseClient

    private init() {}

    // MARK: - createConnection

    func createConnection(to communityId: String) async throws {
        guard let currentUser = AuthService.shared.currentUser else {
            throw ConnectionError.notAuthenticated
        }

        let connection: [String: AnyEncodable] = [
            "from_user_id": AnyEncodable(currentUser.id.uuidString),
            "to_user_id":   AnyEncodable(communityId),
            "status":       AnyEncodable("accepted")
        ]

        try await supabase
            .from("connections")
            .insert(connection)
            .execute()
    }

    // MARK: - loadConnections
    //
    // WHY THE PREVIOUS QUERY FAILED
    // ─────────────────────────────────────────────────────────────────────────
    // The `connections` table has TWO foreign keys that both point to
    // `community.id`:
    //
    //   connections_from_user_id_fkey  (from_user_id → community.id)
    //   connections_to_user_id_fkey    (to_user_id   → community.id)
    //
    // The old query used `community:to_user_id(id, name)`. PostgREST's schema
    // cache cannot determine which FK to traverse when the hint is only a
    // column name, so it returns:
    //
    //   PGRST200 – Could not find a relationship between 'connections'
    //              and 'connected_user_id' in the schema cache
    //
    // FIX: embed with the full constraint name so PostgREST is unambiguous:
    //
    //   from_profile:community!connections_from_user_id_fkey(id,name,image_url)
    //   to_profile:community!connections_to_user_id_fkey(id,name,image_url)
    //
    // The `or` filter returns rows where the current user is on EITHER side.
    // ─────────────────────────────────────────────────────────────────────────

    func loadConnections() async throws -> [ConnectionWithUser] {
        guard let currentUser = AuthService.shared.currentUser else {
            return []
        }

        let userId = currentUser.id.uuidString

        // Each embedded table reference uses the explicit FK constraint name to
        // disambiguate. The alias (from_profile / to_profile) controls the JSON
        // key that PostgREST returns, which CodingKeys in ConnectionRow decodes.
        let selectClause = """
            id, \
            from_user_id, \
            to_user_id, \
            created_at, \
            from_profile:community!connections_from_user_id_fkey(id,name,image_url), \
            to_profile:community!connections_to_user_id_fkey(id,name,image_url)
            """

        let rows: [ConnectionRow] = try await supabase
            .from("connections")
            .select(selectClause)
            .or("from_user_id.eq.\(userId),to_user_id.eq.\(userId)")
            .execute()
            .value

        return rows.map { row in
            let other = row.otherProfile(currentUserId: currentUser.id)
            return ConnectionWithUser(
                id: row.id,
                connectedUserId: other.id,
                connectedUserName: other.name,
                connectedUserImageUrl: other.imageUrl,
                createdAt: row.createdAt
            )
        }
    }

    // Backward-compatible wrapper so existing call sites (e.g. NetworkView)
    // continue to compile without modification.
    func fetchConnections() async throws -> [ConnectionWithUser] {
        try await loadConnections()
    }
}

// MARK: - ConnectionError

enum ConnectionError: Error {
    case notAuthenticated
    case invalidQRCode
}

// MARK: - AnyEncodable

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
