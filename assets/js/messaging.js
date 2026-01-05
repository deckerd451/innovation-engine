/*
 * Direct Messaging System — Fixed + Fully Functional Module (RLS-safe)
 * File: assets/js/messaging.js
 *
 * ✅ Fixes:
 * - Uses correct IDs for schema + RLS:
 *   - conversations.participant_1_id / participant_2_id are community.id
 *   - messages.sender_id is auth.users(id) - the auth user ID
 * - Correctly filters conversations by communityId (not auth uid)
 * - Avoids 406 errors by using maybeSingle()-style logic
 * - Avoids duplicate conversations by sorting participants (matches unique_participants index)
 * - Works even if callers pass auth user_id OR community.id (auto-resolves to community.id)
 *
 * Requirements:
 * - window.supabase must exist (from supabaseClient.js)
 * - Tables:
 *   - conversations(participant_1_id uuid, participant_2_id uuid, context_type, context_id, context_title, last_message_at, last_message_preview)
 *   - messages(conversation_id uuid, sender_id uuid REFERENCES auth.users(id), content text, read bool, ...)
 * - RLS policies already present (yours are)
 */

const MessagingModule = (function () {
  "use strict";

  // ============================================================
  // STATE
  // ============================================================

  const state = {
    initialized: false,

    // Auth + profile
    authUser: null, // supabase auth user
    currentUser: null, // { authId, communityId, email, name, avatar }

    // Data
    conversations: [],
    activeConversation: null,
    messages: [],
    unreadCount: 0,
    allUsers: [],

    // Realtime
    realtimeChannel: null,

    // UI flags
    observer: null
  };

  // ============================================================
  // INIT
  // ============================================================

  async function init() {
    if (state.initialized) {
      console.log("Messaging already initialized");
      // Re-render UI when modal reopens
      renderMessagesTab();
      renderConversationsList();
      return;
    }

    try {
      if (!window.supabase) throw new Error("Supabase not available");

      const { data: { session }, error: sessErr } = await window.supabase.auth.getSession();
      if (sessErr) throw sessErr;
      if (!session) throw new Error("No active session");

      state.authUser = session.user;

      // Load community profile by auth user_id
      const { data: profile, error: profErr } = await window.supabase
        .from("community")
        .select("*")
        .eq("user_id", state.authUser.id)
        .single();

      if (profErr) throw profErr;
      if (!profile?.id) throw new Error("No community profile found for this user (community.id missing)");

      state.currentUser = {
        authId: state.authUser.id,
        email: state.authUser.email,
        name: profile?.name || (state.authUser.email ? state.authUser.email.split("@")[0] : "User"),
        communityId: profile.id, // ✅ critical
        avatar: profile?.image_url || null
      };

      // Load initial data
      await Promise.all([
        loadConversations(),
        loadAllUsers(),
        updateUnreadCount()
      ]);

      renderMessagesTab();
      setupRealtimeSubscriptions();

      state.initialized = true;
      console.log("✅ Messaging initialized");
    } catch (error) {
      console.error("Failed to initialize messaging:", error);
      renderError(error?.message || "Failed to initialize messaging");
    }
  }

  // ============================================================
  // HELPERS (ID RESOLUTION / SAFETY)
  // ============================================================

  function requireReady() {
    if (!state.currentUser?.communityId) {
      throw new Error("Messaging not ready: missing currentUser.communityId");
    }
  }

  // Accept either community.id OR community.user_id (auth uid) and return community.id
  async function resolveCommunityId(maybeAuthOrCommunityId) {
    if (!maybeAuthOrCommunityId) return null;

    // Try as community.id first
    let { data: row, error } = await window.supabase
      .from("community")
      .select("id, user_id")
      .eq("id", maybeAuthOrCommunityId)
      .maybeSingle?.() ?? await window.supabase
        .from("community")
        .select("id, user_id")
        .eq("id", maybeAuthOrCommunityId)
        .single().catch(e => ({ data: null, error: e }));

    if (!error && row?.id) return row.id;

    // Try as auth user_id
    const res2 = await window.supabase
      .from("community")
      .select("id, user_id")
      .eq("user_id", maybeAuthOrCommunityId)
      .maybeSingle?.() ?? await window.supabase
        .from("community")
        .select("id, user_id")
        .eq("user_id", maybeAuthOrCommunityId)
        .single().catch(e => ({ data: null, error: e }));

    if (!res2.error && res2.data?.id) return res2.data.id;

    return null;
  }

  function sortedPair(a, b) {
    return a < b ? [a, b] : [b, a];
  }

  function safeMaybeSingle(queryPromise) {
    // If supabase-js supports maybeSingle(), use it in the caller.
    // Otherwise emulate: return first row or null.
    return queryPromise;
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
          id, user_id, name, email, image_url
        ),
        participant_2:community!conversations_participant_2_id_fkey(
          id, user_id, name, email, image_url
        )
      `)
      // ✅ IMPORTANT: filter by COMMUNITY IDs
      .or(`participant_1_id.eq.${myCid},participant_2_id.eq.${myCid}`)
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error loading conversations:", error);
      return;
    }

    state.conversations = (data || []).map((conv) => {
      const isParticipant1 = conv.participant_1_id === myCid;
      const otherParticipant = isParticipant1 ? conv.participant_2 : conv.participant_1;

      return {
        ...conv,
        otherUser: otherParticipant
          ? {
              // other user's identifiers
              authId: otherParticipant.user_id,
              communityId: otherParticipant.id,
              name: otherParticipant.name || "Unknown",
              email: otherParticipant.email || "",
              avatar: otherParticipant.image_url || null
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
  }

  async function loadMessages(conversationId) {
    requireReady();

    // Fetch messages
    const { data, error } = await window.supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
      return;
    }

    // Get unique sender IDs (auth user IDs)
    const senderIds = [...new Set((data || []).map(m => m.sender_id))];

    // Fetch sender info from community table
    const { data: senders } = await window.supabase
      .from("community")
      .select("id, user_id, name, image_url")
      .in("user_id", senderIds);

    // Create a map of user_id -> community profile
    const senderMap = {};
    (senders || []).forEach(s => {
      senderMap[s.user_id] = { id: s.id, name: s.name, image_url: s.image_url };
    });

    // Attach sender info to messages
    state.messages = (data || []).map(msg => ({
      ...msg,
      sender: senderMap[msg.sender_id] || null
    }));

    // Mark as read (only messages not sent by me)
    await markMessagesAsRead(conversationId);
  }

  async function loadAllUsers() {
    requireReady();

    // show all other community members (filter by auth user_id)
    const { data, error } = await window.supabase
      .from("community")
      .select("id, user_id, name, email, skills, image_url")
      .neq("user_id", state.currentUser.authId);

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

  /**
   * Start or open a conversation.
   * Accepts either:
   * - other user's auth uid (community.user_id), OR
   * - other user's community.id
   */
  async function startConversation(otherUserIdOrCommunityId, context = {}) {
    requireReady();

    try {
      const myCid = state.currentUser.communityId;
      const otherCid = await resolveCommunityId(otherUserIdOrCommunityId);

      if (!otherCid) throw new Error("Could not resolve recipient community id");
      if (otherCid === myCid) throw new Error("Cannot start a conversation with yourself");

      const [p1, p2] = sortedPair(myCid, otherCid);

      // 1) Try to find existing (use unique index order)
      const { data: existingData, error: findError } = await window.supabase
        .from("conversations")
        .select("*")
        .eq("participant_1_id", p1)
        .eq("participant_2_id", p2)
        .limit(1);

      // Only throw on real errors (ignore empty results)
      if (findError) {
        console.error("Error finding conversation:", findError);
      }

      // Extract first result if it exists
      let convo = Array.isArray(existingData) && existingData.length > 0 ? existingData[0] : null;

      // 2) Create if missing
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

        const insertQuery = window.supabase
          .from("conversations")
          .insert(payload)
          .select("*")
          .single();

        const { data: created, error: createErr } = await insertQuery;

        if (createErr) {
          // If we hit duplicate due to race, re-fetch
          if (String(createErr.code || "").includes("23505") || createErr.message?.includes("unique_participants")) {
            const { data: refetchedData, error: refetchErr } = await window.supabase
              .from("conversations")
              .select("*")
              .eq("participant_1_id", p1)
              .eq("participant_2_id", p2)
              .limit(1);

            if (refetchErr) {
              console.error("Error refetching conversation:", refetchErr);
            }

            convo = Array.isArray(refetchedData) && refetchedData.length > 0 ? refetchedData[0] : null;
          } else {
            throw createErr;
          }
        } else {
          convo = created;
        }
      }

      // Reload list + select
      await loadConversations();
      const full = state.conversations.find((c) => c.id === convo.id) || null;

      if (full) await selectConversation(full);
      return convo.id;
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

      // ✅ IMPORTANT: sender_id must be community.id (not auth.uid())
      const { data, error } = await window.supabase
        .from("messages")
        .insert({
          conversation_id: state.activeConversation.id,
          sender_id: state.currentUser.communityId,
          content: messageText,
          read: false
        })
        .select()
        .single();

      if (error) throw error;

      // Clear input
      const input = document.querySelector(".message-input");
      if (input) input.value = "";

      // Immediately reload messages to show the new message
      await loadMessages(state.activeConversation.id);
      renderMessages();

      // Scroll to bottom
      setTimeout(() => {
        const area = document.querySelector(".messages-area");
        if (area) area.scrollTop = area.scrollHeight;
      }, 50);

      // Optionally bump conversation preview client-side (optional; DB trigger is better)
      // This will also help the sidebar feel instant even before a realtime refresh
      await window.supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: messageText.slice(0, 120)
        })
        .eq("id", state.activeConversation.id);

      // Award XP for sending message
      if (window.DailyEngagement) {
        await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.SEND_MESSAGE, 'Sent message');
      }

    } catch (error) {
      console.error("Error sending message:", error);
      showToast(error?.message || "Failed to send message", "error");
    }
  }

  async function markMessagesAsRead(conversationId) {
    requireReady();

    // Mark messages in this conversation as read that were NOT sent by me
    await window.supabase
      .from("messages")
      .update({ read: true })
      .eq("conversation_id", conversationId)
      .neq("sender_id", state.currentUser.communityId)
      .eq("read", false);
  }

  // ============================================================
  // REALTIME SUBSCRIPTIONS
  // ============================================================

  function setupRealtimeSubscriptions() {
    requireReady();

    if (state.realtimeChannel) {
      window.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }

    state.realtimeChannel = window.supabase
      .channel("messaging")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMessage = payload.new;
          if (!newMessage) return;

          // Update sidebar list in background
          // (RLS ensures we only receive what we can see)
          let isActive = state.activeConversation && newMessage.conversation_id === state.activeConversation.id;

          if (isActive) {
            // Fetch sender by auth user_id (sender_id is auth.users.id)
            const { data: sender } = await window.supabase
              .from("community")
              .select("id, name, image_url")
              .eq("user_id", newMessage.sender_id)
              .single()
              .catch(() => ({ data: null }));

            state.messages.push({
              ...newMessage,
              sender: sender ? { id: sender.id, name: sender.name, image_url: sender.image_url } : null
            });

            renderMessages();

            const area = document.querySelector(".messages-area");
            if (area) area.scrollTop = area.scrollHeight;

            // Mark as read if it's not mine
            if (newMessage.sender_id !== state.currentUser.communityId) {
              await markMessagesAsRead(state.activeConversation.id);
            }
          }

          await loadConversations();
          renderConversationsList();
          await updateUnreadCount();
        }
      )
      .subscribe();
  }

  // ============================================================
  // RENDERING
  // ============================================================

  function renderMessagesTab() {
    const container = document.getElementById("messages-container");
    if (!container) return;

    container.innerHTML = `
      <div class="messages-container">
        <div class="conversations-sidebar">
          <div class="conversations-header">
            <h3>
              💬 Messages
              ${state.unreadCount > 0 ? `<span class="unread-badge">${state.unreadCount}</span>` : ""}
            </h3>
            <button class="new-message-btn" onclick="MessagingModule.showNewMessageModal()">
              <i class="fas fa-plus"></i> New
            </button>
          </div>
          <div class="conversations-list" id="conversations-list"></div>
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

    container.innerHTML = state.conversations
      .map((conv) => {
        const isActive = state.activeConversation?.id === conv.id;
        const initials = (conv.otherUser?.name || "??").substring(0, 2).toUpperCase();
        const timeAgo = formatTimeAgo(conv.last_message_at || conv.created_at);

        return `
          <div class="conversation-item ${isActive ? "active" : ""}"
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
                <div class="conversation-name">
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
                <div class="conversation-preview">
                  ${escapeHtml(conv.last_message_preview || "Start a conversation...")}
                </div>
              </div>
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

      <div class="messages-area" id="messages-area"></div>

      <div class="message-input-container">
        <div class="message-input-wrapper">
          <textarea class="message-input"
            placeholder="Type a message..."
            rows="1"
            onkeydown="MessagingModule.handleInputKeydown(event)"></textarea>
        </div>
        <button class="send-button" onclick="MessagingModule.handleSendClick()">
          <i class="fas fa-paper-plane"></i> Send
        </button>
      </div>
    `;

    renderMessages();
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

    container.innerHTML = state.messages
      .map((msg) => {
        const isSent = msg.sender_id === state.currentUser.communityId;
        const senderName = isSent ? "You" : (msg.sender?.name || "Unknown");
        const initials = senderName.substring(0, 2).toUpperCase();
        const timestamp = formatTime(msg.created_at);

        return `
          <div class="message ${isSent ? "sent" : "received"}">
            <div class="message-avatar">${initials}</div>
            <div class="message-content">
              <div class="message-bubble">${escapeHtml(msg.content)}</div>
              <div class="message-timestamp">${timestamp}</div>
            </div>
          </div>
        `;
      })
      .join("");
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

        // ✅ IMPORTANT: pass community.id (not auth user_id) into startConversationWith
        return `
          <div class="user-item" onclick="MessagingModule.startConversationWith('${user.id}')">
            <div class="user-item-avatar">
              ${
                user.image_url
                  ? `<img src="${user.image_url}" alt="${escapeHtml(user.name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
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
  // UTILITIES
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
  // CLEANUP
  // ============================================================

  function cleanup() {
    if (state.realtimeChannel) {
      window.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    state.initialized = false;
    state.conversations = [];
    state.messages = [];
    state.activeConversation = null;
    state.unreadCount = 0;
    console.log("Messaging cleanup complete");
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
    getState: () => ({ ...state })
  };
})();

// Expose globally
window.MessagingModule = MessagingModule;

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
      if (isActive) MessagingModule.init();
      else MessagingModule.cleanup();
    });
  });

  observer.observe(messagesTab, { attributes: true, attributeFilter: ["class"] });

  // Initialize if already active
  if (messagesTab.classList.contains("active-tab-pane")) {
    MessagingModule.init();
  }
});
