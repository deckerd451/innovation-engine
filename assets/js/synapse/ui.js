// assets/js/synapse/ui.js

export function showSynapseNotification(message, type = "info") {
  const existing = document.querySelector(".synapse-notification");
  if (existing) existing.remove();

  const notif = document.createElement("div");
  notif.className = `synapse-notification ${type}`;
  notif.innerHTML = `
    <i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  document.getElementById("synapse-main-view")?.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

export function truncateName(name) {
  if (!name) return "?";
  const parts = name.split(" ");
  if (parts.length > 1) return `${parts[0]} ${parts[1].charAt(0)}.`;
  return name.length > 12 ? name.substring(0, 10) + "..." : name;
}
