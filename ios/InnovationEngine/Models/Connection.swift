import Foundation

// MARK: - CommunityProfile

/// One embedded community row, decoded from a PostgREST FK embed.
/// Columns selected: id, name
struct CommunityProfile: Codable {
    let id: UUID
    let name: String
}

// MARK: - Connection

/// Decoded row from the `connections` table.
///
/// Real schema:
///   id (uuid), from_user_id (uuid), to_user_id (uuid),
///   status (text), created_at (timestamp)
///
/// FK constraints used for PostgREST embedding:
///   connections_from_user_id_fkey  (from_user_id → community.id)
///   connections_to_user_id_fkey    (to_user_id   → community.id)
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

    /// Returns the id and name of whichever user is NOT the current user.
    func otherUser(for currentUserId: UUID) -> (id: UUID, name: String) {
        let profile = fromUserId == currentUserId ? toProfile : fromProfile
        return (id: profile.id, name: profile.name)
    }
}
