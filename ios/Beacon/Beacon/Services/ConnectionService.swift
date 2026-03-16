// MARK: - Verification checklist
//
// After any future edit, confirm:
//   1. Xcode Shift+Cmd+F → "connected_user_id" → 0 results
//   2. Xcode Shift+Cmd+F → "connectedUserId"   → 0 results
//   3. Shift+Cmd+K (clean build folder), then Cmd+R
//   4. Tap Network tab — no PGRST200 in console
//   5. Console shows the three ✅ debug lines below

import Foundation
import Supabase

final class ConnectionService {
    static let shared = ConnectionService()

    private let supabase = AppEnvironment.shared.supabaseClient

    private init() {}

    // MARK: - createConnection

    /// Inserts an accepted connection from the current user to `communityId`.
    /// Columns written: from_user_id, to_user_id, status — nothing else.
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

    // MARK: - createConnectionIfNeeded

    enum ConnectResult {
        case created
        case alreadyExists
    }

    /// Creates a connection if one doesn't already exist. Returns the outcome.
    func createConnectionIfNeeded(to communityId: String) async throws -> ConnectResult {
        guard let currentUser = AuthService.shared.currentUser else {
            throw ConnectionError.notAuthenticated
        }
        guard let toId = UUID(uuidString: communityId) else {
            throw ConnectionError.invalidQRCode
        }

        let userId = currentUser.id.uuidString
        let targetId = toId.uuidString

        // Check both directions
        let orFilter = "and(from_user_id.eq.\(userId),to_user_id.eq.\(targetId)),and(from_user_id.eq.\(targetId),to_user_id.eq.\(userId))"

        struct Row: Decodable { let id: UUID }
        let existing: [Row] = try await supabase
            .from("connections")
            .select("id")
            .or(orFilter)
            .limit(1)
            .execute()
            .value

        if !existing.isEmpty {
            return .alreadyExists
        }

        try await createConnection(to: communityId)
        return .created
    }

    // MARK: - fetchConnections

    /// Fetches every accepted connection where the current user is on either side,
    /// with both community profiles embedded via explicit FK constraint names.
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

        let orFilter = "from_user_id.eq.\(userId),to_user_id.eq.\(userId)"

        print("✅ fetchConnections running")
        print("✅ selectClause:", selectClause)
        print("✅ orFilter:", orFilter)

        return try await supabase
            .from("connections")
            .select(selectClause)
            .or(orFilter)
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
