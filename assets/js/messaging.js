/*
 * Direct Messaging System — Full Rewrite (RLS-safe + Mobile WhatsApp UX)
 * File: assets/js/messaging.js
 *
 * ✅ Key Decisions (CONSISTENT + PRACTICAL):
 * - conversations.participant_1_id / participant_2_id are community.id
 * - messages.sender_id is community.id   ✅ (consistent across load/send/realtime/render)
 *
 * ✅ Includes:
 * - Mobile WhatsApp/iMessage navigation:
 *   - List view by default
 *   - Tap conversation => chat view
 *   - Back button in chat header on mobile
 * - Duplicate init protection + cleanup
 * - Safe conversation de-dupe (sorted participant pairs)
 * - Works whether caller passes auth user_id OR community.id (auto resolves to community.id)
 *
 * Requirements:
 * - window.supabase exists (from supabaseClient.js)
 * - Tables:
 *   - community(id, user_id, name, email, image_url, skills, ..., photo_visible, photo_consent_at)
 *   - conversations(participant_1_id, participant_2_id, context_type, context_id, context_title, last_message_at, last_message_preview)
 *   - messages(conversation_id, sender_id [community.id], content, read, created_at)
 */

const MessagingModule = (function () {
  "use strict";

  // ============================================================
  // STATE
  // ============================================================

  const state = {
    initialized: false,

    authUser: null, // Supabase auth user
    currentUser: null, // { authId, communityId, email, name, avatar }

    conversations: [],
    activeConversation: null,
    messages: [],
    unreadCount: 0,
    allUsers: [],

    realtimeChannel: null,
    observer: null,

    // Mobile UX
    mobileMode: null, // "list" | "chat" | null

    // Pagination
    hasMoreMessages: false,
    messageOffset: 0,

    // Search
    conversationSearch: "",

    // Unsent text per conversation (kept until sent or sign-out)
    drafts: {}
  };

  // ============================================================
  // INIT / CLEANUP
  // ============================================================

  let initPromise = null;
  // Bumped by cleanup(): a load still running for the previous member stops.
  let generation = 0;

  // Opening Inbox again shows Messages as it was left (drafts, the open
  // conversation, search, scroll): nothing is rebuilt. A different account
  // starts over.
  async function init() {
    const authId = window.currentAuthUser?.id;
    if (state.initialized && authId && state.authUser?.id && authId !== state.authUser.id) cleanup();

    if (state.initialized) {
      if (!document.querySelector("#messages-container .messages-container")) {
        renderMessagesTab();
        if (state.activeConversation) renderChatPanel();
      }
      applyResponsiveLayout();
      return;
    }
    // Callers arriving while the first load runs wait for the same load.
    // cleanup() detaches a load it cancels, so the next account starts its own.
    if (!initPromise) {
      const loading = load().finally(() => { if (initPromise === loading) initPromise = null; });
      initPromise = loading;
    }
    return initPromise;
  }

  async function load() {
    window.__IE_MESSAGING_INIT_DONE__ = true;
    const gen = generation;

    try {
      if (!window.supabase) throw new Error("Supabase not available");

      const { data: { session }, error: sessErr } = await window.supabase.auth.getSession();
      if (sessErr) throw sessErr;
      if (!session) throw new Error("No active session");
      if (gen !== generation) return;

      state.authUser = session.user;

      // Load community profile by auth user_id
      const { data: profile, error: profErr } = await window.supabase
        .from("community")
        .select("*")
        .eq("user_id", state.authUser.id)
        .single();

      if (profErr) throw profErr;
      if (!profile?.id) throw new Error("No community profile found (community.id missing)");
      if (gen !== generation) return;

      state.currentUser = {
        authId: state.authUser.id,
        email: state.authUser.email,
        name: profile?.name || (state.authUser.email ? state.authUser.email.split("@")[0] : "User"),
        communityId: profile.id, // ✅ critical
        avatar: window.profilePhotoUrl?.(profile) || null
      };

      await Promise.all([
        loadConversations(),
        loadAllUsers(),
        updateUnreadCount()
      ]);
      if (gen !== generation) {
        // Signed out meanwhile: drop what the previous load brought in.
        state.conversations = [];
        state.allUsers = [];
        state.unreadCount = 0;
        return;
      }

      renderMessagesTab();
      setupRealtimeSubscriptions();
      applyResponsiveLayout(); // ✅ mobile: start in list view

      state.initialized = true;
      console.log("✅ Messaging initialized");
    } catch (error) {
      console.error("Failed to initialize messaging:", error);
      window.__IE_MESSAGING_INIT_DONE__ = false;
      renderError(error?.message || "Failed to initialize messaging");
    }
  }

  // Inbox is on screen and the app is in the foreground: only then are
  // incoming messages marked read.
  function isViewing() {
    return !!document.getElementById("messages-modal")?.classList.contains("active") &&
      document.visibilityState !== "hidden";
  }

  // Back in Inbox (or back in the app): what arrived in the open
  // conversation meanwhile is now read.
  function onShown() {
    if (!state.initialized || !state.activeConversation || !isViewing()) return;
    const unseen = state.messages.some((m) => m.sender_id !== state.currentUser?.communityId && m.read === false);
    if (!unseen) return;
    const conversationId = state.activeConversation.id;
    markMessagesAsRead(conversationId).then(() => {
      if (state.activeConversation?.id !== conversationId) return;
      state.messages = state.messages.map((m) => (m.sender_id !== state.currentUser.communityId ? { ...m, read: true } : m));
      renderMessages();
      updateUnreadCount();
    }).catch((error) => console.warn("Messaging: mark read failed:", error));
  }

  // Inbox selected again from a conversation (app-nav.js): the list.
  function showList() {
    if (isMobile() && state.mobileMode === "chat") setMobileView("list");
  }

  // Sign-out or a different account: nothing of the previous member's
  // messages stays in memory or on the page.
  function cleanup() {
    generation += 1;
    initPromise = null;
    try {
      if (window.realtimeManager?.isChannelActive?.("messaging")) {
        window.realtimeManager.unsubscribe("messaging");
      } else if (state.realtimeChannel) {
        window.supabase.removeChannel(state.realtimeChannel);
      }
    } catch (e) {
      console.warn("Messaging cleanup channel removal failed:", e);
    }
    state.realtimeChannel = null;

    // Clear module state
    state.initialized = false;
    state.authUser = null;
    state.currentUser = null;
    state.conversations = [];
    state.messages = [];
    state.activeConversation = null;
    state.unreadCount = 0;
    state.allUsers = [];
    state.mobileMode = null;
    state.hasMoreMessages = false;
    state.messageOffset = 0;
    state.conversationSearch = "";
    state.drafts = {};

    const container = document.getElementById("messages-container");
    if (container) container.innerHTML = "";
    document.getElementById("msg-incoming-toast")?.remove();

    // Allow init again if user comes back
    window.__IE_MESSAGING_INIT_DONE__ = false;

    console.log("Messaging cleanup complete");
  }

  // ============================================================
  // GUARDS / HELPERS
  // ============================================================

  function requireReady() {
    if (!state.currentUser?.communityId) {
      throw new Error("Messaging not ready: missing currentUser.communityId");
    }
  }

  function sortedPair(a, b) {
    return a < b ? [a, b] : [b, a];
  }

  // Accept either community.id OR community.user_id (auth uid) and return community.id
  async function resolveCommunityId(maybeAuthOrCommunityId) {
    if (!maybeAuthOrCommunityId) return null;

    // 1) Try as community.id
    {
      const { data, error } = await window.supabase
        .from("community")
        .select("id")
        .eq("id", maybeAuthOrCommunityId)
        .limit(1);

      if (!error && Array.isArray(data) && data[0]?.id) return data[0].id;
    }

    // 2) Try as auth user_id
    {
      const { data, error } = await window.supabase
        .from("community")
        .select("id")
        .eq("user_id", maybeAuthOrCommunityId)
        .limit(1);

      if (!error && Array.isArray(data) && data[0]?.id) return data[0].id;
    }

    return null;
  }

  // Messages is full screen, showing the list or the chat, below 1024px
  // (the max-width: 1023px rules in messaging.css); keep the two in step.
  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 1023px)").matches;
  }

  function setMobileView(mode) {
    // mode: "list" | "chat"
    const sidebar = document.querySelector("#messages-container .conversations-sidebar");
    const chat = document.querySelector("#messages-container .chat-panel");
    if (!sidebar || !chat) return;

    if (!isMobile()) {
      // Desktop: show both panes (and drop the back button, e.g. after an
      // iPad rotates to landscape with a chat open)
      sidebar.classList.remove("mobile-hide");
      chat.classList.remove("mobile-show");
      chat.querySelector(".mobile-back-btn")?.remove();
      // Keep list or chat for when the layout goes full screen again (an
      // iPad rotating back to portrait stays in its conversation).
      if (mode === "chat") state.mobileMode = "chat";
      return;
    }

    if (mode === "chat") {
      sidebar.classList.add("mobile-hide");
      chat.classList.add("mobile-show");
      state.mobileMode = "chat";
    } else {
      sidebar.classList.remove("mobile-hide");
      chat.classList.remove("mobile-show");
      state.mobileMode = "list";
    }
  }

  function ensureMobileBackButton() {
    if (!isMobile()) return;

    const header = document.querySelector("#messages-container .chat-header");
    if (!header) return;

    if (header.querySelector(".mobile-back-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-back-btn";
    btn.setAttribute("aria-label", "Back to conversations");
    btn.innerHTML = `<i class="fas fa-chevron-left"></i>`;
    btn.style.cssText = `
      display: inline-flex;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      border: 1px solid rgba(0,224,255,0.25);
      background: rgba(0,224,255,0.12);
      color: #00e0ff;
      cursor: pointer;
      flex: 0 0 auto;
    `;

    btn.addEventListener("click", () => {
      setMobileView("list");
    });

    header.insertBefore(btn, header.firstChild);
  }

  let viewportWatched = false;

  function setupMobileKeyboardHandling() {
    if (!isMobile()) return;

    const messageInput = document.querySelector(".message-input");
    const inputContainer = document.getElementById("message-input-container");
    const messagesArea = document.getElementById("messages-area");
    const chatPanel = document.querySelector(".chat-panel");
    
    if (!messageInput || !inputContainer || !messagesArea) return;

    // Handle focus - keyboard opening
    messageInput.addEventListener("focus", () => {
      // Add class to indicate keyboard is open
      inputContainer.classList.add('keyboard-open');
      
      // Scroll to bottom of messages immediately
      setTimeout(() => {
        if (messagesArea) {
          messagesArea.scrollTop = messagesArea.scrollHeight;
        }
      }, 100);
      
      // Scroll messages again after keyboard animation completes. Do not call
      // scrollIntoView() on the composer: in iOS Safari a fixed full-screen
      // modal plus the animating visual viewport causes the whole page to pan
      // and scale when the browser tries to reveal an element already in view.
      setTimeout(() => {
        if (messagesArea) {
          messagesArea.scrollTop = messagesArea.scrollHeight;
        }
      }, 400);
    });

    // Handle blur - keyboard closing
    messageInput.addEventListener("blur", () => {
      // Remove keyboard open class
      inputContainer.classList.remove('keyboard-open');
    });

    // Use Visual Viewport API for better keyboard detection (one listener
    // for every chat opened; it finds the current composer).
    if (window.visualViewport && !viewportWatched) {
      viewportWatched = true;
      let lastHeight = window.visualViewport.height;

      const handleViewportChange = () => {
        const currentHeight = window.visualViewport.height;
        const heightDiff = lastHeight - currentHeight;
        const container = document.getElementById("message-input-container");
        const area = document.getElementById("messages-area");

        // If viewport shrunk significantly (keyboard opened)
        if (heightDiff > 150) {
          container?.classList.add('keyboard-open');

          // Scroll messages to bottom
          setTimeout(() => {
            if (area) area.scrollTop = area.scrollHeight;
          }, 100);
        } else if (heightDiff < -150) {
          // Keyboard closed
          container?.classList.remove('keyboard-open');
        }

        lastHeight = currentHeight;
      };

      window.visualViewport.addEventListener("resize", handleViewportChange);
      window.visualViewport.addEventListener("scroll", handleViewportChange);
    }

    // Auto-resize textarea as user types
    messageInput.addEventListener("input", function() {
      this.style.height = "auto";
      const newHeight = Math.min(this.scrollHeight, 120);
      this.style.height = newHeight + "px";
    });
  }

  function applyResponsiveLayout() {
    // Called after render, and on resize.
    if (!document.getElementById("messages-container")) return;

    if (isMobile()) {
      // Default to list on mobile unless currently in an active convo and user is in chat mode
      if (state.activeConversation) {
        // If user previously selected convo, keep them in chat
        setMobileView(state.mobileMode === "chat" ? "chat" : "list");
        // Removed while side by side; back again with the full-screen chat.
        if (state.mobileMode === "chat") ensureMobileBackButton();
      } else {
        setMobileView("list");
      }
    } else {
      setMobileView("list"); // in desktop this function shows both panes
    }
  }

  // ============================================================
  // SIDEBAR COLLAPSE (desktop only)
  // ============================================================

  function initSidebarCollapse() {
    const tab = document.getElementById("msg-sidebar-tab");
    const sidebar = document.getElementById("msg-sidebar");
    const container = document.querySelector(".messages-container");
    if (!tab || !sidebar || !container) return;

    // Restore collapsed state from sessionStorage
    const wasCollapsed = sessionStorage.getItem("msgSidebarCollapsed") === "true";
    if (wasCollapsed && !isMobile()) {
      setSidebarCollapsed(true);
    }

    tab.addEventListener("click", () => {
      if (isMobile()) return; // On mobile, use the WhatsApp-style navigation instead
      const isCollapsed = container.classList.contains("sidebar-collapsed");
      setSidebarCollapsed(!isCollapsed);
    });
  }

  function setSidebarCollapsed(collapsed) {
    const container = document.querySelector(".messages-container");
    const icon = document.getElementById("msg-sidebar-tab-icon");
    const tab = document.getElementById("msg-sidebar-tab");
    if (!container) return;

    if (collapsed) {
      container.classList.add("sidebar-collapsed");
      sessionStorage.setItem("msgSidebarCollapsed", "true");
      if (icon) icon.className = "fas fa-chevron-right";
      if (tab) tab.title = "Expand conversations";
      if (tab) tab.setAttribute("aria-label", "Expand conversations");
    } else {
      container.classList.remove("sidebar-collapsed");
      sessionStorage.removeItem("msgSidebarCollapsed");
      if (icon) icon.className = "fas fa-chevron-left";
      if (tab) tab.title = "Collapse conversations";
      if (tab) tab.setAttribute("aria-label", "Collapse conversations");
    }
  }

  // ============================================================
  // DATA LOADING
  // ============================================================

  async function loadConversations() {
    requireReady();

    const myCid = state.currentUser.communityId;

    const { data, error } = await window.supabase
      .from("conversations")
      .select(`
        *,
        participant_1:community!conversations_participant_1_id_fkey(
          id, user_id, name, email, image_url, photo_visible, photo_consent_at
        ),
        participant_2:community!conversations_participant_2_id_fkey(
          id, user_id, name, email, image_url, photo_visible, photo_consent_at
        )
      `)
      .or(`participant_1_id.eq.${myCid},participant_2_id.eq.${myCid}`)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error loading conversations:", error);
      return;
    }

    state.conversations = (data || []).map((conv) => {
      const isP1 = conv.participant_1_id === myCid;
      const other = isP1 ? conv.participant_2 : conv.participant_1;

      return {
        ...conv,
        unreadCount: 0,
        otherUser: other
          ? {
              authId: other.user_id,
              communityId: other.id,
              name: other.name || "Unknown",
              email: other.email || "",
              avatar: window.profilePhotoUrl?.(other) || null
            }
          : {
              authId: null,
              communityId: null,
              name: "Unknown",
              email: "",
              avatar: null
            }
      };
    });

    // Fetch per-conversation unread counts in one query
    const convIds = state.conversations.map((c) => c.id);
    if (convIds.length > 0) {
      const { data: unreadMsgs } = await window.supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convIds)
        .neq("sender_id", state.currentUser.communityId)
        .eq("read", false);

      const unreadMap = {};
      (unreadMsgs || []).forEach((m) => {
        unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
      });

      state.conversations = state.conversations.map((c) => ({
        ...c,
        unreadCount: unreadMap[c.id] || 0
      }));

      const totalUnread = state.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
      console.log(`[Messages] unread count: ${totalUnread}`);
    }
  }

  const MSG_PAGE_SIZE = 50;

  async function loadMessages(conversationId) {
    requireReady();

    state.hasMoreMessages = false;
    state.messageOffset = 0;

    // Load total count + last 50 messages
    const { data, error, count } = await window.supabase
      .from("messages")
      .select("*", { count: "exact" })
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(MSG_PAGE_SIZE);

    if (error) {
      console.error("Error loading messages:", error);
      return;
    }

    const msgs = (data || []).reverse(); // back to chronological order
    state.hasMoreMessages = (count || 0) > MSG_PAGE_SIZE;
    state.messageOffset = MSG_PAGE_SIZE;

    // sender_id is community.id.
    const senderCommunityIds = [...new Set(msgs.map((m) => m.sender_id).filter(Boolean))];

    let senderMap = {};
    if (senderCommunityIds.length > 0) {
      const { data: senders } = await window.supabase
        .from("community")
        .select("id, name, image_url, user_id, photo_visible, photo_consent_at")
        .in("id", senderCommunityIds);

      (senders || []).forEach((s) => {
        senderMap[s.id] = { id: s.id, name: s.name, image_url: window.profilePhotoUrl?.(s) };
      });
    }

    state.messages = msgs.map((msg) => ({
      ...msg,
      sender: senderMap[msg.sender_id] || null
    }));

    console.log(`[Messages] loaded ${state.messages.length} messages`);

    if (isViewing()) {
      await markMessagesAsRead(conversationId);
      state.messages = state.messages.map((m) => (m.sender_id !== state.currentUser.communityId ? { ...m, read: true } : m));
    }
  }

  async function loadEarlierMessages() {
    if (!state.activeConversation || !state.hasMoreMessages) return;

    const conversationId = state.activeConversation.id;

    const { data, error } = await window.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .range(state.messageOffset, state.messageOffset + MSG_PAGE_SIZE - 1);

    if (error) {
      console.error("Error loading earlier messages:", error);
      return;
    }

    const olderMsgs = (data || []).reverse(); // chronological
    if (olderMsgs.length < MSG_PAGE_SIZE) state.hasMoreMessages = false;
    state.messageOffset += MSG_PAGE_SIZE;

    // Lookup senders
    const senderCommunityIds = [...new Set(olderMsgs.map((m) => m.sender_id).filter(Boolean))];
    let senderMap = {};
    if (senderCommunityIds.length > 0) {
      const { data: senders } = await window.supabase
        .from("community")
        .select("id, name, image_url, user_id, photo_visible, photo_consent_at")
        .in("id", senderCommunityIds);
      (senders || []).forEach((s) => {
        senderMap[s.id] = { id: s.id, name: s.name, image_url: window.profilePhotoUrl?.(s) };
      });
    }

    const mapped = olderMsgs.map((msg) => ({ ...msg, sender: senderMap[msg.sender_id] || null }));

    // Preserve scroll position
    const area = document.getElementById("messages-area");
    const prevScrollHeight = area ? area.scrollHeight : 0;

    state.messages = [...mapped, ...state.messages];
    renderMessages();

    if (area) {
      area.scrollTop = area.scrollHeight - prevScrollHeight;
    }
  }

  async function deleteMessage(messageId) {
    try {
      const { error } = await window.supabase
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("sender_id", state.currentUser.communityId);

      if (error) throw error;

      state.messages = state.messages.filter((m) => m.id !== messageId);
      renderMessages();
    } catch (error) {
      console.error("Error deleting message:", error);
      showToast("Failed to delete message", "error");
    }
  }

  async function loadAllUsers() {
    requireReady();

    // Load all other community members
    const { data, error } = await window.supabase
      .from("community")
      .select("id, user_id, name, email, skills, image_url, photo_visible, photo_consent_at")
      .neq("id", state.currentUser.communityId);

    if (error) {
      console.error("Error loading users:", error);
      return;
    }

    state.allUsers = data || [];
  }

  async function updateUnreadCount() {
    // optional RPC; if it doesn't exist, silently ignore
    const { data, error } = await window.supabase.rpc("get_unread_count");
    if (!error && data !== null && data !== undefined) {
      state.unreadCount = data;
      updateUnreadBadge();
    }
  }

  // ============================================================
  // CONVERSATION ACTIONS
  // ============================================================

  async function startConversation(otherUserIdOrCommunityId, context = {}) {
    requireReady();

    try {
      const myCid = state.currentUser.communityId;
      const otherCid = await resolveCommunityId(otherUserIdOrCommunityId);

      if (!otherCid) throw new Error("Could not resolve recipient community id");
      if (otherCid === myCid) throw new Error("Cannot start a conversation with yourself");

      const [p1, p2] = sortedPair(myCid, otherCid);

      // Find existing
      const { data: existingData, error: findError } = await window.supabase
        .from("conversations")
        .select("*")
        .eq("participant_1_id", p1)
        .eq("participant_2_id", p2)
        .limit(1);

      if (findError) console.error("Error finding conversation:", findError);

      let convo = Array.isArray(existingData) && existingData.length > 0 ? existingData[0] : null;

      // Create if missing
      if (!convo) {
        const payload = {
          participant_1_id: p1,
          participant_2_id: p2,
          context_type: context?.type ?? null,
          context_id: context?.id ?? null,
          context_title: context?.title ?? null,
          last_message_at: new Date().toISOString(),
          last_message_preview: null
        };

        const { data: created, error: createErr } = await window.supabase
          .from("conversations")
          .insert(payload)
          .select("*")
          .single();

        if (createErr) {
          // Handle unique race
          const dup = String(createErr.code || "") === "23505" || String(createErr.message || "").includes("unique");
          if (dup) {
            const { data: refetched } = await window.supabase
              .from("conversations")
              .select("*")
              .eq("participant_1_id", p1)
              .eq("participant_2_id", p2)
              .limit(1);

            convo = Array.isArray(refetched) && refetched.length > 0 ? refetched[0] : null;
          } else {
            throw createErr;
          }
        } else {
          convo = created;
        }
      }

      await loadConversations();
      const full = state.conversations.find((c) => c.id === convo?.id) || null;
      if (full) await selectConversation(full);

      return convo?.id || null;
    } catch (error) {
      console.error("Error starting conversation:", error);
      showToast(error?.message || "Failed to start conversation", "error");
      return null;
    }
  }

  async function selectConversation(conversation) {
    state.activeConversation = conversation;

    await loadMessages(conversation.id);
    renderChatPanel();
    await updateUnreadCount();

    // Mobile: switch to chat view like WhatsApp
    setMobileView("chat");
    ensureMobileBackButton();

    // Scroll bottom
    setTimeout(() => {
      const area = document.querySelector(".messages-area");
      if (area) area.scrollTop = area.scrollHeight;
    }, 80);
  }

  async function sendMessage(content) {
    requireReady();
    if (!state.activeConversation || !content || !content.trim()) return;

    try {
      const messageText = content.trim();

      // The deployed messaging authorization model stores community.id in
      // sender_id and RLS maps that profile back to auth.uid().
      const { error } = await window.supabase
        .from("messages")
        .insert({
          conversation_id: state.activeConversation.id,
          sender_id: state.currentUser.communityId,
          content: messageText,
          read: false
        });

      if (error) throw error;

      window.Telemetry?.logEvent("message_sent", { entityType: "conversation", entityId: state.activeConversation.id });

      // Clear input
      const input = document.querySelector(".message-input");
      if (input) input.value = "";
      delete state.drafts[state.activeConversation.id];

      // Reload and render
      await loadMessages(state.activeConversation.id);
      renderMessages();

      // Update conversation preview (client-side bump)
      await window.supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: messageText.slice(0, 120)
        })
        .eq("id", state.activeConversation.id);

      // Dispatch event for message badges
      window.dispatchEvent(new CustomEvent('messages-updated'));

      // Scroll to bottom
      setTimeout(() => {
        const area = document.querySelector(".messages-area");
        if (area) area.scrollTop = area.scrollHeight;
      }, 50);

      // XP hook (optional)
      if (window.DailyEngagement?.awardXP && window.DailyEngagement?.XP_REWARDS?.SEND_MESSAGE) {
        await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.SEND_MESSAGE, "Sent message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      showToast(error?.message || "Failed to send message", "error");
    }
  }

  async function markMessagesAsRead(conversationId) {
    requireReady();

    // Mark as read: messages in convo NOT sent by me
    await window.supabase
      .from("messages")
      .update({ read: true })
      .eq("conversation_id", conversationId)
      .neq("sender_id", state.currentUser.communityId)
      .eq("read", false);

    console.log(`[Messages] marked as read for conversation: ${conversationId}`);

    // Dispatch event for message badges
    window.dispatchEvent(new CustomEvent('messages-updated'));
  }

  function filterConversations(query) {
    state.conversationSearch = (query || "").toLowerCase();
    renderConversationsList();
  }

  function scrollToBottom() {
    const area = document.getElementById("messages-area");
    if (area) area.scrollTop = area.scrollHeight;
    const btn = document.getElementById("scroll-to-bottom");
    if (btn) btn.style.display = "none";
  }

  // A new message elsewhere (another conversation, or while Inbox is not in
  // view): who it is from, never what it says. Above the bottom bar on
  // phones and tablets; opens the conversation in Inbox.
  function showIncomingToast(senderName, convId) {
    const existing = document.getElementById("msg-incoming-toast");
    if (existing) existing.remove();

    const toast = document.createElement("button");
    toast.type = "button";
    toast.id = "msg-incoming-toast";
    toast.setAttribute("role", "status");
    toast.style.cssText = `
      position: fixed;
      bottom: calc(var(--mobile-tab-bar-height, 1.25rem) + 0.75rem);
      right: 1rem;
      background: #0d1b2e;
      border: 1px solid #00e0ff;
      color: #fff;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font: inherit;
      font-size: 0.9rem;
      text-align: left;
      z-index: 16000;
      max-width: min(300px, calc(100vw - 2rem));
      min-height: 44px;
      box-shadow: 0 8px 24px rgba(0,224,255,0.2);
      cursor: pointer;
      animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = `
      <div style="font-weight:700;color:#00e0ff;margin-bottom:0.25rem;"><span aria-hidden="true">💬</span> New message</div>
      <div style="color:#aaa;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">from ${escapeHtml(senderName)}</div>
    `;
    toast.addEventListener("click", async () => {
      toast.remove();
      if (typeof window.openMessagesModal === "function") await window.openMessagesModal();
      await selectConversationById(convId);
    });
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
  }

  // ============================================================
  // REALTIME
  // ============================================================

  function setupRealtimeSubscriptions() {
    requireReady();

    // Realtime channel duplication guard + cleanup
    if (window.__IE_MSG_RT_CHANNEL__) {
      state.realtimeChannel = window.__IE_MSG_RT_CHANNEL__;
      return;
    }

    if (state.realtimeChannel) {
      try { window.supabase.removeChannel(state.realtimeChannel); } catch {}
      state.realtimeChannel = null;
    }

    // Register with realtimeManager (deduped, delayed)
    state.realtimeChannel = window.realtimeManager?.subscribeOnce('messaging', (supabase, context) => {
      return supabase.channel("messaging")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const newMessage = payload.new;
        if (!newMessage) return;

        const isActive = state.activeConversation && newMessage.conversation_id === state.activeConversation.id;

        if (isActive) {
          // sender_id is community.id. (Supabase queries are thenables
          // without .catch(), so a failed lookup is caught here.)
          let sender = null;
          try {
            ({ data: sender } = await window.supabase
              .from("community")
              .select("id, name, image_url, user_id, photo_visible, photo_consent_at")
              .eq("id", newMessage.sender_id)
              .single());
          } catch (_) {
            sender = null;
          }

          // A message already shown (your own, reloaded after sending)
          // is not added twice.
          if (!state.messages.some((m) => m.id === newMessage.id)) {
            state.messages.push({
              ...newMessage,
              sender: sender ? { id: sender.id, name: sender.name, image_url: window.profilePhotoUrl?.(sender) } : null
            });
            renderMessages();
          }

          const area = document.querySelector(".messages-area");
          if (area) area.scrollTop = area.scrollHeight;

          // Mark as read if it's not mine and Inbox is in view; otherwise
          // it stays unread (and counted) until the member comes back.
          if (newMessage.sender_id !== state.currentUser.communityId) {
            if (isViewing()) {
              await markMessagesAsRead(state.activeConversation.id);
              const read = state.messages[state.messages.length - 1];
              if (read?.id === newMessage.id) read.read = true;
            } else {
              const conv = state.conversations.find((c) => c.id === newMessage.conversation_id);
              showIncomingToast(conv?.otherUser?.name || "Someone", newMessage.conversation_id);
            }
          }
        } else if (newMessage.sender_id !== state.currentUser.communityId) {
          // Show incoming toast for messages in other conversations
          const conv = state.conversations.find((c) => c.id === newMessage.conversation_id);
          const senderName = conv?.otherUser?.name || "Someone";
          showIncomingToast(senderName, newMessage.conversation_id);
        }

        await loadConversations();
        renderConversationsList();
        await updateUnreadCount();
        
        // Dispatch event for message badges
        window.dispatchEvent(new CustomEvent('messages-updated'));
      })
      .subscribe();
    });
  }

  // ============================================================
  // RENDERING
  // ============================================================

  function renderMessagesTab() {
    const container = document.getElementById("messages-container");
    if (!container) return;

    container.innerHTML = `
      <div class="messages-container">
        <div class="conversations-sidebar" id="msg-sidebar">
          <div class="conversations-header">
            <h3>
              💬 Messages
              ${state.unreadCount > 0 ? `<span class="unread-badge">${state.unreadCount}</span>` : ""}
            </h3>
            <button class="new-message-btn" type="button" aria-label="New message" onclick="MessagingModule.showNewMessageModal()">
              <i class="fas fa-plus" aria-hidden="true"></i> New
            </button>
          </div>
          <div class="conv-search-bar">
            <input type="text" id="conv-search-input" placeholder="Search conversations..."
              oninput="MessagingModule.filterConversations(this.value)"
              value="${escapeHtml(state.conversationSearch || '')}">
          </div>
          <div class="conversations-list" id="conversations-list"></div>
          <!-- Collapse handle — right edge of sidebar -->
          <button class="msg-sidebar-tab" id="msg-sidebar-tab" aria-label="Collapse conversations" title="Collapse conversations">
            <i class="fas fa-chevron-left" id="msg-sidebar-tab-icon"></i>
          </button>
        </div>

        <div class="chat-panel" id="chat-panel">
          <div class="empty-chat">
            <div class="empty-chat-icon">💬</div>
            <h3>Select a conversation</h3>
            <p>Choose a conversation from the left or start a new one</p>
          </div>
        </div>
      </div>

      <!-- New Message Modal -->
      <div class="new-message-modal" id="new-message-modal">
        <div class="new-message-modal-content">
          <div class="modal-header">
            <h3>New Message</h3>
            <button class="modal-close" onclick="MessagingModule.hideNewMessageModal()">×</button>
          </div>
          <div class="search-users">
            <input type="text" class="search-input" placeholder="Search people..."
              onkeyup="MessagingModule.filterUsers(this.value)">
          </div>
          <div class="users-list" id="users-list"></div>
        </div>
      </div>
    `;

    renderConversationsList();

    // Wire sidebar collapse toggle
    initSidebarCollapse();

    // Wire resize to keep mobile view sane
    window.removeEventListener("resize", applyResponsiveLayout);
    window.addEventListener("resize", applyResponsiveLayout);
    applyResponsiveLayout();
  }

  function renderConversationsList() {
    const container = document.getElementById("conversations-list");
    if (!container) return;

    if (!state.conversations || state.conversations.length === 0) {
      container.innerHTML = `
        <div class="empty-conversations">
          <div class="empty-conversations-icon">📭</div>
          <p>No conversations yet</p>
          <p style="font-size:0.85rem;">Start a new conversation to connect with others</p>
        </div>
      `;
      return;
    }

    const q = state.conversationSearch || "";
    const filtered = q
      ? state.conversations.filter((c) =>
          (c.otherUser?.name || "").toLowerCase().includes(q) ||
          (c.last_message_preview || "").toLowerCase().includes(q)
        )
      : state.conversations;

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-conversations"><p>No results for "${escapeHtml(q)}"</p></div>`;
      return;
    }

    container.innerHTML = filtered
      .map((conv) => {
        const isActive = state.activeConversation?.id === conv.id;
        const isUnread = (conv.unreadCount || 0) > 0;
        const initials = (conv.otherUser?.name || "??").substring(0, 2).toUpperCase();
        const timeAgo = formatTimeAgo(conv.last_message_at || conv.created_at);

        return `
          <div class="conversation-item ${isActive ? "active" : ""} ${isUnread ? "unread" : ""}"
            onclick="MessagingModule.selectConversationById('${conv.id}')">
            <div class="conversation-header">
              <div class="conversation-avatar">
                ${
                  conv.otherUser?.avatar
                    ? `<img src="${conv.otherUser.avatar}" alt="${escapeHtml(conv.otherUser.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                    : initials
                }
              </div>
              <div class="conversation-info">
                <div class="conversation-name${isUnread ? " conv-name-unread" : ""}">
                  <span>${escapeHtml(conv.otherUser?.name || "Unknown")}</span>
                  <span class="conversation-time">${timeAgo}</span>
                </div>
                ${
                  conv.context_title
                    ? `<div style="font-size:0.75rem;color:#00e0ff;margin-bottom:0.25rem;">
                        📌 ${escapeHtml(conv.context_title)}
                      </div>`
                    : ""
                }
                <div class="conversation-preview ${isUnread ? "unread-preview" : ""}">
                  ${escapeHtml(conv.last_message_preview || "Start a conversation...")}
                </div>
              </div>
              ${isUnread ? `<span class="conv-unread-badge">${conv.unreadCount}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderChatPanel() {
    const panel = document.getElementById("chat-panel");
    if (!panel || !state.activeConversation) return;

    const user = state.activeConversation.otherUser || {};
    const initials = (user.name || "??").substring(0, 2).toUpperCase();

    panel.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-avatar">
          ${
            user.avatar
              ? `<img src="${user.avatar}" alt="${escapeHtml(user.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
              : initials
          }
        </div>
        <div class="chat-header-info">
          <div class="chat-header-name">${escapeHtml(user.name || "Unknown")}</div>
          <div class="chat-header-status">${escapeHtml(user.email || "")}</div>
        </div>
        ${
          state.activeConversation.context_title
            ? `<div class="chat-context">
                <i class="fas fa-lightbulb"></i>
                ${escapeHtml(state.activeConversation.context_title)}
              </div>`
            : ""
        }
      </div>

      <div class="messages-area-wrapper">
        <div class="messages-area" id="messages-area"></div>
        <button class="scroll-to-bottom-btn" id="scroll-to-bottom" style="display:none;"
          onclick="MessagingModule.scrollToBottom()">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>

      <div class="message-input-container" id="message-input-container">
        <div class="message-input-wrapper">
          <textarea class="message-input"
            placeholder="Type a message..."
            rows="1"
            onkeydown="MessagingModule.handleInputKeydown(event)"></textarea>
        </div>
        <button class="send-button" onclick="MessagingModule.handleSendClick()" aria-label="Send message" title="Send message">
          <i class="fas fa-paper-plane" aria-hidden="true"></i><span class="send-button-label">Send</span>
        </button>
      </div>
    `;

    // Mobile: inject back button
    ensureMobileBackButton();

    // The unsent text for this conversation, kept while away from it.
    const composer = panel.querySelector(".message-input");
    const conversationId = state.activeConversation.id;
    if (composer) {
      composer.value = state.drafts[conversationId] || "";
      composer.addEventListener("input", () => {
        if (composer.value) state.drafts[conversationId] = composer.value;
        else delete state.drafts[conversationId];
      });
    }

    // Setup keyboard handling for mobile
    setupMobileKeyboardHandling();

    renderMessages();

    // Wire scroll-to-bottom button visibility
    const area = document.getElementById("messages-area");
    if (area) {
      area.addEventListener("scroll", () => {
        const btn = document.getElementById("scroll-to-bottom");
        if (!btn) return;
        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 100;
        btn.style.display = isNearBottom ? "none" : "flex";
      });
    }
  }

  function renderMessages() {
    const container = document.getElementById("messages-area");
    if (!container) return;

    if (!state.messages || state.messages.length === 0) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">
          <div style="text-align:center;">
            <div style="font-size:3rem;margin-bottom:1rem;opacity:0.3;">👋</div>
            <p>Start the conversation!</p>
          </div>
        </div>
      `;
      return;
    }

    let html = "";

    // "Load earlier messages" button at top
    if (state.hasMoreMessages) {
      html += `<div class="load-earlier-wrap"><button class="load-earlier-btn" onclick="MessagingModule.loadEarlierMessages()">Load earlier messages</button></div>`;
    }

    let lastDateStr = null;
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterdayStr = new Date(now - 86400000).toDateString();

    state.messages.forEach((msg, index) => {
      const msgDate = new Date(msg.created_at);
      const msgDateStr = msgDate.toDateString();

      if (msgDateStr !== lastDateStr) {
        lastDateStr = msgDateStr;
        let dateLabel;
        if (msgDateStr === todayStr) dateLabel = "Today";
        else if (msgDateStr === yesterdayStr) dateLabel = "Yesterday";
        else dateLabel = msgDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

        html += `<div class="msg-date-separator"><span>${escapeHtml(dateLabel)}</span></div>`;
      }

      const isSent = msg.sender_id === state.currentUser.communityId;
      const isUnread = !isSent && msg.read === false;
      const senderName = isSent ? "You" : (msg.sender?.name || "Unknown");
      const initials = senderName.substring(0, 2).toUpperCase();
      const timestamp = formatTime(msg.created_at);
      const previous = state.messages[index - 1];
      const next = state.messages[index + 1];
      const previousDate = previous ? new Date(previous.created_at).toDateString() : null;
      const nextDate = next ? new Date(next.created_at).toDateString() : null;
      const continuesGroup = !!previous && previous.sender_id === msg.sender_id && previousDate === msgDateStr;
      const endsGroup = !next || next.sender_id !== msg.sender_id || nextDate !== msgDateStr;

      html += `
        <div class="message ${isSent ? "sent" : "received"}${isUnread ? " unread" : ""}${continuesGroup ? " continued" : ""}" data-msg-id="${escapeHtml(String(msg.id))}">
          <div class="message-avatar"${continuesGroup ? ' aria-hidden="true"' : ''}>${continuesGroup ? '' : initials}</div>
          <div class="message-content">
            <div class="message-bubble">
              ${escapeHtml(msg.content)}
              ${isSent ? `<button class="msg-delete-btn" onclick="MessagingModule.deleteMessage('${escapeHtml(String(msg.id))}')" title="Delete">×</button>` : ""}
            </div>
            ${endsGroup ? `<div class="message-timestamp">${timestamp}</div>` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  function renderUsersList(users = state.allUsers) {
    const container = document.getElementById("users-list");
    if (!container) return;

    if (!users || users.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:2rem;color:#888;"><p>No users found</p></div>`;
      return;
    }

    container.innerHTML = users
      .map((user) => {
        const initials = (user.name || "??").substring(0, 2).toUpperCase();
        const skills = typeof user.skills === "string" ? user.skills : "";

        // Pass community.id into startConversationWith
        return `
          <div class="user-item" onclick="MessagingModule.startConversationWith('${user.id}')">
            <div class="user-item-avatar">
              ${
                window.profilePhotoUrl?.(user)
                  ? `<img src="${window.profilePhotoUrl?.(user)}" alt="${escapeHtml(user.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                  : initials
              }
            </div>
            <div class="user-item-info">
              <div class="user-item-name">${escapeHtml(user.name || "Unknown")}</div>
              <div class="user-item-details">${skills ? escapeHtml(skills) : escapeHtml(user.email || "")}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderError(message) {
    const container = document.getElementById("messages-container");
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:400px;color:#888;text-align:center;">
        <div>
          <div style="font-size:3rem;margin-bottom:1rem;">⚠️</div>
          <p>${escapeHtml(message)}</p>
          <p style="font-size:0.85rem;margin-top:1rem;">Please sign in to access messages</p>
        </div>
      </div>
    `;
  }

  // ============================================================
  // EVENT HANDLERS
  // ============================================================

  function handleSendClick() {
    const input = document.querySelector(".message-input");
    if (input && input.value.trim()) {
      sendMessage(input.value);
    }
  }

  function handleInputKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendClick();
    }
  }

  async function selectConversationById(conversationId) {
    const conversation = state.conversations.find((c) => c.id === conversationId);
    if (conversation) await selectConversation(conversation);
  }

  async function startConversationWith(userIdOrCommunityId) {
    hideNewMessageModal();
    await startConversation(userIdOrCommunityId);
  }

  function showNewMessageModal() {
    const modal = document.getElementById("new-message-modal");
    if (!modal) return;
    modal.classList.add("active");
    renderUsersList();
  }

  function hideNewMessageModal() {
    const modal = document.getElementById("new-message-modal");
    if (modal) modal.classList.remove("active");
  }

  function filterUsers(query) {
    const q = (query || "").toLowerCase();
    const filtered = state.allUsers.filter((user) => {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const skills = (typeof user.skills === "string" ? user.skills : "").toLowerCase();
      return name.includes(q) || email.includes(q) || skills.includes(q);
    });
    renderUsersList(filtered);
  }

  // ============================================================
  // UI UTILITIES
  // ============================================================

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "";
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return "now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString();
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function updateUnreadBadge() {
    // Update tab button badge
    const tabButton = document.querySelector('[data-tab="messages"]');
    if (tabButton) {
      let badge = tabButton.querySelector(".unread-badge");
      if (state.unreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "unread-badge";
          tabButton.appendChild(badge);
        }
        badge.textContent = state.unreadCount;
      } else if (badge) {
        badge.remove();
      }
    }

    // Update header badge
    const headerBadge = document.querySelector(".conversations-header .unread-badge");
    if (headerBadge) {
      if (state.unreadCount > 0) headerBadge.textContent = state.unreadCount;
      else headerBadge.remove();
    }
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === "error" ? "#f00" : "#00e0ff"};
      color: ${type === "error" ? "#fff" : "#000"};
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 16000;
      animation: slideIn 0.3s ease;
      max-width: 420px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.35);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    init,
    cleanup,
    startConversation,
    selectConversationById,
    startConversationWith,
    handleSendClick,
    handleInputKeydown,
    showNewMessageModal,
    hideNewMessageModal,
    filterUsers,
    filterConversations,
    loadEarlierMessages,
    deleteMessage,
    scrollToBottom,
    onShown,
    showList,
    getState: () => ({ ...state })
  };
})();

// Expose globally
window.MessagingModule = MessagingModule;

// Back in the app with Inbox in view: the open conversation is now read.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") MessagingModule.onShown();
});

// Restored from the back-forward cache after leaving the page (which clears
// Messages, dashboardPane.js): Inbox loads again rather than staying empty.
window.addEventListener("pageshow", (event) => {
  if (event.persisted && document.getElementById("messages-modal")?.classList.contains("active")) {
    MessagingModule.init();
  }
});

// Escape closes New Message (and only that; Inbox stays).
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (document.getElementById("new-message-modal")?.classList.contains("active")) {
    MessagingModule.hideNewMessageModal();
    event.stopImmediatePropagation();
  }
}, true);

// Auto-initialize when tab becomes active
document.addEventListener("DOMContentLoaded", () => {
  const messagesTab = document.getElementById("messages");
  if (!messagesTab) return;

  // Prevent double observers
  if (MessagingModule.getState?.().observer) return;

  const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    const el = mutation.target;
    if (!el || el.id !== "messages") return;

    const isActive = el.classList.contains("active-tab-pane");
    if (isActive) {
      MessagingModule.init();
    }
    // DO NOT cleanup just because the tab is inactive
  });
});


  observer.observe(messagesTab, { attributes: true, attributeFilter: ["class"] });

  // Initialize if already active
  if (messagesTab.classList.contains("active-tab-pane")) {
    MessagingModule.init();
  }
});
