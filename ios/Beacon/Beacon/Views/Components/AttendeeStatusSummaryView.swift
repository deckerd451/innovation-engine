import SwiftUI

/// Compact status summary row for FindAttendeeView / detail screens
struct AttendeeStatusSummaryView: View {
    let presentation: AttendeePresentation
    
    var body: some View {
        HStack(spacing: 8) {
            StatusBadgeView.proximity(presentation.proximity)
            
            // Only show relationship badge if it's meaningful
            if presentation.relationship != .unverified {
                StatusBadgeView.relationship(presentation.relationship)
            }
        }
    }
}
