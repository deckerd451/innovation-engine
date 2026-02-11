// ===============================================
// ENHANCED FILE: assets/js/utils.js (FINAL 2025)
// ===============================================
// Improvements:
//  - Animated toast notifications with fade effects
//  - Now supports: success, error, info, warning
//  - Reusable email validation + element clearing
//  - Auto-styled notification container
// ===============================================

/**
 * Show a temporary toast notification
 * @param {string} message - Text to display
 * @param {"success"|"error"|"info"|"warning"} type
 */
export function showNotification(message, type = "info") {
  let container = document.getElementById("notification-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "notification-container";
    Object.assign(container.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    });
    document.body.appendChild(container);
  }

  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.textContent = message;

  // Styles for each toast
  Object.assign(notif.style, {
    padding: "10px 16px",
    borderRadius: "8px",
    color: "#fff",
    fontWeight: "500",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
    opacity: "0",
    transform: "translateY(-10px)",
    transition: "all 0.3s ease",
    fontFamily: "Inter, sans-serif",
  });

  // Color by type
  const colors = {
    success: "#16a34a",   // green
    error: "#dc2626",     // red
    info: "#2563eb",      // blue
    warning: "#ca8a04",   // gold (NEW)
  };
  notif.style.background = colors[type] || colors.info;

  container.appendChild(notif);

  // Animate in
  requestAnimationFrame(() => {
    notif.style.opacity = "1";
    notif.style.transform = "translateY(0)";
  });

  // Remove after 4s
  setTimeout(() => {
    notif.style.opacity = "0";
    notif.style.transform = "translateY(-10px)";
    setTimeout(() => notif.remove(), 300);
  }, 4000);
}

/** Validate email format */
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/** Clear all children from an element */
export function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
