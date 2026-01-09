// assets/js/synapse/realtime.js
let channel = null;
let debounce = null;

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
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      try { onRefresh?.(); } catch (_) {}
    }, 250);
  };

  channel = sb
    .channel("synapse-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleRefresh)
    // Theme circles (new)
    .on("postgres_changes", { event: "*", schema: "public", table: "theme_circles" }, scheduleRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "theme_participants" }, scheduleRefresh)
    .subscribe();

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

export function getSynapseRealtimeChannel() {
  return channel;
}
