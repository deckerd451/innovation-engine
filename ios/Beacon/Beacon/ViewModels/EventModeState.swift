import Foundation
import Combine

/// Unified view model for Event Mode screen.
/// Single source of truth for user-facing event status — replaces
/// reading from 6+ observed objects directly in the view.
///
/// Primary status is derived from:
///   1. EventJoinService (QR join state — authoritative)
///   2. AttendeeStateResolver + EventAttendeesService (resolved peers)
///   3. BLEScannerService (raw BLE peer count)
///
/// BeaconConfidenceService is intentionally excluded from user-facing
/// status. It remains available for the diagnostics section only.
@MainActor
final class EventModeState: ObservableObject {

    static let shared = EventModeState()

    // MARK: - Published State

    @Published private(set) var status: EventStatus = .idle
    @Published private(set) var nearbyResolvedCount: Int = 0
    @Published private(set) var activeAttendeeCount: Int = 0
    @Published private(set) var blePeerCount: Int = 0

    // MARK: - Dependencies

    private let eventJoin = EventJoinService.shared
    private let attendees = EventAttendeesService.shared
    private let resolver = AttendeeStateResolver.shared
    private let scanner = BLEScannerService.shared

    private var cancellables = Set<AnyCancellable>()
    private var refreshTimer: Timer?

    // MARK: - Status Enum

    enum EventStatus: Equatable {
        /// Event mode is off
        case idle
        /// Event mode on, not joined via QR
        case scanningForEvent
        /// Joined via QR, looking for nearby attendees
        case joinedLooking(eventName: String)
        /// Joined via QR, attendees detected nearby
        case joinedWithNearby(eventName: String, nearbyCount: Int)
    }

    // MARK: - Init

    private init() {
        startObserving()
    }

    deinit {
        refreshTimer?.invalidate()
    }

    // MARK: - Observation

    private func startObserving() {
        // React to join state changes
        eventJoin.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.recalculate() }
            .store(in: &cancellables)

        // React to attendee list changes
        attendees.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.recalculate() }
            .store(in: &cancellables)

        // React to BLE device changes (for peer count)
        scanner.$discoveredDevices
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.recalculate() }
            .store(in: &cancellables)

        // Periodic refresh for recency-based state (every 2s)
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.recalculate() }
        }
    }

    // MARK: - Recalculation

    private func recalculate() {
        let resolved = resolver.resolvedPeerDevices(attendees: attendees.attendees)
        let resolvedCount = resolved.count
        let attendeeCount = attendees.attendeeCount
        let bcnPeers = scanner.getKnownBeacons().filter { $0.name.hasPrefix("BCN-") }.count

        nearbyResolvedCount = resolvedCount
        activeAttendeeCount = attendeeCount
        blePeerCount = bcnPeers

        let isScanning = BLEService.shared.isScanning

        if !isScanning {
            status = .idle
        } else if eventJoin.isEventJoined, let name = eventJoin.currentEventName {
            if resolvedCount > 0 || bcnPeers > 0 {
                status = .joinedWithNearby(eventName: name, nearbyCount: max(resolvedCount, bcnPeers))
            } else {
                status = .joinedLooking(eventName: name)
            }
        } else {
            status = .scanningForEvent
        }
    }

    // MARK: - Summary Text

    var attendeeSummaryText: String {
        let nearby = nearbyResolvedCount
        let active = activeAttendeeCount

        if attendees.isLoading && active == 0 {
            return "Looking for nearby attendees…"
        }
        if active == 0 && nearby == 0 {
            return "No nearby attendees yet"
        }

        var parts: [String] = []
        if nearby > 0 {
            parts.append("\(nearby) nearby now")
        }
        if active > 0 && active != nearby {
            parts.append("\(active) active in event")
        }
        return parts.joined(separator: " · ")
    }
}
