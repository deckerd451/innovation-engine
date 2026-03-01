// UI Helper Functions
// Minimal console logging, user-facing feedback

// Loading States
function showLoadingState() {
  const loader = document.getElementById('dashboard-loader') || createLoader();
  loader.style.display = 'flex';
}

function hideLoadingState() {
  const loader = document.getElementById('dashboard-loader');
  if (loader) loader.style.display = 'none';
}

function createLoader() {
  const loader = document.createElement('div');
  loader.id = 'dashboard-loader';
  loader.innerHTML = `
    <div class="loader-content">
      <div class="spinner"></div>
      <p>Loading your network...</p>
    </div>
  `;
  loader.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  document.body.appendChild(loader);
  return loader;
}

// Error States
function showDashboardError(err) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'dashboard-error';
  errorDiv.innerHTML = `
    <div class="error-content">
      <i class="fas fa-exclamation-triangle"></i>
      <h3>Unable to Load Dashboard</h3>
      <p>Please check your connection and try again.</p>
      <button onclick="location.reload()" class="retry-btn">Reload Page</button>
    </div>
  `;
  document.body.appendChild(errorDiv);
}

function showSynapseError(message) {
  const container = document.getElementById('synapse-svg') || document.getElementById('synapse-main-view');
  if (!container) return;
  
  container.innerHTML = `
    <div class="synapse-error">
      <i class="fas fa-exclamation-circle"></i>
      <p>${message}</p>
      <button onclick="location.reload()" class="retry-btn">Refresh</button>
    </div>
  `;
}

function showSynapseEmpty() {
  const container = document.getElementById('synapse-svg') || document.getElementById('synapse-main-view');
  if (!container) return;
  
  container.innerHTML = `
    <div class="synapse-empty">
      <i class="fas fa-network-wired"></i>
      <h3>Start Building Your Network</h3>
      <p>Connect with innovators, mentors, and collaborators to see your network visualization.</p>
      <button onclick="document.getElementById('discover-tab-btn').click()" class="action-btn">Discover People</button>
    </div>
  `;
}

// Toast Notifications
function showErrorToast(message) {
  showToast(message, 'error');
}

function showSuccessToast(message) {
  showToast(message, 'success');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
    <span>${message}</span>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#00e0ff'};
    color: #fff;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: slideInRight 0.3s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Export to window
if (typeof window !== 'undefined') {
  window.showLoadingState = showLoadingState;
  window.hideLoadingState = hideLoadingState;
  window.showDashboardError = showDashboardError;
  window.showSynapseError = showSynapseError;
  window.showSynapseEmpty = showSynapseEmpty;
  window.showErrorToast = showErrorToast;
  window.showSuccessToast = showSuccessToast;
  window.showToast = showToast;
}
