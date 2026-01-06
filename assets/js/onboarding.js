// ================================================================
// CharlestonHacks Innovation Engine — SPATIAL DISCOVERY
// File: assets/js/onboarding.js
// ================================================================
// Philosophy: Learn by interacting, not being told
// No tutorials. No tours. Just spatial cues.
// ================================================================

console.log("%c🌐 Spatial Discovery Active", "color:#0ff; font-weight:bold;");

const DISCOVERY_KEY = "innovation_engine_first_visit";

const state = {
  isFirstVisit: false,
  userNodePulsing: false,
  discoveryComplete: false
};

// Check if this is truly the first visit
function isFirstVisit() {
  return !localStorage.getItem(DISCOVERY_KEY);
}

// Mark discovery as started (not completed)
function markVisitStarted() {
  if (!localStorage.getItem(DISCOVERY_KEY)) {
    localStorage.setItem(DISCOVERY_KEY, "started");
    state.isFirstVisit = true;
  }
}

// Mark discovery as naturally completed
function markDiscoveryComplete() {
  localStorage.setItem(DISCOVERY_KEY, "complete");
  state.discoveryComplete = true;
  console.log("🎯 Network understood through exploration");
}

// Pulse the user's own node to invite interaction
function pulseUserNode(userId) {
  if (!state.isFirstVisit || state.userNodePulsing) return;

  // Find user's node in the graph
  const userNode = document.querySelector(`[data-user-id="${userId}"]`) ||
                   document.querySelector('.synapse-node.current-user') ||
                   document.querySelector('#synapse-svg circle.user-node');

  if (!userNode) {
    console.log("User node not found, waiting...");
    setTimeout(() => pulseUserNode(userId), 500);
    return;
  }

  state.userNodePulsing = true;

  // Add subtle pulsing animation
  userNode.style.animation = "discoverPulse 2s ease-in-out infinite";
  userNode.style.transformOrigin = "center";

  // Inject keyframes if not exists
  if (!document.getElementById("discovery-keyframes")) {
    const style = document.createElement("style");
    style.id = "discovery-keyframes";
    style.textContent = `
      @keyframes discoverPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.85; }
      }
      @keyframes buttonPulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 4px 12px rgba(0,224,255,0.3);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 8px 24px rgba(0,224,255,0.6);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Remove pulse after 10 seconds or on click
  const removePulse = () => {
    userNode.style.animation = "";
    state.userNodePulsing = false;
  };

  userNode.addEventListener("click", removePulse, { once: true });
  setTimeout(removePulse, 10000);
}

// Pulse the Connect button to guide users
export function pulseConnectButton(duration = 15000) {
  const connectBtn = document.getElementById("btn-quickconnect");
  if (!connectBtn) {
    console.log("Connect button not found, waiting...");
    setTimeout(() => pulseConnectButton(duration), 500);
    return;
  }

  // Add pulsing animation
  connectBtn.style.animation = "buttonPulse 2s ease-in-out infinite";

  // Add glow effect
  connectBtn.style.boxShadow = "0 8px 24px rgba(0,224,255,0.6)";

  // Remove pulse after duration or on click
  const removePulse = () => {
    connectBtn.style.animation = "";
    connectBtn.style.boxShadow = "";
  };

  connectBtn.addEventListener("click", removePulse, { once: true });
  setTimeout(removePulse, duration);

  console.log("✨ Connect button pulsing to guide discovery");
}

// Detect meaningful interactions that show understanding
function trackDiscoveryProgress() {
  let interactionCount = 0;

  const meaningfulActions = [
    () => document.addEventListener("click", (e) => {
      // Clicked a node (not self)
      if (e.target.closest(".synapse-node") || e.target.closest("circle[data-user-id]")) {
        interactionCount++;
        console.log(`Discovery: Explored node (${interactionCount}/3)`);
      }
    }),

    () => document.addEventListener("input", (e) => {
      // Used search
      if (e.target.matches("#global-search, [placeholder*='Search']")) {
        interactionCount++;
        console.log(`Discovery: Used search (${interactionCount}/3)`);
      }
    }),

    () => window.addEventListener("conversationStarted", () => {
      // Started a conversation
      interactionCount++;
      console.log(`Discovery: Initiated connection (${interactionCount}/3)`);
    })
  ];

  meaningfulActions.forEach(fn => fn());

  // After 3 meaningful interactions, they understand
  const checkProgress = setInterval(() => {
    if (interactionCount >= 3 && !state.discoveryComplete) {
      markDiscoveryComplete();
      clearInterval(checkProgress);
    }
  }, 1000);
}

// Initialize spatial discovery
function init() {
  markVisitStarted();

  if (state.isFirstVisit) {
    console.log("🌐 First visit detected - spatial cues active");

    // Wait for profile to load, then pulse user's node AND connect button
    window.addEventListener("profile-loaded", (e) => {
      const userId = e.detail?.userId || e.detail?.id;
      if (userId) {
        setTimeout(() => pulseUserNode(userId), 1000);
      }
      // Also pulse the Connect button to start the discovery journey
      setTimeout(() => pulseConnectButton(15000), 2000);
    });

    // Track natural discovery
    trackDiscoveryProgress();
  }
}

// Export for manual reset if needed
export function resetDiscovery() {
  localStorage.removeItem(DISCOVERY_KEY);
  state.isFirstVisit = false;
  state.discoveryComplete = false;
  console.log("🔄 Discovery reset");
}

export function shouldShowOnboarding() {
  return false; // Never show tutorial overlay
}

export function startOnboarding() {
  // No-op: spatial discovery handles this
}

export function resetOnboarding() {
  resetDiscovery();
}

// Auto-initialize
if (typeof window !== "undefined") {
  window.SpatialDiscovery = { init, reset: resetDiscovery, pulseConnectButton };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

console.log("✅ Spatial Discovery ready");
