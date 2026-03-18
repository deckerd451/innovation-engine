/**
 * Lightweight notification utility.
 * Provides window.showSynapseNotification globally (previously from synapse/ui.js).
 */
(function () {
  if (typeof window.showSynapseNotification === 'function') return;

  window.showSynapseNotification = function showSynapseNotification(message, type = 'info', duration = 3000) {
    const colors = {
      success: { bg: 'rgba(0, 255, 136, 0.9)', color: '#000' },
      error:   { bg: 'rgba(255, 107, 107, 0.9)', color: '#000' },
      warning: { bg: 'rgba(255, 215, 0, 0.9)', color: '#000' },
      info:    { bg: 'rgba(0, 224, 255, 0.9)', color: '#fff' }
    };
    const style = colors[type] || colors.info;

    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: 10001;
      background: ${style.bg}; color: ${style.color};
      padding: 1rem 1.5rem; border-radius: 8px; font-weight: bold;
      backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: _snSlideIn 0.3s ease-out;
    `;
    el.textContent = message;
    document.body.appendChild(el);

    setTimeout(() => {
      el.style.animation = '_snSlideOut 0.3s ease-in';
      setTimeout(() => el.remove(), 300);
    }, duration);
  };

  // Inject keyframes once
  if (!document.getElementById('synapse-notification-styles')) {
    const s = document.createElement('style');
    s.id = 'synapse-notification-styles';
    s.textContent = `
      @keyframes _snSlideIn { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } }
      @keyframes _snSlideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100%); } }
    `;
    document.head.appendChild(s);
  }
})();
