import Foundation

// MARK: - Why the previous query failed
//
// PostgREST requires explicit FK constraint names whenever two foreign keys
// exist between the same pair of tables. The `connections` table has TWO FKs
// that both reference `community.id`:
//
//   connections_from_user_id_fkey  (from_user_id → community.id)
//   connections_to_user_id_fkey    (to_user_id   → community.id)
//
// Using an ambiguous embed like `community:to_user_id(id, name)` — or any
// reference to the non-existent column `connected_user_id` — causes:
//   PGRST200: Could not find a relationship between 'connections'
//             and 'connected_user_id' in the schema cache
//
// Fix: embed with the full FK constraint name so PostgREST is unambiguous:
//   from_profile:community!connections_from_user_id_fkey(id, name, image_url)
//   to_profile:community!connections_to_user_id_fkey(id, name, image_url)
//
// No database changes required — purely a query-level fix.

// MARK: - CommunityProfile

/// A single community row embedded via one disambiguated FK.
/// Appears in `Connection` as both `fromProfile` and `toProfile`.
struct CommunityProfile: Codable {
    let id: UUID
    let name: String
    let imageUrl: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case imageUrl = "image_url"
    }
}

// MARK: - Connection

/// Decoded row from `connections` with both community profiles embedded.
/// The select aliases `from_profile` / `to_profile` map to the CodingKeys
/// below, disambiguating which FK was traversed for each embed.
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

    /// Returns the profile of whichever user is NOT the current user.
    /// - If `currentUserId` matches `fromUserId`, returns `toProfile`.
    /// - If `currentUserId` matches `toUserId`,   returns `fromProfile`.
    /// - Falls back to `toProfile` if neither side matches (should not occur
    ///   given the `or` filter used in the query).
    func otherProfile(for currentUserId: UUID) -> CommunityProfile {
        if fromUserId == currentUserId { return toProfile }
        if toUserId   == currentUserId { return fromProfile }
        return toProfile
    }
}
