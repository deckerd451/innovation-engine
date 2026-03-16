import Foundation
import Combine

// MARK: - Beacon Confidence State

enum BeaconConfidenceState {
    case searching
    case candidate
    case stable

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
        Date().timeIntervalSince(firstSeen)
    }
}

// MARK: - Beacon Confidence Service

@MainActor
final class BeaconConfidenceService: ObservableObject {

    static let shared = BeaconConfidenceService()

    @Published private(set) var activeBeacon: ConfidentBeacon?
    @Published private(set) var candidateBeacon: ConfidentBeacon?
    @Published private(set) var confidenceState: BeaconConfidenceState = .searching
    
    /// Nearby peer devices (BCN- prefix) detected via BLE.
    /// Valid proximity signals in a QR-joined event even without a physical event anchor.
    @Published private(set) var nearbyPeerCount: Int = 0

    private let scanner = BLEScannerService.shared
    private var cancellables = Set<AnyCancellable>()
    private var confidenceTimer: Timer?

    // Configuration
    private let rssiThreshold: Int = -80
    private let confidenceWindow: TimeInterval = 3.0
    private let freshnessWindow: TimeInterval = 10.0

    // Tracking
    private var candidateStartTime: Date?
    private var currentCandidateId: UUID?
    
    // MARK: - Log Deduplication
    // Tracks a signature of the last logged evaluation state.
    // Only prints the full diagnostic block when the signature changes,
    // preventing identical output every 0.5s timer tick.
    
    private var lastEvalSignature: String = ""
    private var lastNoBeaconLogged: Bool = false

    private init() {
        startMonitoring()
    }

    deinit {
        confidenceTimer?.invalidate()
    }

    // MARK: - Monitoring

    private func startMonitoring() {
        #if DEBUG
        print("[CONFIDENCE-DIAG] Starting anchor monitoring (scanner + 2.0s timer)")
        #endif
        
        scanner.$discoveredDevices
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.evaluateBeacons(trigger: "scanner")
            }
            .store(in: &cancellables)

        // 2s interval is sufficient for diagnostic-only anchor confidence tracking.
        // User-facing status is driven by EventModeState, not this timer.
        confidenceTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.evaluateBeacons(trigger: "timer")
            }
        }
    }

    // MARK: - Evaluation

    private func evaluateBeacons(trigger: String) {
        let now = Date()

        let qualifyingBeacons = scanner.getKnownBeacons()
            .filter { beacon in
                beacon.rssi >= rssiThreshold &&
                now.timeIntervalSince(beacon.lastSeen) < freshnessWindow
            }

        let eventAnchors = qualifyingBeacons
            .filter { isEventAnchor($0.name) }
            .sorted { $0.rssi > $1.rssi }

        let bcnPeerDevices = qualifyingBeacons
            .filter { $0.name.hasPrefix("BCN-") }
            .sorted { $0.rssi > $1.rssi }

        let legacyPeerDevices = qualifyingBeacons
            .filter { $0.name.hasPrefix("BEACON-") }
            .sorted { $0.rssi > $1.rssi }

        // Update peer count for external consumers (only on change).
        let totalPeers = bcnPeerDevices.count + legacyPeerDevices.count
        if nearbyPeerCount != totalPeers {
            nearbyPeerCount = totalPeers
        }

        // Build a signature of the current evaluation state.
        // Only log the full block when this changes.
        let sig = "\(qualifyingBeacons.count)|\(eventAnchors.count)|\(bcnPeerDevices.count)|\(legacyPeerDevices.count)|\(confidenceState.displayText)|\(currentCandidateId?.uuidString.prefix(8) ?? "nil")"
        let stateChanged = sig != lastEvalSignature
        
        if stateChanged {
            lastEvalSignature = sig
            #if DEBUG
            print("[CONFIDENCE-DIAG] \(trigger): \(qualifyingBeacons.count) qualifying — anchors:\(eventAnchors.count) BCN:\(bcnPeerDevices.count) legacy:\(legacyPeerDevices.count) anchor-state:\(confidenceState.displayText)")
            #endif
        }

        // Only event anchors can become activeBeacon.
        // Peer devices (BCN- and BEACON-) are valid proximity signals
        // handled by AttendeeStateResolver — they don't need activeBeacon.
        guard let strongest = eventAnchors.first else {
            if stateChanged {
                if !bcnPeerDevices.isEmpty {
                    #if DEBUG
                    print("[CONFIDENCE-DIAG] ✅ No anchors, but \(bcnPeerDevices.count) BCN peer(s) — peer BLE is the active model")
                    #endif
                }
                if !legacyPeerDevices.isEmpty {
                    #if DEBUG
                    print("[CONFIDENCE-DIAG] ℹ️ \(legacyPeerDevices.count) legacy BEACON device(s)")
                    #endif
                }
            }
            handleNoQualifyingBeacon()
            return
        }

        // Early return if same beacon is already stable — no need to re-evaluate.
        if confidenceState == .stable && activeBeacon?.id == strongest.id {
            return
        }

        if currentCandidateId == strongest.id {
            updateCandidateConfidence(beacon: strongest, now: now, stateChanged: stateChanged)
        } else {
            startNewCandidate(beacon: strongest, now: now)
        }
    }

    private func handleNoQualifyingBeacon() {
        // Already in clean state — no-op, minimal logging.
        if confidenceState == .searching &&
           activeBeacon == nil &&
           candidateBeacon == nil &&
           currentCandidateId == nil {
            if !lastNoBeaconLogged {
                lastNoBeaconLogged = true
                let hasJoinedEvent = EventJoinService.shared.isEventJoined
                let hasBCNPeers = nearbyPeerCount > 0
                if hasJoinedEvent || hasBCNPeers {
                    // Event session or peer BLE is the active model — anchor absence is expected.
                } else {
                    #if DEBUG
                    print("[CONFIDENCE-DIAG] No anchors, no peers, no event session — anchor monitor idle")
                    #endif
                }
            }
            return
        }
        
        // Actual state transition: was tracking an anchor, now lost it.
        #if DEBUG
        print("[CONFIDENCE-DIAG] Anchor lost → anchor monitor returning to baseline")
        #endif
        lastNoBeaconLogged = false

        confidenceState = .searching
        candidateBeacon = nil
        activeBeacon = nil
        currentCandidateId = nil
        candidateStartTime = nil
    }

    // MARK: - Candidate Handling

    private func startNewCandidate(beacon: DiscoveredBLEDevice, now: Date) {
        currentCandidateId = beacon.id
        candidateStartTime = now
        lastNoBeaconLogged = false

        let confidentBeacon = ConfidentBeacon(
            id: beacon.id,
            name: beacon.name,
            rssi: beacon.rssi,
            confidenceState: .candidate,
            firstSeen: now,
            lastSeen: beacon.lastSeen
        )

        #if DEBUG
        print("[CONFIDENCE-DIAG] 🔍 New anchor candidate: \(beacon.name) (\(beacon.rssi) dBm) — building confidence (\(String(format: "%.1f", confidenceWindow))s)")
        #endif

        confidenceState = .candidate
        candidateBeacon = confidentBeacon
        activeBeacon = nil
    }

    private func updateCandidateConfidence(beacon: DiscoveredBLEDevice, now: Date, stateChanged: Bool) {
        guard let startTime = candidateStartTime else {
            // Edge case: start time missing — reinitialize.
            candidateStartTime = now
            let confidentBeacon = ConfidentBeacon(
                id: beacon.id,
                name: beacon.name,
                rssi: beacon.rssi,
                confidenceState: .candidate,
                firstSeen: now,
                lastSeen: beacon.lastSeen
            )
            confidenceState = .candidate
            candidateBeacon = confidentBeacon
            activeBeacon = nil
            return
        }

        let duration = now.timeIntervalSince(startTime)

        if duration >= confidenceWindow {
            if confidenceState != .stable {
                // Transition: candidate → stable. Log this important event.
                promoteToStable(beacon: beacon, startTime: startTime)
            }
            // Already stable — silent RSSI refresh, no log needed.
            return
        }

        if stateChanged {
            #if DEBUG
            let progress = Int(min(duration / confidenceWindow, 1.0) * 100)
            print("[CONFIDENCE-DIAG] Building anchor confidence: \(beacon.name) — \(progress)%")
            #endif
        }
        
        let confidentBeacon = ConfidentBeacon(
            id: beacon.id,
            name: beacon.name,
            rssi: beacon.rssi,
            confidenceState: .candidate,
            firstSeen: startTime,
            lastSeen: beacon.lastSeen
        )

        confidenceState = .candidate
        candidateBeacon = confidentBeacon
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

        #if DEBUG
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[CONFIDENCE-DIAG] ✅ STABLE ANCHOR: \(beacon.name)")
        print("  RSSI: \(beacon.rssi) dBm · \(confidentBeacon.signalLabel)")
        print("  Confidence: \(String(format: "%.1f", confidentBeacon.confidenceDuration))s")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        #endif

        confidenceState = .stable
        activeBeacon = confidentBeacon
        candidateBeacon = nil
    }

    // MARK: - Helpers

    private func isEventAnchor(_ name: String) -> Bool {
        name.contains("MOONSIDE")
    }

    // MARK: - Public API

    func getActiveBeaconInfo() -> String? {
        guard let beacon = activeBeacon else { return nil }
        return "\(beacon.name) • \(beacon.rssi) dBm • \(beacon.signalLabel)"
    }

    func reset() {
        #if DEBUG
        print("[CONFIDENCE-DIAG] Reset")
        #endif
        confidenceState = .searching
        activeBeacon = nil
        candidateBeacon = nil
        currentCandidateId = nil
        candidateStartTime = nil
        lastEvalSignature = ""
        lastNoBeaconLogged = false
    }
}
