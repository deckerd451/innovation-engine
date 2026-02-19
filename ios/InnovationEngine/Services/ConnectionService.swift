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

    // MARK: - fetchConnections
    //
    // WHY THE PREVIOUS QUERY FAILED
    // ─────────────────────────────────────────────────────────────────────────
    // The `connections` table has TWO foreign keys that both point to
    // `community.id`:
    //
    //   connections_from_user_id_fkey  (from_user_id → community.id)
    //   connections_to_user_id_fkey    (to_user_id   → community.id)
    //
    // Using `community:to_user_id(id, name)` or any reference to the
    // non-existent column `connected_user_id` causes PostgREST to return:
    //
    //   PGRST200 – Could not find a relationship between 'connections'
    //              and 'connected_user_id' in the schema cache
    //
    // FIX: reference the full FK constraint name in each embed so PostgREST
    // knows exactly which FK to traverse:
    //
    //   from_profile:community!connections_from_user_id_fkey(id, name, image_url)
    //   to_profile:community!connections_to_user_id_fkey(id, name, image_url)
    //
    // The `or` filter returns rows where the current user is on EITHER side.
    // ─────────────────────────────────────────────────────────────────────────

    /// Returns every connection involving the current user, with both
    /// community profiles embedded. Call `conn.otherProfile(for:)` in the
    /// UI to get the remote user's data.
    func fetchConnections() async throws -> [Connection] {
        guard let currentUser = AuthService.shared.currentUser else {
            return []
        }

        let userId = currentUser.id.uuidString

        // PostgREST embed syntax: alias:table!constraint_name(columns)
        // Both FKs are named explicitly to avoid PGRST200 ambiguity.
        let selectClause = """
            id, \
            from_user_id, \
            to_user_id, \
            created_at, \
            from_profile:community!connections_from_user_id_fkey(id, name, image_url), \
            to_profile:community!connections_to_user_id_fkey(id, name, image_url)
            """

        let filterClause = "from_user_id.eq.\(userId),to_user_id.eq.\(userId)"

        // Debug: log the exact strings sent to PostgREST so mismatches are
        // immediately visible in the Xcode console.
        print("[ConnectionService] select: \(selectClause)")
        print("[ConnectionService] or filter: \(filterClause)")

        let connections: [Connection] = try await supabase
            .from("connections")
            .select(selectClause)
            .or(filterClause)
            .execute()
            .value

        print("[ConnectionService] loaded \(connections.count) connection(s)")
        return connections
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
