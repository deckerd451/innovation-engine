import SwiftUI

struct NearbyDevicesView: View {
    @ObservedObject private var scanner = BLEScannerService.shared
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .foregroundColor(.blue)
                Text("Nearby Devices")
                    .font(.headline)
                Spacer()
                if scanner.isScanning {
                    ProgressView()
                        .scaleEffect(0.8)
                }
            }
            .padding()
            .background(Color(.systemGray6))
            
            // Device List
            ScrollView {
                LazyVStack(spacing: 12) {
                    let devices = scanner.getFilteredDevices()
                    
                    if devices.isEmpty {
                        EmptyStateView()
                    } else {
                        ForEach(devices) { device in
                            DeviceRowView(device: device)
                        }
                    }
                }
                .padding()
            }
        }
        .background(Color(.systemBackground))
    }
}

// MARK: - Device Row

struct DeviceRowView: View {
    let device: DiscoveredBLEDevice
    
    var body: some View {
        HStack(spacing: 12) {
            // Signal Indicator
            SignalIndicatorView(rssi: device.rssi)
            
            // Device Info
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(device.name)
                        .font(.system(.body, design: .rounded))
                        .fontWeight(device.isKnownBeacon ? .bold : .regular)
                        .foregroundColor(device.isKnownBeacon ? .blue : .primary)
                    
                    if device.isKnownBeacon {
                        Image(systemName: "star.fill")
                            .font(.caption)
                            .foregroundColor(.yellow)
                    }
                }
                
                HStack(spacing: 8) {
                    Text("\(device.rssi) dBm")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text("•")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text(device.signalStrength)
                        .font(.caption)
                        .foregroundColor(signalColor(for: device.rssi))
                    
                    Text("•")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text(device.timeSinceLastSeen)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            // Known Beacon Badge
            if device.isKnownBeacon {
                VStack(spacing: 2) {
                    Image(systemName: "antenna.radiowaves.left.and.right.circle.fill")
                        .font(.title2)
                        .foregroundColor(.blue)
                    Text("Event")
                        .font(.caption2)
                        .foregroundColor(.blue)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(device.isKnownBeacon ? Color.blue.opacity(0.1) : Color(.systemGray6))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(device.isKnownBeacon ? Color.blue.opacity(0.3) : Color.clear, lineWidth: 2)
        )
    }
    
    private func signalColor(for rssi: Int) -> Color {
        switch rssi {
        case -40...0: return .green
        case -60..<(-40): return .blue
        case -80..<(-60): return .orange
        default: return .red
        }
    }
}

// MARK: - Signal Indicator

struct SignalIndicatorView: View {
    let rssi: Int
    
    var body: some View {
        ZStack {
            Circle()
                .fill(signalColor.opacity(0.2))
                .frame(width: 44, height: 44)
            
            Image(systemName: signalIcon)
                .font(.title3)
                .foregroundColor(signalColor)
        }
    }
    
    private var signalColor: Color {
        switch rssi {
        case -40...0: return .green
        case -60..<(-40): return .blue
        case -80..<(-60): return .orange
        default: return .red
        }
    }
    
    private var signalIcon: String {
        switch rssi {
        case -40...0: return "wifi"
        case -60..<(-40): return "wifi"
        case -80..<(-60): return "wifi.slash"
        default: return "wifi.exclamationmark"
        }
    }
}

// MARK: - Empty State

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "antenna.radiowaves.left.and.right.slash")
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            
            Text("No Devices Nearby")
                .font(.headline)
                .foregroundColor(.secondary)
            
            Text("Bluetooth devices will appear here when detected")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding(.vertical, 60)
    }
}

// MARK: - Preview

struct NearbyDevicesView_Previews: PreviewProvider {
    static var previews: some View {
        NearbyDevicesView()
    }
}
