import SwiftUI

// MARK: - BeaconRadarView

/// Lightweight radar visualization for Event Mode
/// Shows beacon at center with attendees in stable ring and suggested edges
struct BeaconRadarView: View {
    let beaconId: UUID
    let beaconLabel: String
    
    @State private var attendees: [ActiveAttendee] = []
    @State private var suggestedEdges: [SuggestedEdge] = []
    @State private var selectedAttendee: ActiveAttendee?
    @State private var showingConnectionSheet = false
    
    private let dataService = EventModeDataService.shared
    private let refreshInterval: TimeInterval = 5.0
    
    var body: some View {
        VStack(spacing: 16) {
            // Radar Canvas
            GeometryReader { geometry in
                Canvas { context, size in
                    let center = CGPoint(x: size.width / 2, y: size.height / 2)
                    let beaconRadius: CGFloat = 30
                    let orbitRadius: CGFloat = min(size.width, size.height) / 2 - 60
                    
                    // Draw beacon at center
                    drawBeacon(context: context, center: center, radius: beaconRadius)
                    
                    // Draw orbit ring
                    drawOrbitRing(context: context, center: center, radius: orbitRadius)
                    
                    // Draw suggested edges
                    drawSuggestedEdges(
                        context: context,
                        center: center,
                        orbitRadius: orbitRadius
                    )
                }
                .overlay(
                    // Overlay attendee nodes (for tap interaction)
                    attendeeNodesOverlay(geometry: geometry)
                )
            }
            .frame(height: 400)
            .background(Color.black.opacity(0.05))
            .cornerRadius(16)
            
            // Stats
            statsBar
        }
        .task {
            await refreshData()
            startRefreshTimer()
        }
        .sheet(isPresented: $showingConnectionSheet) {
            if let attendee = selectedAttendee {
                AttendeeDetailSheet(
                    attendee: attendee,
                    onConnect: {
                        showingConnectionSheet = false
                        // Navigate to SuggestedConnectionsView
                    }
                )
            }
        }
    }
    
    // MARK: - Drawing Functions
    
    private func drawBeacon(context: GraphicsContext, center: CGPoint, radius: CGFloat) {
        // Beacon circle with pulsing glow
        let beaconPath = Circle()
            .path(in: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            ))
        
        // Glow effect
        context.fill(
            beaconPath,
            with: .color(.blue.opacity(0.3))
        )
        
        // Solid beacon
        context.fill(
            beaconPath,
            with: .color(.blue)
        )
        
        // Beacon icon (antenna)
        let iconSize: CGFloat = 20
        let iconRect = CGRect(
            x: center.x - iconSize / 2,
            y: center.y - iconSize / 2,
            width: iconSize,
            height: iconSize
        )
        
        context.draw(
            Text("📡")
                .font(.system(size: iconSize)),
            at: center
        )
    }
    
    private func drawOrbitRing(context: GraphicsContext, center: CGPoint, radius: CGFloat) {
        let ringPath = Circle()
            .stroke(style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
            .path(in: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            ))
        
        context.stroke(
            ringPath,
            with: .color(.gray.opacity(0.3)),
            lineWidth: 1
        )
    }
    
    private func drawSuggestedEdges(context: GraphicsContext, center: CGPoint, orbitRadius: CGFloat) {
        for edge in suggestedEdges {
            // Find positions of from/to users
            guard let fromIndex = attendees.firstIndex(where: { $0.id == edge.fromUserId }),
                  let toIndex = attendees.firstIndex(where: { $0.id == edge.toUserId }) else {
                continue
            }
            
            let fromPos = calculateAttendeePosition(
                index: fromIndex,
                total: attendees.count,
                center: center,
                radius: orbitRadius
            )
            
            let toPos = calculateAttendeePosition(
                index: toIndex,
                total: attendees.count,
                center: center,
                radius: orbitRadius
            )
            
            // Draw dashed line
            var path = Path()
            path.move(to: fromPos)
            path.addLine(to: toPos)
            
            context.stroke(
                path,
                with: .color(.orange.opacity(0.6)),
                style: StrokeStyle(lineWidth: 2, dash: [5, 3])
            )
        }
    }
    
    private func attendeeNodesOverlay(geometry: GeometryProxy) -> some View {
        let center = CGPoint(x: geometry.size.width / 2, y: geometry.size.height / 2)
        let orbitRadius = min(geometry.size.width, geometry.size.height) / 2 - 60
        
        return ZStack {
            ForEach(Array(attendees.enumerated()), id: \.element.id) { index, attendee in
                let position = calculateAttendeePosition(
                    index: index,
                    total: attendees.count,
                    center: center,
                    radius: orbitRadius
                )
                
                AttendeeNode(attendee: attendee)
                    .position(position)
                    .onTapGesture {
                        selectedAttendee = attendee
                        showingConnectionSheet = true
                    }
            }
        }
    }
    
    private func calculateAttendeePosition(index: Int, total: Int, center: CGPoint, radius: CGFloat) -> CGPoint {
        guard total > 0 else { return center }
        
        // Distribute evenly around circle
        let angle = (2 * .pi / Double(total)) * Double(index) - .pi / 2
        
        return CGPoint(
            x: center.x + radius * cos(angle),
            y: center.y + radius * sin(angle)
        )
    }
    
    // MARK: - Stats Bar
    
    private var statsBar: some View {
        HStack(spacing: 24) {
            statItem(
                icon: "person.3.fill",
                label: "Active",
                value: "\(attendees.count)"
            )
            
            statItem(
                icon: "link",
                label: "Suggested",
                value: "\(suggestedEdges.count)"
            )
            
            Spacer()
            
            Text("Updates every 5s")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal)
    }
    
    private func statItem(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(.blue)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text(value)
                    .font(.headline)
            }
        }
    }
    
    // MARK: - Data Refresh
    
    private func refreshData() async {
        do {
            async let attendeesTask = dataService.fetchActiveAttendees(beaconId: beaconId)
            async let edgesTask = dataService.fetchSuggestedEdges(beaconId: beaconId, limit: 5)
            
            let (fetchedAttendees, fetchedEdges) = try await (attendeesTask, edgesTask)
            
            await MainActor.run {
                attendees = fetchedAttendees
                suggestedEdges = fetchedEdges
            }
            
            print("✅ Radar refreshed: \(attendees.count) attendees, \(suggestedEdges.count) edges")
        } catch {
            print("⚠️ Failed to refresh radar data: \(error)")
        }
    }
    
    private func startRefreshTimer() {
        Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { _ in
            Task {
                await refreshData()
            }
        }
    }
}

// MARK: - AttendeeNode

struct AttendeeNode: View {
    let attendee: ActiveAttendee
    
    var body: some View {
        ZStack {
            // Glow based on energy
            Circle()
                .fill(glowColor.opacity(0.3))
                .frame(width: 50, height: 50)
                .blur(radius: 8)
            
            // Node circle
            Circle()
                .fill(Color.white)
                .frame(width: 40, height: 40)
                .overlay(
                    Circle()
                        .stroke(glowColor, lineWidth: 2)
                )
            
            // Avatar or initials
            if let avatarUrl = attendee.avatarUrl, let url = URL(string: avatarUrl) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    initialsView
                }
                .frame(width: 36, height: 36)
                .clipShape(Circle())
            } else {
                initialsView
            }
        }
    }
    
    private var initialsView: some View {
        Text(attendee.name.prefix(2).uppercased())
            .font(.caption)
            .fontWeight(.semibold)
            .foregroundColor(.blue)
    }
    
    private var glowColor: Color {
        // Map energy [0, 1] to color intensity
        if attendee.energy > 0.75 {
            return .green
        } else if attendee.energy > 0.5 {
            return .yellow
        } else {
            return .gray
        }
    }
}

// MARK: - AttendeeDetailSheet

struct AttendeeDetailSheet: View {
    let attendee: ActiveAttendee
    let onConnect: () -> Void
    
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Avatar
                if let avatarUrl = attendee.avatarUrl, let url = URL(string: avatarUrl) {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        Circle()
                            .fill(Color.blue.opacity(0.2))
                            .overlay(
                                Text(attendee.name.prefix(2).uppercased())
                                    .font(.largeTitle)
                                    .foregroundColor(.blue)
                            )
                    }
                    .frame(width: 100, height: 100)
                    .clipShape(Circle())
                } else {
                    Circle()
                        .fill(Color.blue.opacity(0.2))
                        .frame(width: 100, height: 100)
                        .overlay(
                            Text(attendee.name.prefix(2).uppercased())
                                .font(.largeTitle)
                                .foregroundColor(.blue)
                        )
                }
                
                // Name
                Text(attendee.name)
                    .font(.title2)
                    .fontWeight(.semibold)
                
                // Energy indicator
                HStack(spacing: 8) {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .foregroundColor(.blue)
                    Text("Signal: \(String(format: "%.0f%%", attendee.energy * 100))")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                // Connect button
                Button {
                    onConnect()
                } label: {
                    Label("View Suggested Connections", systemImage: "person.badge.plus")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Nearby Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Preview

struct BeaconRadarView_Previews: PreviewProvider {
    static var previews: some View {
        BeaconRadarView(
            beaconId: UUID(),
            beaconLabel: "Main Stage"
        )
    }
}
