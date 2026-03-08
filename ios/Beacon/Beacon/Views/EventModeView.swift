import SwiftUI

struct EventModeView: View {
    @StateObject private var bleService = BLEService.shared
    @ObservedObject private var scanner = BLEScannerService.shared
    @ObservedObject private var confidence = BeaconConfidenceService.shared
    @ObservedObject private var presence = EventPresenceService.shared
    @ObservedObject private var attendees = EventAttendeesService.shared  // ← ADDED: Attendees
    @State private var showingPrivacyInfo = false
    @State private var showNearbyDevices = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Privacy Notice
                    if !bleService.isScanning {
                        privacyNotice
                    }
                    
                    // Event Mode Toggle
                    eventModeToggle
                    
                    // Current Beacon Status
                    if bleService.isScanning {
                        currentBeaconCard
                        
                        // Compact Attendee Summary
                        if presence.currentEvent != nil {
                            compactAttendeeSummary
                        }
                    }
                    
                    // Nearby Signals Section
                    nearbySignalsSection
                    
                    // Error Message
                    if let error = bleService.errorMessage {
                        errorCard(error)
                    }
                    
                    // Navigate to Suggestions
                    if bleService.isScanning {
                        NavigationLink(destination: SuggestedConnectionsView()) {
                            Label("View Suggested Connections", systemImage: "person.2.fill")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(12)
                        }
                    }
                }
                .padding()
                .padding(.bottom, 20)  // Extra bottom padding for tab bar
            }
            .navigationTitle("Event Mode")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showingPrivacyInfo) {
                privacySheet
            }
            .sheet(isPresented: $showNearbyDevices) {
                NavigationView {
                    NearbyDevicesView()
                        .navigationTitle("Nearby Devices")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .navigationBarTrailing) {
                                Button("Done") {
                                    showNearbyDevices = false
                                }
                            }
                        }
                }
            }
        }
    }
    
    // MARK: - Components
    
    private var privacyNotice: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "info.circle.fill")
                    .foregroundColor(.blue)
                Text("How Event Mode Works")
                    .font(.headline)
            }
            
            Text("We record anonymous proximity signals as presence pings. You decide whether to connect with people you were near.")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Button("Learn More") {
                showingPrivacyInfo = true
            }
            .font(.caption)
            .foregroundColor(.blue)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.blue.opacity(0.1))
        )
    }
    
    // MARK: - Compact Attendee Summary
    
    private var compactAttendeeSummary: some View {
        HStack {
            Image(systemName: "person.2.fill")
                .foregroundColor(.purple)
                .font(.caption)
            
            if attendees.isLoading {
                Text("Checking for attendees...")
                    .font(.caption)
                    .foregroundColor(.secondary)
                ProgressView()
                    .scaleEffect(0.6)
            } else {
                Text("Active attendees: \(attendees.attendeeCount)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .onChange(of: attendees.attendeeCount) { oldValue, newValue in
                        print("[ATTENDEES UI] current count = \(newValue)")
                    }
            }
            
            Spacer()
            
            NavigationLink(destination: NetworkView()) {
                Text("View Network")
                    .font(.caption)
                    .foregroundColor(.blue)
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundColor(.blue)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.purple.opacity(0.1))
        )
    }
    
    // NEW: Nearby Signals Section
    private var nearbySignalsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .foregroundColor(.blue)
                Text("Nearby Signals")
                    .font(.headline)
                Spacer()
                if scanner.isScanning {
                    ProgressView()
                        .scaleEffect(0.7)
                }
            }
            
            let devices = scanner.getFilteredDevices()
            let knownBeacons = scanner.getKnownBeacons()
            
            // Debug Info
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Total Devices:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(devices.count)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    Text("Known Beacons:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text("\(knownBeacons.count)")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(knownBeacons.isEmpty ? .secondary : .blue)
                }
                
                if !devices.isEmpty {
                    Divider()
                    
                    // Show first 3 devices
                    ForEach(devices.prefix(3)) { device in
                        HStack {
                            Circle()
                                .fill(device.isKnownBeacon ? Color.blue : Color.gray)
                                .frame(width: 8, height: 8)
                            
                            Text(device.name)
                                .font(.caption)
                                .fontWeight(device.isKnownBeacon ? .bold : .regular)
                                .foregroundColor(device.isKnownBeacon ? .blue : .primary)
                            
                            Spacer()
                            
                            Text("\(device.rssi) dBm")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            
                            if device.isKnownBeacon {
                                Image(systemName: "star.fill")
                                    .font(.caption2)
                                    .foregroundColor(.yellow)
                            }
                        }
                    }
                    
                    if devices.count > 3 {
                        Button(action: {
                            showNearbyDevices = true
                        }) {
                            HStack {
                                Text("View All \(devices.count) Devices")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                        }
                        .padding(.top, 4)
                    }
                } else {
                    Text("No devices detected yet")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.vertical, 4)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
        )
    }
    
    private var eventModeToggle: some View {
        VStack(spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Event Mode")
                        .font(.title2)
                        .fontWeight(.bold)
                    
                    Text(bleService.isScanning ? "Active" : "Inactive")
                        .font(.subheadline)
                        .foregroundColor(bleService.isScanning ? .green : .secondary)
                }
                
                Spacer()
                
                Toggle("", isOn: Binding(
                    get: { bleService.isScanning },
                    set: { newValue in
                        Task {
                            if newValue {
                                await bleService.startEventMode()
                            } else {
                                bleService.stopEventMode()
                            }
                        }
                    }
                ))
                .labelsHidden()
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
        }
    }
    
    private var currentBeaconCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: confidenceIcon)
                    .foregroundColor(confidenceColor)
                Text("Event Beacon")
                    .font(.headline)
                
                Spacer()
                
                // Confidence state badge
                Text(confidence.confidenceState.displayText)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(confidenceColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(confidenceColor.opacity(0.2))
                    )
            }
            
            if let beacon = confidence.activeBeacon {
                // Stable beacon detected
                VStack(alignment: .leading, spacing: 8) {
                    // Show event name if mapped
                    if let eventName = presence.currentEvent {
                        Text(eventName)
                            .font(.title3)
                            .fontWeight(.semibold)
                        
                        Text(beacon.name)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    } else {
                        Text(beacon.name)
                            .font(.title3)
                            .fontWeight(.semibold)
                    }
                    
                    HStack(spacing: 12) {
                        Label("\(beacon.rssi) dBm", systemImage: "antenna.radiowaves.left.and.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Text("•")
                            .foregroundColor(.secondary)
                        
                        Text(beacon.signalLabel)
                            .font(.caption)
                            .foregroundColor(.green)
                        
                        Spacer()
                        
                        Text("Stable for \(Int(beacon.confidenceDuration))s")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            } else if let candidate = confidence.candidateBeacon {
                // Candidate beacon (building confidence)
                VStack(alignment: .leading, spacing: 8) {
                    Text(candidate.name)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(.orange)
                    
                    HStack {
                        Text("Building confidence...")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Spacer()
                        
                        Text("\(candidate.rssi) dBm")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            } else {
                // Searching
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Searching for event beacons...")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(confidenceColor.opacity(0.1))
        )
    }
    
    private var confidenceIcon: String {
        switch confidence.confidenceState {
        case .searching: return "magnifyingglass"
        case .candidate: return "location.circle"
        case .stable: return "location.circle.fill"
        }
    }
    
    private var confidenceColor: Color {
        switch confidence.confidenceState {
        case .searching: return .gray
        case .candidate: return .orange
        case .stable: return .green
        }
    }
    
    private func errorCard(_ message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.red.opacity(0.1))
        )
    }
    
    private var privacySheet: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Event Mode Privacy")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    VStack(alignment: .leading, spacing: 12) {
                        Text("What We Collect")
                            .font(.headline)
                        Text("• Your proximity to event beacons\n• Anonymous signal strength\n• Timestamps of presence")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    VStack(alignment: .leading, spacing: 12) {
                        Text("What We Don't Collect")
                            .font(.headline)
                        Text("• Your exact location\n• Personal conversations\n• Device identifiers")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your Control")
                            .font(.headline)
                        Text("You can turn off Event Mode at any time. Connection suggestions are always opt-in.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Privacy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        showingPrivacyInfo = false
                    }
                }
            }
        }
    }
}
