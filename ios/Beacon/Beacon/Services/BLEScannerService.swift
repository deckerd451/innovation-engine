import Foundation
import CoreBluetooth
import Combine

// MARK: - Discovered Device Model

struct DiscoveredBLEDevice: Identifiable {
    let id: UUID
    let identifier: UUID
    var name: String // Display name (prioritizes advertised local name)
    var rssi: Int
    var lastSeen: Date
    var isKnownBeacon: Bool

    // Advertisement metadata
    var advertisedLocalName: String? // CBAdvertisementDataLocalNameKey
    var peripheralName: String? // peripheral.name
    var serviceUUIDs: [CBUUID]?
    var manufacturerData: Data?
    var isConnectable: Bool?

    var signalStrength: String {
        switch rssi {
        case -40...0:
            return "Very Close"
        case -60..<(-40):
            return "Near"
        case -80..<(-60):
            return "Nearby"
        default:
            return "Far"
        }
    }

    var timeSinceLastSeen: String {
        let interval = Date().timeIntervalSince(lastSeen)
        if interval < 2 {
            return "Just now"
        } else if interval < 10 {
            return "\(Int(interval))s ago"
        } else {
            return "10+ sec ago"
        }
    }
}

// MARK: - BLE Scanner Service

@MainActor
final class BLEScannerService: NSObject, ObservableObject, CBCentralManagerDelegate {

    static let shared = BLEScannerService()

    @Published private(set) var discoveredDevices: [UUID: DiscoveredBLEDevice] = [:]
    @Published private(set) var isScanning = false

    private var centralManager: CBCentralManager!
    private var staleDeviceTimer: Timer?

    // Configuration
    private let rssiThreshold: Int = -95
    private let staleDeviceTimeout: TimeInterval = 10

    // Track first detection for debug logging
    private var firstDetectionLogged = Set<UUID>()

    // Explicit control flag
    private var shouldBeScanning = false
    
    // RSSI smoothing: rolling average of last 5 samples per device
    private var rssiHistory: [UUID: [Int]] = [:]

    // Batching: stage device updates and flush to @Published at a throttled rate.
    // This prevents dozens of objectWillChange fires per second from BLE advertisements.
    private var stagedDevices: [UUID: DiscoveredBLEDevice] = [:]
    private var flushTimer: Timer?
    private let flushInterval: TimeInterval = 0.5 // publish at most 2x/sec

    // BCN summary dedup: only log when the set of visible BCN devices changes
    private var lastBCNSummarySignature: String = ""

    override init() {
        super.init()

        centralManager = CBCentralManager(
            delegate: self,
            queue: DispatchQueue(label: "ble.scanner")
        )

        startStaleDeviceTimer()
        startFlushTimer()
    }

    // MARK: - Public API

    func startScanning() {
        #if DEBUG
        print("[BLE] ▶️ startScanning requested")
        #endif
        shouldBeScanning = true

        guard centralManager.state == .poweredOn else {
            #if DEBUG
            print("[BLE] ⏳ Bluetooth not powered on yet, will start when ready")
            #endif
            return
        }

        discoveredDevices = [:]
        stagedDevices = [:]
        firstDetectionLogged.removeAll()

        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )

        isScanning = true
        #if DEBUG
        print("[BLE] ✅ BLE scanning started")
        #endif
    }

    func stopScanning() {
        #if DEBUG
        print("[BLE] 🛑 Stopping BLE scanning")
        #endif

        shouldBeScanning = false

        if centralManager.state == .poweredOn {
            centralManager.stopScan()
        }

        isScanning = false
        discoveredDevices = [:]
        stagedDevices = [:]
        firstDetectionLogged.removeAll()
        rssiHistory.removeAll()

        #if DEBUG
        print("[BLE] ✅ BLE scanning stopped, devices cleared")
        #endif
    }

    func getFilteredDevices() -> [DiscoveredBLEDevice] {
        // Read from staged buffer for freshest data
        stagedDevices.values
            .filter { $0.rssi >= rssiThreshold }
            .sorted { device1, device2 in
                if device1.isKnownBeacon != device2.isKnownBeacon {
                    return device1.isKnownBeacon
                }
                if device1.rssi != device2.rssi {
                    return device1.rssi > device2.rssi
                }
                return device1.lastSeen > device2.lastSeen
            }
    }

    func getKnownBeacons() -> [DiscoveredBLEDevice] {
        stagedDevices.values
            .filter { $0.isKnownBeacon }
            .sorted { $0.rssi > $1.rssi }
    }
    
    /// Returns the smoothed RSSI for a device based on rolling average of last 5 samples.
    /// Returns nil if no history exists for the device.
    func smoothedRSSI(for deviceId: UUID) -> Int? {
        guard let history = rssiHistory[deviceId], !history.isEmpty else {
            return nil
        }
        return history.reduce(0, +) / history.count
    }
    
    // MARK: - RSSI Smoothing
    
    private func updateRSSIHistory(for deviceId: UUID, rssi: Int) {
        var history = rssiHistory[deviceId] ?? []
        history.append(rssi)
        
        // Keep only last 5 values
        if history.count > 5 {
            history.removeFirst()
        }
        
        rssiHistory[deviceId] = history
    }

    // MARK: - CBCentralManagerDelegate

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                #if DEBUG
                print("[BLE] bluetooth powered on")
                #endif

                if self.shouldBeScanning {
                    self.centralManager.scanForPeripherals(
                        withServices: nil,
                        options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
                    )
                    self.isScanning = true
                    #if DEBUG
                    print("[BLE] ✅ scanning resumed because shouldBeScanning = true")
                    #endif
                } else {
                    self.isScanning = false
                    #if DEBUG
                    print("[BLE] ℹ️ powered on but scanner is idle")
                    #endif
                }

            case .poweredOff:
                print("[BLE] ⚠️ bluetooth powered off")
                self.isScanning = false
                self.stagedDevices = [:]
                self.discoveredDevices = [:]

            case .unauthorized:
                print("[BLE] ⚠️ bluetooth unauthorized")
                self.isScanning = false
                self.stagedDevices = [:]
                self.discoveredDevices = [:]

            default:
                print("[BLE] ⚠️ bluetooth unavailable")
                self.isScanning = false
                self.stagedDevices = [:]
                self.discoveredDevices = [:]
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let rssiValue = RSSI.intValue
        guard rssiValue >= -95 else { return }

        // Capture both name sources separately
        let peripheralName = peripheral.name
        let advertisedLocalName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        
        // Build display name with priority: advertised local name > peripheral name > "Unknown"
        let displayName = advertisedLocalName ?? peripheralName ?? "Unknown"
        
        let identifier = peripheral.identifier

        let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]
        let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
        let isConnectable = advertisementData[CBAdvertisementDataIsConnectable] as? Bool

        let isKnown = Self.isKnownBeacon(
            advertisedLocalName: advertisedLocalName,
            peripheralName: peripheralName,
            serviceUUIDs: serviceUUIDs,
            isConnectable: isConnectable
        )

        Task { @MainActor in
            guard self.shouldBeScanning else { return }

            let now = Date()

            let isFirstDetection = !self.firstDetectionLogged.contains(identifier)
            let isBeaconRelevant = isKnown
                || displayName.hasPrefix("BCN-")
                || displayName.hasPrefix("BEACON-")
                || displayName.contains("MOONSIDE")

            if isFirstDetection {
                self.firstDetectionLogged.insert(identifier)

                // Only log detailed discovery info for beacon-relevant devices.
                // Household BLE devices (AirPods, TVs, etc.) are silently tracked.
                if isBeaconRelevant {
                    #if DEBUG
                    self.debugDeviceDiscovery(
                        displayName: displayName,
                        advertisedLocalName: advertisedLocalName,
                        peripheralName: peripheralName,
                        peripheralUUID: identifier,
                        rssi: rssiValue,
                        serviceUUIDs: serviceUUIDs,
                        manufacturerData: manufacturerData,
                        isConnectable: isConnectable,
                        isKnown: isKnown
                    )
                    
                    // Unified identity classification
                    let isBCN = displayName.hasPrefix("BCN-")
                    let extractedPrefix = BLEAdvertiserService.parseCommunityPrefix(from: displayName)
                    let hasEventServiceUUID = serviceUUIDs?.contains(CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")) ?? false
                    print("[BLE-DEBUG] 🔎 Identity: \(displayName)")
                    print("  BCN- name: \(isBCN) | Service UUID match: \(hasEventServiceUUID) | Known: \(isKnown)")
                    if isBCN {
                        print("  → Attendee beacon (prefix: \(extractedPrefix ?? "?"))")
                    } else if hasEventServiceUUID {
                        print("  → Attendee beacon candidate (name pending)")
                    } else if displayName.hasPrefix("BEACON-") {
                        print("  → Legacy BEACON- device")
                    } else if displayName.contains("MOONSIDE") {
                        print("  → Event anchor")
                    }
                    #endif
                }
            }

            if var existing = self.stagedDevices[identifier] {
                existing.rssi = rssiValue
                existing.lastSeen = now
                existing.name = displayName
                existing.advertisedLocalName = advertisedLocalName
                existing.peripheralName = peripheralName
                existing.serviceUUIDs = serviceUUIDs
                existing.manufacturerData = manufacturerData
                existing.isConnectable = isConnectable
                existing.isKnownBeacon = isKnown
                self.stagedDevices[identifier] = existing
                
                // Update RSSI history for smoothing
                self.updateRSSIHistory(for: identifier, rssi: rssiValue)
            } else {
                let device = DiscoveredBLEDevice(
                    id: identifier,
                    identifier: identifier,
                    name: displayName,
                    rssi: rssiValue,
                    lastSeen: now,
                    isKnownBeacon: isKnown,
                    advertisedLocalName: advertisedLocalName,
                    peripheralName: peripheralName,
                    serviceUUIDs: serviceUUIDs,
                    manufacturerData: manufacturerData,
                    isConnectable: isConnectable
                )
                self.stagedDevices[identifier] = device
                
                // Initialize RSSI history for new device
                self.updateRSSIHistory(for: identifier, rssi: rssiValue)

                let beaconFlag = isKnown ? " [KNOWN BEACON]" : ""
                // Only log beacon-relevant devices on first detection
                #if DEBUG
                if isKnown || displayName.hasPrefix("BCN-") || displayName.hasPrefix("BEACON-") || displayName.contains("MOONSIDE") {
                    print("[BLE] device discovered: \(displayName) \(rssiValue) dBm\(beaconFlag)")
                }
                #endif
            }
        }
    }

    // MARK: - Beacon Matching

    nonisolated private static func isKnownBeacon(
        advertisedLocalName: String?,
        peripheralName: String?,
        serviceUUIDs: [CBUUID]?,
        isConnectable: Bool?
    ) -> Bool {
        let moonsideServiceUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")

        // Check service UUID first (most reliable)
        if let uuids = serviceUUIDs,
           uuids.contains(moonsideServiceUUID) {
            return true
        }

        // Check advertised local name (second most reliable)
        if let localName = advertisedLocalName {
            if localName.hasPrefix("BCN-") {
                return true
            }
            if localName.contains("BEACON-") {
                return true
            }
            if localName.contains("MOONSIDE-S1") || localName.contains("MOONSIDE") {
                return true
            }
        }

        // Check peripheral name (least reliable, often nil)
        if let pName = peripheralName {
            if pName.hasPrefix("BCN-") {
                return true
            }
            if pName.contains("BEACON-") {
                return true
            }
            if pName.contains("MOONSIDE-S1") || pName.contains("MOONSIDE") {
                return true
            }
        }

        return false
    }

    // MARK: - Debug

    private func debugDeviceDiscovery(
        displayName: String,
        advertisedLocalName: String?,
        peripheralName: String?,
        peripheralUUID: UUID,
        rssi: Int,
        serviceUUIDs: [CBUUID]?,
        manufacturerData: Data?,
        isConnectable: Bool?,
        isKnown: Bool
    ) {
        #if DEBUG
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[BLE] Device discovered (first time)")
        print("  Display Name: \(displayName)")
        print("  Advertised Local Name: \(advertisedLocalName ?? "nil")")
        print("  Peripheral Name: \(peripheralName ?? "nil")")
        print("  Peripheral UUID: \(peripheralUUID.uuidString)")
        print("  RSSI: \(rssi) dBm")
        print("  Connectable: \(isConnectable?.description ?? "unknown")")
        print("  Known Beacon: \(isKnown ? "YES" : "NO")")
        if isKnown {
            let hasServiceUUID = serviceUUIDs?.contains(CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")) ?? false
            let isBCN = displayName.hasPrefix("BCN-")
            let isMoonside = displayName.contains("MOONSIDE")
            let isLegacy = displayName.hasPrefix("BEACON-")
            if isBCN { print("  Classification: Attendee beacon") }
            else if hasServiceUUID { print("  Classification: Attendee beacon candidate (name pending)") }
            else if isMoonside { print("  Classification: Event anchor") }
            else if isLegacy { print("  Classification: Legacy beacon") }
            else { print("  Classification: Known beacon (other)") }
        }

        if let uuids = serviceUUIDs, !uuids.isEmpty {
            print("  Service UUIDs:")
            for uuid in uuids {
                print("    - \(uuid.uuidString)")
            }
        } else {
            print("  Service UUIDs: none")
        }

        if let data = manufacturerData {
            print("  Manufacturer Data: \(data.map { String(format: "%02x", $0) }.joined(separator: " "))")
        } else {
            print("  Manufacturer Data: none")
        }

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        #endif
    }

    // MARK: - Cleanup

    private func startStaleDeviceTimer() {
        staleDeviceTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.removeStaleDevices()
            }
        }
    }

    /// Periodically flushes staged device data to the @Published dictionary.
    /// This batches BLE advertisement updates so objectWillChange fires at most 2x/sec
    /// instead of dozens of times per second, preventing SwiftUI navigation contention.
    private func startFlushTimer() {
        flushTimer = Timer.scheduledTimer(withTimeInterval: flushInterval, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.flushStagedDevices()
            }
        }
    }

    private func flushStagedDevices() {
        guard shouldBeScanning else { return }
        // Always copy staged → published on each tick.
        // The timer fires at most 2x/sec, which is acceptable for SwiftUI.
        discoveredDevices = stagedDevices
    }

    private func removeStaleDevices() {
        guard shouldBeScanning else {
            stagedDevices = [:]
            discoveredDevices = [:]
            return
        }

        let cutoff = Date().addingTimeInterval(-staleDeviceTimeout)

        let before = stagedDevices.count
        stagedDevices = stagedDevices.filter { _, device in
            device.lastSeen > cutoff
        }

        let removed = before - stagedDevices.count
        if removed > 0 {
            #if DEBUG
            print("[BLE] removed \(removed) stale device(s)")
            #endif
            // Flush immediately after stale removal
            discoveredDevices = stagedDevices
        }
        
        // BCN- device summary: only log when the visible set changes
        let bcnDevices = stagedDevices.values.filter { $0.name.hasPrefix("BCN-") }
        let bcnSig = bcnDevices.map { $0.name }.sorted().joined(separator: ",")
        if bcnSig != lastBCNSummarySignature {
            lastBCNSummarySignature = bcnSig
            #if DEBUG
            if !bcnDevices.isEmpty {
                print("[BLE-DEBUG] 📊 BCN- devices visible: \(bcnDevices.count)")
                for d in bcnDevices {
                    let prefix = BLEAdvertiserService.parseCommunityPrefix(from: d.name) ?? "?"
                    let smoothed = smoothedRSSI(for: d.id) ?? d.rssi
                    print("  \(d.name) | prefix: \(prefix) | RSSI: \(smoothed) dBm | age: \(d.timeSinceLastSeen)")
                }
            }
            #endif
        }
    }
}
