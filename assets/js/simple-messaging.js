// ================================================================
// SIMPLE MESSAGING SYSTEM
// ================================================================
// Minimal messaging system for simplified dashboard

console.log('💬 Simple Messaging Loading...');

let messagingPanel = null;

// Initialize messaging
function initSimpleMessaging() {
  console.log('💬 Simple Messaging Ready');
}

// Open messaging interface
function openMessagingInterface() {
  if (messagingPanel) {
    messagingPanel.remove();
  }

  messagingPanel = createMessagingPanel();
  document.body.appendChild(messagingPanel);
}

// Create messaging panel
function createMessagingPanel() {
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    height: 500px;
    background: rgba(0,0,0,0.95);
    border: 1px solid #333;
    border-radius: 8px;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    backdrop-filter: blur(10px);
  `;

  panel.innerHTML = `
    <div style="padding: 15px; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;">
      <h3 style="margin: 0; color: #00e0ff;">
        <i class="fas fa-comments"></i> Messages
      </h3>
      <button onclick="closeMessaging()" style="background: none; border: none; color: #ccc; font-size: 1.2rem; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    </div>
    
    <div style="flex: 1; padding: 15px; overflow-y: auto;">
      <div id="conversations-list">
        <div style="text-align: center; color: #666; padding: 20px;">
          <i class="fas fa-spinner fa-spin"></i><br>
          Loading conversations...
        </div>
      </div>
    </div>
    
    <div style="padding: 15px; border-top: 1px solid #333;">
      <div style="display: flex; gap: 10px;">
        <input type="text" id="message-input" placeholder="Type a message..." 
               style="flex: 1; padding: 8px; background: rgba(255,255,255,0.1); border: 1px solid #333; border-radius: 4px; color: white;">
        <button onclick="sendMessage()" style="padding: 8px 15px; background: #00e0ff; border: none; border-radius: 4px; color: black; cursor: pointer;">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `;

  // Load conversations
  loadConversations();

  return panel;
}

// Load conversations
async function loadConversations() {
  try {
    const profile = window.getCurrentProfile();
    if (!profile) {
      document.getElementById('conversations-list').innerHTML = `
        <div style="text-align: center; color: #666; padding: 20px;">
          Please wait for profile to load...
        </div>
      `;
      return;
    }

    const { data, error } = await window.supabase
      .from('conversations')
      .select(`
        *,
        participant1:community!participant_1_id(id, name, image_url),
        participant2:community!participant_2_id(id, name, image_url)
      `)
      .or(`participant_1_id.eq.${profile.id},participant_2_id.eq.${profile.id}`)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const conversationsList = document.getElementById('conversations-list');
    
    if (!data || data.length === 0) {
      conversationsList.innerHTML = `
        <div style="text-align: center; color: #666; padding: 20px;">
          <i class="fas fa-inbox"></i><br>
          No conversations yet.<br>
          <small>Start connecting with people to begin messaging!</small>
        </div>
      `;
      return;
    }

    conversationsList.innerHTML = data.map(conv => {
      const otherParticipant = conv.participant1.id === profile.id ? conv.participant2 : conv.participant1;
      return `
        <div onclick="openConversation('${conv.id}')" style="
          padding: 12px;
          border-bottom: 1px solid #333;
          cursor: pointer;
          transition: background 0.2s ease;
        " onmouseover="this.style.background='rgba(0,224,255,0.1)'" onmouseout="this.style.background='transparent'">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center;">
              ${otherParticipant.image_url ? 
                `<img src="${otherParticipant.image_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` :
                `<i class="fas fa-user" style="color: #666;"></i>`
              }
            </div>
            <div style="flex: 1;">
              <div style="color: white; font-weight: bold;">${otherParticipant.name}</div>
              <div style="color: #999; font-size: 0.9rem;">${conv.last_message_preview || 'No messages yet'}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading conversations:', error);
    document.getElementById('conversations-list').innerHTML = `
      <div style="text-align: center; color: #f44336; padding: 20px;">
        <i class="fas fa-exclamation-triangle"></i><br>
        Error loading conversations
      </div>
    `;
  }
}

// Open specific conversation
function openConversation(conversationId) {
  console.log('Opening conversation:', conversationId);
  // This would load the specific conversation messages
  // For now, just show a placeholder
  document.getElementById('conversations-list').innerHTML = `
    <div style="text-align: center; color: #666; padding: 20px;">
      <i class="fas fa-comments"></i><br>
      Conversation view coming soon...
    </div>
  `;
}

// Send message
function sendMessage() {
  const input = document.getElementById('message-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  console.log('Sending message:', message);
  input.value = '';
  
  // This would send the actual message
  // For now, just show feedback
  const conversationsList = document.getElementById('conversations-list');
  conversationsList.innerHTML = `
    <div style="text-align: center; color: #4caf50; padding: 20px;">
      <i class="fas fa-check"></i><br>
      Message functionality coming soon...
    </div>
  `;
}

// Close messaging
function closeMessaging() {
  if (messagingPanel) {
    messagingPanel.remove();
    messagingPanel = null;
  }
}

// Send direct message (for compatibility)
function sendDirectMessage(userId, message) {
  console.log('Direct message to:', userId, message);
  openMessagingInterface();
}

// Expose globally
window.initSimpleMessaging = initSimpleMessaging;
window.openMessagingInterface = openMessagingInterface;
window.closeMessaging = closeMessaging;
window.sendDirectMessage = sendDirectMessage;
window.openConversation = openConversation;
window.sendMessage = sendMessage;

console.log('✅ Simple Messaging Loaded');