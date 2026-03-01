// Keyboard Shortcuts
// Quick navigation and actions

const shortcuts = {
  '/': focusSearch,
  'Escape': closeModals,
  '?': showShortcutsHelp,
  'n': newConnection,
  'm': openMessages,
  'r': refreshNetwork
};

function initKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyPress);
}

function handleKeyPress(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') {
      e.target.blur();
    }
    return;
  }
  
  const handler = shortcuts[e.key];
  if (handler) {
    e.preventDefault();
    handler();
  }
}

function focusSearch() {
  const search = document.getElementById('search-input');
  if (search) search.focus();
}

function closeModals() {
  const modals = document.querySelectorAll('.modal, .onboarding-modal, [id$="-modal"]');
  modals.forEach(modal => {
    if (modal.style.display !== 'none') {
      modal.style.display = 'none';
    }
  });
  
  const panels = document.querySelectorAll('.node-panel, .mentor-panel');
  panels.forEach(panel => {
    if (panel.style.display !== 'none') {
      panel.style.display = 'none';
    }
  });
}

function showShortcutsHelp() {
  const modal = document.createElement('div');
  modal.className = 'shortcuts-modal';
  modal.innerHTML = `
    <div class="shortcuts-content">
      <div class="shortcuts-header">
        <h2>Keyboard Shortcuts</h2>
        <button onclick="this.closest('.shortcuts-modal').remove()" class="close-btn">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="shortcuts-body">
        <div class="shortcut-item">
          <kbd>/</kbd>
          <span>Focus search</span>
        </div>
        <div class="shortcut-item">
          <kbd>Esc</kbd>
          <span>Close modals</span>
        </div>
        <div class="shortcut-item">
          <kbd>?</kbd>
          <span>Show this help</span>
        </div>
        <div class="shortcut-item">
          <kbd>n</kbd>
          <span>New connection</span>
        </div>
        <div class="shortcut-item">
          <kbd>m</kbd>
          <span>Open messages</span>
        </div>
        <div class="shortcut-item">
          <kbd>r</kbd>
          <span>Refresh network</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function newConnection() {
  const discoverBtn = document.getElementById('discover-tab-btn');
  if (discoverBtn) discoverBtn.click();
}

function openMessages() {
  if (typeof window.openMessagingInterface === 'function') {
    window.openMessagingInterface();
  }
}

function refreshNetwork() {
  const refreshBtn = document.getElementById('btn-refresh-network');
  if (refreshBtn) refreshBtn.click();
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initKeyboardShortcuts);
}
