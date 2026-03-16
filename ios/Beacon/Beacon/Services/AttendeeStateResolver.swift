import Foundation
import Combine

/// Resolves proximity + relationship state for attendees using existing services.
/// Caches connection lookups and peer device results to avoid repeated work.
@MainActor
final class AttendeeStateResolver: ObservableObject {
    static let shared = AttendeeStateResolver()
    
    @Published private(set) var connectedIds: Set<UUID> = []
    @Published private(set) var lastConnectionRefresh: Date?
    
    private let scanner = BLEScannerService.shared
    private let connectionService = ConnectionService.shared
    
    private var refreshTask: Task<Void, Never>?
    
    // MARK: - Peer Device Cache
    // Avoids repeated full BLE scans during SwiftUI recomputes.
    // Invalidated when the underlying device list changes.
    
    private var peerDeviceCache: [UUID: DiscoveredBLEDevice?] = [:]
    private var lastCacheSignature: String = ""
    
    // MARK: - Log Deduplication
    // Prevents identical resolver log blocks from repeating every timer tick.
    
    private var lastLogSignature: String = ""
    private var lastLogTime: Date = .distantPast
    private let logCooldown: TimeInterval = 10 // seconds
    
    private init() {}
    
    // MARK: - Connection Cache
    
    /// Refreshes the set of connected user IDs from the connections table
    func refreshConnections() {
        refreshTask?.cancel()
        refreshTask = Task {
            do {
                let connections = try await connectionService.fetchConnections()
                guard let myId = AuthService.shared.currentUser?.id else { return }
                
                var ids = Set<UUID>()
                for conn in connections {
                    let other = conn.otherUser(for: myId)
                    ids.insert(other.id)
                }
                
                connectedIds = ids
                lastConnectionRefresh = Date()
                #if DEBUG
                print("[StateResolver] ✅ Refreshed connections: \(ids.count) connected users")
                #endif
            } catch {
                print("[StateResolver] ❌ Failed to refresh connections: \(error)")
            }
        }
    }
    
    // MARK: - Proximity Resolution
    
    func resolveProximity(for attendee: EventAttendee) -> ProximityState {
        guard let device = peerDevice(for: attendee) else {
            // No BLE match — use presence data
            let age = Date().timeIntervalSince(attendee.lastSeen)
            if age > 120 { return .lost }
            return .detected
        }
        
        let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi
        let age = Date().timeIntervalSince(device.lastSeen)
        
        if age > 15 { return .lost }
        
        switch rssi {
        case -45...0: return .veryClose
        case -65..<(-45): return .nearby
        default: return .detected
        }
    }
    
    // MARK: - Relationship Resolution
    
    func resolveRelationship(for attendee: EventAttendee) -> RelationshipState {
        if connectedIds.contains(attendee.id) {
            return .connected
        }
        
        let hasProfile = attendee.bio != nil || attendee.skills != nil || attendee.interests != nil
        if hasProfile {
            return .verified
        }
        
        if !attendee.name.hasPrefix("User ") {
            return .verified
        }
        
        return .unverified
    }
    
    // MARK: - Combined
    
    func resolve(for attendee: EventAttendee) -> AttendeePresentation {
        AttendeePresentation(
            attendee: attendee,
            proximity: resolveProximity(for: attendee),
            relationship: resolveRelationship(for: attendee)
        )
    }
    
    // MARK: - BLE Peer Matching
    
    /// Matches a BLE device to an attendee using community ID prefix.
    /// Uses a cache keyed on the current BLE device snapshot to avoid
    /// repeated full scans during SwiftUI view recomputes.
    func peerDevice(for attendee: EventAttendee) -> DiscoveredBLEDevice? {
        // Guard: skip resolution for the local user — they are never a peer target.
        if let localId = AuthService.shared.currentUser?.id, attendee.id == localId {
            return nil
        }
        
        let allDevices = scanner.getFilteredDevices()
        
        // Build a lightweight signature of the current device list.
        // If unchanged since last call, return cached result.
        let signature = buildDeviceSignature(allDevices)
        if signature == lastCacheSignature, let cached = peerDeviceCache[attendee.id] {
            return cached
        }
        
        // Signature changed — invalidate entire cache for fresh resolution.
        if signature != lastCacheSignature {
            peerDeviceCache.removeAll()
            lastCacheSignature = signature
        }
        
        let result = resolvePeerDevice(for: attendee, from: allDevices)
        peerDeviceCache[attendee.id] = result
        return result
    }
    
    /// Core peer resolution logic. Only called on cache miss.
    private func resolvePeerDevice(for attendee: EventAttendee, from allDevices: [DiscoveredBLEDevice]) -> DiscoveredBLEDevice? {
        let attendeePrefix = String(attendee.id.uuidString.prefix(8)).lowercased()
        
        // Partition devices into BCN- peers and legacy BEACON- devices.
        let bcnDevices = allDevices.filter { BLEAdvertiserService.parseCommunityPrefix(from: $0.name) != nil }
        
        // Short-circuit: no devices at all — no BLE peers visible.
        guard !allDevices.isEmpty else {
            logIfChanged("empty", message: nil)
            return nil
        }
        
        // Short-circuit: devices exist but none are qualifying BCN- peers.
        // Skip per-attendee matching entirely.
        if bcnDevices.isEmpty {
            let legacyDevices = allDevices.filter { $0.name.hasPrefix("BEACON-") }
            if legacyDevices.isEmpty {
                logIfChanged("no-peers:\(allDevices.count)", message: nil)
                return nil
            }
            // Fall through to legacy path below
        }
        
        // 1. Deterministic match: BCN-<community-id-prefix>
        for device in bcnDevices {
            if let devicePrefix = BLEAdvertiserService.parseCommunityPrefix(from: device.name) {
                if devicePrefix == attendeePrefix {
                    let sig = "match:\(attendee.id):\(device.name)"
                    logIfChanged(sig, message: "[StateResolver] ✅ BLE match: \(device.name) → \(attendee.name)")
                    return device
                }
            }
        }
        
        // 2. Legacy fallback: BEACON-<device-name> heuristic.
        // Kept for backward compatibility with devices not yet advertising BCN- identity.
        // This path is intentionally quiet — only logs on actual match.
        let legacyDevices = allDevices.filter { $0.name.hasPrefix("BEACON-") }
        guard !legacyDevices.isEmpty else {
            // BCN peers exist but none matched this attendee — normal mismatch, not an error.
            if !bcnDevices.isEmpty {
                let sig = "bcn-nomatch:\(attendee.id):\(bcnDevices.count)"
                logIfChanged(sig, message: "[StateResolver] No BCN match for \(attendee.name) among \(bcnDevices.count) peers")
            }
            return nil
        }
        
        let attendeeLower = attendee.name.lowercased()
        
        // Single legacy peer device — assume it's the only other person.
        // Only applies when no BCN devices are present at all.
        if legacyDevices.count == 1 && bcnDevices.isEmpty {
            logIfChanged("legacy-single:\(legacyDevices.first!.name)", message: "[StateResolver] ⚠️ Single legacy device fallback: \(legacyDevices.first!.name) → \(attendee.name)")
            return legacyDevices.first
        }
        
        // Name substring match (legacy heuristic).
        for device in legacyDevices {
            let deviceSuffix = device.name.replacingOccurrences(of: "BEACON-", with: "").lowercased()
            if attendeeLower.contains(deviceSuffix) || deviceSuffix.contains(attendeeLower) {
                logIfChanged("legacy-name:\(device.name):\(attendee.name)", message: "[StateResolver] ⚠️ Legacy name match: \(device.name) → \(attendee.name)")
                return device
            }
        }
        
        return nil
    }
    
    // MARK: - Batch Resolution
    
    /// Returns all BLE devices that are resolved to event attendees.
    func resolvedPeerDevices(attendees: [EventAttendee]) -> [(attendee: EventAttendee, device: DiscoveredBLEDevice)] {
        var results: [(EventAttendee, DiscoveredBLEDevice)] = []
        for attendee in attendees {
            if let device = peerDevice(for: attendee) {
                results.append((attendee, device))
            }
        }
        return results
    }
    
    // MARK: - Cache & Log Helpers
    
    /// Builds a lightweight signature from the current device list.
    /// Changes when device count, IDs, or RSSI values shift meaningfully.
    private func buildDeviceSignature(_ devices: [DiscoveredBLEDevice]) -> String {
        if devices.isEmpty { return "empty" }
        // Sort by ID for stability, include coarse RSSI buckets
        let parts = devices
            .sorted { $0.id.uuidString < $1.id.uuidString }
            .map { "\($0.id.uuidString.prefix(8)):\($0.rssi / 5)" }
        return parts.joined(separator: ",")
    }
    
    /// Logs a message only if the signature has changed or cooldown has elapsed.
    /// Prevents identical log blocks from repeating every timer tick.
    private func logIfChanged(_ signature: String, message: String?) {
        #if DEBUG
        let now = Date()
        guard signature != lastLogSignature || now.timeIntervalSince(lastLogTime) > logCooldown else {
            return
        }
        lastLogSignature = signature
        lastLogTime = now
        if let msg = message {
            print(msg)
        }
        #endif
    }
}
