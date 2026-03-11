import Foundation
import CoreBluetooth
import Combine
import UIKit

// MARK: - BLE Advertiser Service

@MainActor
final class BLEAdvertiserService: NSObject, ObservableObject, CBPeripheralManagerDelegate {
    
    static let shared = BLEAdvertiserService()
    
    @Published private(set) var isAdvertising = false
    
    private var peripheralManager: CBPeripheralManager!
    private let serviceUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    
    override init() {
        super.init()
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
    }
    
    // MARK: - CBPeripheralManagerDelegate
    
    nonisolated func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        Task { @MainActor in
            switch peripheral.state {
            
            case .poweredOn:
                print("[BLE-ADVERTISE] Bluetooth powered on")
                startAdvertising()
            
            case .poweredOff:
                print("[BLE-ADVERTISE] Bluetooth powered off")
                stopAdvertising()
            
            case .unauthorized:
                print("[BLE-ADVERTISE] Bluetooth unauthorized")
                stopAdvertising()
            
            default:
                print("[BLE-ADVERTISE] Bluetooth unavailable")
                stopAdvertising()
            }
        }
    }
    
    nonisolated func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        Task { @MainActor in
            if let error = error {
                print("[BLE-ADVERTISE] ❌ Failed to start advertising: \(error)")
                isAdvertising = false
            } else {
                print("[BLE-ADVERTISE] ✅ Advertising started successfully")
            }
        }
    }
    
    // MARK: - Advertising Control
    
   func startAdvertising() {
        guard !peripheralManager.isAdvertising else {
            print("[BLE-ADVERTISE] Already advertising")
            return
        }
        
        let localName = "BEACON-\(UIDevice.current.name)"
        
        let advertisementData: [String: Any] = [
            CBAdvertisementDataLocalNameKey: localName,
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID]
        ]
        
        peripheralManager.startAdvertising(advertisementData)
        isAdvertising = true
        
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[BLE-ADVERTISE] 📡 Started advertising")
        print("  Local Name: \(localName)")
        print("  Service UUID: \(serviceUUID.uuidString)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    }
    
    func stopAdvertising() {
        guard peripheralManager.isAdvertising else {
            return
        }
        
        peripheralManager.stopAdvertising()
        isAdvertising = false
        
        print("[BLE-ADVERTISE] 🛑 Stopped advertising")
    }
}
