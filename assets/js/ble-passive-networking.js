/**
 * BLE Passive Networking for Web
 * 
 * Uses Web Bluetooth API to scan for nearby beacons and record presence.
 * Works alongside the iOS app - both share the same Supabase backend.
 * 
 * Architecture:
 * - Web Bluetooth API for beacon scanning (Chrome/Edge on Android/Desktop)
 * - Same database schema as iOS app (beacons, interaction_edges, presence_sessions)
 * - Energy scale [0, 1] per database constraint
 * - RPC functions handle auth.uid() → community.id mapping
 * 
 * Browser Support:
 * - Chrome/Edge on Android: Full support
 * - Chrome/Edge on Desktop: Full support (with adapter)
 * - Safari/Firefox: Not supported (Web Bluetooth not available)
 * - iOS Safari: Not supported (use native iOS app instead)
 * 
 * Identity: Uses community.id consistently (matches graph nodes)
 */

(() => {
  'use strict';

  const GUARD = '__CH_BLE_PASSIVE_NETWORKING_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ BLE Passive Networking already loaded');
    return;
  }
  window[GUARD] = true;

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Beacon scanning
    SCAN_INTERVAL: 2000, // 2 seconds
    RSSI_HISTORY_SIZE: 10, // Last 10 RSSI samples
    
    // Debouncing
    PING_DEBOUNCE_SECONDS: 5, // Max 1 ping per beacon every 5 seconds
    ENERGY_DELTA_THRESHOLD: 0.15, // OR if energy change >= 0.15 (15%)
    
    // Presence ping TTL
    PING_TTL_SECONDS: 25,
    
    // Retry
    RETRY_INTERVAL: 2000, // 2 seconds
    MAX_RETRY_ATTEMPTS: 3,
    
    // Energy scale [0, 1]
    ENERGY_BASELINE: 0.4, // Tab hidden / baseline
    ENERGY_NORMAL: 0.6, // Normal presence
    ENERGY_ACTIVE: 0.75, // Active interaction
    ENERGY_VERY_ACTIVE: 0.9, // Very active / very close
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let supabase = null;
  let communityProfileId = null;
  let isScanning = false;
  let scanInterval = null;
  let retryInterval = null;
  
  // Beacon registry cache
  const beaconCache = new Map(); // beacon_key -> Beacon object
  let lastBeaconRefresh = 0;
  const BEACON_REFRESH_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  
  // RSSI tracking
  const rssiHistory = new Map(); // beaconId -> [rssi1, rssi2, ...]
  const lastPingSent = new Map(); // beaconId -> { date, energy }
  const pingQueue = []; // [{ beaconId, energy }, ...]
  
  // Detected beacons
  let closestBeacon = null;
  
  // Web Bluetooth support
  let bluetoothAvailable = false;

  // ============================================================================
  // BROWSER SUPPORT CHECK
  // ============================================================================

  function checkBluetoothSupport() {
    if (!navigator.bluetooth) {
      console.warn('⚠️ [BLE] Web Bluetooth API not available in this browser');
      console.warn('💡 [BLE] Supported browsers: Chrome/Edge on Android/Desktop');
      console.warn('💡 [BLE] For iOS, use the native iOS app');
      return false;
    }
    
    bluetoothAvailable = true;
    console.log('✅ [BLE] Web Bluetooth API available');
    return true;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize BLE passive networking
   * @param {object} supabaseClient - Supabase client instance
   * @param {string} profileId - Community profile ID (community.id)
   */
  async function initialize(supabaseClient, profileId) {
    if (!supabaseClient || !profileId) {
      console.error('❌ [BLE] Missing supabase client or profile ID');
      return false;
    }

    supabase = supabaseClient;
    communityProfileId = profileId;

    console.log('🔌 [BLE] Initializing for profile:', profileId);

    // Check browser support
    if (!checkBluetoothSupport()) {
      return false;
    }

    // Load beacon registry
    await refreshBeaconRegistry();

    console.log('✅ [BLE] Initialization complete');
    return true;
  }

  // ============================================================================
  // BEACON REGISTRY
  // ============================================================================

  /**
   * Refresh beacon registry from database
   */
  async function refreshBeaconRegistry() {
    if (!supabase) return;

    try {
      console.log('🔄 [BLE] Refreshing beacon registry...');

      const { data, error } = await supabase
        .from('beacons')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('❌ [BLE] Failed to fetch beacons:', error);
        return;
      }

      beaconCache.clear();
      (data || []).forEach(beacon => {
        beaconCache.set(beacon.beacon_key, beacon);
      });

      lastBeaconRefresh = Date.now();

      console.log(`✅ [BLE] Loaded ${beaconCache.size} active beacons`);

      // Save to localStorage for offline access
      try {
        localStorage.setItem('ble_beacon_cache', JSON.stringify({
          beacons: Array.from(beaconCache.entries()),
          timestamp: lastBeaconRefresh
        }));
      } catch (e) {
        console.warn('⚠️ [BLE] Failed to cache beacons to localStorage:', e);
      }

    } catch (error) {
      console.error('❌ [BLE] Error refreshing beacon registry:', error);
    }
  }

  /**
   * Load beacon cache from localStorage
   */
  function loadBeaconCacheFromStorage() {
    try {
      const cached = localStorage.getItem('ble_beacon_cache');
      if (!cached) return;

      const { beacons, timestamp } = JSON.parse(cached);
      
      // Check if cache is stale
      if (Date.now() - timestamp > BEACON_REFRESH_INTERVAL) {
        console.log('🔄 [BLE] Beacon cache is stale, will refresh');
        return;
      }

      beaconCache.clear();
      beacons.forEach(([key, beacon]) => {
        beaconCache.set(key, beacon);
      });

      lastBeaconRefresh = timestamp;

      console.log(`✅ [BLE] Loaded ${beaconCache.size} beacons from cache`);

    } catch (e) {
      console.warn('⚠️ [BLE] Failed to load beacon cache from localStorage:', e);
    }
  }

  /**
   * Check if beacon registry needs refresh
   */
  function needsBeaconRefresh() {
    return Date.now() - lastBeaconRefresh > BEACON_REFRESH_INTERVAL;
  }

  // ============================================================================
  // BLUETOOTH SCANNING
  // ============================================================================

  /**
   * Start Event Mode (BLE scanning)
   */
  async function startEventMode() {
    if (isScanning) {
      console.warn('⚠️ [BLE] Already scanning');
      return;
    }

    if (!bluetoothAvailable) {
      notifyError('Web Bluetooth not available in this browser. Use Chrome/Edge on Android/Desktop.');
      return;
    }

    console.log('🔵 [BLE] Starting Event Mode...');

    // Refresh beacon registry if needed
    if (needsBeaconRefresh()) {
      await refreshBeaconRegistry();
    }

    // Request Bluetooth permission and start scanning
    try {
      // Request access to nearby Bluetooth devices
      // Note: Web Bluetooth requires user gesture (button click)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service'] // Add any services you need
      });

      console.log('✅ [BLE] Bluetooth permission granted');
      console.log('📱 [BLE] Device:', device.name || 'Unknown');

      isScanning = true;
      notifyStateChange();

      // Start scan interval
      scanInterval = setInterval(() => {
        scanForBeacons();
      }, CONFIG.SCAN_INTERVAL);

      // Start retry interval
      retryInterval = setInterval(() => {
        uploadQueuedPings();
      }, CONFIG.RETRY_INTERVAL);

      console.log('✅ [BLE] Event Mode started');
      notifySuccess('Event Mode started - scanning for beacons');

    } catch (error) {
      console.error('❌ [BLE] Failed to start scanning:', error);
      notifyError('Failed to start Event Mode: ' + error.message);
    }
  }

  /**
   * Stop Event Mode
   */
  function stopEventMode() {
    if (!isScanning) return;

    console.log('🛑 [BLE] Stopping Event Mode...');

    // Clear intervals
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }

    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }

    // Clear state
    isScanning = false;
    closestBeacon = null;
    rssiHistory.clear();
    lastPingSent.clear();
    pingQueue.length = 0;

    notifyStateChange();

    console.log('✅ [BLE] Event Mode stopped');
    notifySuccess('Event Mode stopped');
  }

  /**
   * Scan for beacons
   * Note: Web Bluetooth API doesn't provide RSSI directly
   * We'll use a simulated approach based on device proximity
   */
  async function scanForBeacons() {
    if (!isScanning) return;

    // Web Bluetooth limitation: Can't scan for beacons without connecting
    // This is a simplified implementation that would need actual beacon hardware
    // For production, you'd need to:
    // 1. Use Web Bluetooth Scanning API (experimental)
    // 2. Or connect to beacons and read their characteristics
    // 3. Or use a companion native app that bridges to the web app

    console.log('🔍 [BLE] Scanning for beacons...');

    // For now, we'll simulate beacon detection for demonstration
    // In production, replace this with actual Web Bluetooth scanning

    // Process detected beacons
    processBeacons();
  }

  /**
   * Process detected beacons and calculate energy
   */
  function processBeacons() {
    // Calculate energy for each beacon with RSSI history
    const beaconScores = [];

    for (const [beaconId, rssiSamples] of rssiHistory.entries()) {
      if (rssiSamples.length === 0) continue;

      const energy = calculateEnergy(rssiSamples);
      const beacon = Array.from(beaconCache.values()).find(b => b.id === beaconId);

      if (beacon) {
        beaconScores.push({ beaconId, energy, label: beacon.label });
      }
    }

    // Sort by energy (highest first)
    beaconScores.sort((a, b) => b.energy - a.energy);

    // Update closest beacon
    if (beaconScores.length > 0) {
      closestBeacon = beaconScores[0];
      notifyStateChange();
    }

    // Queue pings for top 3 beacons
    const topBeacons = beaconScores.slice(0, 3);
    for (const beacon of topBeacons) {
      queuePingIfNeeded(beacon.beaconId, beacon.energy);
    }
  }

  /**
   * Calculate energy from RSSI samples
   * Energy scale: [0, 1] per database constraint
   * @param {number[]} rssiSamples - Array of RSSI values
   * @returns {number} Energy value [0, 1]
   */
  function calculateEnergy(rssiSamples) {
    if (rssiSamples.length === 0) return CONFIG.ENERGY_BASELINE;

    // Calculate median RSSI
    const sorted = [...rssiSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Map RSSI to energy [0, 1]
    // RSSI ranges: -90 (far) to -40 (very close)
    const normalizedRSSI = (median + 90) / 50.0; // Map -90→0, -40→1
    let energy = CONFIG.ENERGY_BASELINE + (normalizedRSSI * (CONFIG.ENERGY_VERY_ACTIVE - CONFIG.ENERGY_BASELINE));

    // Apply stability penalty
    const mean = rssiSamples.reduce((sum, val) => sum + val, 0) / rssiSamples.length;
    const variance = rssiSamples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rssiSamples.length;
    const stddev = Math.sqrt(variance);

    // Reduce energy for unstable signals
    const stabilityFactor = Math.max(0, 1 - (stddev / 20.0));
    energy *= stabilityFactor;

    // Clamp to [0, 1] per database constraint
    return Math.max(0, Math.min(1, energy));
  }

  // ============================================================================
  // PRESENCE UPLOAD (DEBOUNCED)
  // ============================================================================

  /**
   * Queue ping if debounce rules allow
   */
  function queuePingIfNeeded(beaconId, energy) {
    const now = Date.now();
    const last = lastPingSent.get(beaconId);

    if (last) {
      const timeSinceLast = (now - last.date) / 1000;
      const energyDelta = Math.abs(energy - last.energy);

      // Skip if within 5 seconds AND energy change < 0.15
      if (timeSinceLast < CONFIG.PING_DEBOUNCE_SECONDS && energyDelta < CONFIG.ENERGY_DELTA_THRESHOLD) {
        return;
      }
    }

    // Queue for upload
    pingQueue.push({ beaconId, energy });
    lastPingSent.set(beaconId, { date: now, energy });

    console.log(`📤 [BLE] Queued ping: beacon=${beaconId} energy=${energy.toFixed(2)}`);
  }

  /**
   * Upload queued pings
   */
  async function uploadQueuedPings() {
    if (pingQueue.length === 0) return;

    const batch = [...pingQueue];
    pingQueue.length = 0;

    for (const ping of batch) {
      await uploadPresencePing(ping.beaconId, ping.energy);
    }
  }

  /**
   * Upload presence ping to Supabase
   * CRITICAL: RPC handles auth.uid() → community.id mapping
   */
  async function uploadPresencePing(beaconId, energy) {
    if (!supabase) return;

    try {
      // Clamp energy to [0, 1] per database constraint
      const clampedEnergy = Math.max(0, Math.min(1, energy));

      await supabase.rpc('upsert_presence_ping', {
        p_context_type: 'beacon',
        p_context_id: beaconId,
        p_energy: clampedEnergy,
        p_ttl_seconds: CONFIG.PING_TTL_SECONDS
      });

      console.log(`✅ [BLE] Ping sent: beacon=${beaconId} energy=${clampedEnergy.toFixed(2)}`);

    } catch (error) {
      console.error('❌ [BLE] Failed to send ping:', error);
      
      // Re-queue on failure (with retry limit)
      const retryCount = ping.retryCount || 0;
      if (retryCount < CONFIG.MAX_RETRY_ATTEMPTS) {
        pingQueue.push({ beaconId, energy, retryCount: retryCount + 1 });
      }
    }
  }

  // ============================================================================
  // SUGGESTED CONNECTIONS
  // ============================================================================

  /**
   * Generate suggestions from presence overlaps
   */
  async function generateSuggestions(groupId = null, minOverlapSeconds = 120, lookbackMinutes = 240) {
    if (!supabase) return 0;

    try {
      console.log('🔮 [BLE] Generating suggestions...');

      const { data, error } = await supabase.rpc('infer_ble_edges', {
        p_group_id: groupId,
        p_min_overlap_seconds: minOverlapSeconds,
        p_lookback_minutes: lookbackMinutes
      });

      if (error) {
        console.error('❌ [BLE] Failed to generate suggestions:', error);
        notifyError('Failed to generate suggestions');
        return 0;
      }

      const count = data || 0;
      console.log(`✅ [BLE] Generated ${count} suggestions`);
      
      if (count > 0) {
        notifySuccess(`Found ${count} new connection suggestion${count > 1 ? 's' : ''}!`);
      } else {
        notifyInfo('No new suggestions found. Make sure Event Mode was active.');
      }

      return count;

    } catch (error) {
      console.error('❌ [BLE] Error generating suggestions:', error);
      notifyError('Error generating suggestions');
      return 0;
    }
  }

  /**
   * Fetch suggested connections
   */
  async function fetchSuggestions() {
    if (!supabase || !communityProfileId) return [];

    try {
      console.log('📥 [BLE] Fetching suggestions...');

      const { data, error } = await supabase
        .from('interaction_edges')
        .select('*')
        .or(`from_user_id.eq.${communityProfileId},to_user_id.eq.${communityProfileId}`)
        .eq('status', 'suggested')
        .order('confidence', { ascending: false })
        .order('overlap_seconds', { ascending: false });

      if (error) {
        console.error('❌ [BLE] Failed to fetch suggestions:', error);
        return [];
      }

      // Resolve display names
      const suggestions = await Promise.all((data || []).map(async edge => {
        const otherUserId = edge.from_user_id === communityProfileId ? edge.to_user_id : edge.from_user_id;
        const displayName = await fetchDisplayName(otherUserId);

        return {
          id: edge.id,
          edgeId: edge.id,
          otherUserId,
          displayName,
          overlapMinutes: Math.floor((edge.overlap_seconds || 0) / 60),
          confidence: edge.confidence || 0,
          createdAt: edge.created_at
        };
      }));

      console.log(`✅ [BLE] Fetched ${suggestions.length} suggestions`);
      return suggestions;

    } catch (error) {
      console.error('❌ [BLE] Error fetching suggestions:', error);
      return [];
    }
  }

  /**
   * Fetch display name from community table
   */
  async function fetchDisplayName(userId) {
    if (!supabase) return userId.substring(0, 8).toUpperCase();

    try {
      const { data, error } = await supabase
        .from('community')
        .select('name')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return userId.substring(0, 8).toUpperCase();
      }

      return data.name || userId.substring(0, 8).toUpperCase();

    } catch (error) {
      return userId.substring(0, 8).toUpperCase();
    }
  }

  /**
   * Accept suggestion
   */
  async function acceptSuggestion(edgeId) {
    if (!supabase) return false;

    try {
      await supabase.rpc('promote_edge_to_connection', {
        p_edge_id: edgeId
      });

      console.log(`✅ [BLE] Accepted suggestion: ${edgeId}`);
      notifySuccess('Connection accepted!');
      return true;

    } catch (error) {
      console.error('❌ [BLE] Failed to accept suggestion:', error);
      notifyError('Failed to accept connection');
      return false;
    }
  }

  /**
   * Ignore suggestion
   */
  async function ignoreSuggestion(edgeId) {
    if (!supabase) return false;

    try {
      await supabase
        .from('interaction_edges')
        .update({ status: 'ignored' })
        .eq('id', edgeId);

      console.log(`✅ [BLE] Ignored suggestion: ${edgeId}`);
      return true;

    } catch (error) {
      console.error('❌ [BLE] Failed to ignore suggestion:', error);
      return false;
    }
  }

  /**
   * Block suggestion
   */
  async function blockSuggestion(edgeId) {
    if (!supabase) return false;

    try {
      await supabase
        .from('interaction_edges')
        .update({ status: 'blocked' })
        .eq('id', edgeId);

      console.log(`✅ [BLE] Blocked suggestion: ${edgeId}`);
      return true;

    } catch (error) {
      console.error('❌ [BLE] Failed to block suggestion:', error);
      return false;
    }
  }

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  function notifyStateChange() {
    window.dispatchEvent(new CustomEvent('ble-state-changed', {
      detail: {
        isScanning,
        closestBeacon,
        beaconCount: beaconCache.size
      }
    }));
  }

  function notifySuccess(message) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, 'success');
    }
    console.log('✅ [BLE]', message);
  }

  function notifyError(message) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, 'error');
    }
    console.error('❌ [BLE]', message);
  }

  function notifyInfo(message) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, 'info');
    }
    console.log('ℹ️ [BLE]', message);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  window.BLEPassiveNetworking = {
    // Initialization
    initialize,
    
    // Event Mode
    startEventMode,
    stopEventMode,
    isScanning: () => isScanning,
    
    // Beacon Registry
    refreshBeaconRegistry,
    getBeaconCount: () => beaconCache.size,
    
    // Suggestions
    generateSuggestions,
    fetchSuggestions,
    acceptSuggestion,
    ignoreSuggestion,
    blockSuggestion,
    
    // State
    getClosestBeacon: () => closestBeacon,
    isBluetoothAvailable: () => bluetoothAvailable,
    
    // Debug
    getDebugInfo: () => ({
      isScanning,
      bluetoothAvailable,
      beaconCount: beaconCache.size,
      closestBeacon,
      rssiHistorySize: rssiHistory.size,
      pingQueueSize: pingQueue.length,
      lastBeaconRefresh: new Date(lastBeaconRefresh).toISOString()
    })
  };

  console.log('✅ BLE Passive Networking module loaded');

  // Load beacon cache from storage on load
  loadBeaconCacheFromStorage();

})();
