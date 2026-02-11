/**
 * Synapse Presence Indicator
 * 
 * Adds real-time presence indicators to person nodes in the Synapse graph.
 * Shows a pulsing green ring around online users.
 */

(() => {
  'use strict';

  const GUARD = '__CH_SYNAPSE_PRESENCE_INDICATOR_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ Synapse presence indicator already loaded');
    return;
  }
  window[GUARD] = true;

  let updateInterval = null;
  const UPDATE_INTERVAL = 5 * 1000; // Update every 5 seconds

  /**
   * Initialize presence indicators in synapse
   */
  function init() {
    console.log('👁️ [Synapse Presence] Initializing...');

    // Wait for PresenceRealtime to be available
    if (!window.PresenceRealtime) {
      console.warn('⚠️ [Synapse Presence] PresenceRealtime not loaded, waiting...');
      setTimeout(init, 1000);
      return;
    }

    // Initial update
    updatePresenceIndicators();

    // Update periodically
    updateInterval = setInterval(() => {
      updatePresenceIndicators();
    }, UPDATE_INTERVAL);

    // Listen for presence updates
    window.addEventListener('presence-updated', () => {
      updatePresenceIndicators();
    });

    console.log('✅ [Synapse Presence] Initialized');
  }

  /**
   * Update presence indicators for all person nodes
   */
  function updatePresenceIndicators() {
    if (!window.PresenceRealtime) return;

    // Find all person nodes in the synapse
    const personNodes = document.querySelectorAll('.synapse-node');
    
    personNodes.forEach(nodeEl => {
      const nodeData = d3.select(nodeEl).datum();
      
      // Only process person nodes
      if (!nodeData || nodeData.type !== 'person') return;
      
      const userId = nodeData.id;
      const isOnline = window.PresenceRealtime.isOnline(userId);
      
      // Update or create presence ring
      updatePresenceRing(nodeEl, userId, isOnline, nodeData.isCurrentUser);
    });
  }

  /**
   * Update presence ring for a specific node
   */
  function updatePresenceRing(nodeEl, userId, isOnline, isCurrentUser) {
    const node = d3.select(nodeEl);
    
    // Remove existing presence ring
    node.select('.presence-ring').remove();
    
    // Don't show presence ring for current user (they have their own ring)
    if (isCurrentUser) return;
    
    // Only add ring if user is online
    if (!isOnline) return;
    
    // Calculate radius based on node size
    const nodeCircle = node.select('.node-circle');
    if (nodeCircle.empty()) return;
    
    const baseRadius = parseFloat(nodeCircle.attr('r')) || 16;
    const presenceRadius = baseRadius + 4;
    
    // Add pulsing presence ring
    node
      .insert('circle', ':first-child') // Insert before other elements
      .attr('class', 'presence-ring')
      .attr('r', presenceRadius)
      .attr('fill', 'none')
      .attr('stroke', '#00ff88') // Green for online
      .attr('stroke-width', 2.5)
      .attr('stroke-opacity', 0.8)
      .attr('filter', 'url(#glow)')
      .style('animation', 'presencePulse 2s ease-in-out infinite');
  }

  /**
   * Add CSS animation for presence pulse
   */
  function addPresenceStyles() {
    // Check if styles already exist
    if (document.getElementById('synapse-presence-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'synapse-presence-styles';
    style.textContent = `
      @keyframes presencePulse {
        0%, 100% {
          stroke-opacity: 0.8;
          stroke-width: 2.5;
        }
        50% {
          stroke-opacity: 1;
          stroke-width: 3;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Cleanup
   */
  function cleanup() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  // Add styles
  addPresenceStyles();

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

  // Export public API
  window.SynapsePresenceIndicator = {
    init,
    updatePresenceIndicators,
    cleanup,
  };

  console.log('✅ Synapse presence indicator module loaded');

})();
