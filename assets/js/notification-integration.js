// ================================================================
// NOTIFICATION INTEGRATION
// ================================================================
// Wires up the notification system with real data sources
// - Connection requests
// - Messages
// - Real-time updates
// ================================================================

console.log("%c🔗 Notification Integration Loading...", "color:#0ff; font-weight: bold;");

let supabase = null;
let currentUserId = null;
let realtimeChannel = null;

// Initialize notification integration
export async function initNotificationIntegration() {
  console.log('🔗 Initializing notification integration...');

  // Wait for dependencies
  await waitForDependencies();

  supabase = window.supabase;
  // Use community profile ID (not auth user_id) - connections table uses community.id
  currentUserId = window.currentUserProfile?.id;

  if (!currentUserId) {
    console.warn('⚠️ No community profile ID available for notifications');
    return;
  }

  console.log('🔔 Notification integration using community ID:', currentUserId);

  // Load initial notification counts
  await updateNotificationCounts();

  // Setup real-time listeners
  setupRealtimeNotifications();

  // Refresh counts periodically
  setInterval(updateNotificationCounts, 30000); // Every 30 seconds

  console.log('✅ Notification integration initialized');
}

// Wait for required dependencies
async function waitForDependencies() {
  const maxWait = 15000;
  const checkInterval = 500;
  let waited = 0;

  while (waited < maxWait) {
    if (window.supabase && window.currentUserProfile && window.showNotification) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }

  console.warn('⚠️ Some dependencies not available for notifications');
}

// Update all notification counts
async function updateNotificationCounts() {
  try {
    // Get connection requests count
    const connectionRequests = await getConnectionRequestsCount();

    // Get unread messages count (placeholder - implement when messaging is ready)
    const unreadMessages = 0;

    // Calculate total
    const totalCount = connectionRequests + unreadMessages;

    // Update badge
    updateNotificationBadge(totalCount);

    console.log('🔔 Notification counts updated:', {
      connectionRequests,
      unreadMessages,
      total: totalCount
    });

    return totalCount;
  } catch (error) {
    console.error('❌ Error updating notification counts:', error);
    return 0;
  }
}

// Get connection requests count
async function getConnectionRequestsCount() {
  try {
    if (!supabase || !currentUserId) return 0;

    const { data, error } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id_b', currentUserId)
      .eq('status', 'pending');

    if (error) throw error;

    return data?.length || 0;
  } catch (error) {
    console.error('Error getting connection requests:', error);
    return 0;
  }
}

// Update notification badge in header
function updateNotificationBadge(count) {
  const badge = document.getElementById('notif-count');
  const bell = document.getElementById('notifications-bell');

  if (badge) {
    badge.textContent = count;

    if (count > 0) {
      badge.classList.remove('hidden');
      badge.style.cssText = `
        position: absolute;
        top: -4px;
        right: -4px;
        background: linear-gradient(135deg, #ff6b6b, #ff8c8c);
        color: white;
        font-size: 0.7rem;
        font-weight: bold;
        padding: 0.15rem 0.4rem;
        border-radius: 10px;
        min-width: 18px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
        animation: notificationPulse 2s ease-in-out infinite;
      `;
    } else {
      badge.classList.add('hidden');
    }
  }

  // Add pulse animation to bell when there are notifications
  if (bell && count > 0) {
    bell.style.animation = 'bellShake 2s ease-in-out infinite';
  } else if (bell) {
    bell.style.animation = '';
  }

  // Add CSS animations if not already added
  addNotificationAnimations();
}

// Add CSS animations
function addNotificationAnimations() {
  if (document.getElementById('notification-badge-animations')) return;

  const style = document.createElement('style');
  style.id = 'notification-badge-animations';
  style.textContent = `
    @keyframes notificationPulse {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
      }
      50% {
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(255, 107, 107, 0.6);
      }
    }

    @keyframes bellShake {
      0%, 90%, 100% {
        transform: rotate(0deg);
      }
      92% {
        transform: rotate(10deg);
      }
      94% {
        transform: rotate(-10deg);
      }
      96% {
        transform: rotate(10deg);
      }
      98% {
        transform: rotate(-10deg);
      }
    }

    .notification-badge {
      position: relative;
    }
  `;
  document.head.appendChild(style);
}

// Setup real-time notifications
function setupRealtimeNotifications() {
  if (!supabase || !currentUserId) return;

  console.log('🔄 Setting up real-time notification listeners...');

  // Subscribe to connection requests
  realtimeChannel = supabase
    .channel('user-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'connections',
        filter: `user_id_b=eq.${currentUserId}`
      },
      async (payload) => {
        console.log('🆕 New connection request received:', payload);

        // Show notification
        if (typeof window.showNotification === 'function') {
          const requester = await getUserName(payload.new.user_id_a);

          window.showNotification({
            type: 'connection_request',
            title: 'New Connection Request',
            message: `${requester} wants to connect with you`,
            duration: 7000,
            onClick: () => {
              if (typeof window.openNotificationCenter === 'function') {
                window.openNotificationCenter();
              }
            }
          });
        }

        // Update counts
        updateNotificationCounts();
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'connections',
        filter: `user_id_a=eq.${currentUserId}`
      },
      async (payload) => {
        // Connection request accepted/declined
        if (payload.new.status !== payload.old.status) {
          console.log('🔄 Connection status changed:', payload.new.status);

          if (payload.new.status === 'accepted' && typeof window.showNotification === 'function') {
            const accepter = await getUserName(payload.new.user_id_b);

            window.showNotification({
              type: 'success',
              title: 'Connection Accepted!',
              message: `${accepter} accepted your connection request`,
              duration: 7000
            });
          }

          updateNotificationCounts();
        }
      }
    )
    .subscribe((status) => {
      console.log('🔄 Real-time notification status:', status);
    });
}

// Get user name by ID (expects community.id, not user_id)
async function getUserName(communityId) {
  try {
    const { data, error } = await supabase
      .from('community')
      .select('name')
      .eq('id', communityId)  // Use community.id not user_id
      .single();

    if (error) throw error;
    return data?.name || 'Someone';
  } catch (error) {
    console.error('Error getting user name:', error);
    return 'Someone';
  }
}

// Test notification function
window.testNotification = function(type = 'info') {
  if (typeof window.showNotification !== 'function') {
    console.error('❌ Notification system not available');
    return;
  }

  const testNotifications = {
    info: {
      type: 'info',
      title: 'Test Notification',
      message: 'This is a test info notification',
      duration: 5000
    },
    success: {
      type: 'success',
      title: 'Success!',
      message: 'This is a test success notification',
      duration: 5000
    },
    error: {
      type: 'error',
      title: 'Error',
      message: 'This is a test error notification',
      duration: 5000
    },
    warning: {
      type: 'warning',
      title: 'Warning',
      message: 'This is a test warning notification',
      duration: 5000
    },
    connection: {
      type: 'connection_request',
      title: 'New Connection Request',
      message: 'John Doe wants to connect with you',
      duration: 7000,
      actions: [
        {
          label: 'View',
          onClick: 'window.openNotificationCenter()'
        }
      ]
    }
  };

  const notification = testNotifications[type] || testNotifications.info;
  window.showNotification(notification);
  console.log('🧪 Test notification sent:', type);
};

// Expose functions
window.updateNotificationCounts = updateNotificationCounts;
window.initNotificationIntegration = initNotificationIntegration;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initNotificationIntegration();
  }, 2000);
});

// Also initialize when profile is loaded
window.addEventListener('profile-loaded', () => {
  setTimeout(() => {
    initNotificationIntegration();
  }, 1000);
});

console.log('✅ Notification integration ready');
