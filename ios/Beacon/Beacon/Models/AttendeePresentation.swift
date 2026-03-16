import SwiftUI

// MARK: - Proximity State

enum ProximityState: String {
    case veryClose
    case nearby
    case detected
    case lost
    
    var label: String {
        switch self {
        case .veryClose: return "Very close"
        case .nearby: return "Nearby"
        case .detected: return "Detected"
        case .lost: return "Recently seen"
        }
    }
    
    var color: Color {
        switch self {
        case .veryClose: return .green
        case .nearby: return .blue
        case .detected: return .yellow
        case .lost: return .gray
        }
    }
    
    var icon: String {
        switch self {
        case .veryClose: return "wave.3.right"
        case .nearby: return "wave.3.right"
        case .detected: return "antenna.radiowaves.left.and.right"
        case .lost: return "clock"
        }
    }
}

// MARK: - Relationship State

enum RelationshipState: String {
    case connected
    case pending
    case verified
    case metPreviously
    case unverified
    
    var label: String {
        switch self {
        case .connected: return "Connected"
        case .pending: return "Pending"
        case .verified: return "Verified attendee"
        case .metPreviously: return "Met previously"
        case .unverified: return "Unverified"
        }
    }
    
    var color: Color {
        switch self {
        case .connected: return Color(red: 1.0, green: 0.84, blue: 0.0) // gold
        case .pending: return .orange
        case .verified: return .cyan
        case .metPreviously: return .purple
        case .unverified: return .gray
        }
    }
    
    var icon: String {
        switch self {
        case .connected: return "link"
        case .pending: return "clock.arrow.circlepath"
        case .verified: return "checkmark.seal.fill"
        case .metPreviously: return "person.crop.circle.badge.clock"
        case .unverified: return "questionmark.circle"
        }
    }
}

// MARK: - Attendee Presentation

/// Lightweight derived view-state for a single attendee, combining proximity + relationship
struct AttendeePresentation {
    let attendee: EventAttendee
    let proximity: ProximityState
    let relationship: RelationshipState
    
    // MARK: - Node styling
    
    var nodeColor: Color {
        switch relationship {
        case .connected: return Color(red: 1.0, green: 0.84, blue: 0.0)
        case .verified, .metPreviously: return .cyan
        case .pending: return .orange
        case .unverified:
            return proximity == .lost ? .gray.opacity(0.5) : .green
        }
    }
    
    var nodeOpacity: Double {
        proximity == .lost ? 0.45 : 1.0
    }
    
    var hasRing: Bool {
        relationship == .connected || relationship == .verified
    }
    
    var ringColor: Color {
        switch relationship {
        case .connected: return Color(red: 1.0, green: 0.84, blue: 0.0)
        case .verified: return .cyan
        default: return .clear
        }
    }
    
    var edgeWidth: CGFloat {
        switch relationship {
        case .connected: return 2.0
        case .verified: return 1.5
        default: return 1.0
        }
    }
    
    var edgeColor: Color {
        switch relationship {
        case .connected: return Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.6)
        case .verified: return .cyan.opacity(0.4)
        default: return .white.opacity(0.15 + Double(proximityAlpha) * 0.35)
        }
    }
    
    private var proximityAlpha: CGFloat {
        switch proximity {
        case .veryClose: return 1.0
        case .nearby: return 0.7
        case .detected: return 0.4
        case .lost: return 0.15
        }
    }
}
