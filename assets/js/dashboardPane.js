/* ==========================================================================
 * CharlestonHacks Innovation Engine — Dashboard Controller (2026 rewrite)
 * File: assets/js/dashboardPane.js
 *
 * What this controller guarantees:
 * - Bottom bar buttons always do something deterministic
 * - Filters / Legend / BBS work consistently (no dead buttons)
 * - Profile button opens the real editor (openProfileEditor) when available
 * - Global open/close modal functions remain for HTML onclick close buttons
 * - Safe, one-time initialization with helpful console diagnostics
 * ========================================================================== */

import { supabase as importedSupabase } from "./supabaseClient.js";

// Feature modules
import { toggleLegend } from "./graph-legend.js";
import { initNetworkFilters, toggleFilterPanel } from "./network-filters.js";
import { initBBS } from "./bbs.js";

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    initialized: false,
    supabase: importedSupabase || null,
    authUser: null,
    communityProfile: null,
    filtersInitialized: false,
  };

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  function log(tag, ...args) {
    console.log(`%c${tag}`, "color:#0ff;font-weight:bold;", ...args);
  }
  function warn(tag, ...args) {
    console.warn(`%c${tag}`, "color:#ffb000;font-weight:bold;", ...args);
  }
  function err(tag, ...args) {
    console.error(`%c${tag}`, "color:#ff4d4d;font-weight:bold;", ...args);
  }

  // ---------------------------------------------------------------------------
  // Modal helpers (generic)
  // ---------------------------------------------------------------------------
  function openModal(id) {
    const modal = $(id);
    if (!modal) {
      warn("[Modal] Missing modal:", id);
      return;
    }
    modal.classList.add("active");
    modal.style.display = "block";
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove("active");
    // keep display:none for older CSS setups
    modal.style.display = "none";
  }

  // Keep these globals for HTML close buttons (existing markup expects them)
  function wireGlobalModalAPI() {
    window.openMessagesModal = () => openModal("messages-modal");
    window.closeMessagesModal = () => closeModal("messages-modal");

    window.openProjectsModal = () => openModal("projects-modal");
    window.closeProjectsModal = () => closeModal("projects-modal");

    window.openEndorsementsModal = () => openModal("endorsements-modal");
    window.closeEndorsementsModal = () => closeModal("endorsements-modal");

    // Profile modal (container modal) — but the real editor is openProfileEditor()
    window.openProfileModal = () => openModal("profile-modal");
    window.closeProfileModal = () => closeModal("profile-modal");

    // Optional: Quick Connect if present
    window.openQuickConnectModal = () => openModal("quick-connect-modal");
    window.closeQuickConnectModal = () => closeModal("quick-connect-modal");
  }

  // ---------------------------------------------------------------------------
  // Ensure required anchors exist (BBS modal, etc.)
  // ---------------------------------------------------------------------------
  function ensureModalAnchor(id) {
    if ($(id)) return;
    const div = document.createElement("div");
    div.id = id;
    document.body.appendChild(div);
    log("[UI] Created missing anchor:", `#${id}`);
  }

  // ---------------------------------------------------------------------------
  // Feature initialization
  // ---------------------------------------------------------------------------
  function initFiltersIfNeeded() {
    if (state.filtersInitialized) return;

    // Network filters expects window.supabase in your current implementation.
    // We maintain it here as a stable bridge.
    if (!window.supabase && state.supabase) window.supabase = state.supabase;

    // Provide a callback hook for your graph/synapse.
    // If you have a function like window.applyNetworkFilters(filters), we call it.
    initNetworkFilters((filters) => {
      try {
        // 1) Call optional graph hook
        if (typeof window.applyNetworkFilters === "function") {
          window.applyNetworkFilters(filters);
        }

        // 2) Broadcast event for listeners (synapse, search, etc.)
        window.dispatchEvent(
          new CustomEvent("network-filters-changed", { detail: { filters } })
        );
      } catch (e) {
        warn("[Filters] onChange handler error:", e?.message || e);
      }
    });

    state.filtersInitialized = true;
    log("[Filters] Initialized");
  }

  // ---------------------------------------------------------------------------
  // Deterministic button actions
  // ---------------------------------------------------------------------------
  async function handleOpenProfile() {
    // Your profile editor UI is injected by openProfileEditor() (defined elsewhere).
    // If it exists, it should be the primary experience.
    if (typeof window.openProfileEditor === "function") {
      window.openProfileEditor();
      return;
    }

    // Fallback: open the modal shell with a helpful message
    openModal("profile-modal");

    const content = $("modal-profile-content");
    if (content) {
      content.innerHTML = `
        <div style="padding:1.25rem; color:#fff;">
          <h3 style="margin:0 0 .5rem 0; color:#00e0ff;">Profile</h3>
          <p style="opacity:.85; margin:.25rem 0 0 0;">
            Profile editor wasn’t loaded on this page.
          </p>
          <p style="opacity:.75; margin:.5rem 0 0 0; font-size:.9rem;">
            Tip: ensure the profile editor module is included before dashboardPane.js,
            or move the editor into a dedicated module and import it here.
          </p>
        </div>
      `;
    }
  }

  async function handleOpenMessages() {
    window.openMessagesModal?.();
  }

  async function handleOpenProjects() {
    window.openProjectsModal?.();
  }

  async function handleOpenEndorsements() {
    window.openEndorsementsModal?.();
  }

  async function handleToggleFilters() {
    initFiltersIfNeeded();
    toggleFilterPanel();
  }

  async function handleToggleLegend() {
    toggleLegend();
  }

  async function handleOpenBBS() {
    // Guarantee anchor exists
    ensureModalAnchor("bbs-modal");

    // Your BBS init injects UI into #bbs-modal and shows it.
    try {
      await initBBS();
    } catch (e) {
      err("[BBS] Failed to open:", e);
    }
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  function bindClick(id, fn) {
    const el = $(id);
    if (!el) {
      warn("[UI] Missing button:", `#${id}`);
      return;
    }
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  function wireBottomBarButtons() {
    bindClick("btn-messages", handleOpenMessages);
    bindClick("btn-projects", handleOpenProjects);
    bindClick("btn-endorsements", handleOpenEndorsements);
    bindClick("btn-bbs", handleOpenBBS);
    bindClick("btn-profile", handleOpenProfile);

    // Filters / Legend
    bindClick("btn-filters", handleToggleFilters);
    bindClick("btn-legend", handleToggleLegend);

    log("[UI] Bottom bar wired");
  }

  // Optional: overlay-click outside to close (only if your markup supports it)
  function wireOverlayDismiss(modalId, innerSelector) {
    const modal = $(modalId);
    if (!modal) return;

    modal.addEventListener("click", (e) => {
      const inner = modal.querySelector(innerSelector);
      if (!inner) return;
      if (!inner.contains(e.target)) closeModal(modalId);
    });
  }

  function wireModalDismissals() {
    wireOverlayDismiss("messages-modal", ".messages-modal, .modal, .panel");
    wireOverlayDismiss("projects-modal", ".projects-modal, .modal, .panel");
    wireOverlayDismiss("endorsements-modal", ".endorsements-modal, .modal, .panel");
    wireOverlayDismiss("profile-modal", ".profile-modal, .modal, .panel");
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function init() {
    if (state.initialized) return;
    state.initialized = true;

    // Bridge supabase to window for modules expecting it
    if (!window.supabase && state.supabase) window.supabase = state.supabase;

    wireGlobalModalAPI();
    wireBottomBarButtons();
    wireModalDismissals();

    // Create anchors that feature modules assume exist
    ensureModalAnchor("bbs-modal");

    log("🚀 Dashboard controller ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
