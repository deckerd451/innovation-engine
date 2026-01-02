/* ==========================================================================
 * CharlestonHacks Innovation Engine — Dashboard Pane Controller (2026-ready)
 * File: assets/js/dashboardPane.js
 *
 * What this file does:
 * - Establishes a single, reliable Supabase client reference
 * - Hydrates auth session + maps auth.uid() -> community.id (via community.user_id)
 * - Wires dashboard UI buttons, modals, and counters
 * - Provides Projects create + list (schema-safe: title + required_skills[] + tags[])
 * - Provides Conversations list + start + open (schema-safe: participant_1_id/2_id are COMMUNITY ids)
 * - Adds global helpers used by inline HTML handlers (openModal/closeModal/scrollToSection/etc.)
 *
 * Notes:
 * - This file is defensive: if a table (e.g., messages) differs in your DB, the UI shows a helpful
 *   notice rather than hard-crashing.
 * ========================================================================== */

import { supabase as importedSupabase } from "./supabaseClient.js";

(function () {
  "use strict";

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    supabase: null,
    authUser: null,            // auth.users row
    communityProfile: null,    // public.community row
    refreshTimer: null,
    synapseInitialized: false,
    currentConversationId: null,
    currentConversationData: null,
  };

  
// -----------------------------
// Robust "wait for" helper (Synapse loads asynchronously in your stack)
// -----------------------------
const waitFor = (fn, { timeout = 12000, interval = 200 } = {}) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      try {
        const v = fn();
        if (v) {
          clearInterval(t);
          resolve(v);
        } else if (Date.now() - start > timeout) {
          clearInterval(t);
          reject(new Error("Timed out waiting for dependency"));
        }
      } catch (e) {
        clearInterval(t);
        reject(e);
      }
    }, interval);
  });

// -----------------------------
// Synapse init (supports multiple global entrypoints)
// -----------------------------
async function initSynapseWhenReady(reason = "unknown") {
  if (state.synapseInitialized) return;

  const maybeProfile = state.communityProfile || null;

  const findEntrypoint = () => {
    if (typeof window.initSynapseView === "function") return () => window.initSynapseView(maybeProfile);
    if (window.synapse && typeof window.synapse.init === "function") return () => window.synapse.init(maybeProfile);
    if (window.Synapse && typeof window.Synapse.init === "function") return () => window.Synapse.init(maybeProfile);
    if (typeof window.initSynapse === "function") return () => window.initSynapse(maybeProfile);
    return null;
  };

  // 1) Try globals (some builds expose a global init)
  try {
    const fn = await waitFor(findEntrypoint, { timeout: 3500, interval: 200 });
    console.log(`🧠 Synapse init (${reason}) via GLOBAL →`, fn.name || "anonymous");
    fn();
    state.synapseInitialized = true;
    return;
  } catch (_) {
    // fall through
  }

  // 2) Try dynamic import of the module (your current synapse.js exports initSynapseView)
  try {
    console.log(`🧠 Synapse init (${reason}) attempting dynamic import: assets/js/synapse.js`);
    const mod = await import("assets/js/synapse.js");
    if (mod && typeof mod.initSynapseView === "function") {
      await mod.initSynapseView(maybeProfile);
      state.synapseInitialized = true;
      console.log(`🧠 Synapse init (${reason}) via MODULE → initSynapseView`);
      return;
    }
    console.warn("🧠 Synapse module imported but initSynapseView not found");
  } catch (e) {
    console.warn("🧠 Synapse dynamic import failed:", e?.message || e);
  }
}
// -----------------------------
  // DOM helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");
  const isEl = (v) => v && typeof v === "object" && "nodeType" in v;

  function safeText(v) {
    return (v ?? "").toString();
  }

  // Convert comma-separated text OR array -> text[]
  function toTextArray(v) {
    if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
    if (typeof v === "string") {
      const t = v.trim();
      return t ? t.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
    return [];
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const days = Math.floor(hr / 24);
    return `${days}d`;
  }

  // -----------------------------
  // Modal helpers
  // -----------------------------
  function openModal(modalId) {
    const el = $(modalId);
    if (!el) return;
    el.classList.add("active");
    el.classList.remove("hidden");
  }

  function closeModal(modalId) {
    const el = $(modalId);
    if (!el) return;
    el.classList.remove("active");
    // Some of your CSS uses .hidden to fully remove from flow:
    el.classList.add("hidden");
  }

  // Make sure clicking outside modal closes (if your markup uses .modal-overlay)
  function wireOverlayClose(modalId, innerSelector = ".modal") {
    const overlay = $(modalId);
    if (!overlay) return;
    overlay.addEventListener("click", (e) => {
      const inner = qs(innerSelector, overlay);
      if (!inner) return;
      if (!inner.contains(e.target)) closeModal(modalId);
    });
  }

  // -----------------------------
  // Supabase + Auth hydration
  // -----------------------------
  function getSupabase() {
    // Prefer imported module, fall back to window.supabase (some pages expose it)
    return importedSupabase || window.supabase || null;
  }

  async function hydrateAuthUser() {
    if (!state.supabase) state.supabase = getSupabase();
    if (!state.supabase) throw new Error("Supabase client not available.");

    const { data, error } = await state.supabase.auth.getUser();
    if (error) {
      // Not logged in is not always fatal for public views
      state.authUser = null;
      return null;
    }
    state.authUser = data?.user ?? null;
    return state.authUser;
  }

  async function ensureCommunityProfile() {
    await hydrateAuthUser();
    if (!state.authUser) {
      state.communityProfile = null;
      return null;
    }
    if (state.communityProfile?.id) return state.communityProfile;

    const { data, error } = await state.supabase
      .from("community")
      .select("*")
      .eq("user_id", state.authUser.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      // If your project uses ensureCommunityUser() elsewhere, it should have created this already.
      throw new Error("Community profile not found. Please complete onboarding/profile first.");
    }
    state.communityProfile = data;
    return data;
  }

  function updateHeaderUserBadge() {
    // If your header has a name/initials spot, try to populate it
    const menu = $("user-menu");
    if (!menu) return;

    const name =
      state.communityProfile?.name ||
      state.authUser?.user_metadata?.full_name ||
      state.authUser?.email ||
      "Guest";

    menu.setAttribute("data-user-name", name);
  }

  // -----------------------------
  // Navigation / Buttons
  // -----------------------------
  function wireTopButtons() {
    $("btn-messages")?.addEventListener("click", () => openMessagesModal());
    $("btn-projects")?.addEventListener("click", () => openProjectsModal());
    $("btn-profile")?.addEventListener("click", () => {
      // If you have a profile modal, open it; else redirect
      if ($("profile-modal")) openModal("profile-modal");
      else window.location.href = "profile.html";
    });

    $("btn-bbs")?.addEventListener("click", () => {
      // Your site may use an overlay id, try common ones
      if ($("bbs-overlay")) openModal("bbs-overlay");
      else if (window.openBBS) window.openBBS();
      else console.warn("BBS overlay not found; define openBBS() or add #bbs-overlay");
    });

    $("btn-quickconnect")?.addEventListener("click", () => {
      if ($("quickconnect-modal")) openModal("quickconnect-modal");
      refreshQuickConnectList().catch(console.warn);
    });

    $("btn-filters")?.addEventListener("click", () => {
      if ($("filters-modal")) openModal("filters-modal");
      else if (window.openFilters) window.openFilters();
      else console.warn("Filters modal not found; define openFilters() or add #filters-modal");
    });

    $("btn-legend")?.addEventListener("click", () => {
      if ($("legend-modal")) openModal("legend-modal");
      else if (window.openLegend) window.openLegend();
      else console.warn("Legend modal not found; define openLegend() or add #legend-modal");
    });

    $("btn-endorsements")?.addEventListener("click", () => {
      if ($("endorsements-modal")) openModal("endorsements-modal");
      refreshEndorsementsUI().catch(console.warn);
    });

    $("notifications-bell")?.addEventListener("click", () => {
      if ($("notifications-modal")) openModal("notifications-modal");
      else console.warn("Notifications modal not found.");
    });

    $("search-button")?.addEventListener("click", () => handleGlobalSearch());
    $("global-search")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleGlobalSearch();
    });

    // Floating BBS trigger if present
    $("fab-bbs-trigger")?.addEventListener("click", () => {
      if ($("bbs-overlay")) openModal("bbs-overlay");
      else if (window.openBBS) window.openBBS();
    });
  }

  function handleGlobalSearch() {
    const q = $("global-search")?.value?.trim() || "";
    if (!q) return;
    // If you have a search engine module, call it. Otherwise try Synapse search.
    if (window.searchEngine?.search) {
      window.searchEngine.search(q);
      return;
    }
    if (window.synapse?.search) {
      window.synapse.search(q);
      return;
    }
    console.warn("No searchEngine.search() or synapse.search() found.");
  }

  // -----------------------------
  // Endorsements
  // -----------------------------
  function showEndorsementsTab(tab) {
    const given = $("endorsements-tab-given");
    const received = $("endorsements-tab-received");
    const givenPane = $("endorsements-given");
    const receivedPane = $("endorsements-received");
    if (!given || !received || !givenPane || !receivedPane) return;

    if (tab === "given") {
      given.classList.add("active");
      received.classList.remove("active");
      givenPane.classList.remove("hidden");
      receivedPane.classList.add("hidden");
    } else {
      received.classList.add("active");
      given.classList.remove("active");
      receivedPane.classList.remove("hidden");
      givenPane.classList.add("hidden");
    }
  }

  async function refreshEndorsementsUI() {
    try {
      await ensureCommunityProfile();

      // Your community.endorsements column is jsonb; support either:
      // {given:[...], received:[...]} or any legacy shape.
      const endorsements = state.communityProfile?.endorsements || {};
      const given = Array.isArray(endorsements.given) ? endorsements.given : [];
      const received = Array.isArray(endorsements.received) ? endorsements.received : [];

      const givenPane = $("endorsements-given");
      const receivedPane = $("endorsements-received");

      if (givenPane) {
        givenPane.innerHTML = given.length
          ? `<ul class="endorsement-list">${given
              .map((e) => `<li>${safeText(e?.text || e?.message || e)}</li>`)
              .join("")}</ul>`
          : `<div class="empty-state">No endorsements given yet.</div>`;
      }

      if (receivedPane) {
        receivedPane.innerHTML = received.length
          ? `<ul class="endorsement-list">${received
              .map((e) => `<li>${safeText(e?.text || e?.message || e)}</li>`)
              .join("")}</ul>`
          : `<div class="empty-state">No endorsements received yet.</div>`;
      }

      // Default tab
      showEndorsementsTab("received");
    } catch (e) {
      console.warn("Endorsements refresh failed:", e);
    }
  }

  // -----------------------------
  // Projects
  // Schema: public.projects (id, creator_id -> community.id, title, description, required_skills text[], tags text[], status, created_at...)
  // -----------------------------
  function showCreateProjectForm() {
    const form = $("project-form");
    if (form) form.style.display = "block";
  }

  function hideCreateProjectForm() {
    const form = $("project-form");
    if (form) form.style.display = "none";
  }

  async function createProject(event) {
    event?.preventDefault?.();

    const title = $("project-name")?.value?.trim() || "";
    const description = $("project-description")?.value?.trim() || "";
    const requiredSkills = toTextArray($("project-skills")?.value ?? "");

    if (!title || !description) {
      alert("Please provide a project title and description.");
      return;
    }

    try {
      await ensureCommunityProfile();

      const payload = {
        title,
        description,
        required_skills: requiredSkills, // <-- ARRAY SAFE
        // tags: toTextArray($("project-tags")?.value ?? ""), // if you add a tags input later
        status: "active",
        creator_id: state.communityProfile.id,
      };

      const { data, error } = await state.supabase
        .from("projects")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      // Clear inputs
      if ($("project-name")) $("project-name").value = "";
      if ($("project-description")) $("project-description").value = "";
      if ($("project-skills")) $("project-skills").value = "";

      hideCreateProjectForm();
      await loadProjects();
      await refreshCounters();

      toast("Project created successfully!");
      return data;
    } catch (e) {
      console.error("createProject failed:", e);
      alert(`Project create failed: ${e.message || e}`);
    }
  }

  async function loadProjects() {
    const container = $("projects-list");
    if (!container) return;

    try {
      // Readable to authenticated users per your policies, and to public for open/active/completed
      const { data, error } = await state.supabase
        .from("projects")
        .select("id,title,description,required_skills,tags,status,created_at,creator_id")
        .in("status", ["open", "active", "completed"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const projects = data || [];
      if (!projects.length) {
        container.innerHTML = `
          <div class="empty-state" style="text-align:center; padding:1.5rem; color:#cfefff;">
            <i class="fas fa-folder-open" style="font-size:2rem; opacity:0.7;"></i>
            <p style="margin-top:1rem;">No projects yet</p>
          </div>`;
        return;
      }

      container.innerHTML = projects
        .map((p) => {
          const skills = toTextArray(p.required_skills || p.skills_needed || "");
          const created = p.created_at ? new Date(p.created_at).toLocaleDateString() : "";
          const status = safeText(p.status || "").toLowerCase();

          return `
            <div class="project-card" style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.2);
              border-radius:12px; padding:1.25rem; margin-bottom:1rem;">
              <div style="display:flex; justify-content:space-between; align-items:start; gap:1rem;">
                <div>
                  <h3 style="color:#00e0ff; margin:0 0 0.25rem 0;">
                    <i class="fas fa-lightbulb" style="opacity:0.9;"></i> ${safeText(p.title || p.name)}
                  </h3>
                  <div style="opacity:0.8; font-size:0.9rem;">${created}</div>
                </div>
                <div class="project-status" style="padding:0.25rem 0.6rem; border-radius:999px; font-size:0.8rem;
                  border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.06); text-transform:capitalize;">
                  ${status || "active"}
                </div>
              </div>

              <p style="margin:0.8rem 0 0 0; color:#e6f8ff; line-height:1.35;">
                ${safeText(p.description || "")}
              </p>

              ${
                skills.length
                  ? `<div style="margin-top:0.8rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
                      ${skills
                        .slice(0, 12)
                        .map(
                          (s) =>
                            `<span style="border:1px solid rgba(0,224,255,0.25); background:rgba(0,224,255,0.10);
                              padding:0.25rem 0.5rem; border-radius:999px; font-size:0.8rem; color:#bff4ff;">
                              ${safeText(s)}
                            </span>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }

              <div style="margin-top:1rem; display:flex; gap:0.6rem; flex-wrap:wrap; justify-content:flex-end;">
                <button class="btn btn-small" data-action="project-message" data-project-id="${p.id}">
                  <i class="fas fa-comment"></i> Message
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      // Wire message buttons (start a conversation with project creator, if you want)
      qsa('[data-action="project-message"]', container).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const projectId = btn.getAttribute("data-project-id");
          // If you have project-member mapping, wire it here. For now open messages modal.
          openMessagesModal();
          // Optional: set a filter or context
          console.log("Project message requested for project:", projectId);
        });
      });
    } catch (e) {
      console.error("loadProjects failed:", e);
      container.innerHTML = `<div class="empty-state">Failed to load projects.</div>`;
    }
  }

  // -----------------------------
  // Conversations (table: public.conversations)
  // Columns:
  // - participant_1_id uuid (community.id)
  // - participant_2_id uuid (community.id)
  // - context_type text, context_id uuid, context_title text
  // - last_message_at timestamptz, last_message_preview text
  // Unique index: (participant_1_id, participant_2_id) -> ALWAYS sort ids before insert.
  // -----------------------------
  async function fetchConversations() {
    await ensureCommunityProfile();
    const me = state.communityProfile.id;

    const { data, error } = await state.supabase
      .from("conversations")
      .select("*")
      .or(`participant_1_id.eq.${me},participant_2_id.eq.${me}`)
      .order("last_message_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function ensureConversationWith(otherCommunityId, context = {}) {
    await ensureCommunityProfile();
    const me = state.communityProfile.id;

    if (!otherCommunityId) throw new Error("Missing other participant id.");
    if (otherCommunityId === me) throw new Error("Cannot start a conversation with yourself.");

    const [p1, p2] = me < otherCommunityId ? [me, otherCommunityId] : [otherCommunityId, me];

    // Try find existing (avoid 406 by using maybeSingle)
    const { data: existing, error: findErr } = await state.supabase
      .from("conversations")
      .select("*")
      .eq("participant_1_id", p1)
      .eq("participant_2_id", p2)
      .maybeSingle();

    if (findErr) throw findErr;
    if (existing?.id) return existing;

    // Create new
    const payload = {
      participant_1_id: p1,
      participant_2_id: p2,
      context_type: context.context_type ?? null,
      context_id: context.context_id ?? null,
      context_title: context.context_title ?? null,
      last_message_at: new Date().toISOString(),
      last_message_preview: null,
    };

    const { data: created, error: insErr } = await state.supabase
      .from("conversations")
      .insert(payload)
      .select("*")
      .single();

    if (insErr) {
      // If this throws, it is almost always policy mismatch or wrong IDs being inserted.
      // With your policies, participant ids MUST be community.id values.
      throw insErr;
    }
    return created;
  }

  async function openMessagesModal() {
    openModal("messages-modal");
    wireOverlayClose("messages-modal", ".messages-modal");

    try {
      const list = $("modal-conversations-list");
      const title = $("modal-conversation-title");
      const msgs = $("modal-conversation-messages");
      if (title) title.textContent = "Select a conversation";
      if (msgs) msgs.innerHTML = `<div class="empty-state">Select a conversation</div>`;

      const conversations = await fetchConversations();
      renderConversationList(conversations, list);
    } catch (e) {
      console.error("openMessagesModal failed:", e);
      const list = $("modal-conversations-list");
      if (list) list.innerHTML = `<div class="empty-state">Failed to load conversations.</div>`;
      alert(`Failed to load conversations: ${e.message || e}`);
    }
  }

  function renderConversationList(conversations, listEl) {
    if (!listEl) return;

    if (!conversations.length) {
      listEl.innerHTML = `<div class="empty-state">No conversations yet.</div>`;
      return;
    }

    listEl.innerHTML = conversations
      .map((c) => {
        const label = c.context_title
          ? safeText(c.context_title)
          : `Conversation • ${formatTimeAgo(c.last_message_at) || ""}`;
        const preview = safeText(c.last_message_preview || "");
        return `
          <button class="conversation-row" data-conversation-id="${c.id}">
            <div class="conversation-row-title">${label}</div>
            <div class="conversation-row-preview">${preview || "—"}</div>
          </button>
        `;
      })
      .join("");

    qsa(".conversation-row", listEl).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-conversation-id");
        if (!id) return;
        openConversationById(id).catch(console.error);
      });
    });
  }

  async function openConversationById(conversationId) {
    state.currentConversationId = conversationId;

    const { data: convo, error } = await state.supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (error) throw error;
    state.currentConversationData = convo;

    const title = $("modal-conversation-title");
    if (title) {
      title.textContent = convo.context_title
        ? safeText(convo.context_title)
        : "Conversation";
    }

    await loadConversationMessages(conversationId);
  }

  async function loadConversationMessages(conversationId) {
    const msgs = $("modal-conversation-messages");
    if (!msgs) return;

    // Your database may store messages in a different table name.
    // Try the most common: "messages" with (conversation_id, sender_id, body, created_at)
    try {
      const { data, error } = await state.supabase
        .from("messages")
        .select("id,conversation_id,sender_id,body,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const messages = data || [];
      if (!messages.length) {
        msgs.innerHTML = `<div class="empty-state">No messages yet. Say hi!</div>`;
        return;
      }

      msgs.innerHTML = messages
        .map((m) => {
          const mine = state.communityProfile?.id && m.sender_id === state.communityProfile.id;
          const time = m.created_at ? new Date(m.created_at).toLocaleString() : "";
          return `
            <div class="chat-msg ${mine ? "mine" : "theirs"}">
              <div class="chat-msg-body">${safeText(m.body)}</div>
              <div class="chat-msg-meta">${time}</div>
            </div>
          `;
        })
        .join("");

      // Auto-scroll to bottom
      msgs.scrollTop = msgs.scrollHeight;
    } catch (e) {
      console.warn("Messages table not available or query failed:", e);
      msgs.innerHTML =
        `<div class="empty-state">
          Messages could not be loaded. If your messages table is not named <code>messages</code>,
          update <code>loadConversationMessages()</code> in <code>dashboardPane.js</code> to match.
        </div>`;
    }
  }

  async function sendModalMessage() {
    const input = $("modal-message-text") || $("modal-message-input");
    const body = input?.value?.trim() || "";
    if (!body) return;

    if (!state.currentConversationId) {
      alert("Select a conversation first.");
      return;
    }

    try {
      await ensureCommunityProfile();

      // Attempt insert into "messages"
      const payload = {
        conversation_id: state.currentConversationId,
        sender_id: state.communityProfile.id,
        body,
      };

      const { error } = await state.supabase.from("messages").insert(payload);
      if (error) throw error;

      input.value = "";
      await loadConversationMessages(state.currentConversationId);

      // Update conversation preview (best-effort)
      await state.supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 140),
        })
        .eq("id", state.currentConversationId);

    } catch (e) {
      console.error("sendModalMessage failed:", e);
      alert(`Failed to send message: ${e.message || e}`);
    }
  }

  // -----------------------------
  // Quick Connect (best-effort: uses global helpers if present)
  // -----------------------------
  async function refreshQuickConnectList() {
    const list = $("quick-connect-list");
    if (!list) return;

    // If you already compute suggested connections elsewhere, use it.
    // Common patterns in your repo: window.connections.getSuggestedConnections(), window.synapse.getSuggestedConnections()
    try {
      const suggestions =
        (await window.connections?.getSuggestedConnections?.()) ||
        (await window.synapse?.getSuggestedConnections?.()) ||
        [];

      if (!Array.isArray(suggestions) || !suggestions.length) {
        list.innerHTML = `<div class="empty-state">No suggestions yet.</div>`;
        return;
      }

      list.innerHTML = suggestions
        .slice(0, 20)
        .map((s) => {
          const id = s.id || s.community_id || s.profile_id;
          const name = s.name || s.full_name || "Member";
          const reason = s.reason || s.match_reason || "";
          return `
            <div class="quickconnect-row">
              <div class="quickconnect-main">
                <div class="quickconnect-name">${safeText(name)}</div>
                <div class="quickconnect-reason">${safeText(reason)}</div>
              </div>
              <button class="btn btn-small" data-action="qc-message" data-id="${id}">
                Message
              </button>
            </div>
          `;
        })
        .join("");

      qsa('[data-action="qc-message"]', list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const otherId = btn.getAttribute("data-id");
          if (!otherId) return;
          try {
            const convo = await ensureConversationWith(otherId, { context_title: "Quick Connect" });
            await openMessagesModal();
            await openConversationById(convo.id);
          } catch (e) {
            console.error("Quick connect message failed:", e);
            alert(`Failed to start conversation: ${e.message || e}`);
          }
        });
      });
    } catch (e) {
      console.warn("refreshQuickConnectList failed:", e);
      list.innerHTML = `<div class="empty-state">Unable to load suggestions.</div>`;
    }
  }

  // -----------------------------
  // Network stats / counters
  // -----------------------------
  async function refreshCounters() {
    // Best-effort counters; do not crash dashboard if something fails.
    try {
      // Projects count
      const { count: projectCount } = await state.supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "active", "completed"]);

      // Network count (community size)
      const { count: communityCount } = await state.supabase
        .from("community")
        .select("id", { count: "exact", head: true });

      // Endorsements count: use community jsonb if available
      let endorsementsCount = 0;
      try {
        await ensureCommunityProfile();
        const e = state.communityProfile?.endorsements || {};
        endorsementsCount =
          (Array.isArray(e.given) ? e.given.length : 0) +
          (Array.isArray(e.received) ? e.received.length : 0);
      } catch (_) {}

      // Messages: count conversations
      let convoCount = 0;
      try {
        await ensureCommunityProfile();
        const me = state.communityProfile.id;
        const { count } = await state.supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .or(`participant_1_id.eq.${me},participant_2_id.eq.${me}`);
        convoCount = count || 0;
      } catch (_) {}

      // Update UI (IDs for bottom stats cards vary; try common selectors)
      setStatValue("messages", convoCount);
      setStatValue("projects", projectCount || 0);
      setStatValue("endorsements", endorsementsCount);
      setStatValue("network", communityCount || 0);
    } catch (e) {
      console.warn("refreshCounters failed:", e);
    }
  }

  function setStatValue(key, value) {
    // Try common patterns: data-stat="messages" or ids like stat-messages
    const el =
      qs(`[data-stat="${key}"]`) ||
      $(`stat-${key}`) ||
      $(`${key}-count`) ||
      $(`${key}-value`);
    if (el) el.textContent = String(value ?? 0);
  }

  async function showNetworkStatsModal() {
    openModal("network-stats-modal");
    wireOverlayClose("network-stats-modal", ".network-stats-modal");

    const container = $("network-stats-content");
    if (!container) return;

    container.innerHTML = `<div class="empty-state">Loading…</div>`;

    try {
      const { count: communityCount } = await state.supabase
        .from("community")
        .select("id", { count: "exact", head: true });

      let connectionsCount = 0;
      try {
        // If you have a connections table, count it; otherwise, keep 0
        const { count } = await state.supabase
          .from("connections")
          .select("id", { count: "exact", head: true });
        connectionsCount = count || 0;
      } catch (_) {}

      container.innerHTML = `
        <div style="display:grid; gap:0.75rem;">
          <div><strong>Total community:</strong> ${communityCount || 0}</div>
          <div><strong>Total connections:</strong> ${connectionsCount}</div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="empty-state">Failed to load stats.</div>`;
    }
  }

  // -----------------------------
  // Toast
  // -----------------------------
  function toast(message) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; top: 100px; right: 20px;
      background: linear-gradient(135deg, #00ff88, #00cc70);
      color: white; padding: 1rem 1.25rem; border-radius: 10px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.35);
      z-index: 10000; font-weight: 700; display:flex; gap:0.6rem; align-items:center;
    `;
    toast.innerHTML = `<i class="fas fa-check-circle"></i> <span>${safeText(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  // -----------------------------
  // Globals (used by inline HTML handlers)
  // -----------------------------
  function exposeGlobals() {
    // Modals
    window.openModal = openModal;
    window.closeModal = closeModal;

    // Dashboard stats modal
    window.showNetworkStatsModal = showNetworkStatsModal;
    window.closeNetworkStatsModal = () => closeModal("network-stats-modal");

    // Endorsements tabs
    window.showEndorsementsTab = showEndorsementsTab;

    // Projects form controls
    window.showCreateProjectForm = showCreateProjectForm;
    window.hideCreateProjectForm = hideCreateProjectForm;
    window.createProject = createProject;

    // Messaging
    window.openConversationById = openConversationById;
    window.sendModalMessage = sendModalMessage;

    // Scroll helper (fixes "scrollToSection is not defined")
    window.scrollToSection = function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    state.supabase = getSupabase();
    if (!state.supabase) {
      console.error("Supabase client not found. Check supabaseClient.js import.");
      return;
    }

    exposeGlobals();
    wireTopButtons();

    // Wire modal overlay close for ones we know
    wireOverlayClose("network-stats-modal", ".network-stats-modal");
    wireOverlayClose("endorsements-modal", ".endorsements-modal");

    // Projects form submit
    const projectFormEl = $("project-form");
    if (projectFormEl) {
      projectFormEl.addEventListener("submit", createProject);
    }

    // Messages modal send button (if present)
    qs('[data-action="send-message"]')?.addEventListener("click", sendModalMessage);
    // Enter-to-send in modal input
    const msgInput = $("modal-message-text") || $("modal-message-input");
    msgInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendModalMessage();
      }
    });

    // Hydrate user + profile (best-effort)
    try {
      await ensureCommunityProfile();
      updateHeaderUserBadge();
    } catch (e) {
      // Not fatal for viewing dashboard skeleton; many sections require auth though
      console.warn("Community profile not ready:", e);
    }

    // Initial loads
    await loadProjects().catch(console.warn);
    await refreshCounters().catch(console.warn);

    // Periodic refresh
    state.refreshTimer = setInterval(() => {
      refreshCounters().catch(() => {});
    }, 30_000);

    // Synapse init (async, robust)
    initSynapseWhenReady("profile-loaded");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();