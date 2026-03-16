import Foundation

struct User: Codable, Identifiable {
    let id: UUID
    let userId: UUID?
    let name: String
    let email: String?
    let bio: String?
    let skills: [String]?
    let interests: [String]?
    let imageUrl: String?
    let imagePath: String?
    let profileCompleted: Bool?
    let connectionCount: Int?
    let createdAt: Date?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case name
        case email
        case bio
        case skills
        case interests
        case imageUrl = "image_url"
        case imagePath = "image_path"
        case profileCompleted = "profile_completed"
        case connectionCount = "connection_count"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
    
    // MARK: - Profile State Helpers
    
    /// Profile is missing if this is a placeholder or incomplete fetch
    var isMissing: Bool {
        return userId == nil
    }
    
    /// Profile is ready if it has minimum required fields for app use
    var isReady: Bool {
        guard !name.isEmpty else { return false }
        
        // At least one enrichment field should have content
        let hasBio = bio?.isEmpty == false
        let hasSkills = skills?.isEmpty == false
        let hasInterests = interests?.isEmpty == false
        
        return hasBio || hasSkills || hasInterests
    }
    
    /// Profile is incomplete if it exists but lacks required fields
    var isIncomplete: Bool {
        return !isMissing && !isReady
    }
    
    /// Human-readable profile state
    var profileState: ProfileState {
        if isMissing { return .missing }
        if isReady { return .ready }
        return .incomplete
    }
}

enum ProfileState: String {
    case missing = "missing"
    case incomplete = "incomplete"
    case ready = "ready"
}
