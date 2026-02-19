import Foundation

struct Connection: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    let connectedUserId: UUID
    let status: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "from_user_id"
        case connectedUserId = "to_user_id"
        case status
        case createdAt = "created_at"
    }
}

struct ConnectionWithUser: Identifiable {
    let id: UUID
    let connectedUserId: UUID
    let connectedUserName: String
    let createdAt: Date
}
