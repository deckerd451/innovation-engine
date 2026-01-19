// ================================================================
// Connection Status Indicator
// ================================================================
// Shows users the current status of authentication and data loading

// Prevent duplicate initialization
if (window.__CONNECTION_STATUS_LOADED__) {
  console.log("⚠️ Connection status indicator already loaded");
} else {
  window.__CONNECTION_STATUS_LOADED__ = true;

let statusIndicator = null;
let currentStatus = 'initializing';

const statusConfig = {
  initializing: {
    icon: 'fas fa-spinner fa-spin',
    color: '#00e0ff',
    message: 'Starting up...'
  },
  authenticating: {
    icon: 'fas fa-key',
    color: '#ffaa00',
    message: 'Checking authentication...'
  },
  loading_profile: {
    icon: 'fas fa-user',
    color: '#00e0ff',
    message: 'Loading your profile...'
  },
  loading_network: {
    icon: 'fas fa-network-wired',
    color: '#00e0ff',
    message: 'Building your network...'
  },
  ready: {
    icon: 'fas fa-check-circle',
    color: '#00ff88',
    message: 'Ready!'
  },
  error: {
    icon: 'fas fa-exclamation-triangle',
    color: '#ff6b6b',
    message: 'Connection error'
  },
  offline: {
    icon: 'fas fa-wifi',
    color: '#ff6b6b',
    message: 'No internet connection'
  }
};

function createStatusIndicator() {
  if (statusIndicator) return;

  statusIndicator = document.createElement('div');
  statusIndicator.id = 'connection-status-indicator';
  statusIndicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(26,26,46,0.95));
    border: 2px solid rgba(0,224,255,0.3);
    border-radius: 12px;
    padding: 1rem 1.5rem;
    z-index: 10100;
    backdrop-filter: blur(10px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 200px;
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateY(-20px);
  `;

  document.body.appendChild(statusIndicator);

  // Animate in
  setTimeout(() => {
    statusIndicator.style.opacity = '1';
    statusIndicator.style.transform = 'translateY(0)';
  }, 100);
}

function updateStatus(status, customMessage = null) {
  if (currentStatus === status && !customMessage) return;
  
  currentStatus = status;
  
  if (!statusIndicator) {
    createStatusIndicator();
  }

  const config = statusConfig[status] || statusConfig.error;
  const message = customMessage || config.message;

  statusIndicator.innerHTML = `
    <div style="color: ${config.color}; font-size: 1.2rem;">
      <i class="${config.icon}"></i>
    </div>
    <div style="color: white; font-size: 0.9rem; font-weight: 600;">
      ${message}
    </div>
  `;

  // Update border color
  statusIndicator.style.borderColor = `${config.color}40`;

  // Auto-hide when ready
  if (status === 'ready') {
    setTimeout(() => {
      hideStatusIndicator();
    }, 2000);
  }
}

function hideStatusIndicator() {
  if (!statusIndicator) return;

  statusIndicator.style.opacity = '0';
  statusIndicator.style.transform = 'translateY(-20px)';
  
  setTimeout(() => {
    if (statusIndicator && statusIndicator.parentElement) {
      statusIndicator.remove();
      statusIndicator = null;
    }
  }, 300);
}

function showError(message, details = null) {
  updateStatus('error', message);
  
  if (details) {
    console.error('Connection Status Error:', details);
  }

  // Don't auto-hide errors
}

// Listen for various events to update status
document.addEventListener('DOMContentLoaded', () => {
  updateStatus('initializing');
});

window.addEventListener('beforeunload', () => {
  hideStatusIndicator();
});

// Auth events
window.addEventListener('profile-loaded', () => {
  updateStatus('loading_network');
});

window.addEventListener('app-ready', () => {
  updateStatus('loading_network');
});

window.addEventListener('synapse-ready', () => {
  updateStatus('ready');
});

window.addEventListener('user-logged-out', () => {
  hideStatusIndicator();
});

// Network status
window.addEventListener('online', () => {
  if (currentStatus === 'offline') {
    updateStatus('initializing');
    // Trigger re-initialization
    setTimeout(() => {
      if (typeof window.ensureSynapseInitialized === 'function') {
        window.ensureSynapseInitialized();
      }
    }, 1000);
  }
});

window.addEventListener('offline', () => {
  updateStatus('offline');
});

// Export functions for manual control
window.connectionStatus = {
  update: updateStatus,
  hide: hideStatusIndicator,
  show: createStatusIndicator,
  error: showError
};

// Monitor auth state changes
if (window.supabase) {
  window.supabase.auth.onAuthStateChange((event, session) => {
    switch (event) {
      case 'SIGNED_IN':
      case 'INITIAL_SESSION':
        if (session?.user) {
          updateStatus('loading_profile');
        }
        break;
      case 'SIGNED_OUT':
        hideStatusIndicator();
        break;
      case 'TOKEN_REFRESHED':
        // Don't change status for token refresh
        break;
    }
  });
} else {
  // Wait for supabase to be available
  const checkSupabase = setInterval(() => {
    if (window.supabase) {
      clearInterval(checkSupabase);
      updateStatus('authenticating');
      
      window.supabase.auth.onAuthStateChange((event, session) => {
        switch (event) {
          case 'SIGNED_IN':
          case 'INITIAL_SESSION':
            if (session?.user) {
              updateStatus('loading_profile');
            }
            break;
          case 'SIGNED_OUT':
            hideStatusIndicator();
            break;
        }
      });
    }
  }, 100);
}

console.log("✅ Connection status indicator loaded");

} // End of initialization guard