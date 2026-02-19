import Foundation

// MARK: - Why the previous query failed
//
// PostgREST (which powers Supabase's REST API) requires explicit disambiguation
// when two foreign keys exist between the same pair of tables.
// The `connections` table has TWO FKs that both reference `community.id`:
//
//   connections_from_user_id_fkey  (from_user_id → community.id)
//   connections_to_user_id_fkey    (to_user_id   → community.id)
//
// The old query used `community:to_user_id(id, name)`. PostgREST cannot
// determine WHICH foreign key to traverse from that hint alone, so it
// returns PGRST200: "Could not find a relationship between 'connections'
// and 'connected_user_id' in the schema cache".
//
// Fix: reference the full FK constraint name inside the embed:
//   from_profile:community!connections_from_user_id_fkey(id, name, image_url)
//   to_profile:community!connections_to_user_id_fkey(id, name, image_url)
//
// No database changes are required — this is purely a query-level fix.

// MARK: - CommunityProfile
/// Represents a single community row embedded via a disambiguated FK.
/// Appears in a ConnectionRow as both `from_profile` and `to_profile`.
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

// MARK: - ConnectionRow
/// Full decoded row from `connections`, with both community profiles embedded.
struct ConnectionRow: Codable, Identifiable {
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
    func otherProfile(currentUserId: UUID) -> CommunityProfile {
        fromUserId == currentUserId ? toProfile : fromProfile
    }
}

// MARK: - ConnectionWithUser
/// Flattened view-model used by the UI layer.
struct ConnectionWithUser: Identifiable {
    let id: UUID
    let connectedUserId: UUID
    let connectedUserName: String
    let connectedUserImageUrl: String?
    let createdAt: Date
}
