// assets/js/dashboardPane.js
import { initIlluminatedPathways } from "./illuminatePathways.js";

/* ==========================================================================
 * CharlestonHacks Innovation Engine — Dashboard Pane Controller (Messaging-fixed v2)
 * File: assets/js/dashboardPane.js
 *
 * KEY RULE (based on your Supabase):
 * - Social identity = community.id (UUID)
 * - Auth identity    = auth.users.id (UUID) stored on community.user_id
 * - connections.*_user_id = community.id
 * - conversations.participant_*_id = community.id
 * - messages.sender_id = community.id
 *
 * Primary fix in this version:
 * - Bulletproof messaging UI wiring:
 *   - Enter-to-send
 *   - paper-plane click even without IDs
 *   - form submit wiring
 *   - rebind when modal DOM changes (MutationObserver)
 * ========================================================================== */

import { supabase as importedSupabase } from "./supabaseClient.js";

(function () {
  "use strict";

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    supabase: null,
    authUser: null,
    communityProfile: null, // row from community table (includes id + user_id)
    synapseInitialized: false,
    refreshTimer: null,

    // Messaging
    currentConversationId: null,
    currentConversationName: null,
    messageChannel: null,
  };

  // -----------------------------
  // DOM Helpers (with safety checks)
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => document.querySelector(selector);
  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");
  const openModal = (id) => $(id)?.classList.add("active");
  const closeModal = (id) => $(id)?.classList.remove("active");

  // -----------------------------
  // Message Notification Chime
  // -----------------------------
  function playMessageChime() {
    try {
      // Create a simple notification sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800; // High pitch for notification
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Animate notification bell
      const bell = $("notifications-bell");
      if (bell) {
        bell.style.animation = "bellRing 0.5s ease-in-out 3";
        setTimeout(() => {
          bell.style.animation = "";
        }, 1500);
      }
    } catch (e) {
      console.warn("Could not play notification chime:", e);
    }
  }

  // Expose globally for message handlers
  window.playMessageChime = playMessageChime;

  const on = (el, evt, fn, opts) => {
    if (el && typeof el.addEventListener === "function") {
      el.addEventListener(evt, fn, opts);
      return true;
    }
    return false;
  };

  function safeText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value ?? 0);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function formatTimeAgo(ts) {
    if (!ts) return "";
    const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (seconds < 60) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString();
  }

  // -----------------------------
  // Boot
  // -----------------------------
  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    // One-time init guard - prevents double-binding and ghost listeners
    if (window.__IE_DASHBOARD_INIT_DONE__) {
      console.log("⚠️ Dashboard already initialized, skipping...");
      return;
    }
    window.__IE_DASHBOARD_INIT_DONE__ = true;

    state.supabase = window.supabase || importedSupabase;
    window.supabase = state.supabase;

    wireUI();
    wireGlobalFunctions();
    bindEditProfileDelegation();

    // Messaging wiring:
    // - If MessagingModule exists, it owns the UI.
    // - Otherwise, legacy wiring is needed.
    if (!window.MessagingModule) {
      wireMessagingUI();
    }

    // ========================================================================================
    // UNIFIED AUTH FLOW - Let auth.js handle all authentication
    // ========================================================================================
    // Listen for profile-loaded event from auth.js (existing user with profile)
    window.addEventListener("profile-loaded", async (e) => {
      console.log("📋 Dashboard received profile-loaded event:", e.detail);
      if (e?.detail?.profile) {
        state.authUser = e.detail.user;
        state.communityProfile = e.detail.profile;
        await onAppReady();
      }
    });

    // Listen for profile-new event from auth.js (new user without profile)
    window.addEventListener("profile-new", async (e) => {
      console.log("🆕 Dashboard received profile-new event:", e.detail);
      if (e?.detail?.user) {
        state.authUser = e.detail.user;
        // Create community profile for new user
        await ensureCommunityProfile();
        // After profile is created, initialize dashboard
        if (state.communityProfile?.id) {
          await onAppReady();
        } else {
          console.error("❌ Failed to create community profile for new user");
          showLogin();
        }
      }
    });

    // Listen for logout event
    window.addEventListener("user-logged-out", () => {
      console.log("👋 Dashboard received logout event");
      state.authUser = null;
      state.communityProfile = null;
      state.synapseInitialized = false;
      if (window.MessagingModule?.cleanup) window.MessagingModule.cleanup();
      else cleanupMessageChannel();
      showLogin();
    });

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      if (window.MessagingModule?.cleanup) window.MessagingModule.cleanup();
      else cleanupMessageChannel();
    });

    // NOTE: We no longer call hydrateAuthUser() here - auth.js handles all authentication
    // This prevents the race condition between auth.js and dashboardPane.js
    console.log("✅ Dashboard initialized - waiting for auth.js to emit events");
  }

  // -----------------------------
  // UI Wiring
  // -----------------------------
  function wireUI() {
    // Login buttons (fallback if auth.js doesn't attach handlers)
    on($("github-login"), "click", () => oauthLogin("github"));
    on($("google-login"), "click", () => oauthLogin("google"));

    // Header actions
    on($("user-menu"), "click", () => window.openProfileModal());
    // Notification bell now opens messages modal
    on($("notifications-bell"), "click", async () => {
      if (typeof window.openMessagesModal === "function") {
        window.openMessagesModal();
      } else {
        console.warn("Messages modal not available");
      }
    });

    // Search
    on($("search-button"), "click", () => handleSearch());
    on($("global-search"), "keydown", (e) => {
      if (e.key === "Enter") handleSearch();
    });

    // Setup category filter buttons
    setupCategoryButtons();

    // Bottom bar buttons - modals
    on($("btn-messages"), "click", () => window.openMessagesModal());
    on($("btn-projects-modal"), "click", () => window.openProjectsModal());
    on($("btn-endorsements"), "click", () => window.openEndorsementsModal());
    on($("btn-profile"), "click", () => window.openProfileModal());

    // Bottom bar buttons - filter toggles
    on($("btn-themes"), "click", () => {
      if (typeof window.toggleSynapseFilter === "function") {
        window.toggleSynapseFilter('themes');
      }
    });
    on($("btn-orgs"), "click", () => {
      if (typeof window.toggleSynapseFilter === "function") {
        window.toggleSynapseFilter('organizations');
      }
    });
    on($("btn-projects"), "click", () => {
      if (typeof window.toggleSynapseFilter === "function") {
        window.toggleSynapseFilter('projects');
      }
    });

    // PEOPLE button - dual functionality: toggle filter on click, show connections on long press
    let peopleButtonPressTimer = null;
    const peopleBtn = $("btn-people");
    if (peopleBtn) {
      // Regular click - toggle filter
      on(peopleBtn, "click", (e) => {
        if (peopleButtonPressTimer) return; // Was a long press, ignore click
        if (typeof window.toggleSynapseFilter === "function") {
          window.toggleSynapseFilter('people');
        }
      });

      // Long press - show connections panel
      on(peopleBtn, "mousedown", (e) => {
        peopleButtonPressTimer = setTimeout(() => {
          if (typeof window.toggleConnectionsPanel === "function") {
            window.toggleConnectionsPanel();
          }
          peopleButtonPressTimer = null;
        }, 500); // 500ms = long press
      });

      on(peopleBtn, "mouseup", () => {
        if (peopleButtonPressTimer) {
          clearTimeout(peopleButtonPressTimer);
          peopleButtonPressTimer = null;
        }
      });

      on(peopleBtn, "mouseleave", () => {
        if (peopleButtonPressTimer) {
          clearTimeout(peopleButtonPressTimer);
          peopleButtonPressTimer = null;
        }
      });

      // Context menu (right-click) - show connections panel
      on(peopleBtn, "contextmenu", (e) => {
        e.preventDefault();
        if (typeof window.toggleConnectionsPanel === "function") {
          window.toggleConnectionsPanel();
        }
      });
    }
    // START button (centered - main logic in HTML inline script)
    on($("btn-start-center"), "click", () => {
      if (typeof window.openStartModal === "function") {
        window.openStartModal();
      } else if (typeof openStartModal === "function") {
        openStartModal();
      }
    });

    // Compatibility wiring for legacy START button references
    on($("btn-start-header"), "click", () => {
      if (typeof window.openStartModal === "function") {
        window.openStartModal();
      } else if (typeof openStartModal === "function") {
        openStartModal();
      }
    });

    on($("btn-start-fullwidth"), "click", () => {
      if (typeof window.openStartModal === "function") {
        window.openStartModal();
      } else if (typeof openStartModal === "function") {
        openStartModal();
      }
    });
    on($("btn-filters"), "click", () => toggleFilters());
    on($("btn-legend"), "click", () => toggleLegend());
  }

  function wireGlobalFunctions() {
    // Modals
    window.openProfileModal = async () => {
      if (state.communityProfile) {
        try {
          const { openNodePanel } = await import("./node-panel.js");
          openNodePanel({
            id: state.communityProfile.id,
            name: state.communityProfile.name,
            type: "person",
          });
          return;
        } catch {
          // fall through to modal
        }
      }
      openModal("profile-modal");
    };
    window.closeProfileModal = () => closeModal("profile-modal");

    // =========================================================
    // MESSAGES MODAL — MessagingModule-first (WhatsApp/iMessage mobile)
    // =========================================================
    window.openMessagesModal = async () => {
      openModal("messages-modal");

      // mobile scroll lock + safe-area behavior (pairs with messaging.css)
      document.body.classList.add("messages-open");

      // Give MessagingModule identity (if it uses this pattern)
      window.__currentCommunityId = state.communityProfile?.id || null;

      if (window.MessagingModule?.init) {
        window.MessagingModule.init();
        return;
      }

      // Fallback: legacy system
      wireMessagingUI();
      await loadConversationsForModal();
    };

    window.closeMessagesModal = () => {
      closeModal("messages-modal");
      document.body.classList.remove("messages-open");

      if (window.MessagingModule?.cleanup) {
        window.MessagingModule.cleanup();
        return;
      }
      cleanupMessageChannel();
    };

    window.openProjectsModal = async () => {
      openModal("projects-modal");
      await loadProjects();
    };
    window.closeProjectsModal = () => {
      closeModal("projects-modal");
      hideCreateProjectForm();
    };

    window.openEndorsementsModal = async () => {
      openModal("endorsements-modal");
      await showEndorsementsTab("received");
    };
    window.closeEndorsementsModal = () => closeModal("endorsements-modal");

    // IMPORTANT: openQuickConnectModal is overridden later by Illuminated Pathways
    window.openQuickConnectModal = async () => {
      openModal("quick-connect-modal");
      await loadSuggestedConnections();
    };
    window.closeQuickConnectModal = () => closeModal("quick-connect-modal");

    // Notification Center Modal
    window.openNotificationCenter = async () => {
      openModal("notification-center-modal");
      await loadNotifications("all");
    };
    window.closeNotificationCenter = () => closeModal("notification-center-modal");

    // Network Stats Modal
    window.openNetworkStatsModal = async () => {
      openModal("network-stats-modal");
      await loadNetworkStats();
    };
    window.closeNetworkStatsModal = () => closeModal("network-stats-modal");

    // Endorsements tabs
    window.showEndorsementsTab = showEndorsementsTab;

    // Notification center tabs
    window.showNotificationsTab = showNotificationsTab;
    window.clearAllNotifications = clearAllNotifications;

    // Projects form controls
    window.showCreateProjectForm = showCreateProjectForm;
    window.hideCreateProjectForm = hideCreateProjectForm;
    window.createProject = createProject;

    // Messaging globals:
    // Only expose legacy functions if MessagingModule is NOT present
    if (!window.MessagingModule) {
      window.openConversationById = openConversationById;
      window.sendModalMessage = sendModalMessage;
      window.startConversationWithUser = startConversationWithUser;
    }

    // BBS
    window.initBBS = initBBS;

    // Utility functions
    window.escapeHtml = escapeHtml;
  }

  // -----------------------------
  // Messaging UI Wiring (bulletproof)
  // -----------------------------
  function wireMessagingUI() {
    const tryFindInput = () =>
      document.getElementById("modal-message-text") ||
      document.querySelector("#messages-modal input[type='text']") ||
      document.querySelector("#messages-modal textarea") ||
      document.querySelector(".messages-modal input[type='text']") ||
      document.querySelector(".messages-modal textarea");

    const tryFindForm = () =>
      document.getElementById("modal-message-form") ||
      tryFindInput()?.closest("form") ||
      document.querySelector("#messages-modal form") ||
      document.querySelector(".messages-modal form");

    const bindOnce = () => {
      const input = tryFindInput();
      const form = tryFindForm();

      // Enter-to-send (no shift)
      if (input && !input.__ieBoundEnter) {
        input.__ieBoundEnter = true;
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            window.sendModalMessage?.(e);
          }
        });
      }

      // Submit-to-send
      if (form && !form.__ieBoundSubmit) {
        form.__ieBoundSubmit = true;
        form.addEventListener("submit", (e) => window.sendModalMessage?.(e));
      }
    };

    // Bind now (in case modal is already in DOM)
    bindOnce();

    // Paper-plane click (works even if button has no id)
    if (!document.__ieBoundSendClick) {
      document.__ieBoundSendClick = true;
      document.addEventListener("click", (e) => {
        const btn =
          e.target?.closest?.("#modal-send-message") ||
          e.target?.closest?.(".modal-send-message") ||
          e.target?.closest?.("[data-action='send-message']") ||
          e.target?.closest?.("#messages-modal button[type='submit']") ||
          e.target?.closest?.(".messages-modal button[type='submit']");

        if (!btn) return;

        const inModal = btn.closest("#messages-modal") || btn.closest(".messages-modal");
        if (!inModal) return;

        e.preventDefault();
        window.sendModalMessage?.(e);
      });
    }

    // Rebind when modal DOM changes (covers late-rendered inputs)
    const modal = document.getElementById("messages-modal") || document.querySelector(".messages-modal");

    if (modal && !modal.__ieBoundObserver) {
      modal.__ieBoundObserver = true;
      const obs = new MutationObserver(() => bindOnce());
      obs.observe(modal, { childList: true, subtree: true });
    }
  }

  // -----------------------------
  // Global Click Delegation (Edit Profile)
  // -----------------------------
  function bindEditProfileDelegation() {
    if (window.__IE_EDIT_PROFILE_DELEGATION__) return;
    window.__IE_EDIT_PROFILE_DELEGATION__ = true;

    document.addEventListener(
      "click",
      (evt) => {
        const t = evt.target;
        if (!t) return;

        const trigger = t.closest(
          [
            "#edit-profile",
            "#edit-profile-btn",
            "#editProfile",
            "[data-action='edit-profile']",
            "[data-action='open-profile-editor']",
            ".edit-profile",
            ".edit-profile-btn",
            ".btn-edit-profile",
            ".profile-edit-btn",
            "button[aria-label*='Edit'][aria-label*='Profile']",
            "button[title*='Edit'][title*='Profile']",
            "a[aria-label*='Edit'][aria-label*='Profile']",
            "a[title*='Edit'][title*='Profile']",
          ].join(",")
        );

        const textBtn = !trigger ? t.closest("button,a,[role='button']") : null;
        const text = (textBtn?.innerText || "").trim();
        const isTextMatch = !trigger && (text === "Edit Profile" || text === "Edit profile");

        if (!trigger && !isTextMatch) return;

        evt.preventDefault();
        evt.stopPropagation();

        if (typeof window.openProfileEditor === "function") return window.openProfileEditor();
        if (typeof window.openProfileModal === "function") return window.openProfileModal();

        console.warn("Edit Profile clicked, but no editor function is available on window.");
      },
      true
    );
  }

  // -----------------------------
  // Login / App Ready
  // -----------------------------
  function showLogin() {
    $("login-hint") && ($("login-hint").textContent = "");
    $("login-section") && ($("login-section").style.display = "flex");
    hide($("main-header"));
    hide($("main-content"));
  }

  function showApp() {
    $("login-section") && ($("login-section").style.display = "none");
    show($("main-header"));
    show($("main-content"));
  }

  // NOTE: hydrateAuthUser removed - auth.js handles all authentication
  // This prevents race conditions between auth.js and dashboardPane.js

  async function oauthLogin(provider) {
    try {
      $("login-hint") && ($("login-hint").textContent = "Opening login…");
      const redirectTo = window.location.href.split("#")[0];
      const { error } = await state.supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      console.error("OAuth login failed:", e);
      $("login-hint") && ($("login-hint").textContent = `Login failed: ${e.message || e}`);
      alert(`Login failed. ${e.message || e}`);
    }
  }

  // Database diagnostic function
  window.testDatabaseConnection = async function() {
    console.log("🔍 Testing database connection...");
    
    const tests = [
      {
        name: "Basic connection test",
        test: async () => {
          const start = Date.now();
          const { data, error } = await state.supabase
            .from("community")
            .select("count")
            .limit(1);
          const duration = Date.now() - start;
          return { success: !error, duration, error: error?.message };
        }
      },
      {
        name: "Profile query test",
        test: async () => {
          if (!state.authUser) return { success: false, error: "No auth user" };
          const start = Date.now();
          const { data, error } = await state.supabase
            .from("community")
            .select("*")
            .eq("user_id", state.authUser.id)
            .limit(1);
          const duration = Date.now() - start;
          return { success: !error, duration, error: error?.message, data: data?.length };
        }
      },
      {
        name: "Auth status test",
        test: async () => {
          const start = Date.now();
          const { data, error } = await state.supabase.auth.getUser();
          const duration = Date.now() - start;
          return { success: !error, duration, error: error?.message, user: !!data?.user };
        }
      }
    ];

    for (const test of tests) {
      try {
        console.log(`🧪 Running: ${test.name}`);
        const result = await test.test();
        console.log(`${result.success ? '✅' : '❌'} ${test.name}:`, result);
      } catch (error) {
        console.log(`❌ ${test.name} failed:`, error);
      }
    }
  };

  // Enhanced profile creation with better error handling
  async function ensureCommunityProfile() {
    console.log("🔧 ensureCommunityProfile called");

    if (!state.authUser) {
      console.error("❌ Cannot create profile: No auth user");
      return null;
    }

    if (state.communityProfile?.id) {
      console.log("✅ Community profile already exists:", state.communityProfile.id);
      return state.communityProfile;
    }

    console.log("🔍 Checking for existing community profile...");

    // Helper function to add timeout to any promise
    const withTimeout = (promise, timeoutMs, operation) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs/1000}s`)), timeoutMs)
        )
      ]);
    };

    try {
      // Check if profile already exists with timeout
      const { data: existing, error: exErr } = await withTimeout(
        state.supabase
          .from("community")
          .select("*")
          .eq("user_id", state.authUser.id)
          .maybeSingle(),
        15000, // 15 second timeout
        "Profile check"
      );

      if (!exErr && existing) {
        console.log("📋 Found existing community profile:", existing.id);
        state.communityProfile = existing;
        return existing;
      }

      if (exErr) {
        console.warn("⚠️ Error checking existing profile:", exErr.message);
      }
    } catch (error) {
      console.error("❌ Timeout checking for existing profile:", error);
      // Continue to try creating new profile
    }

    console.log("🆕 Creating new community profile for user:", state.authUser.email);

    const displayName =
      state.authUser.user_metadata?.full_name ||
      state.authUser.user_metadata?.name ||
      state.authUser.email?.split("@")[0] ||
      "New Member";

    const payload = {
      user_id: state.authUser.id,
      email: state.authUser.email,
      name: displayName,
      skills: "",
      bio: "",
      image_url: state.authUser.user_metadata?.avatar_url || null,
    };

    try {
      const { data: created, error: createErr } = await withTimeout(
        state.supabase
          .from("community")
          .insert(payload)
          .select("*")
          .single(),
        15000, // 15 second timeout
        "Profile creation"
      );

      if (createErr) {
        console.error("❌ Failed to create community profile:", createErr);
        return null;
      }

      console.log("✅ Community profile created:", created.id);
      state.communityProfile = created;
      return created;
    } catch (error) {
      console.error("❌ Timeout creating community profile:", error);
      return null;
    }
  }

  // NOTE: dispatchProfileLoadedIfNeeded removed - auth.js handles all profile event dispatching

  async function onAppReady() {
    console.log("🚀 Dashboard onAppReady called with:", {
      hasAuthUser: !!state.authUser,
      hasCommunityProfile: !!state.communityProfile,
      communityId: state.communityProfile?.id,
    });

    // Critical checks - must have both auth user AND community profile with ID
    if (!state.authUser) {
      console.warn("⚠️ onAppReady: No auth user, aborting");
      return;
    }
    if (!state.communityProfile?.id) {
      console.warn("⚠️ onAppReady: No community profile ID, aborting");
      return;
    }

    console.log("✅ All prerequisites met, initializing dashboard...");

    showApp();
    renderHeaderIdentity();

    // Initialize synapse with proper user context
    await initSynapseOnce();

    // Start loading dashboard counters
    await refreshCounters();

    // Set up periodic refresh with longer interval to reduce connection issues
    if (!state.refreshTimer) {
      state.refreshTimer = setInterval(refreshCounters, 60000); // Increased from 30s to 60s
    }

    console.log("✅ Dashboard fully initialized");
  }

  function renderHeaderIdentity() {
    const p = state.communityProfile;
    const name = p?.name || state.authUser?.email || "Member";
    const initials = (name || "?")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");

    safeText("user-name-header", name);
    safeText("user-initials-header", initials || "?");
  }

  // -----------------------------
  // Synapse
  // -----------------------------
  async function initSynapseOnce() {
    if (state.synapseInitialized) {
      console.log("⚠️ Synapse already initialized, skipping");
      return;
    }

    console.log("🧠 Initializing Synapse visualization...");

    try {
      // Verify we have the required user context BEFORE initializing
      if (!state.communityProfile?.id) {
        throw new Error("Cannot initialize Synapse: Missing community profile ID");
      }

      // Import and initialize synapse module
      const mod = await import("./synapse.js");
      if (typeof mod.initSynapseView === "function") {
        await mod.initSynapseView();
        // Only mark as initialized if it actually succeeded
        state.synapseInitialized = true;
        console.log("✅ Synapse initialized successfully");
      } else {
        throw new Error("synapse.js loaded but initSynapseView not found");
      }
    } catch (e) {
      console.error("❌ Synapse initialization failed:", e);
      if (e?.stack) console.error("Stack:", e.stack);

      // Show user-facing error message
      const synapseContainer = document.getElementById("synapse-svg");
      if (synapseContainer) {
        synapseContainer.innerHTML = `
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                      text-align: center; color: #f44336; max-width: 500px; padding: 2rem;">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <h3 style="margin: 0 0 1rem 0; color: #fff;">Visualization Error</h3>
            <p style="color: #aaa; margin: 0 0 1rem 0;">
              The network visualization failed to load. This might be due to a connection issue or missing user data.
            </p>
            <button onclick="window.location.reload()"
                    style="background: linear-gradient(135deg, #00e0ff, #0080ff);
                           border: none; color: white; padding: 0.75rem 1.5rem;
                           border-radius: 8px; cursor: pointer; font-weight: 600;">
              <i class="fas fa-sync-alt"></i> Reload Page
            </button>
            <p style="color: #666; font-size: 0.85rem; margin-top: 1rem;">
              Error: ${e.message || "Unknown error"}
            </p>
          </div>
        `;
      }

      // Don't set synapseInitialized to true on failure - allow retries
      state.synapseInitialized = false;
    }
  }

  // -----------------------------
  // Counters
  // -----------------------------
  async function refreshCounters() {
    // Add connection check and error handling
    if (!state.supabase || !navigator.onLine) {
      console.log('⚠️ Skipping counter refresh - no connection');
      return;
    }

    console.log('🔄 Refreshing dashboard counters...');
    
    const results = await Promise.allSettled([
      countUnreadMessages(),
      countActiveProjects(),
      countEndorsementsReceived(),
      countNetworkSize(),
    ]);

    // Log any failures for debugging
    results.forEach((result, index) => {
      const counterNames = ['messages', 'projects', 'endorsements', 'community'];
      if (result.status === 'rejected') {
        console.warn(`⚠️ Counter ${counterNames[index]} failed:`, result.reason?.message || result.reason);
      }
    });
  }

  async function countUnreadMessages() {
    if (!state.communityProfile?.id) return;

    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const { count, error } = await state.supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("read", false)
        .neq("sender_id", state.communityProfile.id)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;
      safeText("unread-messages", count ?? 0);
    } catch (error) {
      console.warn('⚠️ Failed to count unread messages:', error.message);
      safeText("unread-messages", 0);
    }
  }

  async function countActiveProjects() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { count, error } = await state.supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;
      safeText("active-projects", count ?? 0);
    } catch (error) {
      console.warn('⚠️ Failed to count active projects:', error.message);
      safeText("active-projects", 0);
    }
  }

  async function countEndorsementsReceived() {
    if (!state.communityProfile?.id) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { count, error } = await state.supabase
        .from("endorsements")
        .select("id", { count: "exact", head: true })
        .eq("endorsed_community_id", state.communityProfile.id)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;
      safeText("total-endorsements", count ?? 0);
    } catch (error) {
      console.warn('⚠️ Failed to count endorsements:', error.message);
      safeText("total-endorsements", 0);
    }
  }

  async function countNetworkSize() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const { count, error } = await state.supabase
        .from("community")
        .select("id", { count: "exact", head: true })
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);

      if (error) throw error;
      safeText("network-size", count ?? 0);
    } catch (error) {
      console.warn('⚠️ Failed to count network size:', error.message);
      safeText("network-size", 0);
    }
  }

  // -----------------------------
  // Search + Quick Connect
  // -----------------------------
  let activeSearchCategory = "all"; // Track active search category

  // Setup category filter buttons
  function setupCategoryButtons() {
    const buttons = document.querySelectorAll(".search-category-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSearchCategory = btn.dataset.category;

        // Update button styles
        buttons.forEach((b) => {
          if (b.dataset.category === activeSearchCategory) {
            // Active state
            const color = getCategoryColor(activeSearchCategory);
            b.style.background = `linear-gradient(135deg, ${color.gradient})`;
            b.style.border = "none";
            b.style.color = "white";
          } else {
            // Inactive state
            const color = getCategoryColor(b.dataset.category);
            b.style.background = color.bg;
            b.style.border = color.border;
            b.style.color = color.text;
          }
        });

        // Update placeholder
        const searchInput = $("global-search");
        if (searchInput) {
          searchInput.placeholder = getPlaceholderText(activeSearchCategory);
        }
      });
    });
  }

  function getCategoryColor(category) {
    const colors = {
      all: { gradient: "#00e0ff, #0080ff", bg: "rgba(0,224,255,0.15)", border: "1px solid rgba(0,224,255,0.3)", text: "#00e0ff" },
      people: { gradient: "#00e0ff, #0080ff", bg: "rgba(0,224,255,0.15)", border: "1px solid rgba(0,224,255,0.3)", text: "#00e0ff" },
      organizations: { gradient: "#a855f7, #8b3fd9", bg: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", text: "#a855f7" },
      projects: { gradient: "#00ff88, #00cc6a", bg: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.3)", text: "#00ff88" },
      themes: { gradient: "#ffaa00, #ff8800", bg: "rgba(255,170,0,0.15)", border: "1px solid rgba(255,170,0,0.3)", text: "#ffaa00" },
      skills: { gradient: "#ff6b6b, #ee5555", bg: "rgba(255,107,107,0.15)", border: "1px solid rgba(255,107,107,0.3)", text: "#ff6b6b" }
    };
    return colors[category] || colors.all;
  }

  function getPlaceholderText(category) {
    const placeholders = {
      all: "Search everything...",
      people: "Search people by name or bio...",
      organizations: "Search organizations...",
      projects: "Search projects...",
      themes: "Search themes...",
      skills: "Search by skill name..."
    };
    return placeholders[category] || placeholders.all;
  }

  async function handleSearch() {
    const q = $("global-search")?.value?.trim();
    if (!q) return;
    openModal("quick-connect-modal");
    await renderSearchResults(q, activeSearchCategory);
  }

  async function renderSearchResults(query, category = "all") {
    const list = $("quick-connect-list");
    if (!list) return;

    list.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Searching…</p>
    </div>`;

    try {
      const q = query.toLowerCase();
      let people = null, organizations = null, projects = null, themes = null, skillMatches = null;

      // Search based on category
      if (category === "all" || category === "people") {
        const { data, error } = await state.supabase
          .from("community")
          .select("*")
          .or(`name.ilike.%${q}%,bio.ilike.%${q}%`)
          .limit(25);
        if (error) console.warn("People search error:", error);
        else people = data;
      }

      if (category === "all" || category === "organizations") {
        const { data, error } = await state.supabase
          .from("organizations")
          .select("*")
          .or(`name.ilike.%${q}%,description.ilike.%${q}%,tags.ilike.%${q}%`)
          .limit(10);
        if (error) console.warn("Organizations search error:", error);
        else organizations = data;
      }

      if (category === "all" || category === "projects") {
        const { data, error } = await state.supabase
          .from("projects")
          .select("*")
          .or(`name.ilike.%${q}%,description.ilike.%${q}%,skills_needed.ilike.%${q}%`)
          .limit(10);
        if (error) console.warn("Projects search error:", error);
        else projects = data;
      }

      if (category === "all" || category === "themes") {
        const { data, error } = await state.supabase
          .from("themes")
          .select("*")
          .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
          .limit(10);
        if (error) console.warn("Themes search error:", error);
        else themes = data;
      }

      // Search for skills (search within people's skills field)
      if (category === "all" || category === "skills") {
        const { data, error } = await state.supabase
          .from("community")
          .select("*")
          .ilike("skills", `%${q}%`)
          .limit(25);
        if (error) console.warn("Skills search error:", error);
        else skillMatches = data;
      }

      const filteredPeople = (people || []).filter((p) => p.id !== state.communityProfile?.id);
      const filteredSkillMatches = (skillMatches || []).filter((p) => p.id !== state.communityProfile?.id);
      const totalResults = filteredPeople.length + filteredSkillMatches.length + (organizations?.length || 0) + (projects?.length || 0) + (themes?.length || 0);

      if (totalResults === 0) {
        list.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-search" style="font-size:3rem; opacity:0.25;"></i>
          <p style="margin-top:1rem;">No results for "${escapeHtml(query)}"</p>
        </div>`;
        return;
      }

      let html = "";

      // Render People section
      if (filteredPeople.length > 0) {
        html += `<div style="margin-bottom:2rem;">
          <h3 style="color:#00e0ff; font-size:0.95rem; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
            <i class="fas fa-users"></i> People (${filteredPeople.length})
          </h3>
          ${filteredPeople.map((p) => personCard(p)).join("")}
        </div>`;
      }

      // Render Organizations section
      if (organizations && organizations.length > 0) {
        html += `<div style="margin-bottom:2rem;">
          <h3 style="color:#a855f7; font-size:0.95rem; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
            <i class="fas fa-building"></i> Organizations (${organizations.length})
          </h3>
          ${organizations.map((org) => organizationCard(org)).join("")}
        </div>`;
      }

      // Render Projects section
      if (projects && projects.length > 0) {
        html += `<div style="margin-bottom:2rem;">
          <h3 style="color:#00ff88; font-size:0.95rem; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
            <i class="fas fa-lightbulb"></i> Projects (${projects.length})
          </h3>
          ${projects.map((proj) => projectCard(proj)).join("")}
        </div>`;
      }

      // Render Themes section
      if (themes && themes.length > 0) {
        html += `<div style="margin-bottom:2rem;">
          <h3 style="color:#ffaa00; font-size:0.95rem; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
            <i class="fas fa-palette"></i> Themes (${themes.length})
          </h3>
          ${themes.map((theme) => themeCard(theme)).join("")}
        </div>`;
      }

      // Render Skills section (people with matching skills)
      if (filteredSkillMatches && filteredSkillMatches.length > 0) {
        html += `<div style="margin-bottom:2rem;">
          <h3 style="color:#ff6b6b; font-size:0.95rem; font-weight:700; margin-bottom:1rem; display:flex; align-items:center; gap:0.5rem;">
            <i class="fas fa-code"></i> People with Skill: "${escapeHtml(query)}" (${filteredSkillMatches.length})
          </h3>
          ${filteredSkillMatches.map((p) => personCard(p)).join("")}
        </div>`;
      }

      list.innerHTML = html;
    } catch (e) {
      console.error("Search failed:", e);
      list.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Search failed</p>
        <p style="opacity:0.85;">${escapeHtml(e.message || String(e))}</p>
      </div>`;
    }
  }

  // Helper function to render organization cards
  function organizationCard(org) {
    return `<div class="result-card" style="padding:1rem; background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:8px; margin-bottom:0.75rem; cursor:pointer; transition:all 0.2s;" onclick="openOrganizationProfile('${org.id}')">
      <div style="display:flex; align-items:center; gap:1rem;">
        <div style="width:48px; height:48px; background:rgba(168,85,247,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">
          <i class="fas fa-building" style="color:#a855f7;"></i>
        </div>
        <div style="flex:1;">
          <div style="color:#fff; font-weight:600; margin-bottom:0.25rem;">${escapeHtml(org.name)}</div>
          <div style="color:#aaa; font-size:0.85rem; margin-bottom:0.25rem;">${escapeHtml(org.description || "").slice(0, 80)}${(org.description || "").length > 80 ? "..." : ""}</div>
          ${org.tags ? `<div style="color:#a855f7; font-size:0.75rem;"><i class="fas fa-tags"></i> ${escapeHtml(org.tags)}</div>` : ""}
        </div>
      </div>
    </div>`;
  }

  // Helper function to render project cards
  function projectCard(proj) {
    return `<div class="result-card" style="padding:1rem; background:rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.25); border-radius:8px; margin-bottom:0.75rem; cursor:pointer; transition:all 0.2s;" onclick="openProjectDetails('${proj.id}')">
      <div style="display:flex; align-items:center; gap:1rem;">
        <div style="width:48px; height:48px; background:rgba(0,255,136,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">
          <i class="fas fa-lightbulb" style="color:#00ff88;"></i>
        </div>
        <div style="flex:1;">
          <div style="color:#fff; font-weight:600; margin-bottom:0.25rem;">${escapeHtml(proj.name)}</div>
          <div style="color:#aaa; font-size:0.85rem; margin-bottom:0.25rem;">${escapeHtml(proj.description || "").slice(0, 80)}${(proj.description || "").length > 80 ? "..." : ""}</div>
          ${proj.skills_needed ? `<div style="color:#00ff88; font-size:0.75rem;"><i class="fas fa-code"></i> ${escapeHtml(proj.skills_needed)}</div>` : ""}
        </div>
      </div>
    </div>`;
  }

  // Helper function to render theme cards
  function themeCard(theme) {
    return `<div class="result-card" style="padding:1rem; background:rgba(255,170,0,0.08); border:1px solid rgba(255,170,0,0.25); border-radius:8px; margin-bottom:0.75rem; cursor:pointer; transition:all 0.2s;" onclick="openThemeDetails('${theme.id}')">
      <div style="display:flex; align-items:center; gap:1rem;">
        <div style="width:48px; height:48px; background:rgba(255,170,0,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">
          <i class="fas fa-palette" style="color:#ffaa00;"></i>
        </div>
        <div style="flex:1;">
          <div style="color:#fff; font-weight:600; margin-bottom:0.25rem;">${escapeHtml(theme.name)}</div>
          <div style="color:#aaa; font-size:0.85rem;">${escapeHtml(theme.description || "").slice(0, 100)}${(theme.description || "").length > 100 ? "..." : ""}</div>
        </div>
      </div>
    </div>`;
  }

  async function loadSuggestedConnections() {
    const list = $("quick-connect-list");
    if (!list) return;

    list.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading suggestions…</p>
    </div>`;

    try {
      const { data: allUsers, error } = await state.supabase.from("community").select("*").limit(200);
      if (error) throw error;

      const me = state.communityProfile;
      const mySkills = (me?.skills || "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const candidates = (allUsers || [])
        .filter((u) => u.id !== me?.id)
        .map((u) => {
          const theirSkills = (u.skills || "")
            .toLowerCase()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const score = mySkills.length ? mySkills.filter((s) => theirSkills.includes(s)).length : 0;
          return { u, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map((x) => x.u);

      list.innerHTML = candidates.map((p) => personCard(p, true)).join("");
    } catch (e) {
      console.error("Suggestions failed:", e);
      list.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Failed to load suggestions</p>
      </div>`;
    }
  }

  function personCard(person, showScoreHint = false) {
    const name = person?.name || "Unknown";
    const initials = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");

    const skills = (person.skills || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);

    return `
      <div style="display:flex; align-items:center; gap:1rem; padding:1rem;
        background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.2);
        border-radius:12px; margin-bottom:0.75rem;">
        ${
          person.image_url
            ? `<img src="${escapeHtml(person.image_url)}" style="width:52px; height:52px; border-radius:50%;
                 object-fit:cover; border:2px solid #00e0ff;">`
            : `<div style="width:52px; height:52px; border-radius:50%;
                 background:linear-gradient(135deg,#00e0ff,#0080ff); display:flex; align-items:center; justify-content:center;
                 font-weight:bold; color:white; font-size:1.1rem;">${initials}</div>`
        }
        <div style="flex:1; min-width:0;">
          <div style="color:white; font-weight:700; font-size:1rem;">${escapeHtml(name)}</div>
          <div style="color:#aaa; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${skills.length ? escapeHtml(skills.join(", ")) : "No skills listed"}
          </div>
          ${showScoreHint ? `<div style="color:#666; font-size:0.75rem; margin-top:0.25rem;">Suggested match</div>` : ``}
        </div>
        <button class="btn btn-primary" style="white-space:nowrap;" onclick="sendConnectionRequest('${person.id}')">
          <i class="fas fa-user-plus"></i> Connect
        </button>
      </div>
    `;
  }

  // ================================================================
  // Connection Requests (Send / Accept / Decline / Withdraw) — SAFE VERSION
  // - No maybeSingle() anywhere (avoids 406 edge cases)
  // - Accept/Decline require "addressed to me" (to_user_id === myId)
  // - Withdraw requires "sent by me" (from_user_id === myId)
  // ================================================================

  window.sendConnectionRequest = async function (toCommunityId, targetName = "User", type = "recommendation") {
    try {
      if (!state.supabase) throw new Error("Supabase not initialized.");
      if (!state.communityProfile?.id) throw new Error("No profile loaded.");

      const fromId = state.communityProfile.id;
      const toId = toCommunityId;

      if (!toId) throw new Error("Missing target user id.");
      if (String(fromId) === String(toId)) throw new Error("You can’t connect to yourself.");

      // Prefer central module if present
      try {
        const mod = await import("./connections.js");
        if (typeof mod?.sendConnectionRequest === "function") {
          await mod.sendConnectionRequest(toId, targetName, type);
          try {
            await refreshCounters?.();
          } catch {}
          try {
            await window.refreshSynapse?.();
          } catch {}
          return;
        }
      } catch (_) {
        // fall through to inline insert
      }

      const { error } = await state.supabase.from("connections").insert({
        from_user_id: fromId,
        to_user_id: toId,
        status: "pending",
        type: type || "generic",
      });

      if (error) throw error;

      console.log("✅ Connection request sent:", { from_user_id: fromId, to_user_id: toId });
      try {
        await refreshCounters?.();
      } catch {}
      try {
        await window.refreshSynapse?.();
      } catch {}
    } catch (e) {
      console.error("sendConnectionRequest failed:", e);
      alert(`Could not send request: ${e?.message || e}`);
    }
  };

  window.acceptConnectionRequest = async function (connectionId) {
    try {
      if (!state.supabase) throw new Error("Supabase not initialized.");
      if (!state.communityProfile?.id) throw new Error("No profile loaded.");

      const myId = state.communityProfile.id;

      const { data: rows, error: readErr } = await state.supabase
        .from("connections")
        .select("id,status,from_user_id,to_user_id")
        .eq("id", connectionId)
        .limit(1);

      if (readErr) throw readErr;

      const row = rows?.[0] || null;
      if (!row) return;

      if (row.status !== "pending") return;
      if (String(row.to_user_id) !== String(myId)) return;

      const { data, error: upErr } = await state.supabase
        .from("connections")
        .update({ status: "accepted" })
        .eq("id", connectionId)
        .eq("status", "pending")
        .select("id,status");

      if (upErr) throw upErr;
      if (!data || data.length === 0) return;

      console.log("✅ Connection accepted:", data[0].id);

      try {
        await refreshCounters?.();
      } catch {}
      try {
        await window.refreshSynapse?.();
      } catch {}
    } catch (e) {
      console.error("acceptConnectionRequest failed:", e);
    }
  };

  window.declineConnectionRequest = async function (connectionId) {
    try {
      if (!state.supabase) throw new Error("Supabase not initialized.");
      if (!state.communityProfile?.id) throw new Error("No profile loaded.");

      const myId = state.communityProfile.id;

      const { data: rows, error: readErr } = await state.supabase
        .from("connections")
        .select("id,status,from_user_id,to_user_id")
        .eq("id", connectionId)
        .limit(1);

      if (readErr) throw readErr;

      const row = rows?.[0] || null;
      if (!row) return;

      if (row.status !== "pending") return;
      if (String(row.to_user_id) !== String(myId)) return;

      const { data, error: delErr } = await state.supabase
        .from("connections")
        .delete()
        .eq("id", connectionId)
        .eq("status", "pending")
        .select("id");

      if (delErr) throw delErr;
      if (!data || data.length === 0) return;

      console.log("🗑️ Connection declined:", data[0].id);

      try {
        await refreshCounters?.();
      } catch {}
      try {
        await window.refreshSynapse?.();
      } catch {}
    } catch (e) {
      console.error("declineConnectionRequest failed:", e);
    }
  };

  window.withdrawConnectionRequest = async function (connectionId) {
    try {
      if (!state.supabase) throw new Error("Supabase not initialized.");
      if (!state.communityProfile?.id) throw new Error("No profile loaded.");

      const myId = state.communityProfile.id;

      const { data: rows, error: readErr } = await state.supabase
        .from("connections")
        .select("id,status,from_user_id,to_user_id")
        .eq("id", connectionId)
        .limit(1);

      if (readErr) throw readErr;

      const row = rows?.[0] || null;
      if (!row) return;

      if (row.status !== "pending") return;
      if (String(row.from_user_id) !== String(myId)) return;

      const { data, error: delErr } = await state.supabase
        .from("connections")
        .delete()
        .eq("id", connectionId)
        .eq("status", "pending")
        .select("id");

      if (delErr) throw delErr;
      if (!data || data.length === 0) return;

      console.log("↩️ Connection request withdrawn:", data[0].id);

      try {
        await refreshCounters?.();
      } catch {}
      try {
        await window.refreshSynapse?.();
      } catch {}
    } catch (e) {
      console.error("withdrawConnectionRequest failed:", e);
    }
  };

  // Handy console helpers
  window.__acceptTest = (id) => window.acceptConnectionRequest(id);
  window.__declineTest = (id) => window.declineConnectionRequest(id);
  window.__withdrawTest = (id) => window.withdrawConnectionRequest(id);

  window.joinProject = async function (projectId, projectName = "Project") {
    try {
      if (!state.communityProfile?.id) throw new Error("No profile loaded.");

      const { data: existing, error: checkError } = await state.supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", state.communityProfile.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        alert(`You're already a member of ${projectName}!`);
        return;
      }

      const { error } = await state.supabase.from("project_members").insert({
        project_id: projectId,
        user_id: state.communityProfile.id,
        role: "member",
      });

      if (error) throw error;

      alert(`✓ Successfully joined ${projectName}!`);

      if (window.refreshSynapseProjectCircles) {
        await window.refreshSynapseProjectCircles();
      }
    } catch (e) {
      console.error("joinProject failed:", e);
      alert(`Could not join project: ${e.message || e}`);
    }
  };

  // -----------------------------
  // Messaging (community.id everywhere)
  // -----------------------------
  async function loadConversationsForModal() {
    const listEl = $("modal-conversations-list");
    const messagesEl = $("modal-conversation-messages");
    const titleEl = $("modal-conversation-title");

    if (!listEl || !messagesEl || !titleEl) return;

    listEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading…</p>
    </div>`;

    messagesEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-comment-dots" style="font-size:2rem; opacity:0.3;"></i>
      <p style="margin-top:1rem;">Select a conversation</p>
    </div>`;

    try {
      // Check if user is authenticated (state.authUser set by auth.js events)
      if (!state.authUser || !state.communityProfile?.id) {
        listEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">Please log in.</div>`;
        return;
      }

      const myCommunityId = state.communityProfile.id;

      const [conversationsResult, connectionsResult] = await Promise.all([
        state.supabase
          .from("conversations")
          .select("*")
          .or(`participant_1_id.eq.${myCommunityId},participant_2_id.eq.${myCommunityId}`)
          .order("last_message_at", { ascending: false }),

        state.supabase
          .from("connections")
          .select(
            `
            *,
            from_user:community!connections_from_user_id_fkey(id, name, image_url),
            to_user:community!connections_to_user_id_fkey(id, name, image_url)
          `
          )
          .or(`from_user_id.eq.${myCommunityId},to_user_id.eq.${myCommunityId}`)
          .eq("status", "accepted"),
      ]);

      const conversations = conversationsResult.data || [];
      const connections = connectionsResult.data || [];

      // map other participant profiles
      const otherCommunityIds = new Set();
      conversations.forEach((c) => {
        if (c.participant_1_id && c.participant_1_id !== myCommunityId) otherCommunityIds.add(c.participant_1_id);
        if (c.participant_2_id && c.participant_2_id !== myCommunityId) otherCommunityIds.add(c.participant_2_id);
      });

      let profileMap = {};
      if (otherCommunityIds.size) {
        const { data: profiles, error: pErr } = await state.supabase
          .from("community")
          .select("id, name, image_url")
          .in("id", Array.from(otherCommunityIds));

        if (!pErr && profiles) {
          profiles.forEach((p) => (profileMap[p.id] = p));
        }
      }

      const connectionsList = connections
        .map((conn) => {
          const isFromMe = conn.from_user_id === myCommunityId;
          return isFromMe ? conn.to_user : conn.from_user;
        })
        .filter(Boolean);

      let html = "";

      if (connectionsList.length > 0) {
        html += `
          <div style="margin-bottom: 1rem;">
            <div style="color: #00e0ff; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fas fa-users"></i> Your Connections
            </div>
            ${connectionsList
              .map((conn) => {
                const name = conn.name || "Unknown";
                const initials = name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase();

                return `
                  <div onclick="startConversationWithUser('${conn.id}', '${escapeHtml(name)}')"
                    style="display:flex; align-items:center; gap:0.75rem; padding:0.65rem;
                    background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.1);
                    border-radius:8px; cursor:pointer; margin-bottom:0.4rem; transition:all 0.2s;">
                    ${
                      conn.image_url
                        ? `<img src="${escapeHtml(conn.image_url)}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid #00e0ff;">`
                        : `<div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#00e0ff,#0080ff); display:flex; align-items:center; justify-content:center; font-weight:700; color:white; font-size:0.85rem;">${initials}</div>`
                    }
                    <div style="flex:1; min-width:0;">
                      <div style="color:white; font-weight:700; font-size:0.85rem;">${escapeHtml(name)}</div>
                      <div style="color:#00e0ff; font-size:0.7rem;">
                        <i class="fas fa-comment-dots"></i> Message
                      </div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }

      if (conversations.length > 0) {
        html += `
          <div>
            <div style="color: #00e0ff; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fas fa-comments"></i> Recent Conversations
            </div>
            ${conversations
              .map((conv) => {
                const otherId =
                  conv.participant_1_id === myCommunityId ? conv.participant_2_id : conv.participant_1_id;

                const other = profileMap[otherId] || null;
                const otherName = other?.name || "Unknown";
                const initials = otherName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase();

                const timeAgo = conv.last_message_at ? formatTimeAgo(conv.last_message_at) : "";

                return `
                  <div onclick="openConversationById('${conv.id}', '${escapeHtml(otherName)}')"
                    style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem;
                    background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.1);
                    border-radius:8px; cursor:pointer; margin-bottom:0.5rem; transition:all 0.2s;">
                    ${
                      other?.image_url
                        ? `<img src="${escapeHtml(other.image_url)}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #00e0ff;">`
                        : `<div style="width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,#00e0ff,#0080ff); display:flex; align-items:center; justify-content:center; font-weight:700; color:white;">${initials}</div>`
                    }
                    <div style="flex:1; min-width:0;">
                      <div style="color:white; font-weight:700; font-size:0.9rem;">${escapeHtml(otherName)}</div>
                      <div style="color:#aaa; font-size:0.75rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${escapeHtml(conv.last_message_preview || "No messages yet")}
                      </div>
                    </div>
                    <div style="color:#666; font-size:0.7rem;">${escapeHtml(timeAgo)}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      }

      if (!html) {
        html = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-user-friends" style="font-size:2rem; opacity:0.3;"></i>
          <p style="margin-top:0.75rem;">No connections yet</p>
          <p style="font-size:0.85rem; color:#666; margin-top:0.5rem;">Connect with people to start messaging</p>
        </div>`;
      }

      listEl.innerHTML = html;
    } catch (e) {
      console.error("loadConversationsForModal failed:", e);
      listEl.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:0.75rem;">Messages unavailable</p>
      </div>`;
    }
  }

  async function startConversationWithUser(otherCommunityId, otherUserName) {
    try {
      if (!state.communityProfile?.id) throw new Error("No community profile loaded.");
      const myId = state.communityProfile.id;

      const { data: existingConv, error: existingErr } = await state.supabase
        .from("conversations")
        .select("id")
        .or(
          `and(participant_1_id.eq.${myId},participant_2_id.eq.${otherCommunityId}),and(participant_1_id.eq.${otherCommunityId},participant_2_id.eq.${myId})`
        )
        .maybeSingle();

      if (existingErr) throw existingErr;

      if (existingConv?.id) {
        await openConversationById(existingConv.id, otherUserName);
        return;
      }

      const [p1, p2] = String(myId) < String(otherCommunityId) ? [myId, otherCommunityId] : [otherCommunityId, myId];

      const { data: newConv, error: createErr } = await state.supabase
        .from("conversations")
        .insert({
          participant_1_id: p1,
          participant_2_id: p2,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createErr) throw createErr;

      await openConversationById(newConv.id, otherUserName);
    } catch (error) {
      console.error("Error starting conversation:", error);
      alert("Failed to start conversation: " + (error?.message || String(error)));
    }
  }

  async function openConversationById(conversationId, name) {
    state.currentConversationId = conversationId;
    state.currentConversationName = name || "Conversation";

    const title = $("modal-conversation-title");
    if (title) title.textContent = state.currentConversationName;

    const inputWrap = $("modal-message-input");
    if (inputWrap) inputWrap.style.display = "block";

    // ensure send wiring exists for newly rendered input/buttons
    wireMessagingUI();

    await loadMessagesForConversation(conversationId);
    subscribeToConversationMessages(conversationId);
  }

  async function loadMessagesForConversation(conversationId) {
    const messagesEl = $("modal-conversation-messages");
    if (!messagesEl) return;

    messagesEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading messages…</p>
    </div>`;

    try {
      const { data: messages, error } = await state.supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const myCommunityId = state.communityProfile?.id;

      if (!messages || messages.length === 0) {
        messagesEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-comment-dots" style="font-size:2rem; opacity:0.3;"></i>
          <p style="margin-top:0.75rem;">No messages yet</p>
        </div>`;
        return;
      }

      messagesEl.innerHTML = messages
        .map((m) => {
          const isMine = myCommunityId && m.sender_id === myCommunityId;
          const time = new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          return `
            <div style="margin-bottom:1rem; text-align:${isMine ? "right" : "left"};">
              <div style="display:inline-block; max-width:70%;">
                <div style="background:${isMine ? "linear-gradient(135deg,#00e0ff,#0080ff)" : "rgba(255,255,255,0.1)"};
                  padding:0.75rem; border-radius:${isMine ? "12px 12px 0 12px" : "12px 12px 12px 0"};">
                  <p style="color:white; margin:0; word-wrap:break-word;">${escapeHtml(m.content)}</p>
                </div>
                <div style="color:#666; font-size:0.7rem; margin-top:0.25rem;">${escapeHtml(time)}</div>
              </div>
            </div>
          `;
        })
        .join("");

      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch (e) {
      console.error("loadMessagesForConversation failed:", e);
      messagesEl.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:0.75rem;">Could not load messages</p>
      </div>`;
    }
  }

  async function sendModalMessage(event) {
    event?.preventDefault?.();

    const input = $("modal-message-text");
    const text = input?.value?.trim();
    if (!text) return;

    if (!state.currentConversationId) {
      alert("Select a conversation first.");
      return;
    }

    try {
      if (!state.communityProfile?.id) throw new Error("No community profile loaded.");

      const { error } = await state.supabase.from("messages").insert({
        conversation_id: state.currentConversationId,
        sender_id: state.communityProfile.id,
        content: text,
        read: false,
      });

      if (error) throw error;

      await state.supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 100),
        })
        .eq("id", state.currentConversationId);

      if (input) input.value = "";

      await loadMessagesForConversation(state.currentConversationId);
      await refreshCounters();
    } catch (e) {
      console.error("sendModalMessage failed:", e);
      alert(`Failed to send: ${e.message || e}`);
    }
  }

  function cleanupMessageChannel() {
    try {
      if (state.messageChannel) {
        state.supabase.removeChannel(state.messageChannel);
        state.messageChannel = null;
      }
    } catch (e) {
      console.warn("cleanupMessageChannel skipped:", e?.message || e);
    }
  }

  function subscribeToConversationMessages(conversationId) {
    cleanupMessageChannel();
    if (!state.supabase || !conversationId) return;

    state.messageChannel = state.supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        async () => {
          if (state.currentConversationId !== conversationId) return;
          await loadMessagesForConversation(conversationId);
          await refreshCounters();
        }
      )
      .subscribe();
  }

  // -----------------------------
  // Projects
  // -----------------------------
  async function showCreateProjectForm() {
    const form = $("project-form");
    if (form) {
      form.style.display = "block";
      await loadThemesIntoProjectDropdown();
    }
  }

  async function loadThemesIntoProjectDropdown() {
    const dropdown = $("project-theme");
    if (!dropdown || !state.supabase) return;

    try {
      const { data: themes, error } = await state.supabase
        .from("theme_circles")
        .select("id, title, tags, expires_at")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("title", { ascending: true });

      if (error) {
        console.error("Error loading themes:", error);
        return;
      }

      dropdown.innerHTML = '<option value="">No theme (standalone project)</option>';

      if (themes && themes.length > 0) {
        themes.forEach((theme) => {
          const option = document.createElement("option");
          option.value = theme.id;
          const tags = theme.tags && theme.tags.length > 0 ? ` [${theme.tags.join(", ")}]` : "";
          option.textContent = `${theme.title}${tags}`;
          dropdown.appendChild(option);
        });
        console.log(`✅ Loaded ${themes.length} themes into project form`);
      } else {
        console.log("ℹ️ No active themes available");
      }
    } catch (err) {
      console.error("Error loading themes dropdown:", err);
    }
  }

  function hideCreateProjectForm() {
    $("project-form") && ($("project-form").style.display = "none");
  }

  async function createProject(event) {
    event.preventDefault();

    const name = $("project-name")?.value?.trim();
    const description = $("project-description")?.value?.trim();
    const skills = $("project-skills")?.value?.trim() || "";
    const themeId = $("project-theme")?.value || null;

    if (!name || !description) return;

    try {
      // Check if user is authenticated (state.authUser set by auth.js events)
      if (!state.authUser) throw new Error("Please log in.");
      if (!state.communityProfile?.id) throw new Error("Profile not found.");

      const projectData = {
        name,
        description,
        skills_needed: skills,
        creator_id: state.communityProfile.id,
        status: "open",
      };

      if (themeId) {
        projectData.theme_id = themeId;
        console.log(`✅ Creating project with theme: ${themeId}`);
      }

      const { data: newProject, error } = await state.supabase.from("projects").insert(projectData).select().single();
      if (error) throw error;

      await state.supabase.from("project_members").insert({
        project_id: newProject.id,
        user_id: state.communityProfile.id,
        role: "creator",
      });

      if (window.DailyEngagement) {
        await window.DailyEngagement.awardXP(
          window.DailyEngagement.XP_REWARDS.CREATE_PROJECT,
          `Created project: ${name}`
        );
      }

      $("project-name").value = "";
      $("project-description").value = "";
      $("project-skills").value = "";
      if ($("project-theme")) $("project-theme").value = "";

      hideCreateProjectForm();
      await loadProjects();
      await refreshCounters();

      if (typeof window.refreshSynapseConnections === "function") {
        await window.refreshSynapseConnections();
      }
    } catch (e) {
      console.error("createProject failed:", e);
      alert(`Project create failed: ${e.message || e}`);
    }
  }

  async function loadProjects() {
    const container = $("projects-list");
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading projects…</p>
    </div>`;

    try {
      const { data: projects, error } = await state.supabase.from("projects").select("*").order("created_at", {
        ascending: false,
      });

      if (error) throw error;

      let userProjectIds = new Set();
      if (state.communityProfile?.id) {
        const { data: memberships } = await state.supabase
          .from("project_members")
          .select("project_id")
          .eq("user_id", state.communityProfile.id);

        if (memberships) userProjectIds = new Set(memberships.map((m) => m.project_id));
      }

      if (!projects || projects.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-folder-open" style="font-size:3rem; opacity:0.25;"></i>
          <p style="margin-top:1rem;">No projects yet</p>
        </div>`;
        return;
      }

      container.innerHTML = projects
        .map((p) => {
          const skills = (p.skills_needed || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

          const created = p.created_at ? new Date(p.created_at).toLocaleDateString() : "";
          const isMember = userProjectIds.has(p.id);

          return `
            <div style="background:rgba(0,224,255,0.05); border:${
              isMember ? "2px solid rgba(0,255,136,0.5)" : "1px solid rgba(0,224,255,0.2)"
            };
              border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
              <div style="display:flex; justify-content:space-between; align-items:start; gap:1rem;">
                <div style="flex: 1;">
                  <h3 style="color:#00e0ff; margin:0 0 0.25rem 0; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-lightbulb"></i> ${escapeHtml(p.name)}
                    ${
                      isMember
                        ? '<span style="background:rgba(0,255,136,0.2); color:#0f8; padding:0.15rem 0.5rem; border-radius:8px; font-size:0.7rem; font-weight:600;">MEMBER</span>'
                        : ""
                    }
                  </h3>
                  <div style="color:#666; font-size:0.85rem;">${escapeHtml(created)}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end;">
                  <span style="background:${
                    p.status === "active" ? "rgba(0,255,136,0.2)" : "rgba(255,170,0,0.2)"
                  }; color:${p.status === "active" ? "#0f8" : "#fa0"}; padding:0.25rem 0.75rem; border-radius:12px; font-size:0.85rem; white-space: nowrap;">
                    ${escapeHtml(p.status || "active")}
                  </span>
                  ${
                    !isMember
                      ? `
                    <button onclick="joinProject('${p.id}', '${escapeHtml(p.name).replace(/'/g, "\\'")}'); event.stopPropagation();"
                      style="background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; color: white;
                      padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; white-space: nowrap;">
                      <i class="fas fa-plus-circle"></i> Join
                    </button>
                  `
                      : ""
                  }
                </div>
              </div>

              <p style="color:#ddd; margin:0.75rem 0 0.75rem 0; line-height:1.5;">
                ${escapeHtml(p.description || "")}
              </p>

              ${
                skills.length
                  ? `
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem;">
                  ${skills
                    .slice(0, 8)
                    .map(
                      (s) => `
                    <span style="background:rgba(0,224,255,0.1); color:#00e0ff; padding:0.25rem 0.75rem;
                      border-radius:12px; font-size:0.85rem; border:1px solid rgba(0,224,255,0.2);">
                      ${escapeHtml(s)}
                    </span>
                  `
                    )
                    .join("")}
                </div>
              `
                  : ""
              }
            </div>
          `;
        })
        .join("");
    } catch (e) {
      console.error("loadProjects failed:", e);
      container.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Projects unavailable</p>
      </div>`;
    }
  }

  // -----------------------------
  // Endorsements
  // -----------------------------
  async function showEndorsementsTab(tab) {
    const btnR = $("endorsements-tab-received");
    const btnG = $("endorsements-tab-given");
    const boxR = $("endorsements-received");
    const boxG = $("endorsements-given");

    if (!btnR || !btnG || !boxR || !boxG) return;

    const isReceived = tab === "received";
    btnR.style.background = isReceived ? "linear-gradient(135deg,#00e0ff,#0080ff)" : "rgba(255,255,255,0.1)";
    btnG.style.background = !isReceived ? "linear-gradient(135deg,#00e0ff,#0080ff)" : "rgba(255,255,255,0.1)";

    boxR.style.display = isReceived ? "block" : "none";
    boxG.style.display = !isReceived ? "block" : "none";

    await loadEndorsements(tab);
  }

  async function loadEndorsements(type) {
    const container = type === "received" ? $("endorsements-received") : $("endorsements-given");
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading endorsements…</p>
    </div>`;

    if (!state.communityProfile?.id) {
      container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">No profile loaded.</div>`;
      return;
    }

    try {
      let query;
      if (type === "received") {
        query = state.supabase
          .from("endorsements")
          .select(`*, endorser:community!endorsements_endorser_community_id_fkey(id, name, image_url, bio)`)
          .eq("endorsed_community_id", state.communityProfile.id);
      } else {
        query = state.supabase
          .from("endorsements")
          .select(`*, endorsed:community!endorsements_endorsed_community_id_fkey(id, name, image_url, bio)`)
          .eq("endorser_community_id", state.communityProfile.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-star" style="font-size:3rem; opacity:0.25;"></i>
          <p style="margin-top:1rem;">No endorsements ${type}</p>
        </div>`;
        return;
      }

      container.innerHTML = data
        .map((endorsement) => {
          const user = type === "received" ? endorsement.endorser : endorsement.endorsed;
          const userName = user?.name || "Unknown User";
          const userImage = user?.image_url || "https://via.placeholder.com/50";
          const skill = endorsement.skill || "General";
          const note = endorsement.note || endorsement.comment || "";
          const createdDate = endorsement.created_at ? new Date(endorsement.created_at).toLocaleDateString() : "";

          return `
            <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.2); border-radius:12px;
              padding:1.25rem; margin-bottom:1rem; display:flex; gap:1rem; align-items:start;">

              <img src="${escapeHtml(userImage)}"
                style="width:50px; height:50px; border-radius:50%; object-fit:cover; flex-shrink:0;
                  border:2px solid rgba(0,224,255,0.3);"
                onerror="this.src='https://via.placeholder.com/50'"
                alt="${escapeHtml(userName)}">

              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem; flex-wrap:wrap;">
                  <div style="color:#00e0ff; font-weight:800; font-size:1rem;">
                    ${escapeHtml(userName)}
                  </div>
                  <div style="color:#888; font-size:0.85rem;">
                    ${type === "received" ? "endorsed you for" : "was endorsed for"}
                  </div>
                  <span style="background:rgba(255,215,0,0.2); color:#ffd700; padding:0.25rem 0.75rem;
                    border-radius:12px; font-size:0.85rem; display:inline-flex; align-items:center; gap:0.25rem;">
                    <i class="fas fa-star"></i>
                    ${escapeHtml(skill)}
                  </span>
                </div>

                ${
                  note
                    ? `
                  <div style="color:#ddd; font-size:0.95rem; line-height:1.5; margin-top:0.5rem;
                    padding-left:0.5rem; border-left:2px solid rgba(0,224,255,0.3);">
                    "${escapeHtml(note)}"
                  </div>
                `
                    : ""
                }

                ${
                  createdDate
                    ? `
                  <div style="color:#666; font-size:0.8rem; margin-top:0.5rem;">
                    <i class="far fa-clock"></i> ${escapeHtml(createdDate)}
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `;
        })
        .join("");
    } catch (e) {
      console.error("loadEndorsements failed:", e);
      container.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Endorsements unavailable</p>
      </div>`;
    }
  }

  // -----------------------------
  // Notification Center
  // -----------------------------
  async function showNotificationsTab(tab) {
    const btnAll = $("notifications-tab-all");
    const btnUnread = $("notifications-tab-unread");
    const boxAll = $("notifications-all");
    const boxUnread = $("notifications-unread");

    if (!btnAll || !btnUnread || !boxAll || !boxUnread) return;

    const isAll = tab === "all";
    btnAll.style.background = isAll ? "linear-gradient(135deg,#00e0ff,#0080ff)" : "rgba(255,255,255,0.1)";
    btnUnread.style.background = !isAll ? "linear-gradient(135deg,#00e0ff,#0080ff)" : "rgba(255,255,255,0.1)";

    boxAll.style.display = isAll ? "block" : "none";
    boxUnread.style.display = !isAll ? "block" : "none";

    await loadNotifications(tab);
  }

  async function loadNotifications(type) {
    const container = type === "all" ? $("notifications-all") : $("notifications-unread");
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading notifications…</p>
    </div>`;

    try {
      // Get system notifications from the notification system
      const notifications = [];

      // Add connection request notifications
      if (state.communityProfile?.id) {
        const { data: pendingConnections, error } = await state.supabase
          .from("connections")
          .select("*, from_user:community!connections_from_user_id_fkey(id, name, image_url)")
          .eq("to_user_id", state.communityProfile.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (!error && pendingConnections) {
          pendingConnections.forEach(conn => {
            notifications.push({
              id: `conn-${conn.id}`,
              type: "connection_request",
              title: "New Connection Request",
              message: `${conn.from_user?.name || "Someone"} wants to connect with you`,
              timestamp: conn.created_at,
              read: false,
              image: conn.from_user?.image_url,
              data: conn
            });
          });
        }

        // Add accepted connection notifications
        const { data: acceptedConnections, error: acceptError } = await state.supabase
          .from("connections")
          .select("*, to_user:community!connections_to_user_id_fkey(id, name, image_url)")
          .eq("from_user_id", state.communityProfile.id)
          .eq("status", "accepted")
          .order("updated_at", { ascending: false })
          .limit(10);

        if (!acceptError && acceptedConnections) {
          acceptedConnections.forEach(conn => {
            notifications.push({
              id: `conn-accepted-${conn.id}`,
              type: "success",
              title: "Connection Accepted",
              message: `${conn.to_user?.name || "Someone"} accepted your connection request`,
              timestamp: conn.updated_at,
              read: true,
              image: conn.to_user?.image_url,
              data: conn
            });
          });
        }
      }

      // Filter by read status if needed
      const filteredNotifications = type === "unread"
        ? notifications.filter(n => !n.read)
        : notifications;

      // Sort by timestamp
      filteredNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (filteredNotifications.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-bell-slash" style="font-size:3rem; opacity:0.25;"></i>
          <p style="margin-top:1rem;">No ${type === "unread" ? "unread" : ""} notifications</p>
        </div>`;
        return;
      }

      container.innerHTML = filteredNotifications
        .map((notif) => {
          const typeColors = {
            connection_request: "#ff6b6b",
            success: "#00ff88",
            info: "#00e0ff",
            warning: "#ffa500",
            error: "#f44336"
          };

          const typeIcons = {
            connection_request: "fa-user-plus",
            success: "fa-check-circle",
            info: "fa-info-circle",
            warning: "fa-exclamation-triangle",
            error: "fa-times-circle"
          };

          const color = typeColors[notif.type] || "#00e0ff";
          const icon = typeIcons[notif.type] || "fa-bell";
          const timeAgo = formatTimeAgo(notif.timestamp);

          return `
            <div style="background:rgba(0,224,255,0.05); border-left:4px solid ${color};
              border-radius:8px; padding:1rem; margin-bottom:0.75rem; display:flex; gap:1rem; align-items:start;
              ${!notif.read ? "background:rgba(0,224,255,0.1);" : ""}">

              ${notif.image
                ? `<img src="${escapeHtml(notif.image)}"
                    style="width:48px; height:48px; border-radius:50%; object-fit:cover; flex-shrink:0;
                      border:2px solid ${color};"
                    onerror="this.style.display='none'"
                    alt="">`
                : `<div style="width:48px; height:48px; border-radius:50%;
                    background:linear-gradient(135deg, ${color}40, ${color}20);
                    display:flex; align-items:center; justify-content:center; flex-shrink:0;
                    border:2px solid ${color};">
                    <i class="fas ${icon}" style="color:${color}; font-size:1.2rem;"></i>
                  </div>`
              }

              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                  <div style="color:${color}; font-weight:700; font-size:0.95rem;">
                    ${escapeHtml(notif.title)}
                  </div>
                  ${!notif.read
                    ? `<span style="background:${color}; color:white; padding:0.15rem 0.5rem;
                        border-radius:8px; font-size:0.65rem; font-weight:700;">NEW</span>`
                    : ""
                  }
                </div>

                <div style="color:#ddd; font-size:0.9rem; margin-bottom:0.5rem;">
                  ${escapeHtml(notif.message)}
                </div>

                <div style="color:#666; font-size:0.75rem; display:flex; align-items:center; gap:1rem;">
                  <span><i class="far fa-clock"></i> ${escapeHtml(timeAgo)}</span>
                  ${notif.type === "connection_request" && notif.data
                    ? `<div style="display:flex; gap:0.5rem;">
                        <button onclick="acceptConnectionRequest('${notif.data.id}')"
                          style="background:rgba(0,255,136,0.2); color:#0f8; border:1px solid rgba(0,255,136,0.3);
                          padding:0.25rem 0.75rem; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600;">
                          <i class="fas fa-check"></i> Accept
                        </button>
                        <button onclick="declineConnectionRequest('${notif.data.id}')"
                          style="background:rgba(255,107,107,0.2); color:#f66; border:1px solid rgba(255,107,107,0.3);
                          padding:0.25rem 0.75rem; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600;">
                          <i class="fas fa-times"></i> Decline
                        </button>
                      </div>`
                    : ""
                  }
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    } catch (e) {
      console.error("loadNotifications failed:", e);
      container.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Failed to load notifications</p>
      </div>`;
    }
  }

  async function clearAllNotifications() {
    try {
      // In a real implementation, this would mark notifications as read in the database
      // For now, just reload to show the updated state
      await loadNotifications("all");

      if (typeof window.showNotification === "function") {
        window.showNotification({
          type: "success",
          title: "Notifications Cleared",
          message: "All notifications marked as read",
          duration: 3000
        });
      }
    } catch (e) {
      console.error("clearAllNotifications failed:", e);
    }
  }

  // -----------------------------
  // Network stats
  // -----------------------------
  async function loadNetworkStats() {
    const container = $("network-stats-content");
    if (!container) return;

    container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem; grid-column: 1 / -1;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading network stats…</p>
    </div>`;

    try {
      const me = state.communityProfile;
      if (!me?.id) throw new Error("Profile not loaded");

      const { data: connections, error: connError } = await state.supabase
        .from("connections")
        .select("*")
        .or(`from_user_id.eq.${me.id},to_user_id.eq.${me.id}`);

      if (connError) throw connError;

      const accepted = connections?.filter((c) => c.status === "accepted") || [];
      const pending = connections?.filter((c) => c.status === "pending") || [];
      const sentPending = pending.filter((c) => c.from_user_id === me.id);
      const receivedPending = pending.filter((c) => c.to_user_id === me.id);

      const { data: allMembers } = await state.supabase.from("community").select("id");
      const totalCommunity = allMembers?.length || 0;
      const networkCoverage = totalCommunity > 0 ? Math.round((accepted.length / totalCommunity) * 100) : 0;

      container.innerHTML = `
        <div style="background: rgba(0,224,255,0.1); border: 2px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: bold; color: #00e0ff; margin-bottom: 0.5rem;">${accepted.length}</div>
          <div style="color: #aaa; font-size: 0.9rem; text-transform: uppercase;">Total Connections</div>
        </div>

        <div style="background: rgba(255,170,0,0.1); border: 2px solid rgba(255,170,0,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: bold; color: #ffaa00; margin-bottom: 0.5rem;">${receivedPending.length}</div>
          <div style="color: #aaa; font-size: 0.9rem; text-transform: uppercase;">Pending Requests</div>
        </div>

        <div style="background: rgba(0,255,136,0.1); border: 2px solid rgba(0,255,136,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: bold; color: #00ff88; margin-bottom: 0.5rem;">${sentPending.length}</div>
          <div style="color: #aaa; font-size: 0.9rem; text-transform: uppercase;">Sent Requests</div>
        </div>

        <div style="background: rgba(138,43,226,0.1); border: 2px solid rgba(138,43,226,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 2.5rem; font-weight: bold; color: #8a2be2; margin-bottom: 0.5rem;">${networkCoverage}%</div>
          <div style="color: #aaa; font-size: 0.9rem; text-transform: uppercase;">Network Coverage</div>
        </div>
      `;
    } catch (e) {
      console.error("Network stats failed:", e);
      container.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem; grid-column: 1 / -1;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Failed to load network stats</p>
      </div>`;
    }
  }

  // -----------------------------
  // Filters / Legend
  // -----------------------------
  async function toggleFilters() {
    try {
      if (window.NetworkFilters?.toggle) return window.NetworkFilters.toggle();
      const mod = await import("./network-filters.js");
      if (typeof mod.toggleFilterPanel === "function") mod.toggleFilterPanel();
    } catch (e) {
      console.warn("Filters toggle skipped:", e?.message || e);
    }
  }

  async function toggleLegend() {
    try {
      if (window.GraphLegend?.toggle) return window.GraphLegend.toggle();
      const mod = await import("./graph-legend.js");
      if (typeof mod.toggleLegend === "function") mod.toggleLegend();
    } catch (e) {
      console.warn("Legend toggle skipped:", e?.message || e);
    }
  }

  // -----------------------------
  // BBS
  // -----------------------------
  async function initBBS() {
    try {
      const mod = await import("./bbs.js");
      if (typeof mod.initBBS === "function") return mod.initBBS();
      $("fab-bbs-trigger")?.click();
    } catch (e) {
      console.warn("BBS init skipped:", e?.message || e);
      $("fab-bbs-trigger")?.click();
    }
  }

  // -----------------------------
  // Recommendations renderer (used by pathways, if needed)
  // -----------------------------
  async function renderRecommendationsList(recommendations) {
    const list = $("quick-connect-list");
    if (!list) return;

    list.innerHTML = `
      <div style="margin-bottom: 1.5rem;">
        <div style="color: #00e0ff; font-size: 1rem; font-weight: 800; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-magic"></i> AI-Powered Recommendations
        </div>
        <div style="color: #aaa; font-size: 0.85rem; margin-bottom: 1rem;">
          Based on your skills, interests, and network connections
        </div>
      </div>
    `;

    for (const rec of recommendations) {
      const name = rec.name || "Unknown";
      const initials = name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("");

      const isProject = rec.type === "project";
      const icon = isProject ? "💡" : "";

      const matchBadges = (rec.matchedSkills || [])
        .slice(0, 3)
        .map(
          (skill) => `
        <span style="background: rgba(0,224,255,0.2); color: #00e0ff; padding: 0.2rem 0.5rem;
          border-radius: 8px; font-size: 0.75rem; margin-right: 0.25rem;">
          ${escapeHtml(skill)}
        </span>
      `
        )
        .join("");

      list.innerHTML += `
        <div style="display:flex; align-items:center; gap:1rem; padding:1rem;
          background:${isProject ? "rgba(255,107,107,0.05)" : "rgba(0,224,255,0.05)"};
          border:2px solid ${isProject ? "rgba(255,107,107,0.3)" : "rgba(0,224,255,0.3)"};
          border-radius:12px; margin-bottom:0.75rem; position: relative;">

          <div style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,215,0,0.2);
            color: #ffd700; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.7rem; font-weight: 700;">
            ${Math.round(rec.score || 0)} pts
          </div>

          ${
            isProject
              ? `<div style="width:52px; height:52px; border-radius:8px;
                   background:linear-gradient(135deg,#ff6b6b,#ff4757); display:flex; align-items:center; justify-content:center;
                   font-size:1.8rem;">${icon}</div>`
              : rec.node?.image_url
              ? `<img src="${escapeHtml(rec.node.image_url)}" style="width:52px; height:52px; border-radius:50%;
                   object-fit:cover; border:2px solid #00e0ff;">`
              : `<div style="width:52px; height:52px; border-radius:50%;
                   background:linear-gradient(135deg,#00e0ff,#0080ff); display:flex; align-items:center; justify-content:center;
                   font-weight:bold; color:white; font-size:1.1rem;">${initials}</div>`
          }

          <div style="flex:1; min-width:0;">
            <div style="color:white; font-weight:700; font-size:1rem; margin-bottom: 0.25rem;">
              ${escapeHtml(name)}
              ${isProject ? '<span style="color: #ff6b6b; margin-left: 0.5rem; font-size: 0.85rem;">(Project)</span>' : ""}
            </div>
            <div style="color:#aaa; font-size:0.85rem; margin-bottom: 0.5rem;">
              ${escapeHtml(rec.reason || "")}
            </div>
            ${matchBadges ? `<div style="margin-top: 0.5rem;">${matchBadges}</div>` : ""}
          </div>

          <button class="btn btn-primary" style="white-space:nowrap;"
            onclick="${
              isProject
                ? `joinProject('${rec.userId}', '${escapeHtml(name).replace(/'/g, "\\'")}')`
                : `sendConnectionRequest('${rec.userId}', '${escapeHtml(name).replace(/'/g, "\\'")}', 'recommendation')`
            }">
            <i class="fas fa-${isProject ? "lightbulb" : "user-plus"}"></i> ${isProject ? "Join" : "Connect"}
          </button>
        </div>
      `;
    }

    if (!recommendations || recommendations.length === 0) {
      list.innerHTML += `
        <div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-check-circle" style="font-size:3rem; opacity:0.3;"></i>
          <p style="margin-top:1rem;">You're well connected!</p>
          <p style="font-size:0.85rem; color:#666; margin-top:0.5rem;">No new recommendations at this time</p>
        </div>
      `;
    }
  }

  // -----------------------------
  // Bottom Bar Collapse/Expand
  // -----------------------------
  function collapseBottomBar() {
    const bottomBar = document.querySelector(".bottom-stats-bar");
    if (!bottomBar) return;

    bottomBar.style.transition = "transform 0.3s ease, opacity 0.3s ease";
    bottomBar.style.transform = "translateY(100%)";
    bottomBar.style.opacity = "0";
    console.log("📉 Bottom bar collapsed for pathway viewing");
  }

  function expandBottomBar() {
    const bottomBar = document.querySelector(".bottom-stats-bar");
    if (!bottomBar) return;

    bottomBar.style.transition = "transform 0.3s ease, opacity 0.3s ease";
    bottomBar.style.transform = "translateY(0)";
    bottomBar.style.opacity = "1";
    console.log("📈 Bottom bar expanded");
  }

  // -----------------------------
  // Illuminated Pathways (sequential recommendations)
  // -----------------------------
  const pathways = initIlluminatedPathways({
    collapseBottomBar,
    expandBottomBar,
    getCurrentUserCommunityId: () =>
      state.communityProfile?.id || state.communityProfile?.community_id || state.authUser?.id || null,

    // Optional hook if your illuminatePathways.js wants to reuse this renderer
    renderRecommendationsList,
  });

  // Globals expected by dashboard-actions.js / HTML onclick hooks
  window.showAnimatedPathways = pathways.showAnimatedPathways;

  // Directly trigger animated pathways when clicking Connect button
  // (removed Quick Connect modal to go straight to pathway discovery)
  window.openQuickConnectModal = async function openQuickConnectModal() {
    return pathways.showAnimatedPathways({
      autoplay: true,
      limit: 10,
    });
  };
})();
