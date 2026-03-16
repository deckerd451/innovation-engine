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

        do {
            try await beaconRegistry.refreshBeacons()
        } catch {
            print("⚠️ Failed to refresh beacons: \(error)")
        }

        await MainActor.run {
            BLEScannerService.shared.startScanning()
            // Do NOT start legacy advertising here.
            // BLE advertising with identity (BCN-<prefix>) is started by EventJoinService
            // when the user joins an event via QR. Starting legacy advertising here would
            // block the identity-aware advertising from starting later.
            if let communityId = AuthService.shared.currentUser?.id {
                #if DEBUG
                print("[BLEService] Starting identity-aware advertising from Event Mode")
                #endif
                BLEAdvertiserService.shared.startAdvertisingForEvent(communityId: communityId)
            } else {
                print("[BLEService] ⚠️ No community ID available — skipping BLE advertising")
                #if DEBUG
                print("[BLEService]   Advertising will start when user joins an event via QR")
                #endif
            }
        }

        startMonitoring()

        await MainActor.run {
            isScanning = true
            errorMessage = nil
        }

        startScanTimer()
        startRetryTimer()

        #if DEBUG
        print("✅ Event Mode started")
        #endif
    }

    func stopEventMode() {
        guard isScanning else { return }

        #if DEBUG
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[BLEService] 🛑 STOPPING EVENT MODE")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        #endif

        stopMonitoring()

        scanTimer?.invalidate()
        scanTimer = nil
        retryTimer?.invalidate()
        retryTimer = nil

        rssiHistory.removeAll()
        lastPingSent.removeAll()
        pingQueue.removeAll()
        monitoredRegions.removeAll()

        closestBeacon = nil
        errorMessage = nil
        isScanning = false

        Task { @MainActor in
            BLEScannerService.shared.stopScanning()
            BeaconConfidenceService.shared.reset()
            EventPresenceService.shared.reset()
            BLEAdvertiserService.shared.stopEventAdvertising()
        }

        #if DEBUG
        print("[BLEService] ✅ Event Mode stopped - all services reset")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        #endif
    }

    // MARK: - Monitoring

    private func startMonitoring() {
        for (beaconKey, beacon) in beaconRegistry.cache.beacons {
            guard let components = parseBeaconKey(beaconKey) else { continue }

            let constraint = CLBeaconIdentityConstraint(
                uuid: components.uuid,
                major: components.major,
                minor: components.minor
            )

            _ = CLBeaconRegion(
                beaconIdentityConstraint: constraint,
                identifier: beacon.id.uuidString
            )

            locationManager.startRangingBeacons(satisfying: constraint)
            monitoredRegions.insert(beacon.id)

            #if DEBUG
            print("📡 Monitoring beacon: \(beacon.label)")
            #endif
        }
    }

    private func stopMonitoring() {
        for (beaconKey, _) in beaconRegistry.cache.beacons {
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
        scanTimer?.invalidate()
        scanTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            self?.processBeacons()
        }
    }

    private func processBeacons() {
        guard isScanning else { return }

        var beaconScores: [(beaconId: UUID, energy: Double, label: String)] = []

        for (beaconId, rssiSamples) in rssiHistory {
            guard !rssiSamples.isEmpty else { continue }

            let energy = calculateEnergy(from: rssiSamples)

            if let beacon = beaconRegistry.cache.beacons.values.first(where: { $0.id == beaconId }) {
                beaconScores.append((beaconId, energy, beacon.label))
            }
        }

        beaconScores.sort { $0.energy > $1.energy }
        let topBeacons = Array(beaconScores.prefix(1))

        if let closest = topBeacons.first {
            DispatchQueue.main.async {
                self.closestBeacon = DetectedBeacon(
                    beaconId: closest.beaconId,
                    label: closest.label,
                    energy: closest.energy,
                    lastSeen: Date()
                )
            }
        } else {
            DispatchQueue.main.async {
                self.closestBeacon = nil
            }
        }

        for beacon in topBeacons {
            queuePingIfNeeded(beaconId: beacon.beaconId, energy: beacon.energy)
        }
    }

    // MARK: - Energy Calculation

    private func calculateEnergy(from rssiSamples: [Double]) -> Double {
        guard !rssiSamples.isEmpty else { return 0.4 }

        let sorted = rssiSamples.sorted()
        let median = sorted[sorted.count / 2]

        let normalizedRSSI = (median + 90) / 50.0
        var energy = 0.4 + (normalizedRSSI * 0.5)

        let mean = rssiSamples.reduce(0, +) / Double(rssiSamples.count)
        let variance = rssiSamples.map { pow($0 - mean, 2) }.reduce(0, +) / Double(rssiSamples.count)
        let stddev = sqrt(variance)

        let stabilityFactor = max(0, 1 - (stddev / 20.0))
        energy *= stabilityFactor

        return max(0, min(1, energy))
    }

    // MARK: - Debounced Upload

    private func queuePingIfNeeded(beaconId: UUID, energy: Double) {
        let now = Date()

        if let last = lastPingSent[beaconId] {
            let timeSinceLast = now.timeIntervalSince(last.date)
            let energyDelta = abs(energy - last.energy)

            if timeSinceLast < 5 && energyDelta < 0.15 {
                return
            }
        }

        pingQueue.append((beaconId, energy))
        lastPingSent[beaconId] = (now, energy)
    }

    private func startRetryTimer() {
        retryTimer?.invalidate()
        retryTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.uploadQueuedPings()
        }
    }

    private func uploadQueuedPings() {
        guard isScanning else { return }
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
            let clampedEnergy = max(0, min(1, energy))

            let params: [String: AnyJSON] = [
                "p_context_type": .string("beacon"),
                "p_context_id": .string(beaconId.uuidString),
                "p_energy": .double(clampedEnergy),
                "p_ttl_seconds": .integer(25)
            ]

            try await supabase
                .rpc("upsert_presence_ping", params: params)
                .execute()

            #if DEBUG
            print("✅ Ping sent: beacon=\(beaconId) energy=\(String(format: "%.2f", clampedEnergy))")
            #endif
        } catch {
            print("⚠️ Failed to send ping: \(error)")
            pingQueue.append((beaconId, energy))
        }
    }

    // MARK: - Beacon Key Parsing

    private func parseBeaconKey(_ key: String) -> (uuid: UUID, major: UInt16, minor: UInt16)? {
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
        guard isScanning else { return }

        for beacon in beacons {
            guard beacon.rssi != 0 else { continue }

            let beaconKey = "uuid:\(beacon.uuid.uuidString)|major:\(beacon.major)|minor:\(beacon.minor)"

            guard let registeredBeacon = beaconRegistry.getBeacon(forKey: beaconKey) else {
                continue
            }

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
    let lastSeen: Date
}
