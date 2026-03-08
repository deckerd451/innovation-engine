import SwiftUI

struct NetworkView: View {
    @ObservedObject private var attendees = EventAttendeesService.shared
    @ObservedObject private var presence = EventPresenceService.shared
    
    @State private var showMockAttendees = false  // Toggle for UI testing
    @State private var showSettings = false
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                if presence.currentEvent == nil {
                    // Not at an event
                    inactiveState
                } else {
                    // At an event - show live or mock attendees
                    activeEventView
                }
            }
            .navigationTitle("Network")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showSettings.toggle() }) {
                        Image(systemName: "gearshape")
                            .foregroundColor(.white)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                settingsSheet
            }
        }
    }
    
    // MARK: - States
    
    private var inactiveState: some View {
        VStack(spacing: 20) {
            Image(systemName: "network.slash")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("No Active Event")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.white)
            
            Text("Enable Event Mode and detect a beacon to see active attendees")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
    }
    
    private var activeEventView: some View {
        VStack(spacing: 0) {
            // Event header
            eventHeader
            
            // Attendee visualization
            if displayAttendees.isEmpty {
                emptyState
            } else {
                attendeeVisualization
            }
        }
    }
    
    private var eventHeader: some View {
        VStack(spacing: 8) {
            if let eventName = presence.currentEvent {
                Text(eventName)
                    .font(.headline)
                    .foregroundColor(.white)
            }
            
            HStack(spacing: 16) {
                Label("\(displayAttendees.count)", systemImage: "person.2.fill")
                    .font(.caption)
                    .foregroundColor(.gray)
                
                if attendees.isLoading {
                    ProgressView()
                        .scaleEffect(0.6)
                        .tint(.gray)
                }
                
                if showMockAttendees {
                    Text("MOCK MODE")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundColor(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.orange.opacity(0.2))
                        )
                }
            }
        }
        .padding()
        .background(Color.black.opacity(0.3))
    }
    
    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: "person.crop.circle.badge.questionmark")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("You're Here Alone")
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(.white)
            
            Text("No other attendees detected yet.\nOthers will appear here when they join.")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            Spacer()
        }
    }
    
    private var attendeeVisualization: some View {
        GeometryReader { geo in
            ZStack {
                // Center node (You)
                Circle()
                    .fill(Color.blue)
                    .frame(width: 50, height: 50)
                    .overlay(
                        Text("You")
                            .font(.caption)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                    )
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
                
                // Attendee nodes in radial layout
                ForEach(Array(displayAttendees.enumerated()), id: \.element.id) { index, attendee in
                    let position = radialPosition(
                        index: index,
                        total: displayAttendees.count,
                        center: CGPoint(x: geo.size.width / 2, y: geo.size.height / 2),
                        radius: min(geo.size.width, geo.size.height) * 0.3
                    )
                    
                    // Connection line
                    Path { path in
                        path.move(to: CGPoint(x: geo.size.width / 2, y: geo.size.height / 2))
                        path.addLine(to: position)
                    }
                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
                    
                    // Attendee node
                    VStack(spacing: 4) {
                        Circle()
                            .fill(attendee.isActiveNow ? Color.green : Color.gray)
                            .frame(width: 40, height: 40)
                            .overlay(
                                Text(String(attendee.name.prefix(1)))
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                            )
                        
                        Text(attendee.name)
                            .font(.caption2)
                            .foregroundColor(.white)
                            .lineLimit(1)
                    }
                    .position(position)
                }
            }
        }
        .onAppear {
            print("[ATTENDEES UI] Rendering \(displayAttendees.count) attendees in Network view")
        }
    }
    
    // MARK: - Settings Sheet
    
    private var settingsSheet: some View {
        NavigationView {
            Form {
                Section(header: Text("Debug Options")) {
                    Toggle("Show Mock Attendees", isOn: $showMockAttendees)
                    
                    if showMockAttendees {
                        Text("Mock attendees are for UI testing only and do not affect backend logic.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                Section(header: Text("Info")) {
                    HStack {
                        Text("Event")
                        Spacer()
                        Text(presence.currentEvent ?? "None")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Live Attendees")
                        Spacer()
                        Text("\(attendees.attendeeCount)")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Mock Attendees")
                        Spacer()
                        Text(showMockAttendees ? "\(mockAttendees.count)" : "0")
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Network Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        showSettings = false
                    }
                }
            }
        }
    }
    
    // MARK: - Helpers
    
    private var displayAttendees: [EventAttendee] {
        if showMockAttendees {
            return mockAttendees
        } else {
            return attendees.attendees
        }
    }
    
    private var mockAttendees: [EventAttendee] {
        [
            EventAttendee(
                id: UUID(),
                name: "Alice Johnson",
                avatarUrl: nil,
                energy: 0.8,
                lastSeen: Date().addingTimeInterval(-10)
            ),
            EventAttendee(
                id: UUID(),
                name: "Bob Smith",
                avatarUrl: nil,
                energy: 0.6,
                lastSeen: Date().addingTimeInterval(-45)
            ),
            EventAttendee(
                id: UUID(),
                name: "Carol Davis",
                avatarUrl: nil,
                energy: 0.4,
                lastSeen: Date().addingTimeInterval(-120)
            ),
            EventAttendee(
                id: UUID(),
                name: "David Wilson",
                avatarUrl: nil,
                energy: 0.9,
                lastSeen: Date().addingTimeInterval(-5)
            )
        ]
    }
    
    private func radialPosition(index: Int, total: Int, center: CGPoint, radius: CGFloat) -> CGPoint {
        let angle = (2 * .pi / Double(total)) * Double(index) - .pi / 2
        return CGPoint(
            x: center.x + radius * CGFloat(cos(angle)),
            y: center.y + radius * CGFloat(sin(angle))
        )
    }
}
