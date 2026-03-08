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
    
    private init() {
        observeConfidenceState()
    }
    
    // MARK: - Observation
    
    private func observeConfidenceState() {
        confidence.$activeBeacon
            .receive(on: RunLoop.main)
            .sink { [weak self] beacon in
                self?.handleBeaconChange(beacon)
            }
            .store(in: &cancellables)
    }
    
    private func handleBeaconChange(_ beacon: ConfidentBeacon?) {
        if let beacon, beacon.confidenceState == .stable {
            handleStableBeacon(beacon)
        } else {
            handleBeaconLost()
        }
    }
    
    // MARK: - Stable Beacon Handling
    
    private func handleStableBeacon(_ beacon: ConfidentBeacon) {
        graceTask?.cancel()
        graceTask = nil
        
        // Same beacon already active; keep heartbeat running
        if currentBeaconId == beacon.id {
            return
        }
        
        print("[Presence] beacon stable: \(beacon.name)")
        
        guard let mapping = BeaconEventMapping.getMapping(for: beacon.name) else {
            print("[Presence] no event mapping found for beacon: \(beacon.name)")
            return
        }
        
        currentEvent = mapping.eventName
        currentBeaconId = beacon.id
        
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            guard let self else { return }
            await self.startPresenceLoop(for: beacon, mapping: mapping)
        }
    }
    
    private func handleBeaconLost() {
        guard currentBeaconId != nil else { return }
        
        print("[Presence] stable beacon lost; waiting \(Int(gracePeriod))s grace period")
        
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
        guard let communityId = await resolveCommunityId() else {
            print("[Presence] failed to resolve community.id")
            return
        }
        _currentCommunityId = communityId
        print("[Presence] resolved community.id: \(communityId)")
        
        guard let contextId = await resolveBeaconId(beaconKey: mapping.beaconKey) else {
            print("[Presence] failed to resolve beacon/event id for key: \(mapping.beaconKey)")
            return
        }
        _currentContextId = contextId
        print("[Presence] mapping beacon -> event: \(mapping.eventName) (\(contextId))")
        
        await writePresence(beacon: beacon, communityId: communityId, contextId: contextId)
        
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(presenceRefreshInterval * 1_000_000_000))
            guard !Task.isCancelled else { break }
            
            guard let currentBeacon = confidence.activeBeacon,
                  currentBeacon.confidenceState == .stable,
                  currentBeacon.id == currentBeaconId else {
                print("[Presence] heartbeat stopped: no stable active beacon")
                await MainActor.run {
                    self.stopPresenceWrites()
                }
                break
            }
            
            print("[Presence] heartbeat refresh")
            await writePresence(
                beacon: currentBeacon,
                communityId: communityId,
                contextId: contextId
            )
        }
    }
    
    private func stopPresenceWrites() {
        print("[Presence] heartbeat stopped")
        
        heartbeatTask?.cancel()
        heartbeatTask = nil
        graceTask?.cancel()
        graceTask = nil
        
        currentBeaconId = nil
        _currentCommunityId = nil
        _currentContextId = nil
        currentEvent = nil
        isWritingPresence = false
    }
    
    // MARK: - Presence Write
    
    private func writePresence(beacon: ConfidentBeacon, communityId: UUID, contextId: UUID) async {
        isWritingPresence = true
        
        let normalizedEnergy = max(0.0, min(1.0, Double(beacon.rssi + 100) / 60.0))
        
        let payload = PresenceSessionInsert(
            user_id: communityId,
            context_type: "beacon",
            context_id: contextId,
            energy: normalizedEnergy
        )
        
        print("[Presence] upsert presence session")
        print("  beacon: \(beacon.name)")
        print("  community.id: \(communityId)")
        print("  context_id: \(contextId)")
        print("  rssi: \(beacon.rssi)")
        print("  energy: \(String(format: "%.2f", normalizedEnergy))")
        
        do {
            _ = try await supabase
                .from("presence_sessions")
                .insert(payload)
                .execute()
            
            lastPresenceWrite = Date()
            print("[Presence] presence write successful")
        } catch {
            print("[Presence] presence write failed: \(error)")
        }
        
        isWritingPresence = false
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
            
            return response.first?.id
        } catch {
            print("[Presence] failed to resolve community.id: \(error)")
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
                print("[Presence] found beacon in database: \(beacon.label) (\(beacon.id))")
                return beacon.id
            } else {
                print("[Presence] no active beacon found for key: \(beaconKey)")
                return nil
            }
        } catch {
            print("[Presence] failed to resolve beacon id: \(error)")
            return nil
        }
    }
    
    // MARK: - Public API
    
    func reset() {
        print("[Presence] manual reset")
        stopPresenceWrites()
    }
}
