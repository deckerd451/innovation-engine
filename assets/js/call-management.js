// ================================================================
// CALL MANAGEMENT INTERFACE
// ================================================================
// Video call UI components and interface management

console.log("%c📞 Call Management Loading...", "color:#ff6b6b; font-weight: bold; font-size: 16px");

// Show calling interface (outgoing call)
window.showCallingInterface = function(targetUserName, type = 'outgoing') {
  console.log('📞 Showing calling interface for:', targetUserName);

  // Remove existing interface
  const existing = document.getElementById('video-call-interface');
  if (existing) existing.remove();

  const interface = document.createElement('div');
  interface.id = 'video-call-interface';
  interface.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
    backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    color: white;
  `;

  interface.innerHTML = `
    <div style="text-align: center; margin-bottom: 3rem;">
      <div style="
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
        margin: 0 auto 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
        color: white;
        animation: pulse 2s infinite;
      ">
        ${targetUserName.charAt(0).toUpperCase()}
      </div>
      
      <h2 style="color: #ff6b6b; margin-bottom: 0.5rem; font-size: 1.8rem;">
        ${type === 'outgoing' ? 'Calling...' : 'Incoming Call'}
      </h2>
      
      <p style="color: rgba(255, 255, 255, 0.8); font-size: 1.2rem; margin-bottom: 2rem;">
        ${targetUserName}
      </p>

      <div id="call-timer" style="
        color: rgba(255, 255, 255, 0.6);
        font-size: 1rem;
        margin-bottom: 2rem;
      ">
        ${type === 'outgoing' ? 'Connecting...' : 'Incoming video call'}
      </div>
    </div>

    <div style="display: flex; gap: 2rem; align-items: center;">
      ${type === 'incoming' ? `
        <button onclick="answerCall('${currentCall?.id}')" style="
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: linear-gradient(135deg, #00ff88, #00e0ff);
          border: none;
          color: white;
          font-size: 1.8rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(0, 255, 136, 0.4);
        " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
          <i class="fas fa-phone"></i>
        </button>
      ` : ''}
      
      <button onclick="endCall()" style="
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff6b6b, #ff4757);
        border: none;
        color: white;
        font-size: 1.8rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 20px rgba(255, 107, 107, 0.4);
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <i class="fas fa-phone-slash"></i>
      </button>
    </div>
  `;

  // Add pulse animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0.7); }
      70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(255, 107, 107, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 107, 107, 0); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(interface);

  // Start call timer for outgoing calls
  if (type === 'outgoing') {
    let seconds = 0;
    const timer = setInterval(() => {
      seconds++;
      const timerElement = document.getElementById('call-timer');
      if (timerElement) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerElement.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
      }
      
      // Auto-end call after 60 seconds if not answered
      if (seconds >= 60) {
        clearInterval(timer);
        endCall();
      }
    }, 1000);

    // Store timer reference
    interface.dataset.timer = timer;
  }
};

// Show incoming call interface
window.showIncomingCallInterface = function(callerName, callId) {
  showCallingInterface(callerName, 'incoming');
};

// Show video interface (active call)
window.showVideoInterface = function() {
  console.log('📹 Showing video interface');

  // Remove calling interface
  const callingInterface = document.getElementById('video-call-interface');
  if (callingInterface) {
    // Clear timer if exists
    if (callingInterface.dataset.timer) {
      clearInterval(parseInt(callingInterface.dataset.timer));
    }
    callingInterface.remove();
  }

  const videoInterface = document.createElement('div');
  videoInterface.id = 'video-call-interface';
  videoInterface.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000;
    display: flex;
    flex-direction: column;
    z-index: 10000;
  `;

  videoInterface.innerHTML = `
    <!-- Remote Video (Main) -->
    <div style="flex: 1; position: relative; background: #1a1a1a;">
      <video id="remote-video" autoplay playsinline style="
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #1a1a1a;
      "></video>
      
      <!-- Local Video (Picture-in-Picture) -->
      <div style="
        position: absolute;
        top: 20px;
        right: 20px;
        width: 200px;
        height: 150px;
        border-radius: 12px;
        overflow: hidden;
        border: 2px solid rgba(0, 224, 255, 0.5);
        background: #000;
      ">
        <video id="local-video" autoplay playsinline muted style="
          width: 100%;
          height: 100%;
          object-fit: cover;
        "></video>
      </div>

      <!-- Call Info -->
      <div style="
        position: absolute;
        top: 20px;
        left: 20px;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(10px);
        border-radius: 8px;
        padding: 1rem;
        color: white;
      ">
        <div style="font-weight: 600; margin-bottom: 0.25rem;">
          ${currentCall?.targetUserName || currentCall?.fromUserName || 'Video Call'}
        </div>
        <div id="call-duration" style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">
          00:00
        </div>
      </div>

      <!-- Chat Toggle -->
      <button id="chat-toggle-btn" onclick="toggleCallChat()" style="
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: white;
        padding: 0.5rem 1rem;
        cursor: pointer;
        font-size: 0.9rem;
      ">
        <i class="fas fa-comment"></i> Chat
      </button>
    </div>

    <!-- Call Controls -->
    <div style="
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      padding: 1.5rem;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1.5rem;
    ">
      <button id="mute-btn" onclick="toggleMute()" style="
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(0, 224, 255, 0.2);
        border: 2px solid rgba(0, 224, 255, 0.4);
        color: #00e0ff;
        font-size: 1.5rem;
        cursor: pointer;
        transition: all 0.2s;
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <i class="fas fa-microphone"></i>
      </button>

      <button id="video-btn" onclick="toggleVideo()" style="
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(0, 224, 255, 0.2);
        border: 2px solid rgba(0, 224, 255, 0.4);
        color: #00e0ff;
        font-size: 1.5rem;
        cursor: pointer;
        transition: all 0.2s;
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <i class="fas fa-video"></i>
      </button>

      <button id="screen-btn" onclick="toggleScreenShare()" style="
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(0, 224, 255, 0.2);
        border: 2px solid rgba(0, 224, 255, 0.4);
        color: #00e0ff;
        font-size: 1.5rem;
        cursor: pointer;
        transition: all 0.2s;
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <i class="fas fa-desktop"></i>
      </button>

      <button onclick="endCall()" style="
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff6b6b, #ff4757);
        border: none;
        color: white;
        font-size: 1.8rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 20px rgba(255, 107, 107, 0.4);
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <i class="fas fa-phone-slash"></i>
      </button>
    </div>

    <!-- Call Chat Overlay -->
    <div id="call-chat-overlay" style="
      position: absolute;
      right: 20px;
      top: 200px;
      bottom: 120px;
      width: 300px;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: none;
      flex-direction: column;
    ">
      <div style="
        padding: 1rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-weight: 600;
      ">
        Call Chat
      </div>
      
      <div id="call-chat-messages" style="
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
        color: white;
        font-size: 0.9rem;
      ">
        <!-- Chat messages will appear here -->
      </div>
      
      <div style="
        padding: 1rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        gap: 0.5rem;
      ">
        <input type="text" id="call-chat-input" placeholder="Type a message..." style="
          flex: 1;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          padding: 0.5rem;
          color: white;
          font-size: 0.9rem;
        ">
        <button onclick="sendCallChatMessage()" style="
          background: rgba(0, 224, 255, 0.2);
          border: 1px solid rgba(0, 224, 255, 0.4);
          border-radius: 6px;
          color: #00e0ff;
          padding: 0.5rem;
          cursor: pointer;
        ">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(videoInterface);

  // Set up local video stream
  const localVideo = document.getElementById('local-video');
  if (localVideo && localStream) {
    localVideo.srcObject = localStream;
  }

  // Set up remote video stream
  const remoteVideo = document.getElementById('remote-video');
  if (remoteVideo && remoteStream) {
    remoteVideo.srcObject = remoteStream;
  }

  // Start call duration timer
  startCallDurationTimer();

  // Setup chat input handler
  const chatInput = document.getElementById('call-chat-input');
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendCallChatMessage();
      }
    });
  }
};

// Start call duration timer
function startCallDurationTimer() {
  let seconds = 0;
  const timer = setInterval(() => {
    if (!isCallActive) {
      clearInterval(timer);
      return;
    }

    seconds++;
    const durationElement = document.getElementById('call-duration');
    if (durationElement) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      durationElement.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

// Toggle call chat overlay
window.toggleCallChat = function() {
  const chatOverlay = document.getElementById('call-chat-overlay');
  if (chatOverlay) {
    const isVisible = chatOverlay.style.display !== 'none';
    chatOverlay.style.display = isVisible ? 'none' : 'flex';
    
    const toggleBtn = document.getElementById('chat-toggle-btn');
    if (toggleBtn) {
      toggleBtn.style.background = isVisible 
        ? 'rgba(0, 0, 0, 0.7)' 
        : 'rgba(0, 224, 255, 0.2)';
    }
  }
};

// Send call chat message
window.sendCallChatMessage = function() {
  const input = document.getElementById('call-chat-input');
  const messagesContainer = document.getElementById('call-chat-messages');
  
  if (!input || !messagesContainer || !input.value.trim()) return;

  const message = input.value.trim();
  input.value = '';

  // Add message to chat
  const messageElement = document.createElement('div');
  messageElement.style.cssText = `
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    background: rgba(0, 224, 255, 0.1);
    border-radius: 8px;
    border-left: 3px solid #00e0ff;
  `;
  messageElement.innerHTML = `
    <div style="font-weight: 600; color: #00e0ff; font-size: 0.8rem; margin-bottom: 0.25rem;">
      You
    </div>
    <div>${message}</div>
  `;

  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // TODO: Send message through signaling channel for real implementation
  console.log('📝 Call chat message:', message);

  // Track chat message
  if (window.trackEvent) {
    window.trackEvent('video_call_chat_message', {
      call_id: currentCall?.id,
      message_length: message.length
    });
  }
};

// Open video call interface (for testing)
window.openVideoCallInterface = function() {
  console.log('📹 Opening video call interface for testing');
  
  // Mock call data for demo
  window.currentCall = {
    id: 'demo-call-' + Date.now(),
    targetUserName: 'Demo User',
    type: 'demo'
  };
  
  window.isCallActive = true;
  window.callStartTime = Date.now();
  
  showVideoInterface();
  
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Video call interface opened (demo mode)', 'info');
  }
};

// Close video call interface
window.closeVideoCallInterface = function() {
  const interface = document.getElementById('video-call-interface');
  if (interface) {
    // Clear any timers
    if (interface.dataset.timer) {
      clearInterval(parseInt(interface.dataset.timer));
    }
    interface.remove();
  }
  
  console.log('🗑️ Video call interface closed');
};

// Mobile responsive adjustments
function adjustForMobile() {
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    const localVideo = document.querySelector('#video-call-interface [style*="width: 200px"]');
    if (localVideo) {
      localVideo.style.width = '120px';
      localVideo.style.height = '90px';
      localVideo.style.top = '10px';
      localVideo.style.right = '10px';
    }

    const chatOverlay = document.getElementById('call-chat-overlay');
    if (chatOverlay) {
      chatOverlay.style.width = '280px';
      chatOverlay.style.right = '10px';
    }

    const controls = document.querySelector('#video-call-interface > div:last-child');
    if (controls) {
      controls.style.padding = '1rem';
      controls.style.gap = '1rem';
    }
  }
}

// Listen for window resize
window.addEventListener('resize', adjustForMobile);

console.log('✅ Call management ready');