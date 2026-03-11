import SwiftUI

struct NetworkView: View {
    @ObservedObject private var attendees = EventAttendeesService.shared
    @ObservedObject private var presence = EventPresenceService.shared
    @ObservedObject private var scanner = BLEScannerService.shared
    
    @State private var showMockAttendees = false
    @State private var showSettings = false
    @State private var showPresenceTestResult = false
    @State private var selectedAttendee: EventAttendee?
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                if presence.currentEvent == nil {
                    inactiveState
                } else {
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
            .sheet(item: $selectedAttendee) { attendee in
                FindAttendeeView(attendee: attendee)
            }
            .onAppear {
                attendees.refresh()
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    attendees.refresh()
                }
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
        ScrollView {
            VStack(spacing: 0) {
                eventHeader
                nearbyDevicesSection
                
                if displayAttendees.isEmpty {
                    emptyState
                } else {
                    attendeeVisualization
                        .frame(height: 420)
                }
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
            
            // Presence status indicator
            if let lastWrite = presence.lastPresenceWrite {
                Text("Presence updated: \(lastWrite.formatted(date: .omitted, time: .standard))")
                    .font(.caption)
                    .foregroundColor(.green)
            } else if presence.currentEvent != nil {
                Text("Connected to event: \(presence.currentEvent!)")
                    .font(.caption)
                    .foregroundColor(.orange)
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
    
    private var nearbyDevicesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Nearby Devices")
                    .font(.headline)
                    .foregroundColor(.white)
                
                Spacer()
                
                Text("\(nearbyDevices.count)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            if nearbyDevices.isEmpty {
                Text("No nearby BLE devices detected")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            } else {
                VStack(spacing: 10) {
                    ForEach(nearbyDevices) { device in
                        nearbyDeviceRow(device)
                    }
                }
            }
        }
        .padding()
        .background(Color.white.opacity(0.03))
        .cornerRadius(16)
        .padding(.horizontal)
        .padding(.top, 12)
    }
    
    private func nearbyDeviceRow(_ device: DiscoveredBLEDevice) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(deviceColor(for: device))
                .frame(width: 12, height: 12)
            
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(device.name)
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    if device.name.hasPrefix("BEACON-") {
                        tag("APP")
                    } else if device.name.contains("MOONSIDE") || device.isKnownBeacon {
                        tag("BEACON")
                    }
                }
                
                Text("\(device.rssi) dBm • \(device.signalStrength) • \(device.timeSinceLastSeen)")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
        }
        .padding(10)
        .background(Color.white.opacity(0.04))
        .cornerRadius(12)
    }
    
    private func tag(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.bold)
            .foregroundColor(.black)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.blue)
            .cornerRadius(6)
    }
    
    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 32)
            
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
            
            Spacer(minLength: 32)
        }
        .frame(maxWidth: .infinity)
    }
    
    private var attendeeVisualization: some View {
        GeometryReader { geo in
            ZStack {
                // Center "You" node
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
                
                // Attendee nodes with proximity-based positioning
                ForEach(Array(displayAttendees.enumerated()), id: \.element.id) { index, attendee in
                    let radius = radiusForAttendee(attendee, in: geo.size)
                    let position = radialPosition(
                        index: index,
                        total: displayAttendees.count,
                        center: CGPoint(x: geo.size.width / 2, y: geo.size.height / 2),
                        radius: radius
                    )
                    let size = nodeSize(for: attendee)
                    let opacity = lineOpacity(for: attendee)
                    
                    // Connection line with proximity-based opacity
                    Path { path in
                        path.move(to: CGPoint(x: geo.size.width / 2, y: geo.size.height / 2))
                        path.addLine(to: position)
                    }
                    .stroke(Color.white.opacity(opacity), lineWidth: 1)
                    
                    // Attendee node with proximity-based size
                    VStack(spacing: 4) {
                        Circle()
                            .fill(attendee.isActiveNow ? Color.green : Color.gray)
                            .frame(width: size, height: size)
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
                    .onTapGesture {
                        selectedAttendee = attendee
                    }
                }
            }
        }
        .padding(.top, 20)
        .animation(.easeInOut(duration: 0.35), value: displayAttendees.map { attendee in
            // Animate when proximity changes
            proximityScore(for: attendee)
        })
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
                    
                    Button(action: {
                        Task {
                            await EventPresenceService.shared.debugWritePresenceNow()
                            
                            await MainActor.run {
                                showPresenceTestResult = true
                            }
                        }
                    }) {
                        HStack {
                            Image(systemName: "arrow.up.doc.fill")
                            Text("Test Presence Write")
                            Spacer()
                        }
                    }
                    .padding(.vertical, 4)
                    .alert("Presence Test Result", isPresented: $showPresenceTestResult) {
                        Button("OK", role: .cancel) { }
                    } message: {
                        Text(presence.debugStatus)
                    }
                    
                    if presence.debugStatus != "Idle" {
                        Text(presence.debugStatus)
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
                    
                    if let lastWrite = presence.lastPresenceWrite {
                        HStack {
                            Text("Last Presence Write")
                            Spacer()
                            Text(lastWrite.formatted(date: .omitted, time: .standard))
                                .foregroundColor(.green)
                        }
                    }
                    
                    HStack {
                        Text("Live Attendees")
                        Spacer()
                        Text("\(attendees.attendeeCount)")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Nearby BLE Devices")
                        Spacer()
                        Text("\(nearbyDevices.count)")
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
    
    // MARK: - Proximity Helpers
    
    /// Returns a proximity score from 0.0 (far/unknown) to 1.0 (very close)
    /// based on the smoothed RSSI of the peer device associated with this attendee.
    private func proximityScore(for attendee: EventAttendee) -> Double {
        guard let device = peerDevice(for: attendee) else {
            return 0.5  // Default medium distance if no peer device found
        }
        
        // Use smoothed RSSI for stable proximity calculation
        let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi
        
        // Map RSSI to proximity score
        // >= -45 → 1.0 (very close)
        // -55 to -46 → 0.8 (near)
        // -65 to -56 → 0.6 (nearby)
        // -75 to -66 → 0.4 (far)
        // < -75 → 0.25 (very far)
        
        switch rssi {
        case -45...0:
            return 1.0
        case -55..<(-45):
            return 0.8
        case -65..<(-55):
            return 0.6
        case -75..<(-65):
            return 0.4
        default:
            return 0.25
        }
    }
    
    /// Attempts to match an attendee to a peer BLE device.
    /// Uses heuristic name matching for demo purposes.
    /// Returns nil if no reliable match can be made.
    private func peerDevice(for attendee: EventAttendee) -> DiscoveredBLEDevice? {
        // Get all peer devices (BEACON-* devices, not event anchors)
        let peerDevices = scanner.getFilteredDevices()
            .filter { $0.name.hasPrefix("BEACON-") }
        
        guard !peerDevices.isEmpty else {
            return nil
        }
        
        // Heuristic matching strategy:
        // 1. If attendee name contains "Doug" and there's a BEACON-iPad or BEACON-iPhone, use it
        // 2. If there's only one peer device and one attendee, match them
        // 3. Otherwise, try to match by partial name similarity
        
        let attendeeLower = attendee.name.lowercased()
        
        // Strategy 1: Known name matching
        if attendeeLower.contains("doug") {
            if let device = peerDevices.first(where: { $0.name.contains("iPad") || $0.name.contains("iPhone") }) {
                return device
            }
        }
        
        // Strategy 2: Single peer device scenario
        if peerDevices.count == 1 {
            return peerDevices.first
        }
        
        // Strategy 3: Try to match device name to attendee name
        // Extract the device suffix (e.g., "iPad" from "BEACON-iPad")
        for device in peerDevices {
            let deviceSuffix = device.name.replacingOccurrences(of: "BEACON-", with: "").lowercased()
            if attendeeLower.contains(deviceSuffix) || deviceSuffix.contains(attendeeLower) {
                return device
            }
        }
        
        // No reliable match found
        return nil
    }
    
    /// Returns the radius for an attendee based on proximity.
    /// Closer attendees appear nearer to center, farther ones appear at edge.
    private func radiusForAttendee(_ attendee: EventAttendee, in size: CGSize) -> CGFloat {
        let minRadius = min(size.width, size.height) * 0.18  // Very close
        let maxRadius = min(size.width, size.height) * 0.36  // Far
        let score = proximityScore(for: attendee)
        
        // Higher score = closer = smaller radius
        return maxRadius - (maxRadius - minRadius) * CGFloat(score)
    }
    
    /// Returns the node size for an attendee based on proximity.
    /// Closer attendees have larger nodes.
    private func nodeSize(for attendee: EventAttendee) -> CGFloat {
        let score = proximityScore(for: attendee)
        
        // Map score to node size
        // 1.0 → 52
        // 0.8 → 48
        // 0.6 → 44
        // 0.4 → 40
        // default → 38
        
        let minSize: CGFloat = 38
        let maxSize: CGFloat = 52
        
        return minSize + (maxSize - minSize) * CGFloat(score)
    }
    
    /// Returns the line opacity for an attendee based on proximity.
    /// Closer attendees have more visible connection lines.
    private func lineOpacity(for attendee: EventAttendee) -> Double {
        let score = proximityScore(for: attendee)
        return 0.15 + score * 0.45  // Range: 0.15 (far) to 0.60 (close)
    }
    
    /// Returns a human-readable proximity label for debugging.
    private func proximityLabel(for attendee: EventAttendee) -> String {
        let score = proximityScore(for: attendee)
        
        switch score {
        case 1.0:
            return "Very Close"
        case 0.8:
            return "Near"
        case 0.6:
            return "Nearby"
        case 0.4:
            return "Far"
        case 0.25:
            return "Very Far"
        default:
            return "Unknown"
        }
    }
    
    private var nearbyDevices: [DiscoveredBLEDevice] {
        scanner.getFilteredDevices()
            .filter { device in
                device.isKnownBeacon || device.name.hasPrefix("BEACON-")
            }
            .sorted { $0.rssi > $1.rssi }
    }
    
    private func deviceColor(for device: DiscoveredBLEDevice) -> Color {
        if device.name.hasPrefix("BEACON-") {
            return .green
        }
        if device.isKnownBeacon {
            return .orange
        }
        return .gray
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
