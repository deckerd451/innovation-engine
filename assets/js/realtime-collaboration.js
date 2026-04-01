// ================================================================
// REAL-TIME COLLABORATION SYSTEM
// ================================================================
// Live messaging, notifications, presence indicators, and collaborative features

console.log("%c🔄 Real-time Collaboration Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let authUserId = null; // kept for diagnostics only
let realtimeChannel = null;
let presenceChannel = null;
let activeConversations = new Map();
let unreadCounts = new Map();
let typingIndicators = new Map();
let allConversationsCache = []; // for sidebar search
let participantDetailsCache = new Map(); // for incoming toast
let msgOffsets = new Map(); // conversationId -> number of messages loaded
let hasMoreMsgs = new Map(); // conversationId -> boolean

// Collaboration event types
const COLLAB_EVENTS = {
  MESSAGE_SENT: 'message_sent',
  MESSAGE_READ: 'message_read',
  USER_TYPING: 'user_typing',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  PROJECT_UPDATE: 'project_update',
  TEAM_INVITE: 'team_invite',
  CONNECTION_REQUEST: 'connection_request'
};

// Message types
const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  SYSTEM: 'system',
  PROJECT_INVITE: 'project_invite',
  CONNECTION_REQUEST: 'connection_request'
};

function getCurrentCommunityId() {
  return currentUserProfile?.id || null;
}

function isOwnMessage(message) {
  const currentCommunityId = getCurrentCommunityId();
  return !!currentCommunityId && message?.sender_id === currentCommunityId;
}

// Send direct message function
async function sendDirectMessage(userId, message) {
  console.log('📨 Direct message function called:', userId, message);

  if (!currentUserProfile || !userId) {
    console.error('❌ Missing user information for direct message');
    return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const currentCommunityId = getCurrentCommunityId();
    if (!currentCommunityId) {
      throw new Error('Current community profile not loaded');
    }

    // Check if conversation already exists
    const { data: existingConversation, error: lookupError } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1_id.eq.${currentCommunityId},participant_2_id.eq.${userId}),and(participant_1_id.eq.${userId},participant_2_id.eq.${currentCommunityId})`)
      .maybeSingle();

    if (lookupError) {
      console.warn('⚠️ Conversation lookup error:', lookupError);
    }

    let conversationId;

    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert([{
          participant_1_id: currentCommunityId,
          participant_2_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConversation.id;
    }

    // Send the message if provided
    // IMPORTANT: messages.sender_id references community.id, not auth.users.id
    if (message && message.trim()) {
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentCommunityId,
          content: message.trim()
        });

      if (messageError) throw messageError;

      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
    }

    await openMessagingInterface(conversationId);

    console.log('✅ Direct message sent successfully');

  } catch (error) {
    console.error('❌ Error sending direct message:', error);
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to send message', 'error');
    }
  }
}

// Initialize real-time collaboration
export function initRealtimeCollaboration() {
  supabase = window.supabase;

  // Expose functions globally FIRST
  window.sendDirectMessage = sendDirectMessage;
  window.openMessagingInterface = openMessagingInterface;
  window.closeMessagingInterface = closeMessagingInterface;
  window.markMessagesAsRead = markMessagesAsRead;
  window.showUserPresence = showUserPresence;
  window.startTypingIndicator = startTypingIndicator;
  window.stopTypingIndicator = stopTypingIndicator;
  window.sendMessage = sendMessage;
  window.openConversation = openConversation;
  window.showNewMessageDialog = showNewMessageDialog;
  window.createNewMessage = createNewMessage;
  window.selectUserForMessage = selectUserForMessage;
  window.closeNewMessageDialog = closeNewMessageDialog;
  window.filterConversationsList = filterConversationsList;
  window.rtScrollToBottom = rtScrollToBottom;
  window.deleteConversationMessage = deleteConversationMessage;
  window.loadEarlierMessages = loadEarlierMessages;

  window.addEventListener('profile-loaded', async (e) => {
    currentUserProfile = e.detail.profile;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      authUserId = user?.id || currentUserProfile.user_id || null;
    } catch (_) {
      authUserId = currentUserProfile.user_id || null;
    }

    setupRealtimeChannels();
  });

  console.log('✅ Real-time collaboration ready');
}

// Setup real-time channels
async function setupRealtimeChannels() {
  if (!supabase || !currentUserProfile) return;

  console.log('🔄 Setting up real-time channels for user:', currentUserProfile.name);

  try {
    if (realtimeChannel) {
      await supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    if (presenceChannel) {
      await supabase.removeChannel(presenceChannel);
      presenceChannel = null;
    }

    realtimeChannel = supabase
      .channel('collaboration-main')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, handleNewMessage)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations'
      }, handleConversationUpdate)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'project_members'
      }, handleTeamInvite)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'connections'
      }, handleConnectionRequest)
      .subscribe();

    presenceChannel = supabase
      .channel('user-presence')
      .on('presence', { event: 'sync' }, handlePresenceSync)
      .on('presence', { event: 'join' }, handlePresenceJoin)
      .on('presence', { event: 'leave' }, handlePresenceLeave)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: currentUserProfile.id,
            name: currentUserProfile.name,
            avatar: currentUserProfile.image_url,
            online_at: new Date().toISOString()
          });
          console.log('✅ Presence tracking started');
        }
      });

    await loadActiveConversations();
    await loadUnreadCounts();

    console.log('✅ Real-time channels established');

  } catch (error) {
    console.error('❌ Error setting up real-time channels:', error);
  }
}

// Handle new message
function handleNewMessage(payload) {
  const message = payload.new;
  console.log('📨 New message received:', message);

  const isActive = activeConversations.has(message.conversation_id);

  if (isActive) {
    appendMessageToConversation(message.conversation_id, message);
  }

  // sender_id is community.id
  if (!isOwnMessage(message)) {
    updateUnreadCount(message.conversation_id, 1);

    if (!isActive) {
      // Show inline toast for non-active conversations
      const senderName = participantDetailsCache.get(message.conversation_id)?.name || 'Someone';
      showIncomingMsgToast(senderName, message.content, message.conversation_id);
    }
  }

  playNotificationSound();

  // Refresh sidebar to update last message + unread badge
  if (document.getElementById('messaging-interface')) {
    refreshConversationList();
  }
}

function showIncomingMsgToast(senderName, content, conversationId) {
  const existing = document.getElementById('rt-incoming-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'rt-incoming-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 1rem;
    background: #0d1b2e;
    border: 1px solid #00e0ff;
    color: #fff;
    padding: 0.75rem 1rem;
    border-radius: 12px;
    font-size: 0.9rem;
    z-index: 16000;
    max-width: calc(100vw - 2rem);
    box-shadow: 0 8px 24px rgba(0,224,255,0.2);
    cursor: pointer;
  `;
  toast.innerHTML = `
    <div style="font-weight:700;color:#00e0ff;margin-bottom:0.25rem;">💬 ${escapeHtml(senderName)}</div>
    <div style="color:#aaa;font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">${escapeHtml((content || '').substring(0, 80))}</div>
  `;
  toast.addEventListener('click', () => {
    toast.remove();
    // If the messaging interface is already open, jump straight to the
    // conversation.  If it's closed, open it (which will call openConversation
    // internally), so rt-panel-chat is always set via the normal path.
    if (document.getElementById('messaging-interface')) {
      openConversation(conversationId);
    } else {
      openMessagingInterface(conversationId);
    }
  });
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

// Handle conversation updates
function handleConversationUpdate(payload) {
  const conversation = payload.new;
  console.log('💬 Conversation updated:', conversation);

  if (document.getElementById('messaging-interface')) {
    refreshConversationList();
  }
}

// Handle team invitations
function handleTeamInvite(payload) {
  const invite = payload.new;

  if (invite.user_id === currentUserProfile?.id && invite.role === 'pending') {
    console.log('👥 New team invitation received:', invite);
    showTeamInviteNotification(invite);
  }
}

// Handle connection requests
function handleConnectionRequest(payload) {
  const connection = payload.new;

  if (connection.to_user_id === currentUserProfile?.id && connection.status === 'pending') {
    console.log('🤝 New connection request received:', connection);
    showConnectionRequestNotification(connection);
  }
}

// Presence handlers
function handlePresenceSync() {
  const state = presenceChannel?.presenceState?.() || {};
  console.log('👥 Presence sync:', Object.keys(state).length, 'users online');
  updateOnlineUsersList(state);
}

function handlePresenceJoin({ newPresences }) {
  console.log('✅ User joined:', newPresences);
  updateUserOnlineStatus(newPresences, true);
}

function handlePresenceLeave({ leftPresences }) {
  console.log('👋 User left:', leftPresences);
  updateUserOnlineStatus(leftPresences, false);
}

// Open messaging interface
export async function openMessagingInterface(conversationId = null) {
  console.log('💬 Opening messaging interface...');

  const existing = document.getElementById('messaging-interface');
  if (existing) existing.remove();

  const messagingInterface = document.createElement('div');
  messagingInterface.id = 'messaging-interface';
  messagingInterface.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  messagingInterface.innerHTML = `
    <div class="messaging-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 1200px;
      width: 100%;
      height: 80vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <div style="
        padding: 1rem 1.5rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
        background: rgba(0, 224, 255, 0.03);
      ">
        <h2 style="color: #00e0ff; margin: 0; font-size: 1.3rem; font-weight: 700; display: flex; align-items: center; gap: 0.6rem;">
          <i class="fas fa-comments"></i> Messaging
        </h2>
        <button onclick="closeMessagingInterface()" style="
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.2s;
        ">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div style="flex: 1; display: flex; overflow: hidden;">
        <div class="conversations-sidebar" style="
          width: 350px;
          border-right: 1px solid rgba(0, 224, 255, 0.2);
          display: flex;
          flex-direction: column;
        ">
          <div style="
            padding: 1rem 1.5rem;
            border-bottom: 1px solid rgba(0, 224, 255, 0.2);
            flex-shrink: 0;
          ">
            <button onclick="showNewMessageDialog()" style="
              width: 100%;
              padding: 0.75rem;
              background: rgba(0, 224, 255, 0.1);
              border: 1px solid rgba(0, 224, 255, 0.3);
              border-radius: 8px;
              color: #00e0ff;
              cursor: pointer;
              font-weight: 600;
            ">
              <i class="fas fa-plus"></i> New Message
            </button>
            <input type="text" id="rt-conv-search" placeholder="Search conversations..."
              oninput="filterConversationsList(this.value)"
              style="
                margin-top: 0.6rem;
                width: 100%;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(0,224,255,0.2);
                border-radius: 8px;
                padding: 0.45rem 0.75rem;
                color: #e0e0e0;
                font-size: 16px;
                outline: none;
                box-sizing: border-box;
              "
            >
          </div>

          <div id="conversations-list" style="
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
          ">
            <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
              <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
              <p>Loading conversations...</p>
            </div>
          </div>
        </div>

        <div class="chat-area" style="
          flex: 1;
          display: flex;
          flex-direction: column;
        ">
          <div id="chat-header" style="
            padding: 1.5rem;
            border-bottom: 1px solid rgba(0, 224, 255, 0.2);
            flex-shrink: 0;
            display: none;
          "></div>

          <div style="flex: 1; position: relative; overflow: hidden; display: flex; flex-direction: column; min-height: 0;">
          <div id="messages-area" style="
            flex: 1;
            overflow-y: auto;
            padding: 1rem;
            display: flex;
            align-items: center;
            justify-content: center;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
          ">
            <div style="text-align: center; color: rgba(255, 255, 255, 0.6);">
              <i class="fas fa-comments" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
              <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem;">Select a conversation</h3>
              <p>Choose a conversation from the sidebar or start a new one</p>
            </div>
          </div>

            <button id="rt-scroll-btn" onclick="rtScrollToBottom()" style="
              display: none;
              position: absolute;
              bottom: 12px;
              right: 12px;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: rgba(0,224,255,0.15);
              border: 1px solid rgba(0,224,255,0.4);
              color: #00e0ff;
              cursor: pointer;
              align-items: center;
              justify-content: center;
              z-index: 5;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            "><i class="fas fa-chevron-down"></i></button>
          </div>

          <div id="message-input-area" style="
            padding: 1.5rem;
            border-top: 1px solid rgba(0, 224, 255, 0.2);
            flex-shrink: 0;
            display: none;
          ">
            <div class="rt-composer-row" style="display: flex; gap: 1rem; align-items: flex-end;">
              <div class="rt-composer-input" style="flex: 1 1 auto; min-width: 0;">
                <textarea id="message-input" placeholder="Type your message..." style="
                  width: 100%;
                  min-height: 60px;
                  max-height: 120px;
                  padding: 0.75rem;
                  background: rgba(0, 224, 255, 0.05);
                  border: 1px solid rgba(0, 224, 255, 0.3);
                  border-radius: 8px;
                  color: white;
                  font-size: 16px;
                  resize: vertical;
                  font-family: inherit;
                "></textarea>
                <div id="typing-indicator" style="
                  margin-top: 0.5rem;
                  color: rgba(255, 255, 255, 0.6);
                  font-size: 0.85rem;
                  font-style: italic;
                  min-height: 1.2rem;
                "></div>
              </div>
              <button class="rt-composer-send" onclick="sendMessage()" style="
                padding: 0.75rem 1.5rem;
                background: linear-gradient(135deg, #00e0ff, #0080ff);
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-weight: 600;
                flex-shrink: 0;
              ">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (!document.getElementById('rt-messaging-styles')) {
    const style = document.createElement('style');
    style.id = 'rt-messaging-styles';
    style.textContent = `
      /* ── Base conversation list items ── */
      .conversation-item {
        padding: 1rem;
        border-radius: 8px;
        cursor: pointer;
        touch-action: manipulation;
        transition: background 0.15s, border-color 0.15s;
        margin-bottom: 0.5rem;
        border: 1px solid transparent;
      }
      @media (hover: hover) and (pointer: fine) {
        .conversation-item:hover {
          background: rgba(0, 224, 255, 0.05);
          border-color: rgba(0, 224, 255, 0.2);
        }
      }
      .conversation-item.active {
        background: rgba(0, 224, 255, 0.1);
        border-color: rgba(0, 224, 255, 0.4);
      }

      /* ── Message bubbles ── */
      .message-bubble {
        position: relative;
        max-width: 70%;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        margin-bottom: 0.75rem;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .message-bubble.own {
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        color: white;
        margin-left: auto;
        border-bottom-right-radius: 4px;
      }
      .message-bubble.other {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        margin-right: auto;
        border-bottom-left-radius: 4px;
      }
      .message-time {
        font-size: 0.75rem;
        opacity: 0.7;
        margin-top: 0.25rem;
      }

      /* ── Delete button: opacity-based, works on touch ── */
      .rt-del-btn {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        background: rgba(255,59,48,0.9);
        color: #fff;
        font-size: 0.8rem;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        z-index: 2;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
      }
      /* Mouse: reveal on hover */
      @media (hover: hover) and (pointer: fine) {
        .message-bubble.own:hover .rt-del-btn {
          opacity: 1;
          pointer-events: auto;
        }
      }
      /* Touch: always visible at reduced opacity */
      @media (hover: none) {
        .message-bubble.own .rt-del-btn {
          opacity: 0.55;
          pointer-events: auto;
        }
      }

      /* ── Misc badges / indicators ── */
      .unread-badge {
        background: #ff4444;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: bold;
      }
      .online-indicator {
        width: 8px;
        height: 8px;
        background: #00ff88;
        border-radius: 50%;
        border: 2px solid white;
        position: absolute;
        bottom: 0;
        right: 0;
      }

      /* ── Scrollbar (webkit) ── */
      #messages-area::-webkit-scrollbar { width: 6px; }
      #messages-area::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
      #messages-area::-webkit-scrollbar-thumb { background: rgba(0,224,255,0.3); border-radius: 3px; }

      /* ── Date separators ── */
      .rt-date-separator {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin: 1rem 0 0.75rem;
        color: rgba(255,255,255,0.4);
        font-size: 0.75rem;
        width: 100%;
      }
      .rt-date-separator::before, .rt-date-separator::after {
        content: "";
        flex: 1;
        height: 1px;
        background: rgba(255,255,255,0.08);
      }
      .rt-date-separator span {
        white-space: nowrap;
        padding: 0.2rem 0.6rem;
        background: rgba(255,255,255,0.05);
        border-radius: 20px;
      }

      /* ── Load earlier button ── */
      .rt-load-earlier {
        display: flex;
        justify-content: center;
        padding: 0.5rem 0;
        width: 100%;
      }
      .rt-load-earlier button {
        background: rgba(0,224,255,0.1);
        border: 1px solid rgba(0,224,255,0.3);
        color: #00e0ff;
        font-size: 0.85rem;
        padding: 0.5rem 1.25rem;
        border-radius: 20px;
        cursor: pointer;
        touch-action: manipulation;
        min-height: 36px;
      }

      /* ── Mobile back button (hidden on desktop) ── */
      .rt-mobile-back {
        display: none;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid rgba(0,224,255,0.3);
        background: rgba(0,224,255,0.1);
        color: #00e0ff;
        cursor: pointer;
        flex-shrink: 0;
        touch-action: manipulation;
        margin-right: 0.5rem;
      }

      /* ── Global touch targets inside the modal ── */
      #messaging-interface button {
        touch-action: manipulation;
      }

      /* ══════════════════════════════════════════════
         MOBILE LAYOUT  ≤ 640px
         Single-panel navigation (WhatsApp style)
         ══════════════════════════════════════════════ */
      @media (max-width: 640px) {
        /* Backdrop: no padding, stretch to fill.
           Remove backdrop-filter: on a position:fixed element it creates a
           compositor layer that gets stuck during iOS keyboard animation,
           causing the zoom/crop viewport glitch.  The rgba(0,0,0,0.8)
           background already provides the dimming — the blur is invisible
           because the full-screen modal covers everything behind it. */
        #messaging-interface {
          padding: 0 !important;
          align-items: stretch !important;
          justify-content: flex-start !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        /* Same reason: drop backdrop-filter on the container on mobile.
           The opaque gradient background makes it invisible anyway. */
        #messaging-interface .messaging-container {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        /* Container: full-screen, no rounding */
        #messaging-interface .messaging-container {
          height: 100vh !important;   /* fallback */
          height: 100dvh !important;  /* dynamic — excludes browser chrome */
          border-radius: 0 !important;
          max-width: none !important;
          width: 100% !important;
          box-shadow: none !important;
        }

        /* Default panel: show sidebar, hide chat.
           Give the hidden chat-area explicit zero-width so Safari's
           display:none flex-item layout bug can't leave a residual gap. */
        #messaging-interface .conversations-sidebar {
          width: 100% !important;
          min-width: 0 !important;
          border-right: none !important;
        }
        #messaging-interface .chat-area {
          display: none !important;
          flex: 0 0 0px !important;
          width: 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          overflow: hidden !important;
        }

        /* rt-panel-chat class: flip to chat panel.
           Same zero-width treatment for the hidden sidebar — this is the
           critical fix: without it, Safari can leave the 350px inline-width
           sidebar in the flex layout even when display:none is set, which
           squeezes the chat-area to ~40px and corrupts the composer. */
        #messaging-interface.rt-panel-chat .conversations-sidebar {
          display: none !important;
          flex: 0 0 0px !important;
          width: 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          overflow: hidden !important;
          padding: 0 !important;
          border: none !important;
        }
        #messaging-interface.rt-panel-chat .chat-area {
          display: flex !important;
          flex: 1 1 auto !important;
          width: 100% !important;
          min-width: 0 !important;
        }

        /* Back button visible on mobile */
        .rt-mobile-back {
          display: flex !important;
        }

        /* Message bubbles wider on narrow screens */
        .message-bubble {
          max-width: 85% !important;
        }

        /* Composer: reduce padding + gap so row fits on narrow screens */
        #message-input-area {
          padding: 0.75rem !important;
          padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px)) !important;
        }
        .rt-composer-row {
          gap: 0.5rem !important;
        }
        /* Icon-only send button on mobile to save space */
        .rt-composer-send {
          padding-left: 0.875rem !important;
          padding-right: 0.875rem !important;
        }
      }

      /* ── Composer flex rules (all viewports) ── */
      .rt-composer-row {
        display: flex;
        align-items: flex-end;
        gap: 1rem;
        box-sizing: border-box;
        width: 100%;
      }
      .rt-composer-input {
        flex: 1 1 auto;
        min-width: 0;          /* prevent textarea from expanding the row */
      }
      .rt-composer-input textarea {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
      }
      .rt-composer-send {
        flex: 0 0 auto;        /* button never shrinks or grows */
      }
    `;
    document.head.appendChild(style);
  }

  // Prevent body scroll-through while modal is open.
  // Do NOT use position:fixed on body — on iOS Safari, fixing the body while a
  // text input inside a position:fixed modal receives focus causes iOS to fall
  // back to zooming the visual viewport instead of scrolling, producing the
  // "magnified/cropped" compositor glitch during keyboard-open.
  // overflow:hidden alone is enough since the modal covers the full viewport.
  document.body.style.overflow = 'hidden';

  document.body.appendChild(messagingInterface);

  setupMessagingEventListeners();
  await loadConversationsList();

  if (conversationId) {
    await openConversation(conversationId);
  }

  console.log('✅ Messaging interface opened');
}

function setupMessagingEventListeners() {
  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    let typingTimeout;
    messageInput.addEventListener('input', () => {
      startTypingIndicator();
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        stopTypingIndicator();
      }, 2000);
    });
  }

  // Wire scroll-to-bottom button visibility
  const messagesArea = document.getElementById('messages-area');
  if (messagesArea) {
    messagesArea.addEventListener('scroll', () => {
      const btn = document.getElementById('rt-scroll-btn');
      if (!btn) return;
      const isNearBottom = messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < 100;
      btn.style.display = isNearBottom ? 'none' : 'flex';
    });
  }

  const messagingInterface = document.getElementById('messaging-interface');
  if (messagingInterface) {
    messagingInterface.addEventListener('click', (e) => {
      if (e.target === messagingInterface) {
        closeMessagingInterface();
      }
    });
  }
}

function rtScrollToBottom() {
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
  const btn = document.getElementById('rt-scroll-btn');
  if (btn) btn.style.display = 'none';
}

function filterConversationsList(query) {
  const q = (query || '').toLowerCase();
  const container = document.getElementById('conversations-list');
  if (!container) return;

  if (!allConversationsCache.length) return;

  const filtered = q
    ? allConversationsCache.filter((c) =>
        (c._otherName || '').toLowerCase().includes(q) ||
        (c._lastPreview || '').toLowerCase().includes(q)
      )
    : allConversationsCache;

  renderConversationItems(filtered, container);
}

function renderConversationItems(conversations, container) {
  if (!conversations.length) {
    container.innerHTML = `<div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.5);">No results</div>`;
    return;
  }
  let html = '';
  conversations.forEach((conv) => {
    html += conv._html;
  });
  container.innerHTML = html;
}

async function deleteConversationMessage(messageId) {
  try {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) throw error;
    const el = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) el.remove();
  } catch (e) {
    console.error('Error deleting message:', e);
  }
}

async function loadEarlierMessages(conversationId) {
  const offset = msgOffsets.get(conversationId) || 0;
  const PAGE = 50;

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE - 1);

  if (error) { console.error('Error loading earlier messages:', error); return; }

  const older = (data || []).reverse();
  if (older.length < PAGE) hasMoreMsgs.set(conversationId, false);
  msgOffsets.set(conversationId, offset + PAGE);

  const container = document.getElementById('messages-area')?.querySelector('.rt-msg-inner');
  if (!container) return;

  const loadBtn = container.querySelector('.rt-load-earlier');
  const prevScrollHeight = document.getElementById('messages-area')?.scrollHeight || 0;

  const fragment = document.createDocumentFragment();

  if (!hasMoreMsgs.get(conversationId)) {
    const lb = container.querySelector('.rt-load-earlier');
    if (lb) lb.remove();
  }

  let lastDate = null;
  older.forEach((msg) => {
    const own = isOwnMessage(msg);
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date(msg.created_at).toDateString();

    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const sep = document.createElement('div');
      sep.className = 'rt-date-separator';
      sep.innerHTML = `<span>${formatDateLabel(msg.created_at)}</span>`;
      fragment.appendChild(sep);
    }

    const el = document.createElement('div');
    el.className = `message-bubble ${own ? 'own' : 'other'}`;
    el.dataset.msgId = msg.id;
    el.innerHTML = `
      <div>${escapeHtml(msg.content || '')}</div>
      <div class="message-time">${time}</div>
      ${own ? `<button class="rt-del-btn" onclick="deleteConversationMessage('${msg.id}')" title="Delete">×</button>` : ''}
    `;
    fragment.appendChild(el);
  });

  // Insert before first existing message (after the load btn if present)
  const firstMsg = container.querySelector('.message-bubble');
  if (firstMsg) {
    container.insertBefore(fragment, firstMsg);
  } else {
    container.appendChild(fragment);
  }

  // Remove old load btn and re-add if there are more
  const oldBtn = container.querySelector('.rt-load-earlier');
  if (oldBtn) oldBtn.remove();
  if (hasMoreMsgs.get(conversationId)) {
    const lb = document.createElement('div');
    lb.className = 'rt-load-earlier';
    lb.innerHTML = `<button onclick="loadEarlierMessages('${conversationId}')">Load earlier messages</button>`;
    container.insertBefore(lb, container.firstChild);
  }

  // Restore scroll
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight - prevScrollHeight;
}

function formatDateLabel(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now - 86400000).toDateString();
  if (d.toDateString() === todayStr) return 'Today';
  if (d.toDateString() === yesterdayStr) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMessageTime(timestamp) {
  if (!timestamp) return '';

  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffInSeconds = Math.floor((now - messageTime) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;

  const diffInDays = Math.floor(diffInSeconds / 86400);
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return messageTime.toLocaleDateString();
}

async function loadConversationsList() {
  const container = document.getElementById('conversations-list');
  if (!container || !currentUserProfile) return;

  try {
    console.log('📋 Loading conversations for user:', currentUserProfile.id);

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_1_id.eq.${currentUserProfile.id},participant_2_id.eq.${currentUserProfile.id}`)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('📋 Conversations query failed, checking if table exists:', error);

      if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
        container.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
            <i class="fas fa-database" style="font-size: 2rem; opacity: 0.3; margin-bottom: 1rem;"></i>
            <h4 style="color: #00e0ff; margin-bottom: 0.5rem;">Messaging Setup Required</h4>
            <p style="margin-bottom: 1rem;">The messaging system requires database setup.</p>
            <p style="font-size: 0.85rem; color: rgba(255, 255, 255, 0.5);">
              Please run the database migrations to enable messaging.
            </p>
          </div>
        `;
        return;
      }

      throw error;
    }

    if (!conversations || conversations.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <h4 style="color: #00e0ff; margin-bottom: 0.5rem;">No conversations yet</h4>
          <p style="margin-bottom: 1rem;">Start connecting with community members!</p>
          <button onclick="closeMessagingInterface(); window.openEnhancedSearch?.('', 'people')" style="
            background: linear-gradient(135deg, #00e0ff, #0080ff);
            border: none;
            border-radius: 8px;
            color: white;
            padding: 0.75rem 1.5rem;
            font-weight: 600;
            cursor: pointer;
          ">
            <i class="fas fa-search"></i> Find People to Message
          </button>
        </div>
      `;
      return;
    }

    console.log(`📋 Loaded ${conversations.length} conversations`);

    const participantIds = new Set();
    conversations.forEach(conv => {
      participantIds.add(conv.participant_1_id);
      participantIds.add(conv.participant_2_id);
    });

    let participantDetails = new Map();
    if (participantIds.size > 0) {
      try {
        const { data: participants } = await supabase
          .from('community')
          .select('id, name, image_url')
          .in('id', Array.from(participantIds));

        if (participants) {
          participants.forEach(p => participantDetails.set(p.id, p));
        }
      } catch (participantError) {
        console.warn('📋 Could not load participant details:', participantError);
      }
    }

    const conversationIds = conversations.map(c => c.id);
    let lastMessages = new Map();

    if (conversationIds.length > 0) {
      try {
        const { data: messages } = await supabase
          .from('messages')
          .select('conversation_id, content, created_at, sender_id')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false });

        if (messages) {
          messages.forEach(msg => {
            if (!lastMessages.has(msg.conversation_id)) {
              lastMessages.set(msg.conversation_id, msg);
            }
          });
        }
      } catch (msgError) {
        console.warn('📋 Could not load last messages:', msgError);
      }
    }

    allConversationsCache = [];
    conversations.forEach(conversation => {
      const otherUserId = conversation.participant_1_id === currentUserProfile.id
        ? conversation.participant_2_id
        : conversation.participant_1_id;

      const otherUser = participantDetails.get(otherUserId);

      if (!otherUser) {
        console.warn('📋 Skipping conversation with missing user data:', conversation.id);
        return;
      }

      const lastMessage = lastMessages.get(conversation.id);
      const unreadCount = unreadCounts.get(conversation.id) || 0;
      const preview = lastMessage
        ? (lastMessage.content.length > 50 ? lastMessage.content.substring(0, 50) + '...' : lastMessage.content)
        : 'No messages yet - start the conversation!';

      // Store for realtime toast lookups
      participantDetailsCache.set(conversation.id, otherUser);

      const itemHtml = `
        <div class="conversation-item ${unreadCount > 0 ? 'unread' : ''}" onclick="openConversation('${conversation.id}')" data-conversation-id="${conversation.id}">
          <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; border-radius: 8px; cursor: pointer; transition: background 0.2s;"
               onmouseover="this.style.background='rgba(0, 224, 255, 0.1)'"
               onmouseout="this.style.background='transparent'">
            <div style="position: relative;">
              ${otherUser.image_url
                ? `<img src="${otherUser.image_url}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">`
                : `<div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.2rem;">${otherUser.name?.[0] || '?'}</div>`
              }
              <div class="online-indicator" style="display: none;"></div>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                <h4 style="color: white; margin: 0; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${unreadCount > 0 ? 'font-weight:700;' : ''}">${otherUser.name || 'Unknown User'}</h4>
                ${unreadCount > 0 ? `<div class="unread-badge" style="background: #ff6b6b; color: white; border-radius: 50%; min-width: 20px; height: 20px; padding: 0 4px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold;">${unreadCount}</div>` : ''}
              </div>
              <p style="color: rgba(255, 255, 255, ${unreadCount > 0 ? '0.95' : '0.7'}); margin: 0; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${unreadCount > 0 ? 'font-weight:600;' : ''}">
                ${escapeHtml(preview)}
              </p>
              ${lastMessage ? `
                <div style="color: rgba(255, 255, 255, 0.5); font-size: 0.75rem; margin-top: 0.25rem;">
                  ${formatMessageTime(lastMessage.created_at)}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;

      allConversationsCache.push({
        id: conversation.id,
        _otherName: otherUser.name || '',
        _lastPreview: preview,
        _html: itemHtml
      });
    });

    renderConversationItems(allConversationsCache, container);
    console.log('✅ Conversations list rendered successfully');

  } catch (error) {
    console.error('❌ Error loading conversations:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 1rem;"></i>
        <h4 style="color: #ff6b6b; margin-bottom: 0.5rem;">Connection Error</h4>
        <p style="margin-bottom: 1rem;">Unable to load conversations</p>
        <button onclick="loadConversationsList()" style="
          background: rgba(255, 107, 107, 0.2);
          border: 1px solid rgba(255, 107, 107, 0.4);
          border-radius: 8px;
          color: #ff6b6b;
          padding: 0.5rem 1rem;
          cursor: pointer;
        ">
          <i class="fas fa-redo"></i> Try Again
        </button>
      </div>
    `;
  }
}

async function openConversation(conversationId) {
  console.log('💬 Opening conversation:', conversationId);

  activeConversations.set(conversationId, true);

  document.querySelectorAll('.conversation-item').forEach(item => {
    item.classList.remove('active');
  });

  const selectedItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
  if (selectedItem) {
    selectedItem.classList.add('active');
  }

  document.getElementById('chat-header').style.display = 'block';
  document.getElementById('message-input-area').style.display = 'block';

  // Mobile: switch to chat panel view
  document.getElementById('messaging-interface')?.classList.add('rt-panel-chat');

  await loadConversationMessages(conversationId);
  await markMessagesAsRead(conversationId);
}

async function loadConversationMessages(conversationId) {
  const messagesArea = document.getElementById('messages-area');
  if (!messagesArea) return;

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError) throw convError;

    const otherUserId = conversation.participant_1_id === currentUserProfile.id
      ? conversation.participant_2_id
      : conversation.participant_1_id;

    const { data: otherUser, error: userError } = await supabase
      .from('community_with_last_seen')
      .select('id, name, image_url, presence_last_seen, presence_expires_at')
      .eq('id', otherUserId)
      .single();

    if (userError) throw userError;

    // Compute last-seen text from presence view data
    const _rtActive = !!(otherUser.presence_expires_at && new Date(otherUser.presence_expires_at) > new Date());
    const _rtLastSeen = (() => {
      if (_rtActive) return 'Active now';
      if (!otherUser.presence_last_seen) return 'Last seen: unknown';
      const diffMs  = Date.now() - new Date(otherUser.presence_last_seen).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr  = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);
      if (diffMin < 1)  return 'Last seen: just now';
      if (diffMin < 60) return `Last seen: ${diffMin}m ago`;
      if (diffHr  < 24) return `Last seen: ${diffHr}h ago`;
      if (diffDay <  7) return `Last seen: ${diffDay}d ago`;
      return `Last seen: ${new Date(otherUser.presence_last_seen).toLocaleDateString()}`;
    })();

    const chatHeader = document.getElementById('chat-header');
    chatHeader.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem;">
        <button class="rt-mobile-back" onclick="document.getElementById('messaging-interface')?.classList.remove('rt-panel-chat')" style="
          background: none; border: none; color: #00e0ff; cursor: pointer;
          padding: 0.5rem; font-size: 1.2rem; touch-action: manipulation;
        "><i class="fas fa-arrow-left"></i></button>
        <div style="position: relative;">
          ${otherUser.image_url
            ? `<img src="${otherUser.image_url}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.2rem;">${otherUser.name[0]}</div>`
          }
          <div class="online-indicator" style="display: none;"></div>
        </div>
        <div>
          <h3 style="color: white; margin: 0; font-size: 1.1rem;">${otherUser.name}</h3>
          <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
            <span id="user-status">${_rtLastSeen}</span>
          </div>
        </div>
      </div>
    `;

    const MSG_PAGE = 50;

    const { data: messages, error: msgError, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MSG_PAGE);

    if (msgError) throw msgError;

    const msgs = (messages || []).reverse();
    const totalCount = count || 0;
    msgOffsets.set(conversationId, MSG_PAGE);
    hasMoreMsgs.set(conversationId, totalCount > MSG_PAGE);

    messagesArea.style.alignItems = '';
    messagesArea.style.justifyContent = '';

    let innerHtml = '<div class="rt-msg-inner" style="display: flex; flex-direction: column; width: 100%; padding: 1rem;">';

    if (totalCount > MSG_PAGE) {
      innerHtml += `<div class="rt-load-earlier"><button onclick="loadEarlierMessages('${conversationId}')">Load earlier messages</button></div>`;
    }

    if (!msgs || msgs.length === 0) {
      innerHtml += `
        <div style="text-align: center; color: rgba(255, 255, 255, 0.6); padding: 2rem;">
          <i class="fas fa-comment" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
          <p>No messages yet. Start the conversation!</p>
        </div>
      `;
    } else {
      let lastDateStr = null;
      msgs.forEach(message => {
        const own = isOwnMessage(message);
        const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(message.created_at).toDateString();

        if (dateStr !== lastDateStr) {
          lastDateStr = dateStr;
          innerHtml += `<div class="rt-date-separator"><span>${formatDateLabel(message.created_at)}</span></div>`;
        }

        innerHtml += `
          <div class="message-bubble ${own ? 'own' : 'other'}" data-msg-id="${escapeHtml(String(message.id))}">
            <div>${escapeHtml(message.content || '')}</div>
            <div class="message-time">${time}</div>
            ${own ? `<button class="rt-del-btn" onclick="deleteConversationMessage('${escapeHtml(String(message.id))}')" title="Delete">×</button>` : ''}
          </div>
        `;
      });
    }

    innerHtml += '</div>';
    messagesArea.innerHTML = innerHtml;
    messagesArea.scrollTop = messagesArea.scrollHeight;

  } catch (error) {
    console.error('Error loading conversation messages:', error);
    messagesArea.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
        <p>Failed to load messages</p>
      </div>
    `;
  }
}

// Send message
async function sendMessage() {
  const messageInput = document.getElementById('message-input');
  const activeConversationId = getActiveConversationId();

  if (!messageInput || !activeConversationId) return;

  const content = messageInput.value.trim();
  if (!content) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const currentCommunityId = getCurrentCommunityId();
    if (!currentCommunityId) {
      throw new Error('Current community profile not loaded');
    }

    console.log('📨 Sending message:', {
      conversation_id: activeConversationId,
      sender_id: currentCommunityId,
      auth_uid: user.id,
      community_id: currentCommunityId,
      content_length: content.length
    });

    const optimisticMessage = {
      conversation_id: activeConversationId,
      sender_id: currentCommunityId,
      content,
      created_at: new Date().toISOString()
    };

    const { data: insertedMessage, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversationId,
        sender_id: currentCommunityId,
        content
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Message insert failed:', JSON.stringify(error));
      throw error;
    }

    messageInput.value = '';

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeConversationId);

    appendMessageToConversation(activeConversationId, insertedMessage || optimisticMessage);

    console.log('✅ Message sent successfully');

  } catch (error) {
    console.error('Error sending message:', error);
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to send message', 'error');
    }
  }
}

function getActiveConversationId() {
  const activeItem = document.querySelector('.conversation-item.active');
  return activeItem ? activeItem.dataset.conversationId : null;
}

function appendMessageToConversation(conversationId, message) {
  if (getActiveConversationId() !== conversationId) return;

  const messagesArea = document.getElementById('messages-area');
  if (!messagesArea) return;

  const own = isOwnMessage(message);
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const messageElement = document.createElement('div');
  messageElement.className = `message-bubble ${own ? 'own' : 'other'}`;
  messageElement.dataset.msgId = String(message.id);
  messageElement.innerHTML = `
    <div>${escapeHtml(message.content || '')}</div>
    <div class="message-time">${time}</div>
    ${own ? `<button class="rt-del-btn" onclick="deleteConversationMessage('${escapeHtml(String(message.id))}')" title="Delete">×</button>` : ''}
  `;

  let messagesContainer = messagesArea.querySelector('.rt-msg-inner');
  if (!messagesContainer) {
    messagesContainer = document.createElement('div');
    messagesContainer.className = 'rt-msg-inner';
    messagesContainer.style.display = 'flex';
    messagesContainer.style.flexDirection = 'column';
    messagesContainer.style.width = '100%';
    messagesContainer.style.padding = '1rem';
    messagesArea.innerHTML = '';
    messagesArea.appendChild(messagesContainer);
  }

  const emptyState = messagesContainer.querySelector('.messages-empty-state');
  if (emptyState) emptyState.remove();

  messagesContainer.appendChild(messageElement);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function showMessageNotification(message) {
  if (window.showSynapseNotification) {
    window.showSynapseNotification(`New message: ${(message.content || '').substring(0, 50)}...`, 'info');
  }
}

function showTeamInviteNotification() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('You have a new team invitation!', 'info');
  }
}

function showConnectionRequestNotification() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('You have a new connection request!', 'info');
  }
}

function playNotificationSound() {
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
    audio.volume = 0.1;
    audio.play().catch(() => {});
  } catch (_) {}
}

async function loadActiveConversations() {
  console.log('📋 Loading active conversations...');
}

async function loadUnreadCounts() {
  console.log('📊 Loading unread counts...');
}

function updateUnreadCount(conversationId, increment) {
  const current = unreadCounts.get(conversationId) || 0;
  unreadCounts.set(conversationId, current + increment);
}

function refreshConversationList() {
  loadConversationsList();
}

function updateOnlineUsersList(presenceState) {
  console.log('👥 Updating online users:', Object.keys(presenceState).length);
}

function updateUserOnlineStatus(presences, isOnline) {
  console.log(`${isOnline ? '✅' : '👋'} User status update:`, presences);
}

async function markMessagesAsRead(conversationId) {
  unreadCounts.set(conversationId, 0);
  const currentCommunityId = getCurrentCommunityId();
  if (!currentCommunityId) return;
  try {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', currentCommunityId)
      .eq('read', false);
    // Notify badge system
    window.dispatchEvent(new CustomEvent('messages-updated'));
  } catch (e) {
    console.warn('markMessagesAsRead DB update failed:', e);
  }
}

function startTypingIndicator() {
  console.log('⌨️ User started typing');
}

function stopTypingIndicator() {
  console.log('⏹️ User stopped typing');
}

window.startNewConversation = function() {
  console.log('💬 Starting new conversation');
  if (window.showSynapseNotification) {
    window.showSynapseNotification('New conversation feature coming soon!', 'info');
  }
};

function showUserPresence(userId) {
  console.log('👤 Showing user presence for:', userId);
}

function closeMessagingInterface() {
  const messagingInterface = document.getElementById('messaging-interface');
  if (messagingInterface) {
    messagingInterface.remove();
  }

  // Restore body scroll
  document.body.style.overflow = '';

  activeConversations.clear();
  console.log('🗑️ Messaging interface closed');
}

async function createNewMessage(targetUserId, targetUserName) {
  console.log('💬 Creating new message to:', targetUserName);

  if (!currentUserProfile || !targetUserId) {
    console.error('❌ Missing user information for new message');
    return;
  }

  try {
    const currentCommunityId = getCurrentCommunityId();
    if (!currentCommunityId) {
      throw new Error('Current community profile not loaded');
    }

    const { data: existingConversation, error: lookupError } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1_id.eq.${currentCommunityId},participant_2_id.eq.${targetUserId}),and(participant_1_id.eq.${targetUserId},participant_2_id.eq.${currentCommunityId})`)
      .maybeSingle();

    if (lookupError) {
      console.warn('⚠️ Conversation lookup error:', lookupError);
    }

    let conversationId;

    if (existingConversation) {
      conversationId = existingConversation.id;
      console.log('💬 Using existing conversation:', conversationId);
    } else {
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert([{
          participant_1_id: currentCommunityId,
          participant_2_id: targetUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating conversation:', createError);

        if (createError.code === 'PGRST116' || createError.message.includes('relation')) {
          if (window.showSynapseNotification) {
            window.showSynapseNotification(
              'Messaging requires database setup. Please run the messaging migrations.',
              'warning'
            );
          }
          return;
        }

        throw createError;
      }

      conversationId = newConversation.id;
      console.log('💬 Created new conversation:', conversationId);
    }

    await openMessagingInterface(conversationId);

    setTimeout(() => {
      const messageInput = document.getElementById('message-input');
      if (messageInput) {
        messageInput.focus();
        messageInput.placeholder = `Message ${targetUserName}...`;
      }
    }, 500);

  } catch (error) {
    console.error('❌ Error creating new message:', error);
    if (window.showSynapseNotification) {
      window.showSynapseNotification(
        'Unable to start conversation. Please try again.',
        'error'
      );
    }
  }
}

function showNewMessageDialog() {
  console.log('💬 Showing new message dialog');

  const modal = document.createElement('div');
  modal.id = 'new-message-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    padding: 1rem;
  `;

  modal.innerHTML = `
    <div style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 500px;
      width: 100%;
      padding: 2rem;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h3 style="color: #00e0ff; margin: 0;">
          <i class="fas fa-plus-circle"></i> New Message
        </h3>
        <button onclick="closeNewMessageDialog()" style="
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          font-size: 1.2rem;
        ">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="color: rgba(255, 255, 255, 0.8); display: block; margin-bottom: 0.5rem;">
          Search for someone to message:
        </label>
        <input type="text" id="user-search-input" placeholder="Type a name..." style="
          width: 100%;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: white;
          padding: 1rem;
          font-family: inherit;
        ">
      </div>

      <div id="user-search-results" style="
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 1.5rem;
      ">
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
          <p>Start typing to search for community members</p>
        </div>
      </div>

      <div style="display: flex; gap: 1rem; justify-content: flex-end;">
        <button onclick="closeNewMessageDialog()" style="
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.8);
          padding: 0.75rem 1.5rem;
          cursor: pointer;
        ">
          Cancel
        </button>
        <button onclick="window.openEnhancedSearch?.('', 'people')" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 8px;
          color: white;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
        ">
          <i class="fas fa-search"></i> Browse All Members
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const searchInput = document.getElementById('user-search-input');
  const resultsContainer = document.getElementById('user-search-results');

  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchUsers(e.target.value, resultsContainer);
    }, 300);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeNewMessageDialog();
    }
  });

  searchInput.focus();
}

async function searchUsers(query, container) {
  if (!query || query.length < 2) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
        <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
        <p>Start typing to search for community members</p>
      </div>
    `;
    return;
  }

  try {
    const { data: users, error } = await supabase
      .from('community')
      .select('id, name, image_url, bio, user_role')
      .neq('id', currentUserProfile.id)
      .ilike('name', `%${query}%`)
      .limit(10);

    if (error) throw error;

    if (!users || users.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-user-slash" style="font-size: 1.5rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
          <p>No users found matching "${escapeHtml(query)}"</p>
        </div>
      `;
      return;
    }

    let html = '';
    users.forEach(user => {
      html += `
        <div onclick="selectUserForMessage('${user.id}', '${(user.name || '').replace(/'/g, "\\'")}')" style="
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
          border: 1px solid transparent;
        " onmouseover="this.style.background='rgba(0, 224, 255, 0.1)'; this.style.borderColor='rgba(0, 224, 255, 0.3)'"
           onmouseout="this.style.background='transparent'; this.style.borderColor='transparent'">
          ${user.image_url
            ? `<img src="${user.image_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">${user.name?.[0] || '?'}</div>`
          }
          <div style="flex: 1; min-width: 0;">
            <h4 style="color: white; margin: 0 0 0.25rem 0; font-size: 1rem;">${escapeHtml(user.name || 'Unknown')}</h4>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(user.user_role || 'Community Member')}
            </p>
          </div>
          <i class="fas fa-comment" style="color: rgba(0, 224, 255, 0.6);"></i>
        </div>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error('❌ Error searching users:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
        <p>Error searching users</p>
      </div>
    `;
  }
}

function selectUserForMessage(userId, userName) {
  closeNewMessageDialog();
  createNewMessage(userId, userName);
}

function closeNewMessageDialog() {
  const modal = document.getElementById('new-message-modal');
  if (modal) {
    modal.remove();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Initialize on DOM ready (single-flight guard)
if (!window.__IE_REALTIME_COLLAB_INIT__) {
  window.__IE_REALTIME_COLLAB_INIT__ = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initRealtimeCollaboration();
    }, { once: true });
  } else {
    initRealtimeCollaboration();
  }
}
