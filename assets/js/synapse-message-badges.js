/**
 * Synapse Message Badges
 * 
 * Adds message count badges to person nodes in the Synapse graph.
 * Shows unread message counts for each conversation.
 * 
 * Performance: Single query to get all unread counts, cached and updated via realtime.
 */

(() => {
  'use strict';

  const GUARD = '__CH_SYNAPSE_MESSAGE_BADGES_LOADED__';
  if (window[GUARD]) {
    console.warn('⚠️ Synapse message badges already loaded');
    return;
  }
  window[GUARD] = true;

  let updateInterval = null;
  const UPDATE_INTERVAL = 10 * 1000; // Update every 10 seconds
  let messageCountsCache = new Map(); // userId -> unread count
  let currentUserCommunityId = null;

  /**
   * Initialize message badges in synapse
   */
  async function init() {
    console.log('💬 [Synapse Messages] Initializing...');

    // Wait for Supabase to be available
    if (!window.supabase) {
      console.warn('⚠️ [Synapse Messages] Supabase not loaded, waiting...');
      setTimeout(init, 1000);
      return;
    }

    // Wait for auth.js to finish its init before touching supabase.auth.*.
    // Calling getSession() concurrently with exchangeCodeForSession() or signOut()
    // competes for the Navigator LockManager lock and causes 10 s timeouts.
    try {
      if (typeof window.waitForAuthReady === 'function') {
        await window.waitForAuthReady();
      } else if (window.bootGate?.waitForAuth) {
        await window.bootGate.waitForAuth(8000);
      }
    } catch (_) {}

    // Use the user object auth.js already resolved — no extra lock acquisition.
    const authUser = window.currentAuthUser;
    if (!authUser) {
      console.warn('⚠️ [Synapse Messages] No active session after auth init');
      return;
    }

    // Get current user's community ID
    try {
      const { data: profile } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', authUser.id)
        .single();

      if (!profile?.id) {
        console.warn('⚠️ [Synapse Messages] No community profile found');
        return;
      }

      currentUserCommunityId = profile.id;
    } catch (err) {
      console.error('Error getting current user:', err);
      return;
    }

    // Initial update
    await updateMessageCounts();

    // Update periodically (pauses when tab is hidden to save battery)
    const _vsi = window.visibilitySetInterval || setInterval;
    updateInterval = _vsi(() => {
      updateMessageCounts();
    }, UPDATE_INTERVAL);

    // Listen for message updates from messaging system
    window.addEventListener('messages-updated', () => {
      updateMessageCounts();
    });

    // Listen for conversation changes
    window.addEventListener('conversation-updated', () => {
      updateMessageCounts();
    });

    console.log('✅ [Synapse Messages] Initialized');
  }

  /**
   * Get unread message counts per conversation
   */
  async function getUnreadMessageCounts() {
    if (!currentUserCommunityId) return new Map();

    try {
      // Get all conversations for current user
      const { data: conversations, error: convError } = await window.supabase
        .from('conversations')
        .select('id, participant_1_id, participant_2_id')
        .or(`participant_1_id.eq.${currentUserCommunityId},participant_2_id.eq.${currentUserCommunityId}`);

      if (convError) {
        console.error('Error loading conversations:', convError);
        return new Map();
      }

      if (!conversations || conversations.length === 0) {
        return new Map();
      }

      // Get unread counts for each conversation
      const conversationIds = conversations.map(c => c.id);
      
      const { data: messages, error: msgError } = await window.supabase
        .from('messages')
        .select('conversation_id, sender_id')
        .in('conversation_id', conversationIds)
        .eq('read', false)
        .neq('sender_id', currentUserCommunityId);

      if (msgError) {
        console.error('Error loading unread messages:', msgError);
        return new Map();
      }

      // Count messages per conversation
      const countsByConversation = new Map();
      (messages || []).forEach(msg => {
        const count = countsByConversation.get(msg.conversation_id) || 0;
        countsByConversation.set(msg.conversation_id, count + 1);
      });

      // Map to user IDs
      const countsByUser = new Map();
      conversations.forEach(conv => {
        const count = countsByConversation.get(conv.id) || 0;
        if (count > 0) {
          // Determine the other user
          const otherUserId = conv.participant_1_id === currentUserCommunityId 
            ? conv.participant_2_id 
            : conv.participant_1_id;
          
          // Add to existing count (in case multiple conversations with same user)
          const existingCount = countsByUser.get(otherUserId) || 0;
          countsByUser.set(otherUserId, existingCount + count);
        }
      });

      return countsByUser;
    } catch (err) {
      console.error('Error getting unread message counts:', err);
      return new Map();
    }
  }

  /**
   * Update message counts and badges
   */
  async function updateMessageCounts() {
    const counts = await getUnreadMessageCounts();
    messageCountsCache = counts;
    
    // Update badges on all person nodes
    updateMessageBadges();
    
    // Dispatch event for notification bell
    const totalUnread = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
    window.dispatchEvent(new CustomEvent('total-unread-messages-updated', { 
      detail: { count: totalUnread } 
    }));
  }

  /**
   * Update message badges for all person nodes
   */
  function updateMessageBadges() {
    // Find all person nodes in the synapse
    const personNodes = document.querySelectorAll('.synapse-node');
    
    personNodes.forEach(nodeEl => {
      const nodeData = d3.select(nodeEl).datum();
      
      // Only process person nodes
      if (!nodeData || nodeData.type !== 'person') return;
      
      // Don't show badge for current user
      if (nodeData.isCurrentUser) return;
      
      const userId = nodeData.id;
      const unreadCount = messageCountsCache.get(userId) || 0;
      
      // Update or create message badge
      updateMessageBadge(nodeEl, userId, unreadCount);
    });
  }

  /**
   * Update message badge for a specific node
   */
  function updateMessageBadge(nodeEl, userId, unreadCount) {
    const node = d3.select(nodeEl);
    
    // Remove existing badge
    node.select('.message-badge').remove();
    
    // Only add badge if there are unread messages
    if (unreadCount === 0) return;
    
    // Calculate position based on node size
    const nodeCircle = node.select('.node-circle');
    if (nodeCircle.empty()) return;
    
    const baseRadius = parseFloat(nodeCircle.attr('r')) || 16;
    const badgeX = baseRadius * 0.7; // Position at top-right
    const badgeY = -baseRadius * 0.7;
    
    // Create badge group
    const badge = node
      .append('g')
      .attr('class', 'message-badge')
      .attr('transform', `translate(${badgeX}, ${badgeY})`);
    
    // Badge background circle
    const badgeSize = unreadCount > 9 ? 12 : 10;
    badge
      .append('circle')
      .attr('r', badgeSize)
      .attr('fill', '#ff3b30')
      .attr('stroke', '#000')
      .attr('stroke-width', 2);
    
    // Badge text
    const displayCount = unreadCount > 99 ? '99+' : unreadCount.toString();
    badge
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#fff')
      .attr('font-size', unreadCount > 9 ? '9px' : '10px')
      .attr('font-weight', 'bold')
      .text(displayCount);
  }

  /**
   * Get unread count for a specific user
   */
  function getUnreadCountForUser(userId) {
    return messageCountsCache.get(userId) || 0;
  }

  /**
   * Get total unread count
   */
  function getTotalUnreadCount() {
    return Array.from(messageCountsCache.values()).reduce((sum, count) => sum + count, 0);
  }

  /**
   * Cleanup
   */
  function cleanup() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    messageCountsCache.clear();
  }

  // Initialize after auth.js confirms a logged-in user (profile-loaded).
  // Starting on DOMContentLoaded caused an early getSession() call that raced
  // with exchangeCodeForSession() for the supabase.auth.token Navigator Lock.
  window.addEventListener('profile-loaded', function () {
    if (!currentUserCommunityId) init();
  }, { once: true });

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

  // Export public API
  window.SynapseMessageBadges = {
    init,
    updateMessageCounts,
    updateMessageBadges,
    getUnreadCountForUser,
    getTotalUnreadCount,
    cleanup,
  };

  console.log('✅ Synapse message badges module loaded');

})();
