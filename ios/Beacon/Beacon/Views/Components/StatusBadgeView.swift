import SwiftUI

/// Compact pill badge for proximity or relationship status
struct StatusBadgeView: View {
    let text: String
    let color: Color
    let icon: String?
    
    init(_ text: String, color: Color, icon: String? = nil) {
        self.text = text
        self.color = color
        self.icon = icon
    }
    
    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 8))
            }
            Text(text)
                .font(.system(size: 10, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundColor(color)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(
            Capsule().fill(color.opacity(0.15))
        )
    }
}

/// Convenience initializers for common states
extension StatusBadgeView {
    static func proximity(_ state: ProximityState) -> StatusBadgeView {
        StatusBadgeView(state.label, color: state.color, icon: state.icon)
    }
    
    static func relationship(_ state: RelationshipState) -> StatusBadgeView {
        StatusBadgeView(state.label, color: state.color, icon: state.icon)
    }
}
