// ================================================================
// Synapse Initialization Helper
// ================================================================
// Ensures synapse loads reliably regardless of auth timing issues

// Prevent duplicate initialization
if (window.__SYNAPSE_INIT_HELPER_LOADED__) {
  console.log("⚠️ Synapse initialization helper already loaded");
} else {
  window.__SYNAPSE_INIT_HELPER_LOADED__ = true;

  let synapseInitialized = false;
  let synapseInitPromise = null;

  // Ensure synapse is initialized (idempotent)
  window.ensureSynapseInitialized = async function () {
    // ✅ If already initialized, still broadcast readiness for UI modules
    if (synapseInitialized) {
      console.log("✅ Synapse already initialized");

      window.__SYNAPSE_READY__ = true;
      window.dispatchEvent(new CustomEvent("synapse-ready"));

      return true;
    }

    if (synapseInitPromise) {
      console.log("⏳ Synapse initialization in progress, waiting...");
      return synapseInitPromise;
    }

    synapseInitPromise = initializeSynapse();
    return synapseInitPromise;
  };

  async function initializeSynapse() {
    console.log("🧠 Starting reliable synapse initialization...");

    // Wait for required dependencies
    const dependencies = await waitForDependencies();
    if (!dependencies.success) {
      console.error("❌ Synapse dependencies not available:", dependencies.missing);
      return false;
    }

    try {
      // Try multiple initialization paths
      let initialized = false;

      // Path 1: Direct module import (preferred)
      try {
        console.log("🔄 Attempting synapse init via module import...");
        const mod = await import("./synapse.js");
        if (typeof mod.initSynapseView === "function") {
          await mod.initSynapseView();
          initialized = true;
          console.log("✅ Synapse initialized via module import");
        }
      } catch (e) {
        console.warn("⚠️ Module import failed:", e);
      }

      // Path 2: Global function (fallback)
      if (!initialized && typeof window.initSynapseView === "function") {
        console.log("🔄 Attempting synapse init via global function...");
        await window.initSynapseView();
        initialized = true;
        console.log("✅ Synapse initialized via global function");
      }

      // Path 3: Dashboard pane initialization (last resort)
      if (!initialized && window.dashboardPane?.initSynapseOnce) {
        console.log("🔄 Attempting synapse init via dashboard pane...");
        await window.dashboardPane.initSynapseOnce();
        initialized = true;
        console.log("✅ Synapse initialized via dashboard pane");
      }

      if (initialized) {
        synapseInitialized = true;
        console.log("🎉 Synapse initialization completed successfully!");

        // ✅ Persist readiness signal + emit event for other modules
        window.__SYNAPSE_READY__ = true;
        window.dispatchEvent(new CustomEvent("synapse-ready"));

        // 🔄 Refresh connection status to ensure UI is up-to-date
        setTimeout(async () => {
          if (typeof window.refreshSynapseConnections === 'function') {
            console.log("🔄 Refreshing connection status after init...");
            await window.refreshSynapseConnections();
            console.log("✅ Connection status refreshed");
          }
        }, 1000);

        return true;
      } else {
        throw new Error("No synapse initialization method available");
      }
    } catch (error) {
      console.error("❌ Synapse initialization failed:", error);

      // Reset promise so we can retry
      synapseInitPromise = null;

      // Show user-friendly error
      showSynapseError(error);
      return false;
    }
  }

  async function waitForDependencies(maxWait = 10000) {
    const start = Date.now();
    const missing = [];

    while (Date.now() - start < maxWait) {
      missing.length = 0; // Clear array

      // Check required dependencies
      if (!window.supabase) missing.push("supabase");
      if (!window.d3) missing.push("d3");
      if (!document.getElementById("synapse-svg")) missing.push("synapse-svg");

      // Use boot gate to check auth (event-driven, not polling)
      if (!window.bootGate?.isAuthenticated()) missing.push("authenticated-user");

      if (missing.length === 0) {
        return { success: true, missing: [] };
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return { success: false, missing };
  }

  function showSynapseError(error) {
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, rgba(255,107,107,0.1), rgba(255,107,107,0.2));
    border: 2px solid rgba(255,107,107,0.4);
    border-radius: 12px;
    padding: 2rem;
    z-index: 10000;
    backdrop-filter: blur(10px);
    max-width: 500px;
    text-align: center;
    color: white;
  `;

    errorDiv.innerHTML = `
    <div style="font-size: 3rem; color: #ff6b6b; margin-bottom: 1rem;">
      <i class="fas fa-exclamation-triangle"></i>
    </div>
    <h3 style="color: #ff6b6b; margin-bottom: 1rem;">Network Visualization Error</h3>
    <p style="color: rgba(255,255,255,0.8); margin-bottom: 1.5rem;">
      The network visualization failed to load. This might be due to a connection issue.
    </p>
    <div style="display: flex; gap: 1rem; justify-content: center;">
      <button onclick="location.reload()" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
        <i class="fas fa-sync-alt"></i> Reload Page
      </button>
      <button onclick="this.parentElement.parentElement.remove()" style="padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; cursor: pointer;">
        Dismiss
      </button>
    </div>
    <div style="margin-top: 1rem; font-size: 0.8rem; color: rgba(255,255,255,0.5);">
      Error: ${error.message}
    </div>
  `;

    document.body.appendChild(errorDiv);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (errorDiv.parentElement) {
        errorDiv.remove();
      }
    }, 10000);
  }

  // ============================================================================
  // EVENT-DRIVEN INITIALIZATION (NO RETRY LOOPS)
  // ============================================================================

  // Wait for authentication before initializing Synapse
  if (window.bootGate) {
    window.bootGate.whenAuthenticated((user) => {
      console.log('🧠 [SYNAPSE] User authenticated, initializing Synapse...');
      setTimeout(() => window.ensureSynapseInitialized(), 500);
    });
  } else {
    console.warn('⚠️ Boot gate not available, falling back to profile-loaded event');
    window.addEventListener("profile-loaded", () => {
      setTimeout(() => window.ensureSynapseInitialized(), 500);
    });
  }

  console.log("✅ Synapse initialization helper loaded");
} // End of initialization guard
