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

// MARK: - Supabase Payloads

struct PresenceSessionInsert: Encodable {
    let user_id: UUID
    let context_type: String
    let context_id: UUID
    let energy: Double
    let expires_at: Date
    let last_seen: Date
    let is_active: Bool
}

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
    
    private let presenceRefreshInterval: TimeInterval = 25.0
    private let gracePeriod: TimeInterval = 10.0
    private let hardcodedEventContextId = UUID(uuidString: "8b7c40b1-0c94-497a-8f4e-a815f570cc25")!
    
    private init() {
        observeConfidenceState()
    }
    
    // MARK: - Observation
    
    private func observeConfidenceState() {
        print("[Presence] 🔧 Setting up activeBeacon observer...")
        
        confidence.$activeBeacon
            .receive(on: RunLoop.main)
            .sink { [weak self] beacon in
                print("[Presence] 📡 activeBeacon changed: \(beacon?.name ?? "nil") (state: \(beacon?.confidenceState.displayText ?? "nil"))")
                self?.handleBeaconChange(beacon)
            }
            .store(in: &cancellables)
        
        print("[Presence] ✅ Observer registered")
    }
    
    private func handleBeaconChange(_ beacon: ConfidentBeacon?) {
        print("[Presence] 🔄 handleBeaconChange called")
        print("[Presence]   beacon: \(beacon?.name ?? "nil")")
        print("[Presence]   confidenceState: \(beacon?.confidenceState.displayText ?? "nil")")
        
        guard let beacon else {
            print("[Presence]   ⚠️ Beacon is nil → calling handleBeaconLost()")
            handleBeaconLost()
            return
        }
        
        guard beacon.confidenceState == .stable else {
            print("[Presence]   ℹ️ Beacon present but not stable yet → ignoring")
            return
        }
        
        print("[Presence]   ✅ Beacon is stable → calling handleStableBeacon()")
        handleStableBeacon(beacon)
    }
    
    // MARK: - Stable Beacon Handling
    
    private func handleStableBeacon(_ beacon: ConfidentBeacon) {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 🚪 ENTERED handleStableBeacon()")
        print("  Beacon Name: \(beacon.name)")
        print("  Beacon ID: \(beacon.id)")
        print("  RSSI: \(beacon.rssi) dBm")
        print("  Current beaconId: \(currentBeaconId?.uuidString ?? "nil")")
        print("  Current event: \(currentEvent ?? "nil")")
        print("  Heartbeat task active: \(heartbeatTask != nil)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        // Ignore peer devices - they are not event anchors
        if beacon.name.hasPrefix("BEACON-") {
            print("[Presence] ℹ️ Stable peer device detected: \(beacon.name)")
            print("[Presence] ℹ️ This is not an event anchor beacon, ignoring for event presence")
            debugStatus = "Peer device detected: \(beacon.name)"
            return
        }
        
        print("[Presence] 🧹 Cancelling grace task...")
        graceTask?.cancel()
        graceTask = nil
        print("[Presence]   ✅ Grace task cancelled")
        
        print("[Presence] 🔍 Checking if beacon is duplicate...")
        print("[Presence]   Incoming beacon.id: \(beacon.id)")
        print("[Presence]   Current beaconId: \(currentBeaconId?.uuidString ?? "nil")")
        print("[Presence]   Heartbeat task exists: \(heartbeatTask != nil)")
        print("[Presence]   Heartbeat task cancelled: \(heartbeatTask?.isCancelled ?? false)")
        print("[Presence]   DEBUG heartbeatTask = \(String(describing: heartbeatTask))")
        
        if currentBeaconId == beacon.id {
            print("[Presence] 🔁 Stable beacon re-detected, forcing heartbeat restart")
            print("[Presence]   currentBeaconId: \(currentBeaconId?.uuidString ?? "nil")")
            debugStatus = "Restarting heartbeat"
        } else {
            print("[Presence]   ✅ This is a NEW beacon (not duplicate)")
        }
        
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 🗺️ Looking up event mapping...")
        print("  Beacon name to match: '\(beacon.name)'")
        print("  Available mappings:")
        for m in BeaconEventMapping.mappings {
            print("    - '\(m.beaconName)' → '\(m.eventName)'")
        }
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        guard let mapping = BeaconEventMapping.getMapping(for: beacon.name) else {
            print("[Presence] ❌ EARLY RETURN: NO EVENT MAPPING FOUND")
            print("  Beacon name '\(beacon.name)' not in BeaconEventMapping.mappings")
            print("  Cannot proceed without event mapping")
            debugStatus = "No event mapping for \(beacon.name)"
            return
        }
        
        print("[Presence] ✅ Event mapping found!")
        print("  Beacon: '\(beacon.name)'")
        print("  Event: '\(mapping.eventName)'")
        print("  Beacon Key: '\(mapping.beaconKey)'")
        
        print("[Presence] 📝 Setting current state...")
        currentEvent = mapping.eventName
        currentBeaconId = beacon.id
        debugStatus = "Event active: \(mapping.eventName)"
        print("[Presence]   currentEvent = '\(currentEvent!)'")
        print("[Presence]   currentBeaconId = \(currentBeaconId!)")
        
        print("[Presence] 🛑 Cancelling any existing heartbeat task...")
        if heartbeatTask != nil {
            print("[Presence]   Found existing heartbeat task, cancelling...")
            heartbeatTask?.cancel()
            print("[Presence]   ✅ Cancelled")
        } else {
            print("[Presence]   No existing heartbeat task")
        }
        
        print("[Presence] 🚀 Creating new Task for presence loop...")
        heartbeatTask = Task { [weak self] in
            print("[Presence] 📍 INSIDE Task closure")
            print("[Presence]   Task started executing")
            
            guard let self else {
                print("[Presence] ❌ self is nil inside Task!")
                return
            }
            
            print("[Presence]   ✅ self is valid")
            print("[Presence]   About to call startPresenceLoop()...")
            
            await self.startPresenceLoop(for: beacon, mapping: mapping)
            
            print("[Presence]   startPresenceLoop() returned")
        }
        
        print("[Presence] ✅ Task created and assigned to heartbeatTask")
        print("[Presence] 🏁 Exiting handleStableBeacon() normally")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    }
    
    private func handleBeaconLost() {
        guard currentBeaconId != nil else { return }
        
        print("[Presence] stable beacon lost; waiting \(Int(gracePeriod))s grace period")
        debugStatus = "Beacon lost, waiting grace period"
        
        graceTask?.cancel()
        graceTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(self.gracePeriod * 1_000_000_000))
            guard !Task.isCancelled else { return }
            
            await MainActor.run {
                if self.confidence.activeBeacon == nil {
                    self.stopPresenceWrites()
                }
            }
        }
    }
    
    // MARK: - Presence Loop
    
    private func startPresenceLoop(for beacon: ConfidentBeacon, mapping: BeaconEventMapping) async {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 🎬 ENTERED startPresenceLoop()")
        print("  Called from Task in handleStableBeacon")
        print("  Beacon: \(beacon.name)")
        print("  Event: \(mapping.eventName)")
        print("  Actor: MainActor")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        debugStatus = "Starting presence loop..."
        print("[Presence] CHECKPOINT A: entering startPresenceLoop")
        print("[Presence] 🔄 STARTING PRESENCE LOOP")
        print("  Beacon: \(beacon.name)")
        print("  Event: \(mapping.eventName)")
        print("  Step 1: Resolving community.id from auth session...")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        guard let communityId = await resolveCommunityId() else {
            print("[Presence] CHECKPOINT B FAILED: resolveCommunityId returned nil")
            print("[Presence] ❌ FAILED to resolve community.id - STOPPING")
            debugStatus = "FAILED: could not resolve communityId"
            return
        }
        _currentCommunityId = communityId
        debugStatus = "Resolved communityId: \(communityId.uuidString)"
        print("[Presence] CHECKPOINT B: communityId = \(communityId)")
        print("[Presence] ✅ Resolved community.id: \(communityId)")
        
        print("[Presence] Step 2: Using hardcoded beacons.id...")
        let contextId = hardcodedEventContextId
        _currentContextId = contextId
        debugStatus = "Using contextId: \(contextId.uuidString)"
        print("[Presence] CHECKPOINT C: contextId = \(contextId) (HARDCODED)")
        print("[Presence] ✅ Using hardcoded beacons.id (context_id): \(contextId)")
        
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 📝 READY TO WRITE PRESENCE")
        print("  user_id (community.id): \(communityId)")
        print("  context_type: beacon")
        print("  context_id (beacons.id): \(contextId)")
        print("  event: \(mapping.eventName)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        print("[Presence] CHECKPOINT D: about to call writePresence")
        debugStatus = "About to write presence..."
        await writePresence(beacon: beacon, communityId: communityId, contextId: contextId)
        print("[Presence] CHECKPOINT E: writePresence returned")
        
        if lastPresenceWrite == nil {
            debugStatus = "FAILED: writePresence returned with no success timestamp"
        }
        
        print("[Presence] ♻️ HEARTBEAT STARTED (refresh every \(Int(presenceRefreshInterval))s)")
        
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(presenceRefreshInterval * 1_000_000_000))
            guard !Task.isCancelled else { break }
            
            guard let currentBeacon = confidence.activeBeacon,
                  currentBeacon.confidenceState == .stable,
                  currentBeacon.id == currentBeaconId else {
                print("[Presence] ⚠️ Heartbeat stopped: no stable active beacon")
                await MainActor.run {
                    self.stopPresenceWrites()
                }
                break
            }
            
            print("[Presence] 💓 Heartbeat refresh (\(Int(Date().timeIntervalSince1970)))")
            debugStatus = "Heartbeat refresh..."
            await writePresence(
                beacon: currentBeacon,
                communityId: communityId,
                contextId: contextId
            )
        }
    }
    
    private func stopPresenceWrites() {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 🛑 STOPPING PRESENCE WRITES")
        print("  Reason: Beacon lost or grace period expired")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        heartbeatTask?.cancel()
        heartbeatTask = nil
        graceTask?.cancel()
        graceTask = nil
        
        currentBeaconId = nil
        _currentCommunityId = nil
        _currentContextId = nil
        currentEvent = nil
        isWritingPresence = false
        debugStatus = "Stopped"
    }
    
    // MARK: - Presence Write
    
    private func writePresence(beacon: ConfidentBeacon, communityId: UUID, contextId: UUID) async {
        isWritingPresence = true
        debugStatus = "Writing presence row..."
        
        let normalizedEnergy = max(0.0, min(1.0, Double(beacon.rssi + 100) / 60.0))
        
        let now = Date()
        let expiresAt = now.addingTimeInterval(5 * 60)

        let payload = PresenceSessionInsert(
            user_id: communityId,
            context_type: "beacon",
            context_id: contextId,
            energy: normalizedEnergy,
            expires_at: expiresAt,
            last_seen: now,
            is_active: true
        )
        
        print("[Presence] WRITE ENTRY: user_id=\(communityId), context_id=\(contextId), beacon=\(beacon.name)")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 📤 ATTEMPTING PRESENCE WRITE")
        print("  Timestamp: \(ISO8601DateFormatter().string(from: Date()))")
        print("  Beacon: \(beacon.name)")
        print("  Payload:")
        print("    user_id: \(communityId)")
        print("    context_type: beacon")
        print("    context_id: \(contextId)")
        print("    energy: \(String(format: "%.2f", normalizedEnergy)) (rssi: \(beacon.rssi))")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        print("[Presence] 🔄 Calling supabase.from('presence_sessions').insert()...")
        
        do {
            _ = try await supabase
                .from("presence_sessions")
                .insert(payload)
                .execute()
            
            lastPresenceWrite = Date()
            debugStatus = "SUCCESS: insert completed at \(lastPresenceWrite!.formatted(date: .omitted, time: .standard))"
            print("[Presence] ✅ INSERT SUCCESSFUL - presence_sessions row written for user_id=\(communityId)")
        } catch {
            debugStatus = "FAILED INSERT: \(error.localizedDescription)"
            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print("[Presence] ❌ PRESENCE WRITE FAILED")
            print("  Error: \(error)")
            print("  Error Type: \(type(of: error))")
            print("  Localized: \(error.localizedDescription)")
            if let nsError = error as NSError? {
                print("  Domain: \(nsError.domain)")
                print("  Code: \(nsError.code)")
                print("  UserInfo: \(nsError.userInfo)")
            }
            print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        }
        
        isWritingPresence = false
    }
    
    // MARK: - Resolution Helpers
    
    private func resolveCommunityId() async -> UUID? {
        print("[Presence] 🔍 Resolving community.id...")
        
        do {
            let session = try await supabase.auth.session
            let authUserId = session.user.id
            
            print("[Presence]   ✅ Got auth session")
            print("[Presence]   auth.users.id: \(authUserId)")
            print("[Presence]   Querying community table...")
            
            let response: [EventPresenceCommunityRow] = try await supabase
                .from("community")
                .select("id")
                .eq("user_id", value: authUserId.uuidString)
                .limit(1)
                .execute()
                .value
            
            if let communityId = response.first?.id {
                print("[Presence]   ✅ Found community row")
                print("[Presence]   community.id: \(communityId)")
                return communityId
            } else {
                print("[Presence]   ❌ NO community row found for auth.users.id: \(authUserId)")
                print("[Presence]   Query returned \(response.count) rows")
                return nil
            }
        } catch {
            print("[Presence]   ❌ Error resolving community.id")
            print("[Presence]   Error: \(error)")
            print("[Presence]   Error Type: \(type(of: error))")
            if let nsError = error as NSError? {
                print("[Presence]   Domain: \(nsError.domain)")
                print("[Presence]   Code: \(nsError.code)")
            }
            return nil
        }
    }
    
    private func resolveBeaconId(beaconKey: String) async -> UUID? {
        print("[Presence] 🔍 Resolving beacons.id...")
        print("[Presence]   beacon_key: '\(beaconKey)'")
        print("[Presence]   Querying beacons table...")
        
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
                print("[Presence]   ✅ Found beacon in database")
                print("[Presence]   beacons.id: \(beacon.id)")
                print("[Presence]   label: \(beacon.label)")
                return beacon.id
            } else {
                print("[Presence]   ❌ NO active beacon found for key: '\(beaconKey)'")
                print("[Presence]   Query returned \(response.count) rows")
                print("[Presence]   Check that beacons table has row with:")
                print("[Presence]     beacon_key = '\(beaconKey)'")
                print("[Presence]     is_active = true")
                return nil
            }
        } catch {
            print("[Presence]   ❌ Error resolving beacons.id")
            print("[Presence]   Error: \(error)")
            print("[Presence]   Error Type: \(type(of: error))")
            if let nsError = error as NSError? {
                print("[Presence]   Domain: \(nsError.domain)")
                print("[Presence]   Code: \(nsError.code)")
            }
            return nil
        }
    }
    
    // MARK: - Public API
    
    func reset() {
        print("[Presence] manual reset")
        stopPresenceWrites()
    }
    
    func debugWritePresenceNow() async {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("[Presence] 🧪 DEBUG: Manual presence write triggered")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        debugStatus = "Starting manual presence test..."
        
        guard let communityId = await resolveCommunityId() else {
            debugStatus = "FAILED: could not resolve communityId"
            print("❌ Could not resolve communityId")
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
        
        print("[Presence] 🧪 Writing test presence with:")
        print("  communityId: \(communityId)")
        print("  contextId: \(contextId)")
        print("  beacon: \(fakeBeacon.name)")
        
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
        
        print("[Presence] 🧪 Test presence write completed")
    }
}
