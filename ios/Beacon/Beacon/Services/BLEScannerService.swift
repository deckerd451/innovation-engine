import Foundation
import CoreBluetooth
import Combine

// MARK: - Discovered Device Model

struct DiscoveredBLEDevice: Identifiable {
    let id: UUID
    let identifier: UUID
    var name: String
    var rssi: Int
    var lastSeen: Date
    var isKnownBeacon: Bool

    // Advertisement metadata
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

    override init() {
        super.init()

        centralManager = CBCentralManager(
            delegate: self,
            queue: DispatchQueue(label: "ble.scanner")
        )

        startStaleDeviceTimer()
    }

    // MARK: - Public API

    func startScanning() {
        print("[BLE] ▶️ startScanning requested")
        shouldBeScanning = true

        guard centralManager.state == .poweredOn else {
            print("[BLE] ⏳ Bluetooth not powered on yet, will start when ready")
            return
        }

        discoveredDevices = [:]
        firstDetectionLogged.removeAll()

        centralManager.scanForPeripherals(
            withServices: nil,
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
        )

        isScanning = true
        print("[BLE] ✅ BLE scanning started")
    }

    func stopScanning() {
        print("[BLE] 🛑 Stopping BLE scanning")

        shouldBeScanning = false

        if centralManager.state == .poweredOn {
            centralManager.stopScan()
        }

        isScanning = false
        discoveredDevices = [:]
        firstDetectionLogged.removeAll()
        rssiHistory.removeAll()

        print("[BLE] ✅ BLE scanning stopped, devices cleared")
    }

    func getFilteredDevices() -> [DiscoveredBLEDevice] {
        discoveredDevices.values
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
        discoveredDevices.values
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
                print("[BLE] bluetooth powered on")

                if self.shouldBeScanning {
                    self.centralManager.scanForPeripherals(
                        withServices: nil,
                        options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
                    )
                    self.isScanning = true
                    print("[BLE] ✅ scanning resumed because shouldBeScanning = true")
                } else {
                    self.isScanning = false
                    print("[BLE] ℹ️ powered on but scanner is idle")
                }

            case .poweredOff:
                print("[BLE] bluetooth powered off")
                self.isScanning = false
                self.discoveredDevices = [:]

            case .unauthorized:
                print("[BLE] bluetooth unauthorized")
                self.isScanning = false
                self.discoveredDevices = [:]

            default:
                print("[BLE] bluetooth unavailable")
                self.isScanning = false
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

        let name = peripheral.name
            ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String
            ?? "Unknown"
        let identifier = peripheral.identifier

        let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]
        let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
        let isConnectable = advertisementData[CBAdvertisementDataIsConnectable] as? Bool

        let isKnown = Self.isKnownBeacon(
            name: name,
            serviceUUIDs: serviceUUIDs,
            isConnectable: isConnectable
        )

        Task { @MainActor in
            guard self.shouldBeScanning else { return }

            let now = Date()

            let isFirstDetection = !self.firstDetectionLogged.contains(identifier)
            if isKnown && isFirstDetection {
                self.firstDetectionLogged.insert(identifier)
                self.debugKnownBeacon(
                    name: name,
                    rssi: rssiValue,
                    serviceUUIDs: serviceUUIDs,
                    manufacturerData: manufacturerData,
                    isConnectable: isConnectable
                )
            }

            if var existing = self.discoveredDevices[identifier] {
                existing.rssi = rssiValue
                existing.lastSeen = now
                existing.name = name
                existing.serviceUUIDs = serviceUUIDs
                existing.manufacturerData = manufacturerData
                existing.isConnectable = isConnectable
                existing.isKnownBeacon = isKnown
                self.discoveredDevices[identifier] = existing
                
                // Update RSSI history for smoothing
                self.updateRSSIHistory(for: identifier, rssi: rssiValue)
            } else {
                let device = DiscoveredBLEDevice(
                    id: identifier,
                    identifier: identifier,
                    name: name,
                    rssi: rssiValue,
                    lastSeen: now,
                    isKnownBeacon: isKnown,
                    serviceUUIDs: serviceUUIDs,
                    manufacturerData: manufacturerData,
                    isConnectable: isConnectable
                )
                self.discoveredDevices[identifier] = device
                
                // Initialize RSSI history for new device
                self.updateRSSIHistory(for: identifier, rssi: rssiValue)

                let beaconFlag = isKnown ? " [KNOWN BEACON]" : ""
                print("[BLE] device discovered: \(name) \(rssiValue) dBm\(beaconFlag)")
            }
        }
    }

    // MARK: - Beacon Matching

    nonisolated private static func isKnownBeacon(
        name: String,
        serviceUUIDs: [CBUUID]?,
        isConnectable: Bool?
    ) -> Bool {
        let moonsideServiceUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")

        if let uuids = serviceUUIDs,
           uuids.contains(moonsideServiceUUID) {
            return true
        }

        if name.contains("BEACON-") {
            return true
        }

        if name.contains("MOONSIDE-S1") {
            return true
        }

        return false
    }

    // MARK: - Debug

    private func debugKnownBeacon(
        name: String,
        rssi: Int,
        serviceUUIDs: [CBUUID]?,
        manufacturerData: Data?,
        isConnectable: Bool?
    ) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[BLE] Known beacon detected (first time)")
        print("  Name: \(name)")
        print("  RSSI: \(rssi) dBm")
        print("  Connectable: \(isConnectable?.description ?? "unknown")")

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

    private func removeStaleDevices() {
        guard shouldBeScanning else {
            discoveredDevices = [:]
            return
        }

        let cutoff = Date().addingTimeInterval(-staleDeviceTimeout)

        let before = discoveredDevices.count
        discoveredDevices = discoveredDevices.filter { _, device in
            device.lastSeen > cutoff
        }

        let removed = before - discoveredDevices.count
        if removed > 0 {
            print("[BLE] removed \(removed) stale device(s)")
        }
    }
}
