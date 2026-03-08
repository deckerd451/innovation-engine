import Foundation

// MARK: - Beacon

/// Represents a row from public.beacons table
struct Beacon: Codable, Identifiable {
    let id: UUID
    let beaconKey: String
    let label: String
    let kind: String
    let groupId: UUID?
    let isActive: Bool
    let meta: [String: String]?
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case beaconKey = "beacon_key"
        case label
        case kind
        case groupId = "group_id"
        case isActive = "is_active"
        case meta
        case createdAt = "created_at"
    }
}

// MARK: - BeaconCache

/// In-memory cache mapping beacon_key -> Beacon
struct BeaconCache: Codable {
    var beacons: [String: Beacon]
    var lastRefreshed: Date
    
    init() {
        self.beacons = [:]
        self.lastRefreshed = Date.distantPast
    }
}
