/* 
 * Direct Messaging System - Complete Module
 * File: assets/js/messaging.js
 * 
 * Works with your existing:
 * - supabaseClient.js (window.supabase)
 * - community table structure
 * - Auth system
 */

const MessagingModule = (function() {
  'use strict';
  
  // ============================================================
  // STATE
  // ============================================================
  
  const state = {
    initialized: false,
    currentUser: null,
    conversations: [],
    activeConversation: null,
    messages: [],
    unreadCount: 0,
    allUsers: [],
    realtimeChannel: null
  };
  
  // ============================================================
  // INITIALIZATION
  // ============================================================
  
  async function init() {
    if (state.initialized) {
      console.log('Messaging already initialized');
      return;
    }
    
    try {
      if (!window.supabase) {
        throw new Error('Supabase not available');
      }
      
      // Get current user
      const { data: { session } } = await window.supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }
      
      // Get user profile from community table
      const { data: profile } = await window.supabase
        .from('community')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      
      state.currentUser = {
        id: session.user.id,
        email: session.user.email,
        name: profile?.name || session.user.email.split('@')[0],
        communityId: profile?.id,
        avatar: profile?.image_url
      };
      
      // Load initial data
      await Promise.all([
        loadConversations(),
        loadAllUsers(),
        updateUnreadCount()
      ]);
      
      // Render UI
      renderMessagesTab();
      
      // Setup realtime
      setupRealtimeSubscriptions();
      
      state.initialized = true;
      console.log('✅ Messaging initialized');
      
    } catch (error) {
      console.error('Failed to initialize messaging:', error);
      renderError(error.message);
    }
  }
  
  // ============================================================
  // DATA LOADING
  // ============================================================
  
  async function loadConversations() {
    const { data, error } = await window.supabase
      .from('conversations')
      .select(`
        *,
        participant_1:community!conversations_participant_1_id_fkey(
          id, user_id, name, email, image_url
        ),
        participant_2:community!conversations_participant_2_id_fkey(
          id, user_id, name, email, image_url
        )
      `)
      .or(`participant_1_id.eq.${state.currentUser.id},participant_2_id.eq.${state.currentUser.id}`)
      .order('last_message_at', { ascending: false });
    
    if (error) {
      console.error('Error loading conversations:', error);
      return;
    }
    
    // Process conversations to get the "other" participant
    state.conversations = (data || []).map(conv => {
      const isParticipant1 = conv.participant_1_id === state.currentUser.id;
      const otherParticipant = isParticipant1 ? conv.participant_2 : conv.participant_1;
      
      return {
        ...conv,
        otherUser: {
          id: otherParticipant.user_id,
          communityId: otherParticipant.id,
          name: otherParticipant.name,
          email: otherParticipant.email,
          avatar: otherParticipant.image_url
        }
      };
    });
  }
  
  async function loadMessages(conversationId) {
    const { data, error } = await window.supabase
      .from('messages')
      .select(`
        *,
        sender:community!messages_sender_id_fkey(name, image_url)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error loading messages:', error);
      return;
    }
    
    state.messages = data || [];
    
    // Mark messages as read
    await markMessagesAsRead(conversationId);
  }
  
  async function loadAllUsers() {
    const { data, error } = await window.supabase
      .from('community')
      .select('id, user_id, name, email, skills, image_url')
      .neq('user_id', state.currentUser.id);
    
    if (error) {
      console.error('Error loading users:', error);
      return;
    }
    
    state.allUsers = data || [];
  }
  
  async function updateUnreadCount() {
    const { data, error } = await window.supabase
      .rpc('get_unread_count');
    
    if (!error && data !== null) {
      state.unreadCount = data;
      updateUnreadBadge();
    }
  }
  
  // ============================================================
  // CONVERSATION ACTIONS
  // ============================================================
  
  async function startConversation(userId, context = {}) {
    try {
      // Get or create conversation using database function
      const { data: conversationId, error } = await window.supabase
        .rpc('get_or_create_conversation', {
          other_user_id: userId,
          ctx_type: context.type || null,
          ctx_id: context.id || null,
          ctx_title: context.title || null
        });
      
      if (error) throw error;
      
      // Reload conversations to get the new one
      await loadConversations();
      
      // Find and select the conversation
      const conversation = state.conversations.find(c => c.id === conversationId);
      if (conversation) {
        await selectConversation(conversation);
      }
      
      return conversationId;
      
    } catch (error) {
      console.error('Error starting conversation:', error);
      showToast('Failed to start conversation', 'error');
    }
  }
  
  async function selectConversation(conversation) {
    state.activeConversation = conversation;
    
    // Load messages for this conversation
    await loadMessages(conversation.id);
    
    // Update UI
    renderChatPanel();
    
    // Update unread count
    await updateUnreadCount();
    
    // Scroll to bottom
    setTimeout(() => {
      const messagesArea = document.querySelector('.messages-area');
      if (messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
      }
    }, 100);
  }
  
  async function sendMessage(content) {
    if (!state.activeConversation || !content.trim()) return;
    
    try {
      const { data, error } = await window.supabase
        .from('messages')
        .insert({
          conversation_id: state.activeConversation.id,
          sender_id: state.currentUser.id,
          content: content.trim()
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Message will be added via realtime subscription
      // Clear input
      const input = document.querySelector('.message-input');
      if (input) input.value = '';
      
    } catch (error) {
      console.error('Error sending message:', error);
      showToast('Failed to send message', 'error');
    }
  }
  
  async function markMessagesAsRead(conversationId) {
    await window.supabase
      .from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', state.currentUser.id)
      .eq('read', false);
  }
  
  // ============================================================
  // REALTIME SUBSCRIPTIONS
  // ============================================================
  
  function setupRealtimeSubscriptions() {
    // Cleanup existing channel
    if (state.realtimeChannel) {
      window.supabase.removeChannel(state.realtimeChannel);
    }
    
    // Subscribe to new messages
    state.realtimeChannel = window.supabase
      .channel('messaging')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload) => {
          const newMessage = payload.new;
          
          // If message is in active conversation, add it
          if (state.activeConversation && 
              newMessage.conversation_id === state.activeConversation.id) {
            
            // Get sender info
            const { data: sender } = await window.supabase
              .from('community')
              .select('name, image_url')
              .eq('user_id', newMessage.sender_id)
              .single();
            
            state.messages.push({
              ...newMessage,
              sender: sender
            });
            
            renderMessages();
            
            // Auto-scroll to bottom
            const messagesArea = document.querySelector('.messages-area');
            if (messagesArea) {
              messagesArea.scrollTop = messagesArea.scrollHeight;
            }
            
            // Mark as read if not sent by current user
            if (newMessage.sender_id !== state.currentUser.id) {
              await markMessagesAsRead(state.activeConversation.id);
            }
          }
          
          // Update conversations list
          await loadConversations();
          renderConversationsList();
          
          // Update unread count
          await updateUnreadCount();
        }
      )
      .subscribe();
  }
  
  // ============================================================
  // RENDERING
  // ============================================================
  
  function renderMessagesTab() {
    const container = document.getElementById('messages-container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="messages-container">
        <div class="conversations-sidebar">
          <div class="conversations-header">
            <h3>
              💬 Messages
              ${state.unreadCount > 0 ? `<span class="unread-badge">${state.unreadCount}</span>` : ''}
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
    const container = document.getElementById('conversations-list');
    if (!container) return;
    
    if (state.conversations.length === 0) {
      container.innerHTML = `
        <div class="empty-conversations">
          <div class="empty-conversations-icon">📭</div>
          <p>No conversations yet</p>
          <p style="font-size: 0.85rem;">Start a new conversation to connect with others</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = state.conversations.map(conv => {
      const isActive = state.activeConversation?.id === conv.id;
      const hasUnread = false; // TODO: Calculate unread per conversation
      const initials = conv.otherUser.name.substring(0, 2).toUpperCase();
      const timeAgo = formatTimeAgo(conv.last_message_at || conv.created_at);
      
      return `
        <div class="conversation-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}"
             onclick="MessagingModule.selectConversationById('${conv.id}')">
          <div class="conversation-header">
            <div class="conversation-avatar">
              ${conv.otherUser.avatar ? 
                `<img src="${conv.otherUser.avatar}" alt="${conv.otherUser.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` :
                initials
              }
            </div>
            <div class="conversation-info">
              <div class="conversation-name">
                <span>${escapeHtml(conv.otherUser.name)}</span>
                <span class="conversation-time">${timeAgo}</span>
              </div>
              ${conv.context_title ? 
                `<div style="font-size:0.75rem;color:#00e0ff;margin-bottom:0.25rem;">
                  📌 ${escapeHtml(conv.context_title)}
                </div>` : ''
              }
              <div class="conversation-preview">
                ${escapeHtml(conv.last_message_preview || 'Start a conversation...')}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function renderChatPanel() {
    const panel = document.getElementById('chat-panel');
    if (!panel || !state.activeConversation) return;
    
    const user = state.activeConversation.otherUser;
    const initials = user.name.substring(0, 2).toUpperCase();
    
    panel.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-avatar">
          ${user.avatar ? 
            `<img src="${user.avatar}" alt="${user.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` :
            initials
          }
        </div>
        <div class="chat-header-info">
          <div class="chat-header-name">${escapeHtml(user.name)}</div>
          <div class="chat-header-status">
            ${user.email}
          </div>
        </div>
        ${state.activeConversation.context_title ? 
          `<div class="chat-context">
            <i class="fas fa-lightbulb"></i>
            ${escapeHtml(state.activeConversation.context_title)}
          </div>` : ''
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
    const container = document.getElementById('messages-area');
    if (!container) return;
    
    if (state.messages.length === 0) {
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
    
    container.innerHTML = state.messages.map(msg => {
      const isSent = msg.sender_id === state.currentUser.id;
      const senderName = isSent ? 'You' : (msg.sender?.name || 'Unknown');
      const initials = senderName.substring(0, 2).toUpperCase();
      const timestamp = formatTime(msg.created_at);
      
      return `
        <div class="message ${isSent ? 'sent' : 'received'}">
          <div class="message-avatar">${initials}</div>
          <div class="message-content">
            <div class="message-bubble">${escapeHtml(msg.content)}</div>
            <div class="message-timestamp">${timestamp}</div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  function renderUsersList(users = state.allUsers) {
    const container = document.getElementById('users-list');
    if (!container) return;
    
    if (users.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:2rem;color:#888;">
          <p>No users found</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = users.map(user => {
      const initials = user.name.substring(0, 2).toUpperCase();
      const skills = typeof user.skills === 'string' ? user.skills : '';
      
      return `
        <div class="user-item" onclick="MessagingModule.startConversationWith('${user.user_id}')">
          <div class="user-item-avatar">
            ${user.image_url ? 
              `<img src="${user.image_url}" alt="${user.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` :
              initials
            }
          </div>
          <div class="user-item-info">
            <div class="user-item-name">${escapeHtml(user.name)}</div>
            <div class="user-item-details">
              ${skills ? escapeHtml(skills) : user.email}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // ============================================================
  // EVENT HANDLERS
  // ============================================================
  
  function handleSendClick() {
    const input = document.querySelector('.message-input');
    if (input && input.value.trim()) {
      sendMessage(input.value);
    }
  }
  
  function handleInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendClick();
    }
  }
  
  async function selectConversationById(conversationId) {
    const conversation = state.conversations.find(c => c.id === conversationId);
    if (conversation) {
      await selectConversation(conversation);
    }
  }
  
  async function startConversationWith(userId) {
    hideNewMessageModal();
    await startConversation(userId);
  }
  
  function showNewMessageModal() {
    const modal = document.getElementById('new-message-modal');
    if (modal) {
      modal.classList.add('active');
      renderUsersList();
    }
  }
  
  function hideNewMessageModal() {
    const modal = document.getElementById('new-message-modal');
    if (modal) modal.classList.remove('active');
  }
  
  function filterUsers(query) {
    const filtered = state.allUsers.filter(user => 
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email.toLowerCase().includes(query.toLowerCase()) ||
      (typeof user.skills === 'string' && user.skills.toLowerCase().includes(query.toLowerCase()))
    );
    renderUsersList(filtered);
  }
  
  // ============================================================
  // UTILITIES
  // ============================================================
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function formatTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString();
  }
  
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    }
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric', 
      minute: '2-digit' 
    });
  }
  
  function updateUnreadBadge() {
    // Update tab button badge
    const tabButton = document.querySelector('[data-tab="messages"]');
    if (tabButton) {
      let badge = tabButton.querySelector('.unread-badge');
      if (state.unreadCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'unread-badge';
          tabButton.appendChild(badge);
        }
        badge.textContent = state.unreadCount;
      } else if (badge) {
        badge.remove();
      }
    }
    
    // Update conversations header badge
    const headerBadge = document.querySelector('.conversations-header .unread-badge');
    if (headerBadge) {
      if (state.unreadCount > 0) {
        headerBadge.textContent = state.unreadCount;
      } else {
        headerBadge.remove();
      }
    }
  }
  
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'error' ? '#f00' : '#00e0ff'};
      color: ${type === 'error' ? '#fff' : '#000'};
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      z-index: 16000;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  
  function renderError(message) {
    const container = document.getElementById('messages-container');
    if (container) {
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
    console.log('Messaging cleanup complete');
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
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target.classList.contains('active-tab-pane') && 
          mutation.target.id === 'messages') {
        MessagingModule.init();
      }
      
      // Cleanup when leaving tab
      if (!mutation.target.classList.contains('active-tab-pane') && 
          mutation.target.id === 'messages') {
        MessagingModule.cleanup();
      }
    });
  });
  
  const messagesTab = document.getElementById('messages');
  if (messagesTab) {
    observer.observe(messagesTab, { attributes: true, attributeFilter: ['class'] });
    
    // Initialize if already active
    if (messagesTab.classList.contains('active-tab-pane')) {
      MessagingModule.init();
    }
  }
});
