import Foundation
import Combine
import Supabase

// MARK: - Beacon to Event Mapping

struct BeaconEventMapping {
    let beaconName: String
    let eventName: String
    let beaconKey: String
    
    static let mappings: [BeaconEventMapping] = [
        BeaconEventMapping(
            beaconName: "MOONSIDE-S1",
            eventName: "CharlestonHacks Test Event",
            beaconKey: "MOONSIDE-S1"
        )
    ]
    
    static func getMapping(for beaconName: String) -> BeaconEventMapping? {
        mappings.first { $0.beaconName == beaconName }
    }
}

// MARK: - Supabase Row Types

struct EventPresenceCommunityRow: Decodable {
    let id: UUID
}

struct EventPresenceBeaconRow: Decodable {
    let id: UUID
    let label: String
}

// MARK: - Event Presence Service

@MainActor
final class EventPresenceService: ObservableObject {
    
    static let shared = EventPresenceService()
    
    @Published private(set) var currentEvent: String?
    @Published private(set) var isWritingPresence = false
    @Published private(set) var lastPresenceWrite: Date?
    @Published private(set) var debugStatus: String = "Idle"
    
    // Expose for EventAttendeesService
    var currentContextId: UUID? { _currentContextId }
    var currentCommunityId: UUID? { _currentCommunityId }
    
    private let confidence = BeaconConfidenceService.shared
    private let supabase = AppEnvironment.shared.supabaseClient
    private var cancellables = Set<AnyCancellable>()
    
    private var heartbeatTask: Task<Void, Never>?
    private var graceTask: Task<Void, Never>?
    
    private var currentBeaconId: UUID?
    private var _currentCommunityId: UUID?
    private var _currentContextId: UUID?
    
    /// True when context was established via QR join (not beacon detection).
    /// When true, beacon loss must NOT clear the context.
    private(set) var isQRJoinActive = false
    
    // Prevent re-entrant presence loop starts
    private var isStartingPresenceLoop = false
    private var isPresenceLoopRunning = false
    
    private let presenceRefreshInterval: TimeInterval = 25.0
    private let gracePeriod: TimeInterval = 10.0
    private let hardcodedEventContextId = UUID(uuidString: "8b7c40b1-0c94-497a-8f4e-a815f570cc25")!
    
    private init() {
        observeConfidenceState()
    }
    
    // MARK: - Observation
    
    // MARK: - Legacy Anchor Observer (deprecated)
    // This observer only fires when a physical MOONSIDE anchor is present.
    // QR join is the primary activation path; this is kept for backward compat.

    private func observeConfidenceState() {
        confidence.$activeBeacon
            .receive(on: RunLoop.main)
            .sink { [weak self] beacon in
                guard let self else { return }
                if self.isQRJoinActive { return }
                self.handleBeaconChange(beacon)
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Legacy Anchor Path (deprecated)

    private func handleBeaconChange(_ beacon: ConfidentBeacon?) {
        guard let beacon else {
            handleBeaconLost()
            return
        }
        guard beacon.confidenceState == .stable else { return }
        handleStableBeacon(beacon)
    }
    
    // MARK: - Legacy Stable Beacon Handling (deprecated)

    private func handleStableBeacon(_ beacon: ConfidentBeacon) {
        // Ignore peer devices — only event anchors drive this path
        if beacon.name.hasPrefix("BEACON-") || beacon.name.hasPrefix("BCN-") {
            return
        }

        // Same-beacon RSSI refresh — not a lifecycle transition
        if currentBeaconId == beacon.id && (isStartingPresenceLoop || isPresenceLoopRunning) {
            return
        }

        cancelGraceTask()

        guard let mapping = BeaconEventMapping.getMapping(for: beacon.name) else {
            debugStatus = "No event mapping for \(beacon.name)"
            return
        }

        #if DEBUG
        print("[Presence-Legacy] Anchor detected: \(beacon.name) → \(mapping.eventName)")
        #endif
        currentEvent = mapping.eventName
        currentBeaconId = beacon.id
        debugStatus = "Event active: \(mapping.eventName)"

        heartbeatTask?.cancel()
        heartbeatTask = nil
        isPresenceLoopRunning = false
        isStartingPresenceLoop = true

        heartbeatTask = Task { [weak self] in
            guard let self else { return }
            await self.startPresenceLoop(for: beacon, mapping: mapping)
            await MainActor.run { self.isPresenceLoopRunning = false }
        }
    }
    
    // MARK: - Legacy Beacon Lost (deprecated)

    private func handleBeaconLost() {
        guard currentBeaconId != nil else { return }

        if isQRJoinActive {
            currentBeaconId = nil
            return
        }

        #if DEBUG
        print("[Presence-Legacy] Anchor lost — grace period \(Int(gracePeriod))s")
        #endif
        debugStatus = "Beacon lost, waiting grace period"

        cancelGraceTask()

        graceTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(self.gracePeriod * 1_000_000_000))
            guard !Task.isCancelled else { return }

            await MainActor.run {
                if self.isQRJoinActive { return }
                if self.confidence.activeBeacon == nil {
                    #if DEBUG
                    print("[Presence-Legacy] Grace expired — stopping presence")
                    #endif
                    self.stopPresenceWrites()
                }
            }
        }
    }
    
    private func cancelGraceTask() {
        graceTask?.cancel()
        graceTask = nil
    }
    
    // MARK: - Legacy Presence Loop (anchor-driven)

    private func startPresenceLoop(for beacon: ConfidentBeacon, mapping: BeaconEventMapping) async {
        await MainActor.run {
            isStartingPresenceLoop = false
            isPresenceLoopRunning = true
            debugStatus = "Starting presence loop..."
        }

        // Resolve community ID
        let communityId: UUID
        if let cachedId = AuthService.shared.currentUser?.id {
            communityId = cachedId
        } else {
            guard let resolvedId = await resolveCommunityId() else {
                await MainActor.run {
                    debugStatus = "FAILED: could not resolve communityId"
                    isPresenceLoopRunning = false
                }
                return
            }
            communityId = resolvedId
        }

        let contextId = hardcodedEventContextId
        await MainActor.run {
            _currentCommunityId = communityId
            _currentContextId = contextId
            debugStatus = "Presence loop active"
        }

        #if DEBUG
        print("[Presence-Legacy] Anchor presence loop started for \(mapping.eventName)")
        #endif
        await writePresence(beacon: beacon, communityId: communityId, contextId: contextId)

        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(presenceRefreshInterval * 1_000_000_000))
            guard !Task.isCancelled else { break }

            let shouldContinue = await MainActor.run { () -> Bool in
                if self.isQRJoinActive { return true }
                guard let currentBeacon = confidence.activeBeacon,
                      currentBeacon.confidenceState == .stable,
                      currentBeacon.id == currentBeaconId else {
                    return false
                }
                return true
            }

            guard shouldContinue else {
                await MainActor.run { self.stopPresenceWrites() }
                break
            }

            await writePresence(beacon: beacon, communityId: communityId, contextId: contextId)
        }

        #if DEBUG
        print("[Presence-Legacy] Presence loop exited")
        #endif
    }
    
    private func stopPresenceWrites() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        cancelGraceTask()

        if isQRJoinActive {
            currentBeaconId = nil
            isWritingPresence = false
            isStartingPresenceLoop = false
            isPresenceLoopRunning = false
            debugStatus = "QR join active (anchor stopped)"
        } else {
            currentBeaconId = nil
            _currentCommunityId = nil
            _currentContextId = nil
            currentEvent = nil
            isWritingPresence = false
            isStartingPresenceLoop = false
            isPresenceLoopRunning = false
            debugStatus = "Stopped"
        }
    }
    
    // MARK: - Presence Write (Select-then-Update/Insert)

    /// Writes presence using a select-then-update/insert pattern.
    /// 1. SELECT the existing active row id for this user+context.
    /// 2. If found, UPDATE that row by primary key.
    /// 3. If not found, INSERT a new row.
    /// This prevents duplicate active rows from accumulating.
    private func writePresence(beacon: ConfidentBeacon, communityId: UUID, contextId: UUID) async {
        await MainActor.run {
            isWritingPresence = true
            debugStatus = "Writing presence..."
        }
        
        let normalizedEnergy = max(0.0, min(1.0, Double(beacon.rssi + 100) / 60.0))
        let now = Date()
        let expiresAt = now.addingTimeInterval(5 * 60)
        let nowISO = ISO8601DateFormatter().string(from: now)
        let expiresISO = ISO8601DateFormatter().string(from: expiresAt)
        
        do {
            // Step 1: Check for existing active row.
            let existing: [PresenceUpdateRow] = try await supabase
                .from("presence_sessions")
                .select("id")
                .eq("user_id", value: communityId.uuidString)
                .eq("context_type", value: "beacon")
                .eq("context_id", value: contextId.uuidString)
                .eq("is_active", value: true)
                .order("last_seen", ascending: false)
                .limit(1)
                .execute()
                .value

            if let rowId = existing.first?.id {
                // Step 2a: Update existing row by primary key.
                try await supabase
                    .from("presence_sessions")
                    .update([
                        "energy": AnyJSON.double(normalizedEnergy),
                        "last_seen": AnyJSON.string(nowISO),
                        "expires_at": AnyJSON.string(expiresISO),
                        "is_active": AnyJSON.bool(true)
                    ])
                    .eq("id", value: rowId.uuidString)
                    .execute()

                await MainActor.run {
                    lastPresenceWrite = Date()
                    debugStatus = "Updated at \(lastPresenceWrite!.formatted(date: .omitted, time: .standard))"
                }
                #if DEBUG
                print("[Presence] ✅ Presence updated (row \(rowId.uuidString.prefix(8))), energy=\(String(format: "%.2f", normalizedEnergy))")
                #endif
            } else {
                // Step 2b: No existing row — insert.
                try await supabase
                    .from("presence_sessions")
                    .insert(PresenceInsertPayload(
                        user_id: communityId,
                        context_type: "beacon",
                        context_id: contextId,
                        energy: normalizedEnergy,
                        expires_at: expiresAt,
                        last_seen: now,
                        is_active: true
                    ))
                    .execute()

                await MainActor.run {
                    lastPresenceWrite = Date()
                    debugStatus = "Inserted at \(lastPresenceWrite!.formatted(date: .omitted, time: .standard))"
                }
                #if DEBUG
                print("[Presence] ✅ Presence inserted (new row), energy=\(String(format: "%.2f", normalizedEnergy))")
                #endif
            }
        } catch {
            let isCancellation: Bool
            if let nsError = error as NSError?, nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled {
                isCancellation = true
            } else {
                isCancellation = false
            }
            
            if isCancellation {
                print("[Presence] ⚠️ Presence write cancelled (task replaced)")
                await MainActor.run { debugStatus = "Write cancelled (task replaced)" }
            } else {
                await MainActor.run { debugStatus = "FAILED write: \(error.localizedDescription)" }
                print("[Presence] ❌ Presence write failed: \(error.localizedDescription)")
            }
        }
        
        await MainActor.run { isWritingPresence = false }
    }
    
    // MARK: - Resolution Helpers
    
    private func resolveCommunityId() async -> UUID? {
        do {
            let session = try await supabase.auth.session
            let authUserId = session.user.id
            
            let response: [EventPresenceCommunityRow] = try await supabase
                .from("community")
                .select("id")
                .eq("user_id", value: authUserId.uuidString)
                .limit(1)
                .execute()
                .value
            
            if let communityId = response.first?.id {
                return communityId
            } else {
                print("[Presence] ❌ No community row found for auth user: \(authUserId)")
                return nil
            }
        } catch {
            print("[Presence] ❌ Error resolving community.id: \(error)")
            return nil
        }
    }
    
    private func resolveBeaconId(beaconKey: String) async -> UUID? {
        do {
            let response: [EventPresenceBeaconRow] = try await supabase
                .from("beacons")
                .select("id, label")
                .eq("beacon_key", value: beaconKey)
                .eq("is_active", value: true)
                .limit(1)
                .execute()
                .value
            
            if let beacon = response.first {
                return beacon.id
            } else {
                print("[Presence] ❌ No active beacon found for key: '\(beaconKey)'")
                return nil
            }
        } catch {
            print("[Presence] ❌ Error resolving beacons.id: \(error)")
            return nil
        }
    }
    
    // MARK: - Public API
    
    func reset() {
        #if DEBUG
        print("[Presence] manual reset")
        #endif
        isQRJoinActive = false
        stopPresenceWrites()
    }

    /// Called by EventJoinService when a user joins an event via QR code.
    /// Sets the same published state that beacon detection would set,
    /// so HomeView/NetworkView/EventAttendeesService all activate.
    func activateFromQRJoin(eventName: String, contextId: UUID, communityId: UUID) {
        #if DEBUG
        print("[Presence] 🎫 Activating from QR join — \(eventName)")
        #endif
        
        isQRJoinActive = true
        _currentContextId = contextId
        _currentCommunityId = communityId
        currentEvent = eventName
        debugStatus = "QR join active: \(eventName)"
        lastPresenceWrite = Date()
    }
    
    func debugWritePresenceNow() async {
        #if DEBUG
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 🧪 DEBUG: Manual presence write triggered")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        #endif
        
        debugStatus = "Starting manual presence test..."
        
        guard let communityId = await resolveCommunityId() else {
            debugStatus = "FAILED: could not resolve communityId"
            print("[Presence] ❌ Could not resolve communityId for debug write")
            return
        }
        
        debugStatus = "Resolved communityId: \(communityId.uuidString)"
        
        let contextId = hardcodedEventContextId
        
        let fakeBeacon = ConfidentBeacon(
            id: contextId,
            name: "MOONSIDE-S1",
            rssi: -60,
            confidenceState: .stable,
            firstSeen: Date(),
            lastSeen: Date()
        )
        
        #if DEBUG
        print("[Presence] 🧪 Writing test presence with:")
        print("  communityId: \(communityId)")
        print("  contextId: \(contextId)")
        print("  beacon: \(fakeBeacon.name)")
        #endif
        
        debugStatus = "About to write presence..."
        await writePresence(
            beacon: fakeBeacon,
            communityId: communityId,
            contextId: contextId
        )
        
        if let lastPresenceWrite {
            debugStatus = "SUCCESS: wrote presence at \(lastPresenceWrite.formatted(date: .omitted, time: .standard))"
        } else if !debugStatus.starts(with: "FAILED") {
            debugStatus = "FAILED: writePresence returned but no success timestamp was set"
        }
        
        #if DEBUG
        print("[Presence] 🧪 Test presence write completed")
        #endif
    }
}

// MARK: - Presence Write Models

/// Minimal row returned from an UPDATE ... RETURNING id query.
private struct PresenceUpdateRow: Decodable {
    let id: UUID
}

/// Payload for inserting a new presence row.
private struct PresenceInsertPayload: Encodable {
    let user_id: UUID
    let context_type: String
    let context_id: UUID
    let energy: Double
    let expires_at: Date
    let last_seen: Date
    let is_active: Bool
}
