// assets/js/synapse/themes.js
import { showSynapseNotification, escapeHtml } from "./ui.js";

// Minimal “theme node” shape used in rendering.
export async function fetchActiveThemes(supabase) {
  // MVP query: you can refine status/is_active later.
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("theme_circles")
    .select("id, title, tags, created_at, expires_at")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("⚠️ fetchActiveThemes failed:", error);
    return [];
  }

  return (data || []).map(t => ({
    id: `theme:${t.id}`,
    theme_id: t.id,
    type: "theme",
    name: t.title,
    title: t.title,
    tags: t.tags || [],
    expires_at: t.expires_at,
    // Position near center (will be stabilized by simulation if you choose)
    x: window.innerWidth * 0.5 + (Math.random() * 120 - 60),
    y: window.innerHeight * 0.5 + (Math.random() * 120 - 60),
  }));
}

export async function getThemeInterestCount(supabase, themeId) {
  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from("theme_participants")
    .select("id", { count: "exact", head: true })
    .eq("theme_id", themeId)
    .gt("expires_at", nowIso);

  if (error) return 0;
  return count || 0;
}

export async function markInterested(supabase, { themeId, communityId, days = 7 }) {
  const expires = new Date(Date.now() + days * 86400000).toISOString();

  const { error } = await supabase
    .from("theme_participants")
    .insert([{
      theme_id: themeId,
      community_id: communityId,
      signal: "interested",
      expires_at: expires
    }]);

  if (error) throw error;
}

export function renderThemeOverlayCard({ themeNode, interestCount, onInterested }) {
  // Lightweight card so we don’t depend on node-panel changes yet
  const existing = document.getElementById("synapse-theme-card");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.id = "synapse-theme-card";
  card.className = "synapse-profile-card"; // reuse your existing styling class
  card.style.maxWidth = "360px";

  card.innerHTML = `
    <button class="synapse-card-close" aria-label="Close">
      <i class="fas fa-times"></i>
    </button>

    <div class="synapse-card-header">
      <div class="synapse-card-avatar-fallback" style="background: rgba(0,224,255,0.12); border: 1px solid rgba(0,224,255,0.35);">
        ✨
      </div>
      <div class="synapse-card-info">
        <h3>${escapeHtml(themeNode.title)}</h3>
        <span class="synapse-availability">Theme Circle</span>
      </div>
    </div>

    <div class="synapse-card-bio">
      <strong>${interestCount}</strong> interested
      ${themeNode.tags?.length ? `<div style="margin-top:8px; opacity:.9;">Tags: ${escapeHtml(themeNode.tags.join(", "))}</div>` : ""}
    </div>

    <div class="synapse-card-actions">
      <button class="synapse-connect-btn" id="theme-interested-btn">
        <i class="fas fa-star"></i> Interested
      </button>
    </div>
  `;

  card.querySelector(".synapse-card-close")?.addEventListener("click", () => card.remove());
  card.querySelector("#theme-interested-btn")?.addEventListener("click", onInterested);

  document.getElementById("synapse-main-view")?.appendChild(card);
}
