import SwiftUI
import Combine

struct FindAttendeeView: View {
    let attendee: EventAttendee
    
    @ObservedObject private var scanner = BLEScannerService.shared
    @Environment(\.dismiss) private var dismiss
    
    @State private var recentRSSI: [Int] = []
    @State private var pulseScale: CGFloat = 1.0
    
    private let updateTimer = Timer.publish(every: 1.0, on: .main, in: .common).autoconnect()
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                VStack(spacing: 32) {
                    Spacer()
                    
                    // Header
                    VStack(spacing: 8) {
                        Text("Find Attendee")
                            .font(.headline)
                            .foregroundColor(.gray)
                        
                        Text(attendee.name)
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                    }
                    
                    // Radar visualization
                    radarView
                    
                    // Signal details
                    signalDetailsView
                    
                    // Hint text
                    Text("Walk around slowly and watch the signal strength")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                    
                    Spacer()
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }
            }
            .onReceive(updateTimer) { _ in
                updateSignal()
            }
            .onAppear {
                updateSignal()
            }
        }
    }
    
    // MARK: - Radar View
    
    private var radarView: some View {
        ZStack {
            // Outer ring
            Circle()
                .stroke(Color.white.opacity(0.1), lineWidth: 2)
                .frame(width: 240, height: 240)
            
            // Middle ring with pulse
            Circle()
                .stroke(signalColor.opacity(0.3), lineWidth: 2)
                .frame(width: 180, height: 180)
                .scaleEffect(pulseScale)
                .animation(
                    Animation.easeInOut(duration: 1.5)
                        .repeatForever(autoreverses: true),
                    value: pulseScale
                )
            
            // Inner ring
            Circle()
                .stroke(signalColor.opacity(0.5), lineWidth: 3)
                .frame(width: 120, height: 120)
            
            // Center circle
            Circle()
                .fill(signalColor)
                .frame(width: 80, height: 80)
                .overlay(
                    Text(String(attendee.name.prefix(1)))
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                )
        }
        .onAppear {
            pulseScale = 1.1
        }
    }
    
    // MARK: - Signal Details
    
    private var signalDetailsView: some View {
        VStack(spacing: 16) {
            if let device = peerDevice(for: attendee) {
                // Use smoothed RSSI for stable display
                let displayRSSI = scanner.smoothedRSSI(for: device.id) ?? device.rssi
                
                // Proximity label
                Text(proximityLabel(for: displayRSSI))
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(signalColor)
                
                // RSSI value
                Text("\(displayRSSI) dBm")
                    .font(.headline)
                    .foregroundColor(.white)
                
                // Trend label
                Text(trendLabel())
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(trendColor)
                
                // Last seen
                Text("Last seen \(device.timeSinceLastSeen)")
                    .font(.caption)
                    .foregroundColor(.gray)
                
            } else {
                // No signal fallback
                VStack(spacing: 12) {
                    Image(systemName: "antenna.radiowaves.left.and.right.slash")
                        .font(.system(size: 40))
                        .foregroundColor(.gray)
                    
                    Text("Signal Unavailable")
                        .font(.headline)
                        .foregroundColor(.white)
                    
                    Text("Move around and try again")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
            }
        }
        .frame(height: 180)
    }
    
    // MARK: - Helpers
    
    /// Attempts to match the attendee to a peer BLE device.
    /// Reuses the same heuristic matching logic as NetworkView.
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
    
    /// Returns a human-readable proximity label based on RSSI.
    private func proximityLabel(for rssi: Int) -> String {
        switch rssi {
        case -45...0:
            return "Very Close"
        case -55..<(-45):
            return "Near"
        case -65..<(-55):
            return "Nearby"
        case -75..<(-65):
            return "Far"
        default:
            return "Very Far"
        }
    }
    
    /// Returns a color based on signal strength.
    private var signalColor: Color {
        guard let device = peerDevice(for: attendee) else {
            return .gray
        }
        
        // Use smoothed RSSI for stable color
        let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi
        
        switch rssi {
        case -45...0:
            return .green
        case -55..<(-45):
            return .blue
        case -65..<(-55):
            return .yellow
        case -75..<(-65):
            return .orange
        default:
            return .red
        }
    }
    
    /// Returns warmer/colder guidance based on RSSI trend.
    private func trendLabel() -> String {
        guard recentRSSI.count >= 2 else {
            return "Hold steady"
        }
        
        let newest = recentRSSI.last ?? 0
        let oldest = recentRSSI.first ?? 0
        let delta = newest - oldest
        
        // Remember: less negative RSSI = stronger signal = closer
        if delta >= 4 {
            return "Getting warmer"
        } else if delta <= -4 {
            return "Getting colder"
        } else {
            return "Hold steady"
        }
    }
    
    /// Returns color for trend label.
    private var trendColor: Color {
        let label = trendLabel()
        
        switch label {
        case "Getting warmer":
            return .green
        case "Getting colder":
            return .red
        default:
            return .gray
        }
    }
    
    /// Updates the signal state by reading current RSSI and maintaining rolling history.
    private func updateSignal() {
        guard let device = peerDevice(for: attendee) else {
            // Clear history if no device found
            recentRSSI = []
            return
        }
        
        // Use smoothed RSSI for stable trend calculation
        let currentRSSI = scanner.smoothedRSSI(for: device.id) ?? device.rssi
        
        // Append to rolling window
        recentRSSI.append(currentRSSI)
        
        // Keep only last 5 values
        if recentRSSI.count > 5 {
            recentRSSI.removeFirst()
        }
        
        print("[FIND] \(attendee.name) RSSI: \(currentRSSI) dBm, trend: \(trendLabel())")
    }
}

