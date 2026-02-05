// assets/js/synapse/realtime.js
let channel = null;
let debounce = null;

// ✅ EGRESS OPTIMIZATION: Prevent excessive reloads (50% reduction in realtime-triggered fetches)
let lastReload = 0;
const RELOAD_COOLDOWN = 5 * 60 * 1000; // 5 minutes between full reloads
const DEBOUNCE_DELAY = 2000; // 2 seconds (increased from 250ms)

export function setupSynapseRealtime(sb, onRefresh) {
  if (!sb?.channel) return null;

  // Realtime channel duplication guard - check global first
  if (window.__IE_SYNAPSE_RT_CHANNEL__) {
    console.log("⚠️ Synapse realtime channel already exists globally, reusing...");
    channel = window.__IE_SYNAPSE_RT_CHANNEL__;
    return channel;
  }

  if (channel) return channel;

  const scheduleRefresh = () => {
    const now = Date.now();
    
    // ✅ COOLDOWN CHECK: Skip if we reloaded recently (unless user-initiated)
    if (now - lastReload < RELOAD_COOLDOWN) {
      const remainingMinutes = Math.ceil((RELOAD_COOLDOWN - (now - lastReload)) / 60000);
      console.log(`⏱️ Synapse reload skipped (cooldown active, ${remainingMinutes}min remaining)`);
      return;
    }

    clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log("🔄 Synapse realtime refresh triggered");
      lastReload = Date.now();
      try { onRefresh?.(); } catch (_) {}
    }, DEBOUNCE_DELAY);
  };

  channel = sb
    .channel("synapse-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
    // Theme circles (new)
    .on("postgres_changes", { event: "*", schema: "public", table: "theme_circles" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "theme_participants" }, scheduleRefresh)
    // Organizations
    .on("postgres_changes", { event: "*", schema: "public", table: "organizations" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "organization_followers" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "organization_members" }, scheduleRefresh)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("✅ Synapse realtime active (with 5min cooldown)");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.log("ℹ️ Synapse realtime unavailable, using manual refresh");
      }
    });

  // Store channel globally to prevent duplication
  window.__IE_SYNAPSE_RT_CHANNEL__ = channel;

  // Cleanup on page unload
  if (!window.__IE_SYNAPSE_RT_CLEANUP_REGISTERED__) {
    window.__IE_SYNAPSE_RT_CLEANUP_REGISTERED__ = true;
    window.addEventListener("beforeunload", () => {
      try {
        if (window.__IE_SYNAPSE_RT_CHANNEL__) {
          sb?.removeChannel(window.__IE_SYNAPSE_RT_CHANNEL__);
          window.__IE_SYNAPSE_RT_CHANNEL__ = null;
        }
      } catch (e) {
        console.warn("Failed to cleanup synapse channel:", e);
      }
    });
  }

  return channel;
}

// ✅ NEW: Allow user-initiated refresh to bypass cooldown
export function forceRefreshSynapse() {
  console.log("🔄 Force refresh triggered (bypassing cooldown)");
  lastReload = 0; // Reset cooldown
  clearTimeout(debounce);
  // Trigger refresh immediately if callback is available
  if (window.__IE_SYNAPSE_REFRESH_CALLBACK__) {
    window.__IE_SYNAPSE_REFRESH_CALLBACK__();
  }
}

export function getSynapseRealtimeChannel() {
  return channel;
}
