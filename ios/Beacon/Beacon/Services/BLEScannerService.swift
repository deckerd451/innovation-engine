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
        case -40...0: return "Very Close"
        case -60..<(-40): return "Near"
        case -80..<(-60): return "Nearby"
        default: return "Far"
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

final class BLEScannerService: NSObject, ObservableObject, CBCentralManagerDelegate {
    
    static let shared = BLEScannerService()
    
    // Published for UI observation
    @Published private(set) var discoveredDevices: [UUID: DiscoveredBLEDevice] = [:]
    @Published private(set) var isScanning = false
    
    private var centralManager: CBCentralManager!
    private var staleDeviceTimer: Timer?
    
    // Configuration
    private let rssiThreshold: Int = -95  // Ignore devices weaker than this
    private let staleDeviceTimeout: TimeInterval = 10  // Remove after 10 seconds
    
    // Known beacon signatures
    private let moonsideServiceUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    
    // Track first detection for debug logging
    private var firstDetectionLogged = Set<UUID>()
    
    override init() {
        super.init()
        
        centralManager = CBCentralManager(
            delegate: self,
            queue: DispatchQueue(label: "ble.scanner")
        )
        
        // Start stale device cleanup timer
        startStaleDeviceTimer()
    }
    
    // MARK: - Public API
    
    func getFilteredDevices() -> [DiscoveredBLEDevice] {
        return discoveredDevices.values
            .filter { $0.rssi >= rssiThreshold }
            .sorted { device1, device2 in
                // Known beacons first
                if device1.isKnownBeacon != device2.isKnownBeacon {
                    return device1.isKnownBeacon
                }
                // Then by RSSI (strongest first)
                if device1.rssi != device2.rssi {
                    return device1.rssi > device2.rssi
                }
                // Then by most recent
                return device1.lastSeen > device2.lastSeen
            }
    }
    
    func getKnownBeacons() -> [DiscoveredBLEDevice] {
        return discoveredDevices.values
            .filter { $0.isKnownBeacon }
            .sorted { $0.rssi > $1.rssi }
    }
    
    // MARK: - CBCentralManagerDelegate
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        
        switch central.state {
        
        case .poweredOn:
            print("[BLE] scanning started")
            isScanning = true
            centralManager.scanForPeripherals(
                withServices: nil,
                options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]  // Allow updates
            )
        
        case .poweredOff:
            print("[BLE] bluetooth powered off")
            isScanning = false
        
        case .unauthorized:
            print("[BLE] bluetooth unauthorized")
            isScanning = false
        
        default:
            print("[BLE] bluetooth unavailable")
            isScanning = false
        }
    }
    
    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String : Any],
        rssi RSSI: NSNumber
    ) {
        
        let rssiValue = RSSI.intValue
        
        // Skip very weak signals unless debugging
        guard rssiValue >= rssiThreshold else { return }
        
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? "Unknown"
        let identifier = peripheral.identifier
        
        // Extract advertisement metadata
        let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID]
        let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
        let isConnectable = advertisementData[CBAdvertisementDataIsConnectable] as? Bool
        
        // Determine if this is a known beacon
        let isKnown = isKnownBeacon(
            name: name,
            serviceUUIDs: serviceUUIDs,
            isConnectable: isConnectable
        )
        
        // Debug output for MOONSIDE on first detection only
        let isFirstDetection = !firstDetectionLogged.contains(identifier)
        if isKnown && isFirstDetection {
            firstDetectionLogged.insert(identifier)
            debugMoonsideBeacon(
                name: name,
                rssi: rssiValue,
                serviceUUIDs: serviceUUIDs,
                manufacturerData: manufacturerData,
                isConnectable: isConnectable
            )
        }
        
        // Update or create device entry
        DispatchQueue.main.async { [weak self] in
            if var existing = self?.discoveredDevices[identifier] {
                // Update existing device
                existing.rssi = rssiValue
                existing.lastSeen = Date()
                existing.name = name
                existing.serviceUUIDs = serviceUUIDs
                existing.manufacturerData = manufacturerData
                existing.isConnectable = isConnectable
                existing.isKnownBeacon = isKnown
                self?.discoveredDevices[identifier] = existing
            } else {
                // New device discovered
                let device = DiscoveredBLEDevice(
                    id: identifier,
                    identifier: identifier,
                    name: name,
                    rssi: rssiValue,
                    lastSeen: Date(),
                    isKnownBeacon: isKnown,
                    serviceUUIDs: serviceUUIDs,
                    manufacturerData: manufacturerData,
                    isConnectable: isConnectable
                )
                self?.discoveredDevices[identifier] = device
                
                // Log new discoveries
                let beaconFlag = isKnown ? " [KNOWN BEACON]" : ""
                print("[BLE] device discovered: \(name) \(rssiValue) dBm\(beaconFlag)")
            }
        }
    }
    
    // MARK: - Beacon Matching
    
    private func isKnownBeacon(
        name: String,
        serviceUUIDs: [CBUUID]?,
        isConnectable: Bool?
    ) -> Bool {
        // Primary: Match MOONSIDE beacon by service UUID signature
        if let uuids = serviceUUIDs,
           uuids.contains(moonsideServiceUUID),
           isConnectable == true {
            return true
        }
        
        // Fallback: Match by name if service UUID not available
        if name.contains("MOONSIDE-S1") {
            return true
        }
        
        return false
    }
    
    // MARK: - Debug
    
    private func debugMoonsideBeacon(
        name: String,
        rssi: Int,
        serviceUUIDs: [CBUUID]?,
        manufacturerData: Data?,
        isConnectable: Bool?
    ) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[BLE] MOONSIDE beacon detected (first time)")
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
            self?.removeStaleDevices()
        }
    }
    
    private func removeStaleDevices() {
        let cutoff = Date().addingTimeInterval(-staleDeviceTimeout)
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let before = self.discoveredDevices.count
            self.discoveredDevices = self.discoveredDevices.filter { _, device in
                device.lastSeen > cutoff
            }
            let removed = before - self.discoveredDevices.count
            if removed > 0 {
                print("[BLE] removed \(removed) stale device(s)")
            }
        }
    }
}
