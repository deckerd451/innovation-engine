// assets/js/synapse.js
// NEW THEME CARDS STRATEGY - Updated to use core-cards.js
// Compatibility barrel: keeps your existing imports working,
// while synapse logic lives in /assets/js/synapse/* modules.

export {
  initSynapseView,
  refreshSynapseConnections,
  showSynapseNotification,
  toggleThemeDisplayMode,
  toggleFullCommunityView
} from "./synapse/core-cards.js";

// Legacy exports for backward compatibility
export {
  setupSynapseRealtime
} from "./synapse/realtime.js";

export {
  getSynapseStats,
  showConnectPathways,
  clearConnectPathways,
  getRecommendations
} from "./synapse/core.js?v=6";
