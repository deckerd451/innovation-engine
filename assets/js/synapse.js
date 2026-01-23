// assets/js/synapse.js
// START WITH SYNAPSE (CIRCLES) VIEW - Switch to cards via Views button
// Compatibility barrel: keeps your existing imports working,
// while synapse logic lives in /assets/js/synapse/* modules.

// Default to Synapse (circles) view
export {
  initSynapseView,
  refreshSynapseConnections,
  showSynapseNotification,
  getSynapseStats,
  showConnectPathways,
  clearConnectPathways,
  getRecommendations,
  toggleFullCommunityView
} from "./synapse/core.js?v=6";

// Legacy exports for backward compatibility
export {
  setupSynapseRealtime
} from "./synapse/realtime.js";

// Theme cards functionality (available when user switches to cards view)
// Not imported by default - loaded dynamically via theme-strategy-toggle.js
