// ================================================================
// VIDEO CHAT ENGINE - WebRTC Implementation
// ================================================================
// Real-time video communication system for CharlestonHacks Innovation Engine

console.log("%c📹 Video Chat Engine Loading...", "color:#ff6b6b; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let signalingChannel = null;
let isCallActive = false;
let callStartTime = null;

// WebRTC Configuration
const rtcConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Call states
const CALL_STATES = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  CONNECTED: 'connected',
  ENDED: 'ended',
  FAILED: 'failed'
};

let currentCallState = CALL_STATES.IDLE;
let currentCall = null;

// Initialize video chat engine
let videoChatEngineInitialized = false;

export function initVideoChatEngine() {
  if (videoChatEngineInitialized) {
    console.log('⚠️ Video Chat Engine already initialized, skipping');
    return;
  }
  videoChatEngineInitialized = true;
  
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
    setupSignalingChannel();
  });

  // Expose functions globally
  window.startVideoCall = startVideoCall;
  window.answerCall = answerCall;
  window.endCall = endCall;
  window.toggleMute = toggleMute;
  window.toggleVideo = toggleVideo;
  window.toggleScreenShare = toggleScreenShare;
  window.openVideoCallInterface = openVideoCallInterface;
  window.closeVideoCallInterface = closeVideoCallInterface;

  console.log('✅ Video chat engine initialized');
}

// Setup signaling channel using Supabase real-time
function setupSignalingChannel() {
  if (!supabase || !currentUserProfile) return;

  signalingChannel = supabase
    .channel(`video-calls-${currentUserProfile.id}`)
    .on('broadcast', { event: 'call-signal' }, (payload) => {
      handleSignalingMessage(payload.payload);
    })
    .subscribe();

  console.log('📡 Signaling channel established');
}

// Handle signaling messages
async function handleSignalingMessage(message) {
  console.log('📡 Received signaling message:', message.type);

  switch (message.type) {
    case 'call-offer':
      await handleCallOffer(message);
      break;
    case 'call-answer':
      await handleCallAnswer(message);
      break;
    case 'ice-candidate':
      await handleIceCandidate(message);
      break;
    case 'call-end':
      handleCallEnd(message);
      break;
    case 'call-reject':
      handleCallReject(message);
      break;
  }
}

// Start a video call
window.startVideoCall = async function(targetUserId, targetUserName) {
  console.log('📹 Starting video call to:', targetUserName);

  try {
    // Check if already in a call
    if (isCallActive) {
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Already in an active call', 'warning');
      }
      return;
    }

    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    // Create peer connection
    peerConnection = new RTCPeerConnection(rtcConfiguration);
    setupPeerConnectionHandlers();

    // Add local stream to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Create offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Set call state
    currentCallState = CALL_STATES.CALLING;
    currentCall = {
      id: generateCallId(),
      targetUserId: targetUserId,
      targetUserName: targetUserName,
      startTime: Date.now(),
      type: 'outgoing'
    };

    // Send offer through signaling
    await sendSignalingMessage({
      type: 'call-offer',
      callId: currentCall.id,
      fromUserId: currentUserProfile.id,
      fromUserName: currentUserProfile.name,
      toUserId: targetUserId,
      offer: offer
    });

    // Show calling interface
    showCallingInterface(targetUserName, 'outgoing');

    // Track call event
    if (window.trackEvent) {
      window.trackEvent('video_call_started', {
        target_user: targetUserId,
        call_id: currentCall.id
      });
    }

  } catch (error) {
    console.error('❌ Error starting video call:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to start video call. Please check camera/microphone permissions.', 'error');
    }
    
    cleanupCall();
  }
};

// Handle incoming call offer
async function handleCallOffer(message) {
  console.log('📞 Incoming call from:', message.fromUserName);

  // Check if already in a call
  if (isCallActive) {
    // Send busy signal
    await sendSignalingMessage({
      type: 'call-reject',
      callId: message.callId,
      fromUserId: currentUserProfile.id,
      toUserId: message.fromUserId,
      reason: 'busy'
    });
    return;
  }

  // Set call state
  currentCallState = CALL_STATES.RINGING;
  currentCall = {
    id: message.callId,
    fromUserId: message.fromUserId,
    fromUserName: message.fromUserName,
    offer: message.offer,
    type: 'incoming'
  };

  // Show incoming call interface
  showIncomingCallInterface(message.fromUserName, message.callId);

  // Play ringtone (optional)
  playRingtone();
}

// Answer incoming call
window.answerCall = async function(callId) {
  console.log('📞 Answering call:', callId);

  try {
    if (!currentCall || currentCall.id !== callId) {
      console.error('❌ No matching call to answer');
      return;
    }

    // Get user media
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    // Create peer connection
    peerConnection = new RTCPeerConnection(rtcConfiguration);
    setupPeerConnectionHandlers();

    // Add local stream
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Set remote description from offer
    await peerConnection.setRemoteDescription(currentCall.offer);

    // Create answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send answer
    await sendSignalingMessage({
      type: 'call-answer',
      callId: callId,
      fromUserId: currentUserProfile.id,
      toUserId: currentCall.fromUserId,
      answer: answer
    });

    // Update call state
    currentCallState = CALL_STATES.CONNECTED;
    isCallActive = true;
    callStartTime = Date.now();

    // Show video interface
    showVideoInterface();

    // Stop ringtone
    stopRingtone();

    // Track call event
    if (window.trackEvent) {
      window.trackEvent('video_call_answered', {
        call_id: callId,
        caller_user: currentCall.fromUserId
      });
    }

  } catch (error) {
    console.error('❌ Error answering call:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to answer call. Please check camera/microphone permissions.', 'error');
    }
    
    cleanupCall();
  }
};

// Handle call answer
async function handleCallAnswer(message) {
  console.log('📞 Call answered by:', message.fromUserId);

  try {
    if (!peerConnection) {
      console.error('❌ No peer connection for answer');
      return;
    }

    // Set remote description from answer
    await peerConnection.setRemoteDescription(message.answer);

    // Update call state
    currentCallState = CALL_STATES.CONNECTED;
    isCallActive = true;
    callStartTime = Date.now();

    // Show video interface
    showVideoInterface();

    // Track call event
    if (window.trackEvent) {
      window.trackEvent('video_call_connected', {
        call_id: currentCall.id,
        target_user: currentCall.targetUserId
      });
    }

  } catch (error) {
    console.error('❌ Error handling call answer:', error);
    cleanupCall();
  }
}

// Setup peer connection event handlers
function setupPeerConnectionHandlers() {
  if (!peerConnection) return;

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    console.log('📹 Received remote stream');
    remoteStream = event.streams[0];
    
    const remoteVideo = document.getElementById('remote-video');
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream;
    }
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = async (event) => {
    if (event.candidate) {
      await sendSignalingMessage({
        type: 'ice-candidate',
        callId: currentCall.id,
        fromUserId: currentUserProfile.id,
        toUserId: currentCall.targetUserId || currentCall.fromUserId,
        candidate: event.candidate
      });
    }
  };

  // Handle connection state changes
  peerConnection.onconnectionstatechange = () => {
    console.log('🔗 Connection state:', peerConnection.connectionState);
    
    if (peerConnection.connectionState === 'failed') {
      if (window.showSynapseNotification) {
        window.showSynapseNotification('Video call connection failed', 'error');
      }
      endCall();
    }
  };
}

// Handle ICE candidate
async function handleIceCandidate(message) {
  if (peerConnection && message.candidate) {
    try {
      await peerConnection.addIceCandidate(message.candidate);
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }
}

// End video call
window.endCall = async function() {
  console.log('📞 Ending video call');

  // Send end call signal
  if (currentCall && signalingChannel) {
    await sendSignalingMessage({
      type: 'call-end',
      callId: currentCall.id,
      fromUserId: currentUserProfile.id,
      toUserId: currentCall.targetUserId || currentCall.fromUserId
    });
  }

  // Track call duration
  if (window.trackEvent && callStartTime) {
    const duration = Date.now() - callStartTime;
    window.trackEvent('video_call_ended', {
      call_id: currentCall?.id,
      duration: duration,
      ended_by: 'user'
    });
  }

  cleanupCall();
  closeVideoCallInterface();

  if (window.showSynapseNotification) {
    window.showSynapseNotification('Video call ended', 'info');
  }
};

// Handle call end from remote
function handleCallEnd(message) {
  console.log('📞 Call ended by remote user');
  
  // Track call event
  if (window.trackEvent && callStartTime) {
    const duration = Date.now() - callStartTime;
    window.trackEvent('video_call_ended', {
      call_id: message.callId,
      duration: duration,
      ended_by: 'remote'
    });
  }

  cleanupCall();
  closeVideoCallInterface();

  if (window.showSynapseNotification) {
    window.showSynapseNotification('Video call ended by other user', 'info');
  }
}

// Handle call rejection
function handleCallReject(message) {
  console.log('📞 Call rejected:', message.reason);
  
  cleanupCall();
  closeVideoCallInterface();

  const reason = message.reason === 'busy' ? 'User is busy' : 'Call declined';
  if (window.showSynapseNotification) {
    window.showSynapseNotification(reason, 'warning');
  }
}

// Cleanup call resources
function cleanupCall() {
  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Close peer connection
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  // Reset state
  isCallActive = false;
  callStartTime = null;
  currentCallState = CALL_STATES.IDLE;
  currentCall = null;
  remoteStream = null;

  // Stop ringtone
  stopRingtone();
}

// Send signaling message
async function sendSignalingMessage(message) {
  if (!signalingChannel) return;

  try {
    await signalingChannel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: message
    });
  } catch (error) {
    console.error('❌ Error sending signaling message:', error);
  }
}

// Media controls
window.toggleMute = function() {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.innerHTML = audioTrack.enabled 
        ? '<i class="fas fa-microphone"></i>' 
        : '<i class="fas fa-microphone-slash"></i>';
      muteBtn.style.background = audioTrack.enabled 
        ? 'rgba(0, 224, 255, 0.2)' 
        : 'rgba(255, 107, 107, 0.2)';
    }

    // Track mute event
    if (window.trackEvent) {
      window.trackEvent('video_call_mute_toggle', {
        call_id: currentCall?.id,
        muted: !audioTrack.enabled
      });
    }
  }
};

window.toggleVideo = function() {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    
    const videoBtn = document.getElementById('video-btn');
    if (videoBtn) {
      videoBtn.innerHTML = videoTrack.enabled 
        ? '<i class="fas fa-video"></i>' 
        : '<i class="fas fa-video-slash"></i>';
      videoBtn.style.background = videoTrack.enabled 
        ? 'rgba(0, 224, 255, 0.2)' 
        : 'rgba(255, 107, 107, 0.2)';
    }

    // Track video toggle event
    if (window.trackEvent) {
      window.trackEvent('video_call_video_toggle', {
        call_id: currentCall?.id,
        video_enabled: videoTrack.enabled
      });
    }
  }
};

window.toggleScreenShare = async function() {
  try {
    if (!peerConnection) return;

    const screenBtn = document.getElementById('screen-btn');
    
    // Check if already sharing screen
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack && videoTrack.label.includes('screen')) {
      // Stop screen sharing, return to camera
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const newVideoTrack = cameraStream.getVideoTracks()[0];
      
      // Replace track in peer connection
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      // Update local stream
      localStream.removeTrack(videoTrack);
      localStream.addTrack(newVideoTrack);
      videoTrack.stop();

      // Update local video
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localStream;
      }

      if (screenBtn) {
        screenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
        screenBtn.style.background = 'rgba(0, 224, 255, 0.2)';
      }

      if (window.showSynapseNotification) {
        window.showSynapseNotification('Screen sharing stopped', 'info');
      }

    } else {
      // Start screen sharing
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Replace track in peer connection
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(screenTrack);
      }

      // Update local stream
      if (videoTrack) {
        localStream.removeTrack(videoTrack);
        videoTrack.stop();
      }
      localStream.addTrack(screenTrack);

      // Update local video
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localStream;
      }

      if (screenBtn) {
        screenBtn.innerHTML = '<i class="fas fa-stop"></i>';
        screenBtn.style.background = 'rgba(255, 107, 107, 0.2)';
      }

      if (window.showSynapseNotification) {
        window.showSynapseNotification('Screen sharing started', 'success');
      }

      // Handle screen share end
      screenTrack.onended = () => {
        toggleScreenShare(); // Return to camera
      };
    }

    // Track screen share event
    if (window.trackEvent) {
      window.trackEvent('video_call_screen_share', {
        call_id: currentCall?.id,
        sharing: videoTrack && videoTrack.label.includes('screen')
      });
    }

  } catch (error) {
    console.error('❌ Error toggling screen share:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Screen sharing not available', 'warning');
    }
  }
};

// Utility functions
function generateCallId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

let ringtoneAudio = null;

function playRingtone() {
  // Create audio element for ringtone (you can replace with actual ringtone file)
  ringtoneAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
  
  if (ringtoneAudio) {
    ringtoneAudio.loop = true;
    ringtoneAudio.volume = 0.5;
    ringtoneAudio.play().catch(e => console.log('Could not play ringtone:', e));
  }
}

function stopRingtone() {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio = null;
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initVideoChatEngine();
});

console.log('✅ Video chat engine ready');