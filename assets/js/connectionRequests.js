// connectionRequests.js - Pending connection requests panel
// Features: view received/sent requests, accept/decline, notifications

import {
  getPendingRequestsReceived,
  getPendingRequestsSent,
  getAcceptedConnections,
  acceptConnectionRequest,
  declineConnectionRequest,
  cancelConnectionRequest,
  removeConnection,
  formatTimeAgo
} from './connections.js';

let supabase = null;
let panelElement = null;
let notificationBadge = null;

// Initialize the connection requests module
export async function initConnectionRequests(supabaseClient) {
  supabase = supabaseClient;
  
  createRequestsPanel();
  createNotificationBadge();
  await refreshPendingCount();
  
  console.log('%c✓ Connection Requests module initialized', 'color: #0f0');
}

// Create the floating notification badge
function createNotificationBadge() {
  // Add badge to connections button if it exists
  const connectionsTab = document.querySelector('[data-tab="connections"]');
  if (connectionsTab) {
    notificationBadge = document.createElement('span');
    notificationBadge.className = 'connection-badge hidden';
    notificationBadge.textContent = '0';
    connectionsTab.appendChild(notificationBadge);
  }
}

// Update pending count badge
export async function refreshPendingCount() {
  try {
    const received = await getPendingRequestsReceived();
    const count = received.length;
    
    if (notificationBadge) {
      notificationBadge.textContent = count;
      notificationBadge.classList.toggle('hidden', count === 0);
    }
    
    // Also update any other badges
    const badges = document.querySelectorAll('.pending-count-badge');
    badges.forEach(badge => {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    });
    
    return count;
  } catch (err) {
    console.warn('Could not refresh pending count:', err);
    return 0;
  }
}

// Create the requests panel
function createRequestsPanel() {
  // Check if panel already exists
  if (document.getElementById('connection-requests-panel')) return;
  
  panelElement = document.createElement('div');
  panelElement.id = 'connection-requests-panel';
  panelElement.className = 'connection-requests-panel hidden';
  
  panelElement.innerHTML = `
    <div class="crp-header">
      <h3><i class="fas fa-user-friends"></i> Connections</h3>
      <button class="crp-close" onclick="toggleConnectionsPanel()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="crp-tabs">
      <button class="crp-tab active" data-tab="received">
        Received <span class="pending-count-badge hidden">0</span>
      </button>
      <button class="crp-tab" data-tab="sent">Sent</button>
      <button class="crp-tab" data-tab="connected">Connected</button>
    </div>
    <div class="crp-content">
      <div id="crp-received" class="crp-section active"></div>
      <div id="crp-sent" class="crp-section"></div>
      <div id="crp-connected" class="crp-section"></div>
    </div>
  `;
  
  document.body.appendChild(panelElement);
  
  // Setup tab switching
  panelElement.querySelectorAll('.crp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panelElement.querySelectorAll('.crp-tab').forEach(t => t.classList.remove('active'));
      panelElement.querySelectorAll('.crp-section').forEach(s => s.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`crp-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// Toggle panel visibility
window.toggleConnectionsPanel = async function() {
  if (!panelElement) return;
  
  const isHidden = panelElement.classList.contains('hidden');
  
  if (isHidden) {
    panelElement.classList.remove('hidden');
    await loadAllSections();
  } else {
    panelElement.classList.add('hidden');
  }
};

// Load all sections
async function loadAllSections() {
  await Promise.all([
    loadReceivedRequests(),
    loadSentRequests(),
    loadConnectedUsers()
  ]);
}

// Load received requests
async function loadReceivedRequests() {
  const container = document.getElementById('crp-received');
  if (!container) return;
  
  container.innerHTML = '<div class="crp-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  
  try {
    const requests = await getPendingRequestsReceived();
    
    if (requests.length === 0) {
      container.innerHTML = '<div class="crp-empty">No pending requests</div>';
      return;
    }
    
    container.innerHTML = requests.map(req => {
      const user = req.community || {};
      return `
        <div class="crp-item" data-id="${req.id}">
          <div class="crp-item-avatar">
            ${user.image_url 
              ? `<img src="${user.image_url}" alt="${user.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%2300e0ff%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 dy=%22.35em%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22>${getInitials(user.name)}</text></svg>'">` 
              : `<div class="crp-avatar-fallback">${getInitials(user.name)}</div>`
            }
          </div>
          <div class="crp-item-info">
            <div class="crp-item-name">${user.name || 'Unknown'}</div>
            <div class="crp-item-meta">${formatTimeAgo(req.created_at)}</div>
          </div>
          <div class="crp-item-actions">
            <button class="crp-accept" data-id="${req.id}" title="Accept">
              <i class="fas fa-check"></i>
            </button>
            <button class="crp-decline" data-id="${req.id}" title="Decline">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Attach listeners
    container.querySelectorAll('.crp-accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          await acceptConnectionRequest(btn.dataset.id);
          showPanelNotification('Connection accepted!', 'success');
          await loadAllSections();
          await refreshPendingCount();
        } catch (err) {
          showPanelNotification(err.message, 'error');
        }
      });
    });
    
    container.querySelectorAll('.crp-decline').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          await declineConnectionRequest(btn.dataset.id);
          showPanelNotification('Request declined.', 'info');
          await loadAllSections();
          await refreshPendingCount();
        } catch (err) {
          showPanelNotification(err.message, 'error');
        }
      });
    });
    
  } catch (err) {
    console.error('Error loading received requests:', err);
    container.innerHTML = '<div class="crp-error">Error loading requests</div>';
  }
}

// Load sent requests
async function loadSentRequests() {
  const container = document.getElementById('crp-sent');
  if (!container) return;
  
  container.innerHTML = '<div class="crp-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  
  try {
    const requests = await getPendingRequestsSent();
    
    if (requests.length === 0) {
      container.innerHTML = '<div class="crp-empty">No pending requests</div>';
      return;
    }
    
    container.innerHTML = requests.map(req => {
      const user = req.community || {};
      return `
        <div class="crp-item" data-id="${req.id}">
          <div class="crp-item-avatar">
            ${user.image_url 
              ? `<img src="${user.image_url}" alt="${user.name}" onerror="this.src='data:image/svg+xml,...'">` 
              : `<div class="crp-avatar-fallback">${getInitials(user.name)}</div>`
            }
          </div>
          <div class="crp-item-info">
            <div class="crp-item-name">${user.name || 'Unknown'}</div>
            <div class="crp-item-meta">Sent ${formatTimeAgo(req.created_at)}</div>
          </div>
          <div class="crp-item-actions">
            <button class="crp-cancel" data-id="${req.id}" title="Cancel request">
              <i class="fas fa-times"></i> Cancel
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Attach cancel listeners
    container.querySelectorAll('.crp-cancel').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          await cancelConnectionRequest(btn.dataset.id);
          showPanelNotification('Request cancelled.', 'info');
          await loadSentRequests();
        } catch (err) {
          showPanelNotification(err.message, 'error');
        }
      });
    });
    
  } catch (err) {
    console.error('Error loading sent requests:', err);
    container.innerHTML = '<div class="crp-error">Error loading requests</div>';
  }
}

// Load connected users
async function loadConnectedUsers() {
  const container = document.getElementById('crp-connected');
  if (!container) return;
  
  container.innerHTML = '<div class="crp-loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  
  try {
    const connections = await getAcceptedConnections();
    
    if (connections.length === 0) {
      container.innerHTML = '<div class="crp-empty">No connections yet</div>';
      return;
    }
    
    container.innerHTML = connections.map(conn => {
      const user = conn.community || {};
      return `
        <div class="crp-item connected" data-id="${conn.id}">
          <div class="crp-item-avatar">
            ${user.image_url 
              ? `<img src="${user.image_url}" alt="${user.name}" onerror="this.src='data:image/svg+xml,...'">` 
              : `<div class="crp-avatar-fallback">${getInitials(user.name)}</div>`
            }
          </div>
          <div class="crp-item-info">
            <div class="crp-item-name">${user.name || 'Unknown'}</div>
            <div class="crp-item-email">${user.email || ''}</div>
          </div>
          <div class="crp-item-actions">
            <button class="crp-remove" data-id="${conn.id}" title="Remove connection">
              <i class="fas fa-user-minus"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    // Attach remove listeners
    container.querySelectorAll('.crp-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this connection?')) return;
        
        try {
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
          await removeConnection(btn.dataset.id);
          showPanelNotification('Connection removed.', 'info');
          await loadConnectedUsers();
        } catch (err) {
          showPanelNotification(err.message, 'error');
        }
      });
    });
    
  } catch (err) {
    console.error('Error loading connections:', err);
    container.innerHTML = '<div class="crp-error">Error loading connections</div>';
  }
}

// Helper functions
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

function showPanelNotification(message, type = 'info') {
  const existing = document.querySelector('.crp-notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = `crp-notification ${type}`;
  notif.textContent = message;
  
  panelElement?.appendChild(notif);
  setTimeout(() => notif.remove(), 2500);
}

// Export
export default {
  initConnectionRequests,
  refreshPendingCount,
  toggleConnectionsPanel: window.toggleConnectionsPanel
};
