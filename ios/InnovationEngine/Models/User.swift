import Foundation

struct User: Codable, Identifiable {
    let id: UUID
    let userId: UUID?
    let name: String
    let email: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case name
        case email
    }
}
