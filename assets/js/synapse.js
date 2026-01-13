// assets/js/synapse.js
// Compatibility barrel: keeps your existing imports working,
// while synapse logic lives in /assets/js/synapse/* modules.

export {
  initSynapseView,
  setupSynapseRealtime,
  refreshSynapseConnections,
  getSynapseStats,
  showSynapseNotification,
  showConnectPathways,
  clearConnectPathways,
  getRecommendations,
  // Theme API (new)
  refreshThemeCircles
} from "./synapse/core.js?v=3";
