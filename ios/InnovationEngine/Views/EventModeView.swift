import SwiftUI

struct EventModeView: View {
    @StateObject private var bleService = BLEService.shared
    @State private var showingPrivacyInfo = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Privacy Notice
                if !bleService.isScanning {
                    privacyNotice
                }
                
                // Event Mode Toggle
                eventModeToggle
                
                // Current Beacon Status
                if bleService.isScanning {
                    currentBeaconCard
                }
                
                // Error Message
                if let error = bleService.errorMessage {
                    errorCard(error)
                }
                
                Spacer()
                
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
                    .padding(.horizontal)
                }
            }
            .padding()
            .navigationTitle("Event Mode")
            .sheet(isPresented: $showingPrivacyInfo) {
                privacySheet
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
        .background(Color.blue.opacity(0.1))
        .cornerRadius(12)
    }
    
    private var eventModeToggle: some View {
        VStack(spacing: 16) {
            Image(systemName: bleService.isScanning ? "antenna.radiowaves.left.and.right" : "antenna.radiowaves.left.and.right.slash")
                .font(.system(size: 60))
                .foregroundColor(bleService.isScanning ? .green : .gray)
            
            Text(bleService.isScanning ? "Event Mode Active" : "Event Mode Inactive")
                .font(.title2)
                .fontWeight(.semibold)
            
            Button {
                Task {
                    if bleService.isScanning {
                        bleService.stopEventMode()
                    } else {
                        await bleService.startEventMode()
                    }
                }
            } label: {
                Text(bleService.isScanning ? "Stop Event Mode" : "Start Event Mode")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(bleService.isScanning ? Color.red : Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .cornerRadius(16)
    }
    
    private var currentBeaconCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Closest Beacon")
                .font(.headline)
            
            if let beacon = bleService.closestBeacon {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(beacon.label)
                            .font(.title3)
                            .fontWeight(.semibold)
                        
                        Text("Signal Strength: \(String(format: "%.1f", beacon.energy))/10")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    signalStrengthIndicator(energy: beacon.energy)
                }
            } else {
                Text("Scanning for beacons...")
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color.green.opacity(0.1))
        .cornerRadius(12)
    }
    
    private func signalStrengthIndicator(energy: Double) -> some View {
        HStack(spacing: 4) {
            ForEach(0..<5) { index in
                RoundedRectangle(cornerRadius: 2)
                    .fill(energy > Double(index * 2) ? Color.green : Color.gray.opacity(0.3))
                    .frame(width: 8, height: CGFloat(12 + index * 4))
            }
        }
    }
    
    private func errorCard(_ message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            Text(message)
                .font(.subheadline)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
    }
    
    private var privacySheet: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Privacy & How It Works")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    privacySection(
                        icon: "antenna.radiowaves.left.and.right",
                        title: "BLE Beacon Scanning",
                        description: "Your device scans for nearby iBeacons placed at the event venue. This happens only when Event Mode is ON."
                    )
                    
                    privacySection(
                        icon: "chart.line.uptrend.xyaxis",
                        title: "Presence Pings",
                        description: "We send lightweight 'presence pings' to record that you were near a beacon. These include a signal strength score but no raw location data."
                    )
                    
                    privacySection(
                        icon: "person.2.badge.gearshape",
                        title: "Overlap Detection",
                        description: "After the event, we analyze overlapping presence to suggest people you were near. You control whether to connect."
                    )
                    
                    privacySection(
                        icon: "hand.raised.fill",
                        title: "Your Control",
                        description: "You can stop Event Mode anytime. Suggestions are opt-in—accept, ignore, or block as you choose."
                    )
                }
                .padding()
            }
            .navigationTitle("Privacy Info")
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
    
    private func privacySection(icon: String, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.blue)
                .frame(width: 40)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct EventModeView_Previews: PreviewProvider {
    static var previews: some View {
        EventModeView()
    }
}
