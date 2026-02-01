// assets/js/unified-network/presence-tracker.js
// Presence Energy Tracker
// Version: 1.0.0

import { PresenceTier, getPresenceTier } from './types.js';
import { 
  PRESENCE_THRESHOLDS, 
  DECAY_RATES,
  PRESENCE_BOOSTS 
} from './constants.js';

/**
 * Presence Energy Tracker
 * Tracks ephemeral real-time presence energy with TTL-based decay
 */
export class PresenceEnergyTracker {
  constructor() {
    this._supabase = null;
    this._userId = null;
    this._presenceMap = new Map(); // nodeId -> { energy, ttl, lastUpdate }
    this._subscription = null;
    this._decayInterval = null;
    this._pollingInterval = null;
    this._pollingFallback = false;
  }

  /**
   * Initialize and subscribe to presence updates
   * @param {Object} supabase - Supabase client
   * @param {string} userId - Current user ID
   */
  async initialize(supabase, userId) {
    this._supabase = supabase;
    this._userId = userId;

    console.log('🔌 Initializing PresenceEnergyTracker');

    // Load existing presence sessions
    await this._loadPresenceSessions();

    // Subscribe to real-time updates
    await this._subscribeToPresence();

    // Start decay loop
    this._startDecayLoop();

    console.log('✅ PresenceEnergyTracker initialized');
  }

  /**
   * Subscribe to real-time presence updates
   * @private
   */
  async _subscribeToPresence() {
    if (!this._supabase) {
      console.warn('Supabase client not available');
      return;
    }

    try {
      // Subscribe to presence_sessions changes
      this._subscription = this._supabase
        .channel('presence_sessions_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'presence_sessions'
          },
          (payload) => this._handlePresenceChange(payload)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Subscribed to presence updates');
            this._pollingFallback = false;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('⚠️ Presence subscription error, falling back to polling');
            this._enablePollingFallback();
          }
        });
    } catch (error) {
      console.error('Error subscribing to presence:', error);
      this._enablePollingFallback();
    }
  }

  /**
   * Enable polling fallback when real-time fails
   * @private
   */
  _enablePollingFallback() {
    if (this._pollingFallback) return;

    this._pollingFallback = true;
    console.log('🔄 Enabling presence polling fallback');

    // Poll every 10 seconds
    this._pollingInterval = setInterval(() => {
      this._loadPresenceSessions();
    }, 10000);
  }

  /**
   * Handle presence change from real-time subscription
   * @private
   */
  _handlePresenceChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      this._updatePresenceFromRecord(newRecord);
    } else if (eventType === 'DELETE') {
      this._removePresenceFromRecord(oldRecord);
    }
  }

  /**
   * Update presence from database record
   * @private
   */
  _updatePresenceFromRecord(record) {
    if (!record) return;

    const { user_id, context_id, energy, expires_at } = record;
    const nodeId = context_id;

    // Only track presence for other users (not self)
    if (user_id === this._userId) return;

    const ttl = new Date(expires_at);
    const now = new Date();

    // Skip if already expired
    if (ttl <= now) return;

    this._presenceMap.set(nodeId, {
      energy: parseFloat(energy),
      ttl,
      lastUpdate: now
    });
  }

  /**
   * Remove presence from database record
   * @private
   */
  _removePresenceFromRecord(record) {
    if (!record) return;
    const { context_id } = record;
    this._presenceMap.delete(context_id);
  }

  /**
   * Load presence sessions from database
   * @private
   */
  async _loadPresenceSessions() {
    if (!this._supabase) return;

    try {
      const { data, error } = await this._supabase
        .from('presence_sessions')
        .select('*')
        .gt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Error loading presence sessions:', error);
        return;
      }

      if (data) {
        data.forEach(record => this._updatePresenceFromRecord(record));
      }
    } catch (error) {
      console.error('Error loading presence sessions:', error);
    }
  }

  /**
   * Start decay loop
   * @private
   */
  _startDecayLoop() {
    // Run decay every second
    this._decayInterval = setInterval(() => {
      this._processDecay();
    }, 1000);
  }

  /**
   * Process presence energy decay
   * @private
   */
  _processDecay() {
    const now = new Date();
    const toRemove = [];

    for (const [nodeId, presence] of this._presenceMap.entries()) {
      // Check if TTL expired
      if (now >= presence.ttl) {
        // Decay to 0 over 2 seconds
        const timeSinceExpiry = (now - presence.ttl) / 1000; // seconds
        const decayAmount = DECAY_RATES.presenceDecay * timeSinceExpiry;
        
        presence.energy = Math.max(0, presence.energy - decayAmount);
        presence.lastUpdate = now;

        // Remove if fully decayed
        if (presence.energy === 0) {
          toRemove.push(nodeId);
        }
      }
    }

    // Clean up fully decayed presence
    toRemove.forEach(nodeId => this._presenceMap.delete(nodeId));
  }

  /**
   * Unsubscribe from presence updates
   */
  unsubscribe() {
    console.log('🔌 Unsubscribing from presence updates');

    // Unsubscribe from real-time
    if (this._subscription) {
      this._subscription.unsubscribe();
      this._subscription = null;
    }

    // Stop decay loop
    if (this._decayInterval) {
      clearInterval(this._decayInterval);
      this._decayInterval = null;
    }

    // Stop polling fallback
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }

    // Clear presence map
    this._presenceMap.clear();

    console.log('✅ Unsubscribed from presence updates');
  }

  /**
   * Get presence energy for a node
   * @param {string} nodeId - Node ID
   * @returns {number} Presence energy [0, 1]
   */
  getEnergy(nodeId) {
    if (!this._presenceMap.has(nodeId)) {
      return 0;
    }

    const presence = this._presenceMap.get(nodeId);
    return presence.energy;
  }

  /**
   * Set presence energy for a node
   * @param {string} nodeId - Node ID
   * @param {number} energy - Presence energy [0, 1]
   * @param {number} [ttl] - Time-to-live in milliseconds (default: 5 minutes)
   */
  setEnergy(nodeId, energy, ttl = 300000) {
    // Validate energy
    const validEnergy = Math.max(0, Math.min(1, energy));

    // Calculate expiration
    const expiresAt = new Date(Date.now() + ttl);

    this._presenceMap.set(nodeId, {
      energy: validEnergy,
      ttl: expiresAt,
      lastUpdate: new Date()
    });

    // Persist to database if available
    this._persistPresence(nodeId, validEnergy, expiresAt);
  }

  /**
   * Persist presence to database
   * @private
   */
  async _persistPresence(nodeId, energy, expiresAt) {
    if (!this._supabase || !this._userId) return;

    try {
      const { error } = await this._supabase
        .from('presence_sessions')
        .upsert({
          user_id: this._userId,
          context_type: 'general',
          context_id: nodeId,
          energy,
          expires_at: expiresAt.toISOString()
        }, {
          onConflict: 'user_id,context_id'
        });

      if (error) {
        console.error('Error persisting presence:', error);
      }
    } catch (error) {
      console.error('Error persisting presence:', error);
    }
  }

  /**
   * Decay presence energy for a node
   * @param {string} nodeId - Node ID
   * @param {number} rate - Decay rate per second
   */
  decay(nodeId, rate) {
    if (!this._presenceMap.has(nodeId)) return;

    const presence = this._presenceMap.get(nodeId);
    presence.energy = Math.max(0, presence.energy - rate);
    presence.lastUpdate = new Date();

    // Remove if fully decayed
    if (presence.energy === 0) {
      this._presenceMap.delete(nodeId);
    }
  }

  /**
   * Get presence tier for a node
   * @param {string} nodeId - Node ID
   * @returns {number} Presence tier (PresenceTier enum)
   */
  getTier(nodeId) {
    const energy = this.getEnergy(nodeId);
    return getPresenceTier(energy);
  }

  /**
   * Clear presence for a node
   * @param {string} nodeId - Node ID
   */
  clearPresence(nodeId) {
    this._presenceMap.delete(nodeId);

    // Remove from database
    this._removePresenceFromDatabase(nodeId);
  }

  /**
   * Remove presence from database
   * @private
   */
  async _removePresenceFromDatabase(nodeId) {
    if (!this._supabase || !this._userId) return;

    try {
      const { error } = await this._supabase
        .from('presence_sessions')
        .delete()
        .eq('user_id', this._userId)
        .eq('context_id', nodeId);

      if (error) {
        console.error('Error removing presence:', error);
      }
    } catch (error) {
      console.error('Error removing presence:', error);
    }
  }

  /**
   * Boost presence energy for context-aware events
   * @param {string} nodeId - Node ID
   * @param {string} boostType - Type of boost (projectMilestone, themeView, etc.)
   * @param {number} [ttl] - Time-to-live in milliseconds
   */
  boostPresence(nodeId, boostType, ttl = 300000) {
    const currentEnergy = this.getEnergy(nodeId);
    const boostAmount = PRESENCE_BOOSTS[boostType] || 0;
    const newEnergy = Math.min(1, currentEnergy + boostAmount);

    this.setEnergy(nodeId, newEnergy, ttl);

    console.log(`⚡ Boosted presence for ${nodeId}: ${boostType} (+${boostAmount})`);
  }

  /**
   * Get all active presence
   * @returns {Map<string, number>} Map of nodeId to energy
   */
  getAllPresence() {
    const presenceMap = new Map();
    
    for (const [nodeId, presence] of this._presenceMap.entries()) {
      presenceMap.set(nodeId, presence.energy);
    }

    return presenceMap;
  }

  /**
   * Get nodes by presence tier
   * @param {number} tier - Presence tier (PresenceTier enum)
   * @returns {string[]} Node IDs
   */
  getNodesByTier(tier) {
    const nodes = [];

    for (const [nodeId, presence] of this._presenceMap.entries()) {
      if (getPresenceTier(presence.energy) === tier) {
        nodes.push(nodeId);
      }
    }

    return nodes;
  }

  /**
   * Get presence statistics
   * @returns {Object} Presence stats
   */
  getStats() {
    const stats = {
      total: this._presenceMap.size,
      ambient: 0,
      relevant: 0,
      actionable: 0,
      averageEnergy: 0
    };

    let totalEnergy = 0;

    for (const [, presence] of this._presenceMap.entries()) {
      const tier = getPresenceTier(presence.energy);
      totalEnergy += presence.energy;

      if (tier === PresenceTier.Ambient) stats.ambient++;
      else if (tier === PresenceTier.Relevant) stats.relevant++;
      else if (tier === PresenceTier.Actionable) stats.actionable++;
    }

    stats.averageEnergy = stats.total > 0 ? totalEnergy / stats.total : 0;

    return stats;
  }

  /**
   * Check if tracker is using polling fallback
   * @returns {boolean}
   */
  isUsingPolling() {
    return this._pollingFallback;
  }
}

// Create singleton instance
export const presenceEnergyTracker = new PresenceEnergyTracker();
