import Foundation

// MARK: - CommunityProfile

/// A community row embedded via one disambiguated FK constraint.
/// Appears in `Connection` as both `fromProfile` and `toProfile`.
struct CommunityProfile: Codable {
    let id: UUID
    let name: String
}

// MARK: - Connection

/// Decoded row from `connections` with both community profiles embedded.
///
/// The select aliases `from_profile` / `to_profile` map to FK constraint names:
///   from_profile:community!connections_from_user_id_fkey(id, name)
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

    /// Returns the id and name of whichever user is NOT the current user.
    /// - If `currentUserId` == `fromUserId`, returns `toProfile`.
    /// - Otherwise returns `fromProfile`.
    func otherUser(for currentUserId: UUID) -> (id: UUID, name: String) {
        let profile = fromUserId == currentUserId ? toProfile : fromProfile
        return (id: profile.id, name: profile.name)
    }
}
