import Foundation
import Combine

// MARK: - Beacon Confidence State

enum BeaconConfidenceState {
    case searching      // No qualifying beacon detected
    case candidate      // Beacon detected, building confidence
    case stable         // Beacon confirmed stable
    
    var displayText: String {
        switch self {
        case .searching: return "Searching"
        case .candidate: return "Candidate"
        case .stable: return "Stable"
        }
    }
}

// MARK: - Confident Beacon

struct ConfidentBeacon: Identifiable {
    let id: UUID
    let name: String
    let rssi: Int
    let confidenceState: BeaconConfidenceState
    let firstSeen: Date
    let lastSeen: Date
    
    var signalLabel: String {
        switch rssi {
        case -40...0: return "Very Close"
        case -60..<(-40): return "Near"
        case -80..<(-60): return "Nearby"
        default: return "Far"
        }
    }
    
    var confidenceDuration: TimeInterval {
        return Date().timeIntervalSince(firstSeen)
    }
}

// MARK: - Beacon Confidence Service

final class BeaconConfidenceService: ObservableObject {
    
    static let shared = BeaconConfidenceService()
    
    // Published state
    @Published private(set) var activeBeacon: ConfidentBeacon?
    @Published private(set) var candidateBeacon: ConfidentBeacon?
    @Published private(set) var confidenceState: BeaconConfidenceState = .searching
    
    private var scanner = BLEScannerService.shared
    private var cancellables = Set<AnyCancellable>()
    private var confidenceTimer: Timer?
    
    // Configuration
    private let rssiThreshold: Int = -80           // Minimum RSSI for qualification
    private let confidenceWindow: TimeInterval = 3.0  // Seconds of continuous detection
    private let freshnessWindow: TimeInterval = 5.0   // Max age for "fresh" detection
    
    // Tracking
    private var candidateStartTime: Date?
    private var currentCandidateId: UUID?
    
    private init() {
        startMonitoring()
    }
    
    // MARK: - Monitoring
    
    private func startMonitoring() {
        // Monitor scanner's discovered devices
        scanner.$discoveredDevices
            .sink { [weak self] _ in
                self?.evaluateBeacons()
            }
            .store(in: &cancellables)
        
        // Start evaluation timer
        confidenceTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.evaluateBeacons()
        }
    }
    
    private func evaluateBeacons() {
        let knownBeacons = scanner.getKnownBeacons()
        
        // Filter qualifying beacons
        let qualifyingBeacons = knownBeacons.filter { beacon in
            beacon.rssi >= rssiThreshold &&
            Date().timeIntervalSince(beacon.lastSeen) < freshnessWindow
        }
        
        guard let strongest = qualifyingBeacons.first else {
            // No qualifying beacons
            handleNoQualifyingBeacon()
            return
        }
        
        // Check if this is a new candidate or same as current
        if let currentId = currentCandidateId, currentId == strongest.id {
            // Same candidate, check confidence duration
            updateCandidateConfidence(beacon: strongest)
        } else {
            // New candidate detected
            startNewCandidate(beacon: strongest)
        }
    }
    
    private func handleNoQualifyingBeacon() {
        if confidenceState != .searching {
            print("[CONFIDENCE] No qualifying beacon, returning to searching")
        }
        
        DispatchQueue.main.async { [weak self] in
            self?.confidenceState = .searching
            self?.candidateBeacon = nil
            self?.activeBeacon = nil
            self?.currentCandidateId = nil
            self?.candidateStartTime = nil
        }
    }
    
    private func startNewCandidate(beacon: DiscoveredBLEDevice) {
        let now = Date()
        currentCandidateId = beacon.id
        candidateStartTime = now
        
        let confidentBeacon = ConfidentBeacon(
            id: beacon.id,
            name: beacon.name,
            rssi: beacon.rssi,
            confidenceState: .candidate,
            firstSeen: now,
            lastSeen: beacon.lastSeen
        )
        
        print("[CONFIDENCE] New candidate: \(beacon.name) at \(beacon.rssi) dBm")
        
        DispatchQueue.main.async { [weak self] in
            self?.confidenceState = .candidate
            self?.candidateBeacon = confidentBeacon
            self?.activeBeacon = nil
        }
    }
    
    private func updateCandidateConfidence(beacon: DiscoveredBLEDevice) {
        guard let startTime = candidateStartTime else { return }
        
        let duration = Date().timeIntervalSince(startTime)
        let progress = duration / confidenceWindow
        
        // Debug output
        if Int(duration * 2) % 2 == 0 {  // Log every 0.5 seconds
            print("[CONFIDENCE] \(beacon.name): \(String(format: "%.1f", duration))s / \(String(format: "%.1f", confidenceWindow))s (\(Int(progress * 100))%)")
        }
        
        if duration >= confidenceWindow && confidenceState != .stable {
            // Confidence achieved! (only promote if not already stable)
            promoteToStable(beacon: beacon, startTime: startTime)
        } else if duration < confidenceWindow {
            // Still building confidence
            let confidentBeacon = ConfidentBeacon(
                id: beacon.id,
                name: beacon.name,
                rssi: beacon.rssi,
                confidenceState: .candidate,
                firstSeen: startTime,
                lastSeen: beacon.lastSeen
            )
            
            DispatchQueue.main.async { [weak self] in
                self?.candidateBeacon = confidentBeacon
            }
        } else {
            // Already stable, just update RSSI
            let confidentBeacon = ConfidentBeacon(
                id: beacon.id,
                name: beacon.name,
                rssi: beacon.rssi,
                confidenceState: .stable,
                firstSeen: startTime,
                lastSeen: beacon.lastSeen
            )
            
            DispatchQueue.main.async { [weak self] in
                self?.activeBeacon = confidentBeacon
            }
        }
    }
    
    private func promoteToStable(beacon: DiscoveredBLEDevice, startTime: Date) {
        let confidentBeacon = ConfidentBeacon(
            id: beacon.id,
            name: beacon.name,
            rssi: beacon.rssi,
            confidenceState: .stable,
            firstSeen: startTime,
            lastSeen: beacon.lastSeen
        )
        
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[CONFIDENCE] ✅ STABLE BEACON ACHIEVED")
        print("  Name: \(beacon.name)")
        print("  RSSI: \(beacon.rssi) dBm")
        print("  Signal: \(confidentBeacon.signalLabel)")
        print("  Confidence Duration: \(String(format: "%.1f", confidentBeacon.confidenceDuration))s")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        DispatchQueue.main.async { [weak self] in
            self?.confidenceState = .stable
            self?.activeBeacon = confidentBeacon
            self?.candidateBeacon = nil
        }
    }
    
    // MARK: - Public API
    
    func getActiveBeaconInfo() -> String? {
        guard let beacon = activeBeacon else { return nil }
        return "\(beacon.name) • \(beacon.rssi) dBm • \(beacon.signalLabel)"
    }
    
    func reset() {
        print("[CONFIDENCE] Reset requested")
        DispatchQueue.main.async { [weak self] in
            self?.confidenceState = .searching
            self?.activeBeacon = nil
            self?.candidateBeacon = nil
            self?.currentCandidateId = nil
            self?.candidateStartTime = nil
        }
    }
}
