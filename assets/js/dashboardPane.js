/* ==========================================================================
 * CharlestonHacks Innovation Engine — Dashboard Pane Controller (2026-ready)
 * File: assets/js/dashboardPane.js
 *
 * Goals:
 * - Works even if auth.js/profile.js are imperfect (fallback logic included)
 * - Wires all UI buttons & modals
 * - Initializes Synapse on profile-loaded
 * - Updates bottom stats counters
 * - Provides global modal functions used by HTML close buttons
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
    communityProfile: null, // row from community table
    synapseInitialized: false,
    refreshTimer: null,
    currentConversationId: null,
    currentConversationData: null,
  };

  // -----------------------------
  // DOM Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");
  const openModal = (id) => $(id)?.classList.add("active");
  const closeModal = (id) => $(id)?.classList.remove("active");


// -----------------------------
// Global Click Delegation
// -----------------------------
// Many UI buttons are injected dynamically (Synapse/NodePanel/etc).
// To make "Edit Profile" work everywhere without hunting down each template,
// we delegate clicks to a single handler.
function bindEditProfileDelegation() {
  if (window.__IE_EDIT_PROFILE_DELEGATION__) return;
  window.__IE_EDIT_PROFILE_DELEGATION__ = true;

  document.addEventListener("click", (evt) => {
    const t = evt.target;
    if (!t) return;

    // Match any "Edit Profile" triggers we might have across pages.
    // (IDs/classes are best; data-action is preferred; text match is a last resort.)
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

    // Fallback: exact text match
    const textBtn = !trigger
      ? t.closest("button,a,[role='button']")
      : null;
    const text = (textBtn?.innerText || "").trim();

    const isTextMatch =
      !trigger && (text === "Edit Profile" || text === "Edit profile");

    if (!trigger && !isTextMatch) return;

    evt.preventDefault();
    evt.stopPropagation();

    if (typeof window.openProfileEditor === "function") {
      window.openProfileEditor();
      return;
    }

  // Enable global Edit Profile click handling
  bindEditProfileDelegation();


    // Legacy fallback if some module uses a different name
    if (typeof window.openProfileModal === "function") {
      window.openProfileModal();
      return;
    }

    console.warn("Edit Profile clicked, but no editor function is available on window.");
  }, true);
}


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
    // Ensure Supabase is globally available for other scripts
    state.supabase = window.supabase || importedSupabase;
    window.supabase = state.supabase;

    wireUI();
    wireGlobalFunctions();

    // Listen for existing app events
    window.addEventListener("profile-loaded", async (e) => {
      if (e?.detail?.profile) state.communityProfile = e.detail.profile;
      await onAppReady();
    });

    // If already logged in, proceed
    await hydrateAuthUser();
    if (state.authUser) {
      await ensureCommunityProfile();
      await onAppReady();
    } else {
      showLogin();
    }

    // Auth state changes (handles redirects / returning from OAuth)
    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.authUser = session?.user || null;
      if (!state.authUser) {
        showLogin();
        return;
      }
      await ensureCommunityProfile();
      // Fire profile-loaded if the app didn't
      dispatchProfileLoadedIfNeeded();
      await onAppReady();
    });
  }

  // -----------------------------
  // UI Wiring
  // -----------------------------
  function wireUI() {
    // Login buttons (fallback if auth.js doesn't attach handlers)
    $("github-login")?.addEventListener("click", () => oauthLogin("github"));
    $("google-login")?.addEventListener("click", () => oauthLogin("google"));

    // Header actions
    $("user-menu")?.addEventListener("click", () => window.openProfileModal());
    $("notifications-bell")?.addEventListener("click", async () => {
      // If you have a notification panel elsewhere, hook it here
      // For now, open Quick Connect as a useful “inbox”
      window.openQuickConnectModal();
    });

    // Search
    $("search-button")?.addEventListener("click", () => handleSearch());
    $("global-search")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSearch();
    });

    // Bottom bar buttons
    $("btn-messages")?.addEventListener("click", () => window.openMessagesModal());
    $("btn-projects")?.addEventListener("click", () => window.openProjectsModal());
    $("btn-endorsements")?.addEventListener("click", () => window.openEndorsementsModal());
    $("btn-bbs")?.addEventListener("click", () => initBBS());
    $("btn-profile")?.addEventListener("click", () => window.openProfileModal());
    $("btn-quickconnect")?.addEventListener("click", () => window.openQuickConnectModal());
    $("btn-filters")?.addEventListener("click", () => toggleFilters());
    $("btn-legend")?.addEventListener("click", () => toggleLegend());

    // Close profile modal button already uses closeProfileModal()
  }

  function wireGlobalFunctions() {
    // Modals
    window.openProfileModal = () => openModal("profile-modal");
    window.closeProfileModal = () => closeModal("profile-modal");

    window.openMessagesModal = async () => {
      openModal("messages-modal");
      await loadConversationsForModal();
    };
    window.closeMessagesModal = () => closeModal("messages-modal");

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

    window.openQuickConnectModal = async () => {
      openModal("quick-connect-modal");
      await loadSuggestedConnections();
    };
    window.closeQuickConnectModal = () => closeModal("quick-connect-modal");

    // Endorsements tabs
    window.showEndorsementsTab = showEndorsementsTab;

    // Projects form controls
    window.showCreateProjectForm = showCreateProjectForm;
    window.hideCreateProjectForm = hideCreateProjectForm;
    window.createProject = createProject;

    // Messaging
    window.openConversationById = openConversationById;
    window.sendModalMessage = sendModalMessage;
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

  async function hydrateAuthUser() {
    try {
      const { data, error } = await state.supabase.auth.getUser();
      if (error) throw error;
      state.authUser = data?.user || null;
      return state.authUser;
    } catch (e) {
      console.warn("auth.getUser failed:", e?.message || e);
      state.authUser = null;
      return null;
    }
  }

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

  async function ensureCommunityProfile() {
    if (!state.authUser) return null;
    if (state.communityProfile?.id) return state.communityProfile;

    // Try to load existing profile
    const { data: existing, error: exErr } = await state.supabase
      .from("community")
      .select("*")
      .eq("user_id", state.authUser.id)
      .maybeSingle();

    if (!exErr && existing) {
      state.communityProfile = existing;
      return existing;
    }

    // Create a minimal profile if missing
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

    const { data: created, error: createErr } = await state.supabase
      .from("community")
      .insert(payload)
      .select("*")
      .single();

    if (createErr) {
      console.warn("Could not create community profile:", createErr.message);
      return null;
    }

    state.communityProfile = created;
    return created;
  }

  function dispatchProfileLoadedIfNeeded() {
    // If other modules already dispatched, do nothing.
    // We infer it by checking whether state.communityProfile exists; if it does, dispatch once.
    if (!state.communityProfile?.id) return;

    const evt = new CustomEvent("profile-loaded", {
      detail: { profile: state.communityProfile },
    });
    window.dispatchEvent(evt);
  }

  async function onAppReady() {
    if (!state.authUser) return;
    showApp();

    renderHeaderIdentity();
    await initSynapseOnce();
    await refreshCounters();

    // Refresh counters every 30s
    if (!state.refreshTimer) {
      state.refreshTimer = setInterval(refreshCounters, 30000);
    }
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

    // Image avatar if you have one (optional)
    // You can extend header avatar container later.
  }

  // -----------------------------
  // Synapse
  // -----------------------------
  async function initSynapseOnce() {
    if (state.synapseInitialized) return;
    state.synapseInitialized = true;

    try {
      // Only attempt if file exists in your repo
      const mod = await import("./synapse.js");
      if (typeof mod.initSynapseView === "function") {
        await mod.initSynapseView();
      } else {
        console.warn("synapse.js loaded but initSynapseView not found");
      }
    } catch (e) {
      console.warn("Synapse init skipped:", e?.message || e);
    }
  }

  // -----------------------------
  // Counters
  // -----------------------------
  async function refreshCounters() {
    // These are “best-effort” counts; if a table doesn’t exist, we don’t crash.
    await Promise.allSettled([
      countUnreadMessages(),
      countActiveProjects(),
      countEndorsementsReceived(),
      countNetworkSize(),
    ]);
  }

  async function countUnreadMessages() {
    if (!state.communityProfile?.id) return;
    try {
      const { count, error } = await state.supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("read", false)
        .neq("sender_id", state.communityProfile.id);

      if (error) throw error;
      safeText("unread-messages", count ?? 0);
    } catch (e) {
      // Table might not exist or schema differs
      safeText("unread-messages", 0);
    }
  }

  async function countActiveProjects() {
    try {
      const { count, error } = await state.supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      if (error) throw error;
      safeText("active-projects", count ?? 0);
    } catch (e) {
      safeText("active-projects", 0);
    }
  }

  async function countEndorsementsReceived() {
    if (!state.communityProfile?.id) return;
    try {
      const { count, error } = await state.supabase
        .from("endorsements")
        .select("id", { count: "exact", head: true })
        .eq("endorsed_community_id", state.communityProfile.id);

      if (error) throw error;
      safeText("total-endorsements", count ?? 0);
    } catch (e) {
      safeText("total-endorsements", 0);
    }
  }

  async function countNetworkSize() {
    try {
      const { count, error } = await state.supabase
        .from("community")
        .select("id", { count: "exact", head: true });

      if (error) throw error;
      safeText("network-size", count ?? 0);
    } catch (e) {
      safeText("network-size", 0);
    }
  }

  // -----------------------------
  // Search + Quick Connect
  // -----------------------------
  async function handleSearch() {
    const q = $("global-search")?.value?.trim();
    if (!q) return;
    openModal("quick-connect-modal");
    await renderSearchResults(q);
  }

  async function renderSearchResults(query) {
    const list = $("quick-connect-list");
    if (!list) return;

    list.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Searching…</p>
    </div>`;

    try {
      const q = query.toLowerCase();
      const { data: people, error } = await state.supabase
        .from("community")
        .select("*")
        .or(`name.ilike.%${q}%,skills.ilike.%${q}%,bio.ilike.%${q}%`)
        .limit(25);

      if (error) throw error;

      if (!people || people.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-search" style="font-size:3rem; opacity:0.25;"></i>
          <p style="margin-top:1rem;">No results for “${escapeHtml(query)}”</p>
        </div>`;
        return;
      }

      list.innerHTML = people
        .filter((p) => p.id !== state.communityProfile?.id)
        .map((p) => personCard(p))
        .join("");
    } catch (e) {
      console.error("Search failed:", e);
      list.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Search failed</p>
        <p style="opacity:0.85;">${escapeHtml(e.message || String(e))}</p>
      </div>`;
    }
  }

  async function loadSuggestedConnections() {
    const list = $("quick-connect-list");
    if (!list) return;

    list.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading suggestions…</p>
    </div>`;

    try {
      const { data: allUsers, error } = await state.supabase
        .from("community")
        .select("*")
        .limit(200);

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

          const score = mySkills.length
            ? mySkills.filter((s) => theirSkills.includes(s)).length
            : 0;

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

    const skills = (person.skills || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);

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

  // Connection requests: uses your existing connections module if present,
  // otherwise falls back to direct insert into "connections" table (best-effort).
  window.sendConnectionRequest = async function (toCommunityId) {
    try {
      if (!state.communityProfile?.id) throw new Error("No profile loaded.");

      // Preferred: use your existing connections module if it exists
      if (window.ConnectionsModule?.sendConnectionRequest) {
        await window.ConnectionsModule.sendConnectionRequest(toCommunityId);
        alert("Connection request sent!");
        return;
      }

      // Fallback: direct insert (schema may differ in your project)
      const { error } = await state.supabase
        .from("connections")
        .insert({
          from_user_id: state.communityProfile.id,
          to_user_id: toCommunityId,
          status: "pending",
        });

      if (error) throw error;
      alert("Connection request sent!");
    } catch (e) {
      console.error("sendConnectionRequest failed:", e);
      alert(`Could not send request: ${e.message || e}`);
    }
  };

  // -----------------------------
  // Messaging (simple, best-effort)
  // -----------------------------
  async function loadConversationsForModal() {
    const listEl = $("modal-conversations-list");
    const messagesEl = $("modal-conversation-messages");
    const titleEl = $("modal-conversation-title");

    if (!listEl || !messagesEl || !titleEl) return;

    listEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i>
      <p style="margin-top:1rem;">Loading conversations…</p>
    </div>`;

    messagesEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
      <i class="fas fa-comment-dots" style="font-size:2rem; opacity:0.3;"></i>
      <p style="margin-top:1rem;">Select a conversation</p>
    </div>`;

    try {
      await hydrateAuthUser();
      if (!state.authUser) {
        listEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">Please log in.</div>`;
        return;
      }

      const { data: conversations, error } = await state.supabase
        .from("conversations")
        .select("*")
        .or(`participant_1_id.eq.${state.authUser.id},participant_2_id.eq.${state.authUser.id}`)
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      if (!conversations || conversations.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-comments" style="font-size:2rem; opacity:0.3;"></i>
          <p style="margin-top:0.75rem;">No conversations yet</p>
          <button class="btn btn-primary" style="margin-top:1rem;" onclick="closeMessagesModal(); openQuickConnectModal();">
            <i class="fas fa-user-plus"></i> Find people
          </button>
        </div>`;
        return;
      }

      // Build participant map
      const ids = new Set();
      conversations.forEach((c) => {
        if (c.participant_1_id !== state.authUser.id) ids.add(c.participant_1_id);
        if (c.participant_2_id !== state.authUser.id) ids.add(c.participant_2_id);
      });

      const { data: profiles } = await state.supabase
        .from("community")
        .select("id, user_id, name, image_url")
        .in("user_id", Array.from(ids));

      const profileMap = {};
      (profiles || []).forEach((p) => (profileMap[p.user_id] = p));

      listEl.innerHTML = conversations
        .map((conv) => {
          const otherId = conv.participant_1_id === state.authUser.id ? conv.participant_2_id : conv.participant_1_id;
          const other = profileMap[otherId];
          const otherName = other?.name || "Unknown";
          const initials = otherName.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
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
        .join("");
    } catch (e) {
      console.error("loadConversationsForModal failed:", e);
      $("modal-conversations-list").innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:0.75rem;">Messages unavailable</p>
      </div>`;
    }
  }

  async function openConversationById(conversationId, name) {
    state.currentConversationId = conversationId;
    $("modal-conversation-title").textContent = name;
    $("modal-message-input").style.display = "block";
    await loadMessagesForConversation(conversationId);
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
    event.preventDefault();
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

      // update conversation preview (best effort)
      await state.supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: text.slice(0, 100),
        })
        .eq("id", state.currentConversationId);

      input.value = "";
      await loadMessagesForConversation(state.currentConversationId);
      await refreshCounters();
    } catch (e) {
      console.error("sendModalMessage failed:", e);
      alert(`Failed to send: ${e.message || e}`);
    }
  }

  // -----------------------------
  // Projects
  // -----------------------------
  function showCreateProjectForm() {
    $("project-form") && ($("project-form").style.display = "block");
  }

  function hideCreateProjectForm() {
    $("project-form") && ($("project-form").style.display = "none");
  }

  async function createProject(event) {
    event.preventDefault();

    const name = $("project-name")?.value?.trim();
    const description = $("project-description")?.value?.trim();
    const skills = $("project-skills")?.value?.trim() || "";

    if (!name || !description) return;

    try {
      await hydrateAuthUser();
      if (!state.authUser) throw new Error("Please log in.");

      // Get creator's community profile ID
      const { data: creatorProfile, error: profileError } = await state.supabase
        .from("community")
        .select("id")
        .eq("user_id", state.authUser.id)
        .single();

      if (profileError || !creatorProfile) {
        throw new Error("Profile not found. Please complete your profile first.");
      }

      // Insert the project with creator_id as the community profile ID
      const { data: newProject, error } = await state.supabase
        .from("projects")
        .insert({
          name,
          description,
          skills_needed: skills,
          creator_id: creatorProfile.id,
          status: "open",
        })
        .select()
        .single();

      if (error) throw error;

      // Automatically add creator as first team member
      const { error: memberError } = await state.supabase
        .from("project_members")
        .insert({
          project_id: newProject.id,
          user_id: creatorProfile.id,
          role: "creator"
        });

      if (memberError) {
        console.error("Failed to add creator as member:", memberError);
        // Don't fail the whole operation, just log it
      }

      $("project-name").value = "";
      $("project-description").value = "";
      $("project-skills").value = "";
      hideCreateProjectForm();
      await loadProjects();
      await refreshCounters();

      // Show success message
      const toast = document.createElement("div");
      toast.style.cssText = `
        position: fixed; top: 100px; right: 20px;
        background: linear-gradient(135deg, #00ff88, #00cc70);
        color: white; padding: 1rem 1.5rem; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; font-weight: bold;
      `;
      toast.innerHTML = '<i class="fas fa-check-circle"></i> Project created successfully!';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);

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
      const { data: projects, error } = await state.supabase
        .from("projects")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!projects || projects.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#aaa; padding:2rem;">
          <i class="fas fa-folder-open" style="font-size:3rem; opacity:0.25;"></i>
          <p style="margin-top:1rem;">No projects yet</p>
        </div>`;
        return;
      }

      container.innerHTML = projects.map((p) => {
        const skills = (p.skills_needed || "").split(",").map(s => s.trim()).filter(Boolean);
        const created = p.created_at ? new Date(p.created_at).toLocaleDateString() : "";
        return `
          <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.2);
            border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:start; gap:1rem;">
              <div>
                <h3 style="color:#00e0ff; margin:0 0 0.25rem 0;">
                  <i class="fas fa-lightbulb"></i> ${escapeHtml(p.name)}
                </h3>
                <div style="color:#666; font-size:0.85rem;">${escapeHtml(created)}</div>
              </div>
              <span style="background:rgba(0,255,136,0.2); color:#0f8; padding:0.25rem 0.75rem; border-radius:12px; font-size:0.85rem;">
                ${escapeHtml(p.status || "active")}
              </span>
            </div>

            <p style="color:#ddd; margin:0.75rem 0 0.75rem 0; line-height:1.5;">
              ${escapeHtml(p.description || "")}
            </p>

            ${skills.length ? `
              <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem;">
                ${skills.slice(0, 8).map(s => `
                  <span style="background:rgba(0,224,255,0.1); color:#00e0ff; padding:0.25rem 0.75rem;
                    border-radius:12px; font-size:0.85rem; border:1px solid rgba(0,224,255,0.2);">
                    ${escapeHtml(s)}
                  </span>
                `).join("")}
              </div>
            ` : ""}
          </div>
        `;
      }).join("");
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
          .select("*")
          .eq("endorsed_community_id", state.communityProfile.id);
      } else {
        query = state.supabase
          .from("endorsements")
          .select("*")
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

      // Group by skill (if column exists)
      const bySkill = {};
      data.forEach((e) => {
        const key = e.skill || "Endorsement";
        bySkill[key] = bySkill[key] || [];
        bySkill[key].push(e);
      });

      container.innerHTML = Object.entries(bySkill).map(([skill, list]) => `
        <div style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.2); border-radius:12px;
          padding:1.25rem; margin-bottom:1rem;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
            <i class="fas fa-star" style="color:#ffd700;"></i>
            <div style="color:#00e0ff; font-weight:800;">${escapeHtml(skill)}</div>
            <span style="margin-left:auto; background:rgba(0,224,255,0.2); color:#00e0ff; padding:0.2rem 0.6rem; border-radius:12px; font-size:0.85rem;">
              ${list.length}
            </span>
          </div>
          <div style="color:#ddd; font-size:0.9rem; line-height:1.5;">
            ${list.map(x => escapeHtml(x.note || x.comment || "")).filter(Boolean).slice(0, 6).map(t => `• ${t}`).join("<br>") || "—"}
          </div>
        </div>
      `).join("");
    } catch (e) {
      console.error("loadEndorsements failed:", e);
      container.innerHTML = `<div style="text-align:center; color:#f66; padding:2rem;">
        <i class="fas fa-exclamation-triangle" style="font-size:2rem;"></i>
        <p style="margin-top:1rem;">Endorsements unavailable</p>
      </div>`;
    }
  }

  // -----------------------------
  // Filters / Legend
  // -----------------------------
  async function toggleFilters() {
    try {
      // If your network-filters module exposes a toggle, call it.
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
      // Preferred: your existing module
      const mod = await import("./bbs.js");
      if (typeof mod.initBBS === "function") {
        mod.initBBS();
        return;
      }
      // Legacy fallback: click hidden trigger
      $("fab-bbs-trigger")?.click();
    } catch (e) {
      console.warn("BBS init skipped:", e?.message || e);
      $("fab-bbs-trigger")?.click();
    }
  }
})();
