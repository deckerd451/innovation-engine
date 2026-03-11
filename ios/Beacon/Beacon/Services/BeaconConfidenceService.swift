import Foundation
import Combine

// MARK: - Beacon Confidence State

enum BeaconConfidenceState {
    case searching
    case candidate
    case stable

    var displayText: String {
        switch self {
        case .searching:
            return "Searching"
        case .candidate:
            return "Candidate"
        case .stable:
            return "Stable"
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

    private init() {
        startMonitoring()
    }

    deinit {
        confidenceTimer?.invalidate()
    }

    // MARK: - Monitoring

    private func startMonitoring() {
        scanner.$discoveredDevices
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                self?.evaluateBeacons(trigger: "scanner update")
            }
            .store(in: &cancellables)

        confidenceTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
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

        let peerDevices = qualifyingBeacons
            .filter { $0.name.hasPrefix("BEACON-") }
            .sorted { $0.rssi > $1.rssi }

        let otherKnownBeacons = qualifyingBeacons
            .filter { !isEventAnchor($0.name) && !$0.name.hasPrefix("BEACON-") }
            .sorted { $0.rssi > $1.rssi }

        print("[CONFIDENCE-EVAL] Trigger: \(trigger)")
        print("[CONFIDENCE-EVAL] Found \(qualifyingBeacons.count) qualifying beacon(s)")
        print("[CONFIDENCE-EVAL]   Event anchors: \(eventAnchors.count)")
        print("[CONFIDENCE-EVAL]   Peer devices: \(peerDevices.count)")
        print("[CONFIDENCE-EVAL]   Other known beacons: \(otherKnownBeacons.count)")

        guard let strongest = eventAnchors.first ?? otherKnownBeacons.first ?? peerDevices.first else {
            handleNoQualifyingBeacon()
            return
        }

        print("[CONFIDENCE-EVAL] Selected beacon: \(strongest.name) (ID: \(strongest.id))")
        print("[CONFIDENCE-EVAL] Current candidate ID: \(currentCandidateId?.uuidString ?? "nil")")

        if currentCandidateId == strongest.id {
            print("[CONFIDENCE-EVAL] ✅ SAME beacon - calling updateCandidateConfidence")
            updateCandidateConfidence(beacon: strongest, now: now)
        } else {
            print("[CONFIDENCE-EVAL] 🆕 DIFFERENT beacon - calling startNewCandidate")
            print("[CONFIDENCE-EVAL]   Previous: \(currentCandidateId?.uuidString ?? "none")")
            print("[CONFIDENCE-EVAL]   New: \(strongest.id.uuidString)")
            startNewCandidate(beacon: strongest, now: now)
        }
    }

    private func handleNoQualifyingBeacon() {
        if confidenceState != .searching || activeBeacon != nil || candidateBeacon != nil {
            print("[CONFIDENCE] No qualifying beacon, returning to searching")
        }

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

        print("[CONFIDENCE-NEW] Setting currentCandidateId = \(beacon.id.uuidString)")
        print("[CONFIDENCE-NEW] Setting candidateStartTime = \(now)")

        let confidentBeacon = ConfidentBeacon(
            id: beacon.id,
            name: beacon.name,
            rssi: beacon.rssi,
            confidenceState: .candidate,
            firstSeen: now,
            lastSeen: beacon.lastSeen
        )

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[CONFIDENCE] 🔍 NEW CANDIDATE DETECTED")
        print("  Name: \(beacon.name)")
        print("  RSSI: \(beacon.rssi) dBm")
        print("  Beacon ID: \(beacon.id)")
        print("  Building confidence... (need \(String(format: "%.1f", confidenceWindow))s)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        confidenceState = .candidate
        candidateBeacon = confidentBeacon
        activeBeacon = nil
    }

    private func updateCandidateConfidence(beacon: DiscoveredBLEDevice, now: Date) {
        print("[CONFIDENCE-UPDATE] Entry: beacon=\(beacon.name), currentCandidateId=\(currentCandidateId?.uuidString ?? "nil")")

        guard let startTime = candidateStartTime else {
            print("[CONFIDENCE-UPDATE] ⚠️ candidateStartTime was nil, initializing now")
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
        let progress = min(duration / confidenceWindow, 1.0)

        print("[CONFIDENCE-UPDATE] Duration: \(String(format: "%.1f", duration))s, Progress: \(Int(progress * 100))%")
        print("[CONFIDENCE] \(beacon.name): \(String(format: "%.1f", duration))s / \(String(format: "%.1f", confidenceWindow))s (\(Int(progress * 100))%)")

        if duration >= confidenceWindow {
            if confidenceState != .stable {
                promoteToStable(beacon: beacon, startTime: startTime)
                return
            }

            let confidentBeacon = ConfidentBeacon(
                id: beacon.id,
                name: beacon.name,
                rssi: beacon.rssi,
                confidenceState: .stable,
                firstSeen: startTime,
                lastSeen: beacon.lastSeen
            )

            print("[CONFIDENCE] 🔄 Already stable, updating RSSI to \(beacon.rssi) dBm")
            print("[CONFIDENCE] 📝 Updating activeBeacon RSSI")

            activeBeacon = confidentBeacon

            print("[CONFIDENCE]   activeBeacon = \(activeBeacon?.name ?? "nil") at \(beacon.rssi) dBm")
            return
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

        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[CONFIDENCE] ✅ STABLE BEACON ACHIEVED")
        print("  Name: \(beacon.name)")
        print("  Beacon ID: \(beacon.id)")
        print("  RSSI: \(beacon.rssi) dBm")
        print("  Signal: \(confidentBeacon.signalLabel)")
        print("  Confidence Duration: \(String(format: "%.1f", confidentBeacon.confidenceDuration))s")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        confidenceState = .stable
        activeBeacon = confidentBeacon
        candidateBeacon = nil

        print("[CONFIDENCE] 📝 PUBLISHING activeBeacon NOW")
        print("[CONFIDENCE] ✅ Published activeBeacon = \(confidentBeacon.name)")
    }

    // MARK: - Helpers

    private func isEventAnchor(_ name: String) -> Bool {
        name == "MOONSIDE-S1"
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
            print("[CONFIDENCE] ✅ Reset complete")
        }
    }
}
