// ================================================================
// COLLABORATION TOOLS SYSTEM
// ================================================================
// Team management, project collaboration, and communication features

console.log("%c🤝 Collaboration Tools Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;

// Collaboration features
const COLLABORATION_FEATURES = {
  TEAM_CHAT: { id: 'team_chat', name: 'Team Chat', icon: 'fas fa-comments' },
  FILE_SHARING: { id: 'file_sharing', name: 'File Sharing', icon: 'fas fa-cloud-upload-alt' },
  TASK_MANAGEMENT: { id: 'task_management', name: 'Task Management', icon: 'fas fa-tasks' },
  VIDEO_CALLS: { id: 'video_calls', name: 'Video Calls', icon: 'fas fa-video' },
  CODE_REVIEW: { id: 'code_review', name: 'Code Review', icon: 'fas fa-code-branch' },
  PROGRESS_TRACKING: { id: 'progress_tracking', name: 'Progress Tracking', icon: 'fas fa-chart-line' }
};

// Initialize collaboration tools
export function initCollaborationTools() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Expose functions globally
  window.openCollaborationHub = openCollaborationHub;
  window.closeCollaborationHub = closeCollaborationHub;
  window.openTeamManagement = openTeamManagement;
  window.inviteTeamMember = inviteTeamMember;
  window.manageTeamRoles = manageTeamRoles;
  window.createProjectSubteam = createProjectSubteam;

  console.log('✅ Collaboration tools initialized');
}

// Open collaboration hub
export async function openCollaborationHub(projectId = null) {
  console.log('🤝 Opening collaboration hub...');

  // Remove existing modal if present
  const existing = document.getElementById('collaboration-hub-modal');
  if (existing) existing.remove();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'collaboration-hub-modal';
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
    z-index: 10000;
    padding: 1rem;
  `;

  modal.innerHTML = `
    <div class="collaboration-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 1000px;
      width: 100%;
      max-height: 90vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div class="collaboration-header" style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-users-cog"></i> Collaboration Hub
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Manage teams, coordinate projects, and enhance collaboration
            </p>
          </div>
          <button onclick="closeCollaborationHub()" style="
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2rem;
            transition: all 0.2s;
          ">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="collaboration-content" style="
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      ">
        <!-- Quick Actions -->
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.2rem;">
            <i class="fas fa-bolt"></i> Quick Actions
          </h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <button onclick="openTeamBuilder()" class="action-card">
              <i class="fas fa-users-cog"></i>
              <span>Build New Team</span>
            </button>
            <button onclick="openTeamManagement()" class="action-card">
              <i class="fas fa-user-cog"></i>
              <span>Manage Teams</span>
            </button>
            <button onclick="openProjectCollaboration()" class="action-card">
              <i class="fas fa-project-diagram"></i>
              <span>Project Collaboration</span>
            </button>
            <button onclick="openCommunicationTools()" class="action-card">
              <i class="fas fa-comments"></i>
              <span>Communication</span>
            </button>
          </div>
        </div>

        <!-- Active Projects -->
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.2rem;">
            <i class="fas fa-lightbulb"></i> Your Active Projects
          </h3>
          <div id="active-projects-list">
            <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
              <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
              <p>Loading your projects...</p>
            </div>
          </div>
        </div>

        <!-- Team Invitations -->
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.2rem;">
            <i class="fas fa-envelope"></i> Team Invitations
          </h3>
          <div id="team-invitations-list">
            <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
              <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
              <p>Loading invitations...</p>
            </div>
          </div>
        </div>

        <!-- Collaboration Features -->
        <div>
          <h3 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.2rem;">
            <i class="fas fa-tools"></i> Collaboration Features
          </h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
            ${Object.values(COLLABORATION_FEATURES).map(feature => `
              <div class="feature-card" style="
                background: rgba(0, 224, 255, 0.05);
                border: 1px solid rgba(0, 224, 255, 0.2);
                border-radius: 8px;
                padding: 1.5rem;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
              " onclick="openCollaborationFeature('${feature.id}')">
                <i class="${feature.icon}" style="font-size: 2rem; color: #00e0ff; margin-bottom: 0.75rem;"></i>
                <h4 style="color: #00e0ff; margin: 0; font-size: 1rem;">${feature.name}</h4>
                <p style="color: rgba(255, 255, 255, 0.7); margin: 0.5rem 0 0 0; font-size: 0.85rem;">
                  ${getFeatureDescription(feature.id)}
                </p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .action-card {
      background: rgba(0, 224, 255, 0.1);
      border: 2px solid rgba(0, 224, 255, 0.3);
      border-radius: 8px;
      padding: 1rem;
      color: #00e0ff;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }

    .action-card:hover {
      border-color: rgba(0, 224, 255, 0.6);
      background: rgba(0, 224, 255, 0.15);
      transform: translateY(-2px);
    }

    .action-card i {
      font-size: 1.5rem;
    }

    .feature-card:hover {
      border-color: rgba(0, 224, 255, 0.4) !important;
      background: rgba(0, 224, 255, 0.08) !important;
      transform: translateY(-2px);
    }

    .project-card {
      background: rgba(0, 224, 255, 0.05);
      border: 1px solid rgba(0, 224, 255, 0.2);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: all 0.2s;
    }

    .project-card:hover {
      border-color: rgba(0, 224, 255, 0.4);
      background: rgba(0, 224, 255, 0.08);
    }

    .team-member-mini {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      margin-right: 0.5rem;
      margin-bottom: 0.25rem;
    }

    .member-avatar-mini {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      font-weight: bold;
      color: white;
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Load data
  await loadCollaborationData();

  console.log('✅ Collaboration hub opened');
}

// Load collaboration data
async function loadCollaborationData() {
  await Promise.all([
    loadActiveProjects(),
    loadTeamInvitations()
  ]);
}

// Load active projects
async function loadActiveProjects() {
  const container = document.getElementById('active-projects-list');
  if (!container || !currentUserProfile) return;

  try {
    // Get projects where user is a member
    const { data: projectMembers, error } = await supabase
      .from('project_members')
      .select(`
        project_id,
        role,
        projects (
          id,
          title,
          description,
          status,
          creator_id,
          created_at,
          project_members (
            user_id,
            role,
            community (name, image_url)
          )
        )
      `)
      .eq('user_id', currentUserProfile.id);

    if (error) throw error;

    const projects = projectMembers?.map(pm => pm.projects).filter(Boolean) || [];

    if (projects.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-lightbulb" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
          <p>No active projects</p>
          <button onclick="openTeamBuilder()" style="
            margin-top: 1rem;
            padding: 0.5rem 1rem;
            background: rgba(0, 224, 255, 0.2);
            border: 1px solid rgba(0, 224, 255, 0.4);
            border-radius: 6px;
            color: #00e0ff;
            cursor: pointer;
            font-weight: 600;
          ">
            Create Your First Team
          </button>
        </div>
      `;
      return;
    }

    let html = '';
    projects.forEach(project => {
      const teamMembers = project.project_members || [];
      const isCreator = project.creator_id === currentUserProfile.id;

      html += `
        <div class="project-card">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
            <div>
              <h4 style="color: #00e0ff; margin: 0 0 0.25rem 0; font-size: 1.1rem;">
                ${project.title}
              </h4>
              <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
                ${isCreator ? 'Project Creator' : 'Team Member'} • ${project.status}
              </div>
            </div>
            <button onclick="openProjectCollaboration('${project.id}')" style="
              background: rgba(0, 224, 255, 0.2);
              border: 1px solid rgba(0, 224, 255, 0.4);
              border-radius: 6px;
              color: #00e0ff;
              padding: 0.5rem 1rem;
              cursor: pointer;
              font-size: 0.85rem;
              font-weight: 600;
            ">
              <i class="fas fa-cog"></i> Manage
            </button>
          </div>

          <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 1rem; font-size: 0.9rem;">
            ${project.description || 'No description available'}
          </p>

          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${teamMembers.slice(0, 5).map(member => {
              const name = member.community?.name || 'Unknown';
              const initials = name.split(' ').map(n => n[0]).join('').toUpperCase();
              return `
                <div class="team-member-mini">
                  <div class="member-avatar-mini">${initials}</div>
                  <span>${name}</span>
                </div>
              `;
            }).join('')}
            ${teamMembers.length > 5 ? `
              <div class="team-member-mini">
                <span>+${teamMembers.length - 5} more</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading active projects:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
        <p>Failed to load projects</p>
      </div>
    `;
  }
}

// Load team invitations
async function loadTeamInvitations() {
  const container = document.getElementById('team-invitations-list');
  if (!container || !currentUserProfile) return;

  try {
    // Get pending invitations
    const { data: invitations, error } = await supabase
      .from('project_members')
      .select(`
        id,
        project_id,
        role,
        created_at,
        projects (
          id,
          title,
          description,
          creator_id,
          community (name, image_url)
        )
      `)
      .eq('user_id', currentUserProfile.id)
      .eq('role', 'pending');

    if (error) throw error;

    if (!invitations || invitations.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;"></i>
          <p>No pending invitations</p>
        </div>
      `;
      return;
    }

    let html = '';
    invitations.forEach(invitation => {
      const project = invitation.projects;
      const creator = project?.community;

      html += `
        <div style="
          background: rgba(255, 170, 0, 0.1);
          border: 1px solid rgba(255, 170, 0, 0.3);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 0.75rem;
        ">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h5 style="color: #ffaa00; margin: 0 0 0.25rem 0;">
                Invitation to join "${project?.title || 'Unknown Project'}"
              </h5>
              <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.85rem; margin-bottom: 0.5rem;">
                From: ${creator?.name || 'Unknown'} • ${new Date(invitation.created_at).toLocaleDateString()}
              </div>
              <p style="color: rgba(255, 255, 255, 0.8); margin: 0; font-size: 0.9rem;">
                ${project?.description || 'No description available'}
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button onclick="acceptTeamInvitation('${invitation.id}')" style="
                background: rgba(0, 255, 136, 0.2);
                border: 1px solid rgba(0, 255, 136, 0.4);
                border-radius: 6px;
                color: #00ff88;
                padding: 0.5rem 1rem;
                cursor: pointer;
                font-size: 0.85rem;
                font-weight: 600;
              ">
                <i class="fas fa-check"></i> Accept
              </button>
              <button onclick="declineTeamInvitation('${invitation.id}')" style="
                background: rgba(255, 107, 107, 0.2);
                border: 1px solid rgba(255, 107, 107, 0.4);
                border-radius: 6px;
                color: #ff6b6b;
                padding: 0.5rem 1rem;
                cursor: pointer;
                font-size: 0.85rem;
                font-weight: 600;
              ">
                <i class="fas fa-times"></i> Decline
              </button>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading team invitations:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
        <p>Failed to load invitations</p>
      </div>
    `;
  }
}

// Get feature description
function getFeatureDescription(featureId) {
  const descriptions = {
    team_chat: 'Real-time messaging and communication for your teams',
    file_sharing: 'Share documents, code, and resources with team members',
    task_management: 'Organize tasks, set deadlines, and track progress',
    video_calls: 'Schedule and join video meetings with your team',
    code_review: 'Collaborative code review and feedback system',
    progress_tracking: 'Monitor project milestones and team performance'
  };
  return descriptions[featureId] || 'Enhance your team collaboration';
}

// Global functions
window.openCollaborationFeature = function(featureId) {
  console.log('Opening collaboration feature:', featureId);
  
  // Show feature coming soon notification
  if (window.showSynapseNotification) {
    window.showSynapseNotification(`${COLLABORATION_FEATURES[featureId.toUpperCase()]?.name || 'Feature'} coming soon!`, 'info');
  } else {
    alert(`${COLLABORATION_FEATURES[featureId.toUpperCase()]?.name || 'Feature'} coming soon!`);
  }
};

window.openProjectCollaboration = function(projectId) {
  console.log('Opening project collaboration for:', projectId);
  
  // This would open a detailed project collaboration interface
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Project collaboration interface coming soon!', 'info');
  } else {
    alert('Project collaboration interface coming soon!');
  }
};

window.openCommunicationTools = function() {
  console.log('Opening communication tools');
  
  // This would open team communication interface
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Communication tools coming soon!', 'info');
  } else {
    alert('Communication tools coming soon!');
  }
};

window.acceptTeamInvitation = async function(invitationId) {
  try {
    // Update role from 'pending' to 'member'
    const { error } = await supabase
      .from('project_members')
      .update({ role: 'member' })
      .eq('id', invitationId);

    if (error) throw error;

    if (window.showSynapseNotification) {
      window.showSynapseNotification('Team invitation accepted! 🎉', 'success');
    } else {
      alert('Team invitation accepted!');
    }

    // Refresh invitations list
    await loadTeamInvitations();
    await loadActiveProjects();

  } catch (error) {
    console.error('Error accepting invitation:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to accept invitation', 'error');
    } else {
      alert('Failed to accept invitation');
    }
  }
};

window.declineTeamInvitation = async function(invitationId) {
  try {
    // Delete the invitation
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', invitationId);

    if (error) throw error;

    if (window.showSynapseNotification) {
      window.showSynapseNotification('Team invitation declined', 'info');
    } else {
      alert('Team invitation declined');
    }

    // Refresh invitations list
    await loadTeamInvitations();

  } catch (error) {
    console.error('Error declining invitation:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to decline invitation', 'error');
    } else {
      alert('Failed to decline invitation');
    }
  }
};

window.closeCollaborationHub = function() {
  const modal = document.getElementById('collaboration-hub-modal');
  if (modal) {
    modal.remove();
  }
  console.log('🗑️ Collaboration hub closed');
};

// Team management functions (placeholders for future implementation)
window.openTeamManagement = function() {
  console.log('Opening team management');
  
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Advanced team management coming soon!', 'info');
  } else {
    alert('Advanced team management coming soon!');
  }
};

window.inviteTeamMember = function() {
  console.log('Inviting team member');
};

window.manageTeamRoles = function() {
  console.log('Managing team roles');
};

window.createProjectSubteam = function() {
  console.log('Creating project subteam');
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initCollaborationTools();
});

console.log('✅ Collaboration tools ready');