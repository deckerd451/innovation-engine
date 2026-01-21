// ================================================================
// NOTIFICATION SYSTEM
// ================================================================
// Real-time notifications, alerts, and user engagement features

console.log("%c🔔 Notification System Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let notificationQueue = [];
let activeNotifications = new Map();
let notificationSettings = {
  messages: true,
  teamInvites: true,
  connectionRequests: true,
  projectUpdates: true,
  achievements: true,
  sound: true,
  desktop: true
};

// Notification types
const NOTIFICATION_TYPES = {
  MESSAGE: 'message',
  TEAM_INVITE: 'team_invite',
  CONNECTION_REQUEST: 'connection_request',
  PROJECT_UPDATE: 'project_update',
  ACHIEVEMENT: 'achievement',
  SYSTEM: 'system',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Notification priorities
const NOTIFICATION_PRIORITY = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4
};

// Initialize notification system
export function initNotificationSystem() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
    loadNotificationSettings();
    requestNotificationPermission();
  });

  // Expose functions globally
  window.showNotification = showNotification;
  window.showSynapseNotification = showSynapseNotification;
  window.clearNotification = clearNotification;
  window.clearAllNotifications = clearAllNotifications;
  window.openNotificationCenter = openNotificationCenter;
  window.updateNotificationSettings = updateNotificationSettings;

  // Create notification container
  createNotificationContainer();

  console.log('✅ Notification system initialized');
}

// Create notification container
function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 10001;
    max-width: 400px;
    width: 100%;
    pointer-events: none;
  `;
  document.body.appendChild(container);

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .notification-item {
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.95), rgba(26, 26, 46, 0.95));
      border: 1px solid rgba(0, 224, 255, 0.4);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      margin-bottom: 0.75rem;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      pointer-events: auto;
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease-out;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }

    .notification-item.show {
      transform: translateX(0);
      opacity: 1;
    }

    .notification-item.success {
      border-color: rgba(0, 255, 136, 0.6);
      background: linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 255, 136, 0.05));
    }

    .notification-item.error {
      border-color: rgba(255, 107, 107, 0.6);
      background: linear-gradient(135deg, rgba(255, 107, 107, 0.1), rgba(255, 107, 107, 0.05));
    }

    .notification-item.warning {
      border-color: rgba(255, 170, 0, 0.6);
      background: linear-gradient(135deg, rgba(255, 170, 0, 0.1), rgba(255, 170, 0, 0.05));
    }

    .notification-item.info {
      border-color: rgba(0, 224, 255, 0.6);
      background: linear-gradient(135deg, rgba(0, 224, 255, 0.1), rgba(0, 224, 255, 0.05));
    }

    .notification-item:hover {
      transform: translateX(-5px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    }

    .notification-close {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s;
    }

    .notification-close:hover {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .notification-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, #00e0ff, #0080ff);
      transition: width linear;
    }

    .notification-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      margin-right: 1rem;
      font-size: 1rem;
    }

    .notification-icon.success {
      background: rgba(0, 255, 136, 0.2);
      color: #00ff88;
    }

    .notification-icon.error {
      background: rgba(255, 107, 107, 0.2);
      color: #ff6b6b;
    }

    .notification-icon.warning {
      background: rgba(255, 170, 0, 0.2);
      color: #ffaa00;
    }

    .notification-icon.info {
      background: rgba(0, 224, 255, 0.2);
      color: #00e0ff;
    }

    @media (max-width: 768px) {
      #notification-container {
        top: 60px;
        right: 10px;
        left: 10px;
        max-width: none;
      }

      .notification-item {
        padding: 0.75rem 1rem;
        font-size: 0.9rem;
      }
    }
  `;
  document.head.appendChild(style);
}

// Show notification
export function showNotification(options) {
  const {
    type = NOTIFICATION_TYPES.INFO,
    title,
    message,
    duration = 5000,
    priority = NOTIFICATION_PRIORITY.NORMAL,
    actions = [],
    persistent = false,
    onClick = null
  } = options;

  console.log('🔔 Showing notification:', { type, title, message });

  // Check if notifications are enabled for this type
  if (!isNotificationTypeEnabled(type)) {
    console.log('🔕 Notification type disabled:', type);
    return null;
  }

  const notificationId = generateNotificationId();
  const container = document.getElementById('notification-container');
  
  if (!container) {
    console.error('❌ Notification container not found');
    return null;
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.id = `notification-${notificationId}`;
  notification.className = `notification-item ${type}`;
  
  const icon = getNotificationIcon(type);
  
  notification.innerHTML = `
    <button class="notification-close" onclick="clearNotification('${notificationId}')">
      <i class="fas fa-times"></i>
    </button>
    
    <div style="display: flex; align-items: flex-start;">
      <div class="notification-icon ${type}">
        <i class="${icon}"></i>
      </div>
      
      <div style="flex: 1; min-width: 0;">
        ${title ? `<h4 style="color: white; margin: 0 0 0.5rem 0; font-size: 1rem;">${title}</h4>` : ''}
        <p style="color: rgba(255, 255, 255, 0.9); margin: 0; line-height: 1.4; font-size: 0.9rem;">
          ${message}
        </p>
        
        ${actions.length > 0 ? `
          <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
            ${actions.map(action => `
              <button onclick="${action.onClick}" style="
                padding: 0.5rem 1rem;
                background: rgba(0, 224, 255, 0.2);
                border: 1px solid rgba(0, 224, 255, 0.4);
                border-radius: 6px;
                color: #00e0ff;
                cursor: pointer;
                font-size: 0.85rem;
                font-weight: 600;
              ">
                ${action.label}
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
    
    ${!persistent ? `<div class="notification-progress" style="width: 100%;"></div>` : ''}
  `;

  // Add click handler
  if (onClick) {
    notification.addEventListener('click', (e) => {
      if (!e.target.closest('.notification-close') && !e.target.closest('button')) {
        onClick();
        clearNotification(notificationId);
      }
    });
  }

  // Add to container
  container.appendChild(notification);

  // Animate in
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);

  // Store notification
  activeNotifications.set(notificationId, {
    element: notification,
    type,
    priority,
    timestamp: Date.now()
  });

  // Auto-remove if not persistent
  if (!persistent && duration > 0) {
    const progressBar = notification.querySelector('.notification-progress');
    if (progressBar) {
      progressBar.style.transition = `width ${duration}ms linear`;
      setTimeout(() => {
        progressBar.style.width = '0%';
      }, 100);
    }

    setTimeout(() => {
      clearNotification(notificationId);
    }, duration);
  }

  // Play sound if enabled
  if (notificationSettings.sound) {
    playNotificationSound(type);
  }

  // Show desktop notification if enabled
  if (notificationSettings.desktop && 'Notification' in window && Notification.permission === 'granted') {
    showDesktopNotification(title || 'CharlestonHacks', message, type);
  }

  return notificationId;
}

// Simplified notification function (backward compatibility)
window.showSynapseNotification = function(message, type = 'info', duration = 5000) {
  return showNotification({
    type: type,
    message: message,
    duration: duration
  });
};

// Clear specific notification
window.clearNotification = function(notificationId) {
  const notification = activeNotifications.get(notificationId);
  if (!notification) return;

  const element = notification.element;
  element.style.transform = 'translateX(100%)';
  element.style.opacity = '0';

  setTimeout(() => {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
    activeNotifications.delete(notificationId);
  }, 300);
};

// Clear all notifications
window.clearAllNotifications = function() {
  activeNotifications.forEach((notification, id) => {
    clearNotification(id);
  });
};

// Open notification center
window.openNotificationCenter = function() {
  console.log('🔔 Opening notification center...');

  // Remove existing center if present
  const existing = document.getElementById('notification-center');
  if (existing) existing.remove();

  // Create notification center
  const center = document.createElement('div');
  center.id = 'notification-center';
  center.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  center.innerHTML = `
    <div style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 800px;
      width: 100%;
      max-height: 80vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-bell"></i> Notification Center
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Manage your notifications and preferences
            </p>
          </div>
          <button onclick="closeNotificationCenter()" style="
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2rem;
          ">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div style="
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      ">
        <!-- Notification Settings -->
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.2rem;">
            <i class="fas fa-cog"></i> Notification Settings
          </h3>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
            ${Object.entries(notificationSettings).map(([key, enabled]) => `
              <label style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 1rem;
                background: rgba(0, 224, 255, 0.05);
                border: 1px solid rgba(0, 224, 255, 0.2);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
              " onmouseover="this.style.background='rgba(0, 224, 255, 0.08)'" onmouseout="this.style.background='rgba(0, 224, 255, 0.05)'">
                <input type="checkbox" ${enabled ? 'checked' : ''} 
                       onchange="updateNotificationSettings('${key}', this.checked)"
                       style="width: 18px; height: 18px; accent-color: #00e0ff;">
                <div>
                  <div style="color: white; font-weight: 600; margin-bottom: 0.25rem;">
                    ${formatSettingName(key)}
                  </div>
                  <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.85rem;">
                    ${getSettingDescription(key)}
                  </div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Recent Notifications -->
        <div>
          <h3 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.2rem;">
            <i class="fas fa-history"></i> Recent Notifications
          </h3>
          
          <div id="recent-notifications-list">
            <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
              <i class="fas fa-bell-slash" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
              <p>No recent notifications</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(center);

  // Close on backdrop click
  center.addEventListener('click', (e) => {
    if (e.target === center) {
      closeNotificationCenter();
    }
  });

  console.log('✅ Notification center opened');
};

// Close notification center
window.closeNotificationCenter = function() {
  const center = document.getElementById('notification-center');
  if (center) {
    center.remove();
  }
};

// Update notification settings
window.updateNotificationSettings = function(setting, enabled) {
  notificationSettings[setting] = enabled;
  saveNotificationSettings();
  console.log('⚙️ Notification setting updated:', setting, enabled);
};

// Helper functions
function generateNotificationId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getNotificationIcon(type) {
  const icons = {
    [NOTIFICATION_TYPES.MESSAGE]: 'fas fa-comment',
    [NOTIFICATION_TYPES.TEAM_INVITE]: 'fas fa-users',
    [NOTIFICATION_TYPES.CONNECTION_REQUEST]: 'fas fa-user-plus',
    [NOTIFICATION_TYPES.PROJECT_UPDATE]: 'fas fa-project-diagram',
    [NOTIFICATION_TYPES.ACHIEVEMENT]: 'fas fa-trophy',
    [NOTIFICATION_TYPES.SYSTEM]: 'fas fa-cog',
    [NOTIFICATION_TYPES.SUCCESS]: 'fas fa-check-circle',
    [NOTIFICATION_TYPES.ERROR]: 'fas fa-exclamation-circle',
    [NOTIFICATION_TYPES.WARNING]: 'fas fa-exclamation-triangle',
    [NOTIFICATION_TYPES.INFO]: 'fas fa-info-circle'
  };
  return icons[type] || 'fas fa-bell';
}

function isNotificationTypeEnabled(type) {
  const typeMap = {
    [NOTIFICATION_TYPES.MESSAGE]: 'messages',
    [NOTIFICATION_TYPES.TEAM_INVITE]: 'teamInvites',
    [NOTIFICATION_TYPES.CONNECTION_REQUEST]: 'connectionRequests',
    [NOTIFICATION_TYPES.PROJECT_UPDATE]: 'projectUpdates',
    [NOTIFICATION_TYPES.ACHIEVEMENT]: 'achievements'
  };
  
  const settingKey = typeMap[type];
  return settingKey ? notificationSettings[settingKey] : true;
}

function playNotificationSound(type) {
  try {
    // Different sounds for different notification types
    const frequencies = {
      [NOTIFICATION_TYPES.SUCCESS]: 800,
      [NOTIFICATION_TYPES.ERROR]: 400,
      [NOTIFICATION_TYPES.WARNING]: 600,
      [NOTIFICATION_TYPES.INFO]: 500,
      default: 500
    };
    
    const frequency = frequencies[type] || frequencies.default;
    
    // Create audio context and play tone
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    // Fallback to simple beep or ignore
    console.log('🔇 Audio notification not available');
  }
}

function showDesktopNotification(title, message, type) {
  try {
    const icon = getNotificationIcon(type);
    new Notification(title, {
      body: message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'charlestonhacks-notification'
    });
  } catch (e) {
    console.log('🖥️ Desktop notification not available');
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      console.log('🔔 Notification permission:', permission);
    });
  }
}

function loadNotificationSettings() {
  try {
    const saved = localStorage.getItem('notification-settings');
    if (saved) {
      notificationSettings = { ...notificationSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load notification settings');
  }
}

function saveNotificationSettings() {
  try {
    localStorage.setItem('notification-settings', JSON.stringify(notificationSettings));
  } catch (e) {
    console.warn('Failed to save notification settings');
  }
}

function formatSettingName(key) {
  const names = {
    messages: 'Messages',
    teamInvites: 'Team Invitations',
    connectionRequests: 'Connection Requests',
    projectUpdates: 'Project Updates',
    achievements: 'Achievements',
    sound: 'Sound Effects',
    desktop: 'Desktop Notifications'
  };
  return names[key] || key;
}

function getSettingDescription(key) {
  const descriptions = {
    messages: 'Get notified when you receive new messages',
    teamInvites: 'Get notified when you receive team invitations',
    connectionRequests: 'Get notified about new connection requests',
    projectUpdates: 'Get notified about project changes and updates',
    achievements: 'Get notified when you earn achievements',
    sound: 'Play sound effects for notifications',
    desktop: 'Show desktop notifications when browser is not active'
  };
  return descriptions[key] || 'Enable this notification type';
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNotificationSystem();
});

console.log('✅ Notification system ready');