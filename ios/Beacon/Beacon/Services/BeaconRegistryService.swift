import Foundation
import Supabase

final class BeaconRegistryService {
    
    static let shared = BeaconRegistryService()
    
    private let supabase = AppEnvironment.shared.supabaseClient
    private let cacheKey = "beacon_registry_cache"
    private let refreshInterval: TimeInterval = 6 * 60 * 60 // 6 hours
    
    var cache = BeaconCache()
    
    private init() {
        loadCacheFromDisk()
    }
    
    // MARK: - Public API
    
    /// Fetch active beacons and update cache
    func refreshBeacons() async throws {
        
        let beacons: [Beacon] = try await supabase
            .from("beacons")
            .select()
            .eq("is_active", value: true)
            .execute()
            .value
        
        cache.beacons = Dictionary(
            uniqueKeysWithValues: beacons.map { ($0.beaconKey, $0) }
        )
        
        cache.lastRefreshed = Date()
        
        saveCacheToDisk()
        
        print("✅ Refreshed \(beacons.count) active beacons")
    }
    
    /// Get beacon by beacon_key from cache
    func getBeacon(forKey beaconKey: String) -> Beacon? {
        return cache.beacons[beaconKey]
    }
    
    /// Check if cache needs refresh (6 hours old)
    func needsRefresh() -> Bool {
        return Date().timeIntervalSince(cache.lastRefreshed) > refreshInterval
    }
    
    /// Force refresh if needed
    func refreshIfNeeded() async throws {
        if needsRefresh() {
            try await refreshBeacons()
        }
    }
    
    // MARK: - Persistence
    
    private func loadCacheFromDisk() {
        
        guard
            let data = UserDefaults.standard.data(forKey: cacheKey),
            let decoded = try? JSONDecoder().decode(BeaconCache.self, from: data)
        else {
            return
        }
        
        cache = decoded
        
        print("✅ Loaded \(cache.beacons.count) beacons from cache")
    }
    
    private func saveCacheToDisk() {
        
        guard let data = try? JSONEncoder().encode(cache) else { return }
        
        UserDefaults.standard.set(data, forKey: cacheKey)
    }
}
