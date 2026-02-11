// /assets/js/notifications.js
let toastHost;

function ensureHost() {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.id = 'toast-host';
    Object.assign(toastHost.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: 10000, display: 'flex',
      flexDirection: 'column', gap: '8px', pointerEvents: 'none'
    });
    document.body.appendChild(toastHost);
  }
}

function spawnToast(message, tone = 'info', ttl = 3200) {
  ensureHost();
  const el = document.createElement('div');
  el.role = 'status';
  el.textContent = message;
  Object.assign(el.style, {
    pointerEvents: 'auto',
    padding: '10px 14px',
    borderRadius: '10px',
    border: '1px solid #2a2a2a',
    background: '#111',
    color: tone === 'error' ? '#ff7a7a' : tone === 'success' ? '#0bb' : '#eee',
    boxShadow: '0 6px 22px rgba(0,0,0,.35)',
    fontSize: '0.95rem',
    maxWidth: '420px'
  });
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), ttl);
}

export const showInfo    = (msg) => spawnToast(msg, 'info');
export const showSuccess = (msg) => spawnToast(msg, 'success');
export const showError   = (msg) => spawnToast(msg, 'error');

export default { showInfo, showSuccess, showError };
