import Foundation

// MARK: - PresenceSession

/// Represents a row from public.presence_sessions table
struct PresenceSession: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    let contextType: String
    let contextId: UUID
    let energy: Double
    let expiresAt: Date
    let createdAt: Date
    let updatedAt: Date
    let isActive: Bool
    let lastSeen: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case contextType = "context_type"
        case contextId = "context_id"
        case energy
        case expiresAt = "expires_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case isActive = "is_active"
        case lastSeen = "last_seen"
    }
}
