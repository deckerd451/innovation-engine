// ================================================================
// VIDEO CHAT INTEGRATION
// ================================================================
// Integration with existing CharlestonHacks systems

console.log("%c🔗 Video Chat Integration Loading...", "color:#ff6b6b; font-weight: bold; font-size: 16px");

// Initialize video chat integration
export function initVideoChatIntegration() {
  // Add video call buttons to user profiles
  addVideoCallButtonsToProfiles();
  
  // Add video call buttons to messaging interface
  addVideoCallButtonsToMessaging();
  
  // Add team meeting buttons to project management
  addTeamMeetingButtons();
  
  // Integrate with notification system
  setupVideoChatNotifications();

  console.log('✅ Video chat integration initialized');
}

// Add video call buttons to user profiles
function addVideoCallButtonsToProfiles() {
  // Listen for profile modal opens
  document.addEventListener('click', (e) => {
    const profileTrigger = e.target.closest('[onclick*="showUserProfile"]');
    if (profileTrigger) {
      setTimeout(() => {
        addVideoCallButtonToProfile();
      }, 100);
    }
  });
}

function addVideoCallButtonToProfile() {
  const profileModal = document.getElementById('profile-modal');
  if (!profileModal || !profileModal.classList.contains('active')) return;

  // Check if button already exists
  if (profileModal.querySelector('.video-call-btn')) return;

  // Find the profile actions area
  const profileContent = profileModal.querySelector('#modal-profile-content');
  if (!profileContent) return;

  // Get user data from profile content
  const userNameElement = profileContent.querySelector('h2');
  if (!userNameElement) return;

  const userName = userNameElement.textContent.trim();
  const userId = profileContent.dataset.userId || 'unknown';

  // Create video call button
  const videoCallBtn = document.createElement('button');
  videoCallBtn.className = 'video-call-btn';
  videoCallBtn.style.cssText = `
    background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
    border: none;
    border-radius: 8px;
    color: white;
    padding: 0.75rem 1.5rem;
    font-weight: 600;
    cursor: pointer;
    margin: 0.5rem 0.5rem 0.5rem 0;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  `;
  
  videoCallBtn.innerHTML = `
    <i class="fas fa-video"></i>
    Video Call
  `;

  videoCallBtn.onclick = () => {
    if (window.startVideoCall) {
      window.startVideoCall(userId, userName);
      // Close profile modal
      if (window.closeProfileModal) {
        window.closeProfileModal();
      }
    }
  };

  videoCallBtn.onmouseover = () => {
    videoCallBtn.style.transform = 'translateY(-2px)';
    videoCallBtn.style.boxShadow = '0 8px 25px rgba(255, 107, 107, 0.3)';
  };

  videoCallBtn.onmouseout = () => {
    videoCallBtn.style.transform = 'translateY(0)';
    videoCallBtn.style.boxShadow = 'none';
  };

  // Find connection button and add video call button next to it
  const connectionBtn = profileContent.querySelector('button[onclick*="sendConnectionRequest"]');
  if (connectionBtn) {
    connectionBtn.parentNode.insertBefore(videoCallBtn, connectionBtn.nextSibling);
  } else {
    // Add to the end of profile content
    profileContent.appendChild(videoCallBtn);
  }
}

// Add video call buttons to messaging interface
function addVideoCallButtonsToMessaging() {
  // Listen for messaging modal opens
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-messages') || e.target.closest('[onclick*="openMessagingInterface"]')) {
      setTimeout(() => {
        addVideoCallButtonsToConversations();
      }, 500);
    }
  });
}

function addVideoCallButtonsToConversations() {
  const messagesModal = document.getElementById('messages-modal');
  if (!messagesModal || !messagesModal.classList.contains('active')) return;

  // Find conversation headers and add video call buttons
  const conversationHeaders = messagesModal.querySelectorAll('.conversation-header, .message-header');
  
  conversationHeaders.forEach(header => {
    // Skip if button already exists
    if (header.querySelector('.video-call-btn')) return;

    // Get conversation partner info
    const nameElement = header.querySelector('h4, .conversation-name');
    if (!nameElement) return;

    const partnerName = nameElement.textContent.trim();
    const partnerId = header.dataset.userId || header.dataset.partnerId;

    if (!partnerId || partnerId === 'unknown') return;

    // Create video call button
    const videoBtn = document.createElement('button');
    videoBtn.className = 'video-call-btn';
    videoBtn.style.cssText = `
      background: rgba(255, 107, 107, 0.2);
      border: 1px solid rgba(255, 107, 107, 0.4);
      border-radius: 6px;
      color: #ff6b6b;
      padding: 0.5rem;
      cursor: pointer;
      margin-left: 0.5rem;
      transition: all 0.2s;
      font-size: 0.9rem;
    `;

    videoBtn.innerHTML = '<i class="fas fa-video"></i>';
    videoBtn.title = `Video call with ${partnerName}`;

    videoBtn.onclick = (e) => {
      e.stopPropagation();
      if (window.startVideoCall) {
        window.startVideoCall(partnerId, partnerName);
      }
    };

    videoBtn.onmouseover = () => {
      videoBtn.style.background = 'rgba(255, 107, 107, 0.3)';
      videoBtn.style.borderColor = 'rgba(255, 107, 107, 0.6)';
    };

    videoBtn.onmouseout = () => {
      videoBtn.style.background = 'rgba(255, 107, 107, 0.2)';
      videoBtn.style.borderColor = 'rgba(255, 107, 107, 0.4)';
    };

    // Add button to header
    header.appendChild(videoBtn);
  });
}

// Add team meeting buttons to project management
function addTeamMeetingButtons() {
  // Listen for project modal opens
  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-projects') || e.target.closest('[onclick*="openProjectsModal"]')) {
      setTimeout(() => {
        addTeamMeetingButtonsToProjects();
      }, 500);
    }
  });
}

function addTeamMeetingButtonsToProjects() {
  const projectsModal = document.getElementById('projects-modal');
  if (!projectsModal || !projectsModal.classList.contains('active')) return;

  // Find project cards and add team meeting buttons
  const projectCards = projectsModal.querySelectorAll('.project-card, .project-item');
  
  projectCards.forEach(card => {
    // Skip if button already exists
    if (card.querySelector('.team-meeting-btn')) return;

    // Get project info
    const titleElement = card.querySelector('h4, .project-title');
    if (!titleElement) return;

    const projectTitle = titleElement.textContent.trim();
    const projectId = card.dataset.projectId || 'unknown';

    // Create team meeting button
    const meetingBtn = document.createElement('button');
    meetingBtn.className = 'team-meeting-btn';
    meetingBtn.style.cssText = `
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid rgba(255, 107, 107, 0.3);
      border-radius: 6px;
      color: #ff6b6b;
      padding: 0.5rem 1rem;
      cursor: pointer;
      margin: 0.5rem 0.5rem 0 0;
      transition: all 0.2s;
      font-size: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    `;

    meetingBtn.innerHTML = `
      <i class="fas fa-users"></i>
      Team Meeting
    `;

    meetingBtn.onclick = () => {
      startTeamMeeting(projectId, projectTitle);
    };

    meetingBtn.onmouseover = () => {
      meetingBtn.style.background = 'rgba(255, 107, 107, 0.2)';
      meetingBtn.style.borderColor = 'rgba(255, 107, 107, 0.5)';
    };

    meetingBtn.onmouseout = () => {
      meetingBtn.style.background = 'rgba(255, 107, 107, 0.1)';
      meetingBtn.style.borderColor = 'rgba(255, 107, 107, 0.3)';
    };

    // Add button to project actions area
    const actionsArea = card.querySelector('.project-actions, .project-buttons');
    if (actionsArea) {
      actionsArea.appendChild(meetingBtn);
    } else {
      card.appendChild(meetingBtn);
    }
  });
}

// Start team meeting
function startTeamMeeting(projectId, projectTitle) {
  console.log('👥 Starting team meeting for project:', projectTitle);

  if (window.showSynapseNotification) {
    window.showSynapseNotification(`Starting team meeting for "${projectTitle}"`, 'info');
  }

  // Create team meeting room
  createTeamMeetingRoom(projectId, projectTitle);

  // Track team meeting event
  if (window.trackEvent) {
    window.trackEvent('team_meeting_started', {
      project_id: projectId,
      project_title: projectTitle
    });
  }
}

// Create team meeting room
function createTeamMeetingRoom(projectId, projectTitle) {
  // For now, open the video interface in demo mode
  // In a real implementation, this would create a group call room
  
  if (window.openVideoCallInterface) {
    window.openVideoCallInterface();
  }

  // Show team meeting notification
  setTimeout(() => {
    if (window.showSynapseNotification) {
      window.showSynapseNotification(
        `Team meeting room created for "${projectTitle}". Share the meeting link with team members.`,
        'success'
      );
    }
  }, 1000);
}

// Setup video chat notifications
function setupVideoChatNotifications() {
  // Listen for incoming call events
  window.addEventListener('incoming-video-call', (e) => {
    const { callerName, callId } = e.detail;
    
    // Show browser notification if permission granted
    if (Notification.permission === 'granted') {
      const notification = new Notification(`Incoming video call from ${callerName}`, {
        icon: '/favicon.ico',
        body: 'Click to answer the call',
        tag: `video-call-${callId}`
      });

      notification.onclick = () => {
        window.focus();
        if (window.answerCall) {
          window.answerCall(callId);
        }
        notification.close();
      };

      // Auto-close notification after 30 seconds
      setTimeout(() => {
        notification.close();
      }, 30000);
    }

    // Show in-app notification
    if (window.showSynapseNotification) {
      window.showSynapseNotification(
        `Incoming video call from ${callerName}`,
        'info',
        30000
      );
    }
  });

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Add video chat button to START flow
function addVideoCallToStartFlow() {
  const startModal = document.getElementById('start-modal');
  if (!startModal) return;

  // Find the quick actions section
  const quickActionsSection = startModal.querySelector('[style*="Quick Actions"]');
  if (!quickActionsSection) return;

  // Check if button already exists
  if (startModal.querySelector('.start-video-call-btn')) return;

  // Create video call button for START flow
  const videoCallBtn = document.createElement('button');
  videoCallBtn.className = 'start-action-btn start-video-call-btn';
  videoCallBtn.style.cssText = `
    background: rgba(255, 107, 107, 0.1);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  `;

  videoCallBtn.innerHTML = `
    <div style="font-size: 1.5rem; color: #ff6b6b;">
      <i class="fas fa-video"></i>
    </div>
    <div style="text-align: left;">
      <div style="color: #fff; font-size: 0.9rem; font-weight: 600;">Video Call</div>
      <div style="color: rgba(255, 255, 255, 0.5); font-size: 0.75rem;">Start a video conversation</div>
    </div>
  `;

  videoCallBtn.onclick = () => {
    if (window.openVideoCallInterface) {
      window.openVideoCallInterface();
    }
  };

  // Add to quick actions grid
  const actionsGrid = quickActionsSection.querySelector('[style*="grid"]');
  if (actionsGrid) {
    actionsGrid.appendChild(videoCallBtn);
  }
}

// Listen for START modal opens
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-start')) {
    setTimeout(() => {
      addVideoCallToStartFlow();
    }, 100);
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initVideoChatIntegration();
});

console.log('✅ Video chat integration ready');