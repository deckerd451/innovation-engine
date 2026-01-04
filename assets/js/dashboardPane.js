/* ==========================================================================
 * CharlestonHacks Innovation Engine — Dashboard Pane Controller (FIXED)
 * File: assets/js/dashboardPane.js
 *
 * Fixes:
 * - Filters button reliably opens Network Filters panel
 * - Avoids the prior SyntaxError caused by duplicate initNetworkFilters declarations
 * - Guards against missing DOM elements (no more null.style crashes)
 * ========================================================================== */

import { supabase as importedSupabase } from "./supabaseClient.js";
import { initNetworkFilters } from "./network-filters.js";

(function () {
  "use strict";

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    supabase: null,
    authUser: null,
    communityProfile: null,
    synapseInitialized: false,

    // filters
    filtersController: null,
    activeFilters: null,
  };

  // -----------------------------
  // DOM Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);

  function safeShow(el) {
    if (!el) return;
    el.classList.remove("hidden");
  }

  function safeHide(el) {
    if (!el) return;
    el.classList.add("hidden");
  }

  // -----------------------------
  // Notifications
  // -----------------------------
  function notify(msg, type = "info") {
    if (window.showNotification) return window.showNotification(msg, type);
    console.log(`[${type.toUpperCase()}] ${msg}`);
  }

  // -----------------------------
  // Filters wiring
  // -----------------------------
  function ensureFilters() {
    if (state.filtersController) return state.filtersController;

    // Hook filters into your graph logic:
    // If you already have a function to apply filters to Synapse, wire it here.
    state.filtersController = initNetworkFilters((payload) => {
      state.activeFilters = payload;

      // Broadcast for any listeners (synapse / search engine / etc.)
      window.dispatchEvent(new CustomEvent("synapse-apply-filters", { detail: payload }));
    });

    return state.filtersController;
  }

  async function toggleFilters() {
    try {
      const controller = ensureFilters();
      controller.toggle();
    } catch (error) {
      console.error("⚠️ Filters toggle failed:", error);
      notify("Filters failed to open — check console.", "error");
    }
  }

  // -----------------------------
  // UI Wiring
  // -----------------------------
  function wireBottomButtons() {
    const btnFilters = $("btn-filters");
    if (btnFilters) btnFilters.addEventListener("click", toggleFilters);
    else console.warn("⚠️ btn-filters not found — Filters button won't work.");
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function init() {
    state.supabase = window.supabase || importedSupabase || null;

    // Wire UI after DOM ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", wireBottomButtons, { once: true });
    } else {
      wireBottomButtons();
    }

    // Keep profile in state for filters payload
    window.addEventListener("profile-loaded", (e) => {
      state.authUser = e?.detail?.user || state.authUser;
      state.communityProfile = e?.detail?.profile || null;
    });

    console.log("✅ dashboardPane.js ready");
  }

  init();

  // Legacy global helpers (if HTML close buttons still call these)
  window.toggleFilters = toggleFilters;
})();
