// assets/js/synapse/realtime.js
let channel = null;
let debounce = null;

export function setupSynapseRealtime(sb, onRefresh) {
  if (!sb?.channel) return null;
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

  return channel;
}

export function getSynapseRealtimeChannel() {
  return channel;
}
