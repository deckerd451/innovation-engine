// ================================================================
// BEACON REGISTRY LOADER
// ================================================================
// Manages beacon cache and registry for Event Mode
// Fetches active beacons from Supabase and caches locally

(() => {
  'use strict';

  const CACHE_KEY = 'CH_BEACON_REGISTRY_CACHE_V1';
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

  class BeaconRegistry {
    constructor() {
      this.byKey = new Map();
      this.byId = new Map();
      this.eventBeacons = [];
      this.lastRegistryError = null;
      this.lastFetchedAt = null;
    }

    /**
     * Load beacon registry from Supabase or cache
     * @param {Object} options - { force: boolean }
     * @returns {Promise<boolean>} success
     */
    async loadBeaconRegistry({ force = false } = {}) {
      try {
        // Check cache first unless forced
        if (!force && this.lastFetchedAt) {
          const age = Date.now() - this.lastFetchedAt;
          if (age < CACHE_TTL_MS) {
            console.log('✅ [BeaconRegistry] Using in-memory cache');
            return true;
          }
        }

        // Try to load from localStorage cache
        if (!force) {
          const cached = this._loadFromCache();
          if (cached) {
            console.log('✅ [BeaconRegistry] Loaded from localStorage cache');
            return true;
          }
        }

        // Fetch from Supabase
        console.log('🔄 [BeaconRegistry] Fetching from Supabase...');
        
        if (!window.supabase) {
          throw new Error('Supabase client not available');
        }

        const { data, error } = await window.supabase
          .from('beacons')
          .select('id, beacon_key, label, kind, group_id, is_active, meta')
          .eq('is_active', true);

        if (error) throw error;

        // Build maps
        this.byKey.clear();
        this.byId.clear();
        this.eventBeacons = [];

        (data || []).forEach(beacon => {
          this.byKey.set(beacon.beacon_key, beacon);
          this.byId.set(beacon.id, beacon);
          
          if (beacon.kind === 'event') {
            this.eventBeacons.push(beacon);
          }
        });

        this.lastFetchedAt = Date.now();
        this.lastRegistryError = null;

        // Save to cache
        this._saveToCache(data);

        console.log(`✅ [BeaconRegistry] Loaded ${data.length} beacons (${this.eventBeacons.length} events)`);
        return true;

      } catch (error) {
        console.error('❌ [BeaconRegistry] Load failed:', error);
        this.lastRegistryError = error.message || String(error);
        
        // Try to use cached data as fallback
        const cached = this._loadFromCache();
        if (cached) {
          console.warn('⚠️ [BeaconRegistry] Using stale cache due to fetch error');
          return true;
        }
        
        return false;
      }
    }

    /**
     * Get beacon by ID
     * @param {string} id - UUID
     * @returns {Object|null}
     */
    getBeaconById(id) {
      return this.byId.get(id) || null;
    }

    /**
     * Get beacon by beacon_key
     * @param {string} key - beacon_key string
     * @returns {Object|null}
     */
    getBeaconByKey(key) {
      return this.byKey.get(key) || null;
    }

    /**
     * Get all event beacons
     * @returns {Array}
     */
    getEventBeacons() {
      return [...this.eventBeacons];
    }

    /**
     * Check if cache needs refresh
     * @returns {boolean}
     */
    needsRefresh() {
      if (!this.lastFetchedAt) return true;
      const age = Date.now() - this.lastFetchedAt;
      return age > CACHE_TTL_MS;
    }

    /**
     * Load from localStorage cache
     * @private
     * @returns {boolean} success
     */
    _loadFromCache() {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return false;

        const { fetchedAt, rows } = JSON.parse(cached);
        const age = Date.now() - fetchedAt;

        if (age > CACHE_TTL_MS) {
          console.log('🗑️ [BeaconRegistry] Cache expired');
          localStorage.removeItem(CACHE_KEY);
          return false;
        }

        // Rebuild maps from cached data
        this.byKey.clear();
        this.byId.clear();
        this.eventBeacons = [];

        (rows || []).forEach(beacon => {
          this.byKey.set(beacon.beacon_key, beacon);
          this.byId.set(beacon.id, beacon);
          
          if (beacon.kind === 'event') {
            this.eventBeacons.push(beacon);
          }
        });

        this.lastFetchedAt = fetchedAt;
        return true;

      } catch (error) {
        console.error('❌ [BeaconRegistry] Cache load failed:', error);
        localStorage.removeItem(CACHE_KEY);
        return false;
      }
    }

    /**
     * Save to localStorage cache
     * @private
     * @param {Array} rows
     */
    _saveToCache(rows) {
      try {
        const cacheData = {
          fetchedAt: this.lastFetchedAt,
          rows: rows || []
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      } catch (error) {
        console.warn('⚠️ [BeaconRegistry] Cache save failed:', error);
      }
    }
  }

  // Export singleton
  window.BeaconRegistry = new BeaconRegistry();
  console.log('✅ BeaconRegistry loaded');
})();
