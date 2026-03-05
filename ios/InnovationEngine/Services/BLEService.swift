import Foundation
import CoreLocation
import Combine
import Supabase

// MARK: - BLEService

final class BLEService: NSObject, ObservableObject {
    static let shared = BLEService()
    
    @Published var isScanning = false
    @Published var closestBeacon: DetectedBeacon?
    @Published var errorMessage: String?
    
    private let supabase = AppEnvironment.shared.supabaseClient
    private let locationManager = CLLocationManager()
    private let beaconRegistry = BeaconRegistryService.shared
    
    // Tracking state
    private var monitoredRegions: Set<UUID> = []
    private var rssiHistory: [UUID: [Double]] = [:]
    private var lastPingSent: [UUID: (date: Date, energy: Double)] = [:]
    private var pingQueue: [(beaconId: UUID, energy: Double)] = []
    
    private var scanTimer: Timer?
    private var retryTimer: Timer?
    
    private override init() {
        super.init()
        locationManager.delegate = self
    }
    
    // MARK: - Public API
    
    func startEventMode() async {
        guard !isScanning else { return }
        
        // Request location permission
        let status = locationManager.authorizationStatus
        if status == .notDetermined {
            locationManager.requestWhenInUseAuthorization()
            return
        }
        
        guard status == .authorizedWhenInUse || status == .authorizedAlways else {
            await MainActor.run {
                errorMessage = "Location permission required for BLE scanning"
            }
            return
        }
        
        // Refresh beacon registry
        do {
            try await beaconRegistry.refreshBeacons()
        } catch {
            print("⚠️ Failed to refresh beacons: \(error)")
        }
        
        // Start monitoring all active beacons
        startMonitoring()
        
        await MainActor.run {
            isScanning = true
            errorMessage = nil
        }
        
        // Start periodic processing
        startScanTimer()
        startRetryTimer()
        
        print("✅ Event Mode started")
    }
    
    func stopEventMode() {
        guard isScanning else { return }
        
        stopMonitoring()
        scanTimer?.invalidate()
        retryTimer?.invalidate()
        
        isScanning = false
        closestBeacon = nil
        rssiHistory.removeAll()
        lastPingSent.removeAll()
        
        print("✅ Event Mode stopped")
    }
    
    // MARK: - Monitoring
    
    private func startMonitoring() {
        // Parse all cached beacons and start ranging
        for (beaconKey, beacon) in beaconRegistry.cache.beacons {
            guard let components = parseBeaconKey(beaconKey) else { continue }
            
            let constraint = CLBeaconIdentityConstraint(
                uuid: components.uuid,
                major: components.major,
                minor: components.minor
            )
            
            let region = CLBeaconRegion(
                beaconIdentityConstraint: constraint,
                identifier: beacon.id.uuidString
            )
            
            locationManager.startRangingBeacons(satisfying: constraint)
            monitoredRegions.insert(beacon.id)
            
            print("📡 Monitoring beacon: \(beacon.label)")
        }
    }
    
    private func stopMonitoring() {
        for (beaconKey, beacon) in beaconRegistry.cache.beacons {
            guard let components = parseBeaconKey(beaconKey) else { continue }
            
            let constraint = CLBeaconIdentityConstraint(
                uuid: components.uuid,
                major: components.major,
                minor: components.minor
            )
            
            locationManager.stopRangingBeacons(satisfying: constraint)
        }
        
        monitoredRegions.removeAll()
    }
    
    // MARK: - Scan Timer
    
    private func startScanTimer() {
        scanTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            self?.processBeacons()
        }
    }
    
    private func processBeacons() {
        // Find top 3 closest beacons by median RSSI
        var beaconScores: [(beaconId: UUID, energy: Double, label: String)] = []
        
        for (beaconId, rssiSamples) in rssiHistory {
            guard !rssiSamples.isEmpty else { continue }
            
            let energy = calculateEnergy(from: rssiSamples)
            
            if let beacon = beaconRegistry.cache.beacons.values.first(where: { $0.id == beaconId }) {
                beaconScores.append((beaconId, energy, beacon.label))
            }
        }
        
        beaconScores.sort { $0.energy > $1.energy }
        let topBeacons = Array(beaconScores.prefix(3))
        
        // Update UI with closest beacon
        if let closest = topBeacons.first {
            DispatchQueue.main.async {
                self.closestBeacon = DetectedBeacon(
                    beaconId: closest.beaconId,
                    label: closest.label,
                    energy: closest.energy
                )
            }
        }
        
        // Queue pings for debounced upload
        for beacon in topBeacons {
            queuePingIfNeeded(beaconId: beacon.beaconId, energy: beacon.energy)
        }
    }
    
    // MARK: - Energy Calculation
    
    private func calculateEnergy(from rssiSamples: [Double]) -> Double {
        guard !rssiSamples.isEmpty else { return 0.4 } // tab hidden baseline
        
        // Calculate median RSSI
        let sorted = rssiSamples.sorted()
        let median = sorted[sorted.count / 2]
        
        // Map RSSI to energy [0, 1]
        // RSSI ranges: -90 (far) to -40 (very close)
        // Energy scale: 0.4 (hidden) to 0.9 (very active)
        let normalizedRSSI = (median + 90) / 50.0 // Map -90 to 0, -40 to 1
        var energy = 0.4 + (normalizedRSSI * 0.5) // Scale to [0.4, 0.9]
        
        // Apply stability penalty
        let mean = rssiSamples.reduce(0, +) / Double(rssiSamples.count)
        let variance = rssiSamples.map { pow($0 - mean, 2) }.reduce(0, +) / Double(rssiSamples.count)
        let stddev = sqrt(variance)
        
        // Reduce energy for unstable signals
        let stabilityFactor = max(0, 1 - (stddev / 20.0))
        energy *= stabilityFactor
        
        // Clamp to [0, 1] as required by database constraint
        return max(0, min(1, energy))
    }
    
    // MARK: - Debounced Upload
    
    private func queuePingIfNeeded(beaconId: UUID, energy: Double) {
        let now = Date()
        
        // Check debounce rules
        if let last = lastPingSent[beaconId] {
            let timeSinceLast = now.timeIntervalSince(last.date)
            let energyDelta = abs(energy - last.energy)
            
            // Skip if within 5 seconds AND energy change < 1.5
            if timeSinceLast < 5 && energyDelta < 1.5 {
                return
            }
        }
        
        // Queue for upload
        pingQueue.append((beaconId, energy))
        lastPingSent[beaconId] = (now, energy)
    }
    
    private func startRetryTimer() {
        retryTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.uploadQueuedPings()
        }
    }
    
    private func uploadQueuedPings() {
        guard !pingQueue.isEmpty else { return }
        
        let batch = pingQueue
        pingQueue.removeAll()
        
        Task {
            for ping in batch {
                await uploadPresencePing(beaconId: ping.beaconId, energy: ping.energy)
            }
        }
    }
    
    private func uploadPresencePing(beaconId: UUID, energy: Double) async {
        do {
            // CRITICAL: RPC handles auth.uid() → community.id mapping
            // Client must NEVER insert directly into presence_sessions
            // Energy must be [0, 1] per database constraint
            let clampedEnergy = max(0, min(1, energy))
            
            try await supabase.rpc(
                "upsert_presence_ping",
                params: [
                    "p_context_type": "beacon",
                    "p_context_id": beaconId.uuidString,
                    "p_energy": clampedEnergy,
                    "p_ttl_seconds": 25
                ]
            ).execute()
            
            print("✅ Ping sent: beacon=\(beaconId) energy=\(String(format: "%.2f", clampedEnergy))")
        } catch {
            print("⚠️ Failed to send ping: \(error)")
            // Re-queue on failure
            pingQueue.append((beaconId, energy))
        }
    }
    
    // MARK: - Beacon Key Parsing
    
    private func parseBeaconKey(_ key: String) -> (uuid: UUID, major: UInt16, minor: UInt16)? {
        // Format: "uuid:<UUID>|major:<MAJOR>|minor:<MINOR>"
        let parts = key.split(separator: "|")
        guard parts.count == 3 else { return nil }
        
        var uuidValue: UUID?
        var majorValue: UInt16?
        var minorValue: UInt16?
        
        for part in parts {
            let kv = part.split(separator: ":")
            guard kv.count == 2 else { continue }
            
            let key = String(kv[0])
            let value = String(kv[1])
            
            switch key {
            case "uuid":
                uuidValue = UUID(uuidString: value)
            case "major":
                majorValue = UInt16(value)
            case "minor":
                minorValue = UInt16(value)
            default:
                break
            }
        }
        
        guard let uuid = uuidValue, let major = majorValue, let minor = minorValue else {
            return nil
        }
        
        return (uuid, major, minor)
    }
}

// MARK: - CLLocationManagerDelegate

extension BLEService: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            Task {
                await startEventMode()
            }
        }
    }
    
    func locationManager(_ manager: CLLocationManager, didRange beacons: [CLBeacon], satisfying beaconConstraint: CLBeaconIdentityConstraint) {
        for beacon in beacons {
            guard beacon.rssi != 0 else { continue }
            
            // Build beacon_key
            let beaconKey = "uuid:\(beacon.uuid.uuidString)|major:\(beacon.major)|minor:\(beacon.minor)"
            
            // Look up in registry
            guard let registeredBeacon = beaconRegistry.getBeacon(forKey: beaconKey) else {
                continue
            }
            
            // Update RSSI history (keep last 10 samples)
            var history = rssiHistory[registeredBeacon.id] ?? []
            history.append(Double(beacon.rssi))
            if history.count > 10 {
                history.removeFirst()
            }
            rssiHistory[registeredBeacon.id] = history
        }
    }
}

// MARK: - DetectedBeacon

struct DetectedBeacon {
    let beaconId: UUID
    let label: String
    let energy: Double
}
