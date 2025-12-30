// ================================================================
// NODE SIDE PANEL
// ================================================================
// Actionable side panel that appears when clicking network nodes
// Shows profile details, mutual connections, and clear CTAs

console.log("%c👤 Node Panel Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let currentNodeData = null;
let panelElement = null;
let supabase = null;
let currentUserProfile = null;

// Initialize panel
export function initNodePanel() {
  supabase = window.supabase;
  createPanelElement();

  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  console.log('✅ Node panel initialized');
}

// Create the panel DOM element
function createPanelElement() {
  panelElement = document.createElement('div');
  panelElement.id = 'node-side-panel';
  panelElement.style.cssText = `
    position: fixed;
    top: 0;
    right: -450px;
    width: 420px;
    height: 100vh;
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
    border-left: 2px solid rgba(0, 224, 255, 0.5);
    backdrop-filter: blur(10px);
    z-index: 2000;
    overflow-y: auto;
    overflow-x: hidden;
    transition: right 0.3s ease-out;
    box-shadow: -5px 0 30px rgba(0, 0, 0, 0.5);
  `;

  // Custom scrollbar
  const style = document.createElement('style');
  style.textContent = `
    #node-side-panel::-webkit-scrollbar {
      width: 8px;
    }
    #node-side-panel::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
    }
    #node-side-panel::-webkit-scrollbar-thumb {
      background: rgba(0, 224, 255, 0.3);
      border-radius: 4px;
    }
    #node-side-panel::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 224, 255, 0.5);
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(panelElement);
}

// Open panel with node data
export async function openNodePanel(nodeData) {
  console.log('Opening panel for node:', nodeData);

  currentNodeData = nodeData;

  // Show panel
  panelElement.style.right = '0';

  // Load full data
  await loadNodeDetails(nodeData);
}

// Close panel
export function closeNodePanel() {
  panelElement.style.right = '-450px';
  currentNodeData = null;
}

// Load complete node details
async function loadNodeDetails(nodeData) {
  // Show loading state
  panelElement.innerHTML = `
    <div style="padding: 2rem; text-align: center; color: #00e0ff;">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
      <p style="margin-top: 1rem;">Loading profile...</p>
    </div>
  `;

  try {
    // Determine if this is a person or project
    const isProject = nodeData.type === 'project';

    if (isProject) {
      await renderProjectPanel(nodeData);
    } else {
      await renderPersonPanel(nodeData);
    }

  } catch (error) {
    console.error('Error loading node details:', error);
    panelElement.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ff6666;">
        <i class="fas fa-exclamation-circle" style="font-size: 2rem;"></i>
        <p style="margin-top: 1rem;">Error loading profile</p>
      </div>
    `;
  }
}

// Render person profile panel
async function renderPersonPanel(nodeData) {
  // Fetch full profile data
  const { data: profile, error } = await supabase
    .from('community')
    .select('*')
    .eq('id', nodeData.id)
    .single();

  if (error || !profile) {
    throw error;
  }

  // Get connection status
  let connectionStatus = 'none';
  let connectionId = null;

  if (currentUserProfile && profile.id !== currentUserProfile.id) {
    const { data: connection } = await supabase
      .from('connections')
      .select('id, status')
      .or(`and(from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${profile.id}),and(from_user_id.eq.${profile.id},to_user_id.eq.${currentUserProfile.id})`)
      .single();

    if (connection) {
      connectionStatus = connection.status;
      connectionId = connection.id;
    }
  }

  // Get mutual connections
  const mutualConnections = await getMutualConnections(profile.id);

  // Get endorsements
  const { data: endorsements } = await supabase
    .from('endorsements')
    .select('skill, endorser:community!endorsements_endorser_community_id_fkey(name)')
    .eq('endorsed_community_id', profile.id)
    .limit(5);

  // Get shared projects
  const sharedProjects = await getSharedProjects(profile.id);

  // Build panel HTML
  const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase();

  let html = `
    <div style="padding: 2rem; padding-bottom: 100px;">
      <!-- Close Button -->
      <button onclick="closeNodePanel()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; transition: all 0.2s;">
        <i class="fas fa-times"></i>
      </button>

      <!-- Profile Header -->
      <div style="text-align: center; margin-bottom: 2rem;">
        ${profile.image_url ?
          `<img src="${profile.image_url}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff; margin-bottom: 1rem;">` :
          `<div style="width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: bold; color: white; margin: 0 auto 1rem; border: 3px solid #00e0ff;">${initials}</div>`
        }

        <h2 style="color: #00e0ff; font-size: 1.75rem; margin-bottom: 0.5rem;">${profile.name}</h2>

        ${profile.user_role ? `<div style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">${profile.user_role}</div>` : ''}

        ${profile.availability ? `
          <div style="display: inline-block; background: rgba(0,255,136,0.2); color: #00ff88; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; margin-bottom: 1rem;">
            <i class="fas fa-circle" style="font-size: 0.5rem;"></i> ${profile.availability}
          </div>
        ` : ''}

        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem; font-size: 0.9rem; color: #aaa;">
          <div>
            <i class="fas fa-users"></i> ${profile.connection_count || 0} connections
          </div>
          ${profile.projects_created ? `
            <div>
              <i class="fas fa-lightbulb"></i> ${profile.projects_created} projects
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Bio -->
      ${profile.bio ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-user"></i> About
          </h3>
          <p style="color: #ddd; line-height: 1.6;">${profile.bio}</p>
        </div>
      ` : ''}

      <!-- Skills -->
      ${profile.skills ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-code"></i> Skills
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${profile.skills.split(',').map(skill => `
              <span style="background: rgba(0,224,255,0.1); color: #00e0ff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; border: 1px solid rgba(0,224,255,0.3);">
                ${skill.trim()}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Endorsements -->
      ${endorsements && endorsements.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-star"></i> Top Endorsements
          </h3>
          ${endorsements.slice(0, 3).map(e => `
            <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem;">
              <div style="color: #00e0ff; font-weight: bold; margin-bottom: 0.25rem;">${e.skill}</div>
              <div style="color: #aaa; font-size: 0.85rem;">Endorsed by ${e.endorser?.name || 'Unknown'}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Mutual Connections -->
      ${mutualConnections.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-user-friends"></i> ${mutualConnections.length} Mutual Connection${mutualConnections.length !== 1 ? 's' : ''}
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${mutualConnections.slice(0, 5).map(conn => {
              const connInitials = conn.name.split(' ').map(n => n[0]).join('').toUpperCase();
              return `
                <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0,224,255,0.05); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(0,224,255,0.2);">
                  ${conn.image_url ?
                    `<img src="${conn.image_url}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">` :
                    `<div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: white;">${connInitials}</div>`
                  }
                  <span style="color: white; font-size: 0.85rem;">${conn.name}</span>
                </div>
              `;
            }).join('')}
            ${mutualConnections.length > 5 ? `
              <div style="color: #aaa; font-size: 0.85rem; padding: 0.5rem;">
                +${mutualConnections.length - 5} more
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Shared Projects -->
      ${sharedProjects.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-project-diagram"></i> Shared Projects
          </h3>
          ${sharedProjects.map(proj => `
            <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem;">
              <div style="color: #00e0ff; font-weight: bold;">${proj.title}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Action Bar (Fixed at Bottom) -->
    <div style="position: fixed; bottom: 0; right: 0; width: 420px; background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border-top: 2px solid rgba(0, 224, 255, 0.5); padding: 1.5rem; backdrop-filter: blur(10px);">
      ${profile.id === currentUserProfile?.id ? `
        <!-- Own Profile -->
        <button onclick="openProfileModal()" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem;">
          <i class="fas fa-edit"></i> Edit Profile
        </button>
      ` : `
        <!-- Other User Actions -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
          ${connectionStatus === 'accepted' ? `
            <button onclick="sendMessage('${profile.id}')" style="padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
              <i class="fas fa-comment"></i> Message
            </button>
          ` : connectionStatus === 'pending' ? `
            <button disabled style="padding: 0.75rem; background: rgba(255,170,0,0.2); border: 1px solid rgba(255,170,0,0.5); border-radius: 8px; color: #ffaa00; font-weight: bold; cursor: not-allowed;">
              <i class="fas fa-clock"></i> Pending
            </button>
          ` : `
            <button onclick="sendConnectionFromPanel('${profile.id}')" style="padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
              <i class="fas fa-user-plus"></i> Connect
            </button>
          `}

          <button onclick="endorseSkill('${profile.id}')" style="padding: 0.75rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff; font-weight: bold; cursor: pointer;">
            <i class="fas fa-star"></i> Endorse
          </button>
        </div>

        ${connectionStatus === 'accepted' ? `
          <button onclick="inviteToProject('${profile.id}')" style="width: 100%; padding: 0.75rem; background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); border-radius: 8px; color: #00ff88; font-weight: bold; cursor: pointer;">
            <i class="fas fa-plus-circle"></i> Invite to Project
          </button>
        ` : ''}
      `}
    </div>
  `;

  panelElement.innerHTML = html;
}

// Render project panel
async function renderProjectPanel(nodeData) {
  // Fetch full project data
  const { data: project, error } = await supabase
    .from('projects')
    .select(`
      *,
      creator:community!projects_creator_id_fkey(name, image_url),
      project_members(
        user:community(name, image_url)
      )
    `)
    .eq('id', nodeData.id)
    .single();

  if (error || !project) {
    throw error;
  }

  // Check if user is already a member
  const isMember = project.project_members?.some(m => m.user.id === currentUserProfile?.id);

  let html = `
    <div style="padding: 2rem; padding-bottom: 100px;">
      <!-- Close Button -->
      <button onclick="closeNodePanel()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem;">
        <i class="fas fa-times"></i>
      </button>

      <!-- Project Header -->
      <div style="margin-bottom: 2rem;">
        <div style="width: 80px; height: 80px; border-radius: 16px; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: white; margin: 0 auto 1rem; border: 3px solid #ff6b6b;">
          <i class="fas fa-lightbulb"></i>
        </div>

        <h2 style="color: #ff6b6b; font-size: 1.75rem; margin-bottom: 0.5rem; text-align: center;">${project.title}</h2>

        <div style="text-align: center; margin-bottom: 1rem;">
          <span style="background: rgba(255,107,107,0.2); color: #ff6b6b; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">
            ${project.status}
          </span>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: center; font-size: 0.9rem; color: #aaa;">
          <div>
            <i class="fas fa-users"></i> ${project.project_members?.length || 0} members
          </div>
          <div>
            <i class="fas fa-eye"></i> ${project.view_count || 0} views
          </div>
        </div>
      </div>

      <!-- Description -->
      <div style="margin-bottom: 2rem;">
        <h3 style="color: #ff6b6b; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
          <i class="fas fa-info-circle"></i> Description
        </h3>
        <p style="color: #ddd; line-height: 1.6;">${project.description || 'No description provided'}</p>
      </div>

      <!-- Required Skills -->
      ${project.required_skills && project.required_skills.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #ff6b6b; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-code"></i> Required Skills
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            ${project.required_skills.map(skill => `
              <span style="background: rgba(255,107,107,0.1); color: #ff6b6b; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; border: 1px solid rgba(255,107,107,0.3);">
                ${skill}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Team Members -->
      ${project.project_members && project.project_members.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #ff6b6b; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-users"></i> Team Members
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
            ${project.project_members.map(member => {
              const user = member.user;
              const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
              return `
                <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,107,107,0.05); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,107,107,0.2);">
                  ${user.image_url ?
                    `<img src="${user.image_url}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">` :
                    `<div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: white;">${initials}</div>`
                  }
                  <span style="color: white; font-size: 0.85rem;">${user.name}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Creator Info -->
      ${project.creator ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #ff6b6b; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-user-circle"></i> Created By
          </h3>
          <div style="display: flex; align-items: center; gap: 1rem; background: rgba(255,107,107,0.05); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,107,107,0.2);">
            ${project.creator.image_url ?
              `<img src="${project.creator.image_url}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">` :
              `<div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; color: white;">${project.creator.name[0]}</div>`
            }
            <div>
              <div style="color: white; font-weight: bold;">${project.creator.name}</div>
              <div style="color: #aaa; font-size: 0.85rem;">Project Creator</div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Action Bar -->
    <div style="position: fixed; bottom: 0; right: 0; width: 420px; background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border-top: 2px solid rgba(255, 107, 107, 0.5); padding: 1.5rem; backdrop-filter: blur(10px);">
      ${isMember ? `
        <div style="text-align: center; color: #00ff88; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-check-circle"></i> You're a member of this project
        </div>
      ` : `
        <button onclick="joinProjectFromPanel('${project.id}')" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem; margin-bottom: 0.75rem;">
          <i class="fas fa-plus-circle"></i> Join Project
        </button>
      `}

      <button onclick="viewProjectDetails('${project.id}')" style="width: 100%; padding: 0.75rem; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 8px; color: #ff6b6b; font-weight: bold; cursor: pointer;">
        <i class="fas fa-eye"></i> View Full Details
      </button>
    </div>
  `;

  panelElement.innerHTML = html;
}

// Helper functions
async function getMutualConnections(userId) {
  if (!currentUserProfile) return [];

  try {
    // Get current user's connections
    const { data: myConnections } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .eq('status', 'accepted');

    // Get target user's connections
    const { data: theirConnections } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .eq('status', 'accepted');

    // Find mutual connections
    const myConnectionIds = new Set();
    myConnections?.forEach(conn => {
      const otherId = conn.from_user_id === currentUserProfile.id ? conn.to_user_id : conn.from_user_id;
      myConnectionIds.add(otherId);
    });

    const mutualIds = [];
    theirConnections?.forEach(conn => {
      const otherId = conn.from_user_id === userId ? conn.to_user_id : conn.from_user_id;
      if (myConnectionIds.has(otherId)) {
        mutualIds.push(otherId);
      }
    });

    // Get profiles for mutual connections
    if (mutualIds.length === 0) return [];

    const { data: mutuals } = await supabase
      .from('community')
      .select('id, name, image_url')
      .in('id', mutualIds);

    return mutuals || [];

  } catch (error) {
    console.error('Error getting mutual connections:', error);
    return [];
  }
}

async function getSharedProjects(userId) {
  if (!currentUserProfile) return [];

  try {
    // Get projects where both users are members
    const { data: myProjects } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', currentUserProfile.id);

    const { data: theirProjects } = await supabase
      .from('project_members')
      .select('project_id, projects(id, title)')
      .eq('user_id', userId);

    const myProjectIds = new Set(myProjects?.map(p => p.project_id) || []);
    const shared = theirProjects?.filter(tp => myProjectIds.has(tp.project_id)) || [];

    return shared.map(s => s.projects);

  } catch (error) {
    console.error('Error getting shared projects:', error);
    return [];
  }
}

// Action handlers (these will be attached to window)
window.closeNodePanel = closeNodePanel;

window.sendConnectionFromPanel = async function(userId) {
  try {
    await window.sendConnectionRequest(userId);
    // Reload panel to update connection status
    await loadNodeDetails(currentNodeData);
  } catch (error) {
    console.error('Error sending connection:', error);
    alert('Failed to send connection request');
  }
};

window.sendMessage = function(userId) {
  // Open messages modal with this user
  closeNodePanel();
  window.startNewConversation(userId, currentNodeData.name, userId);
  window.openMessagesModal();
};

window.endorseSkill = function(userId) {
  // Open endorsement modal
  alert('Endorse skill feature - integrate with endorsements modal');
};

window.inviteToProject = function(userId) {
  // Open project invitation modal
  alert('Invite to project feature - coming soon!');
};

window.joinProjectFromPanel = async function(projectId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to join a project');
      return;
    }

    // Add user to project_members
    const { error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: currentUserProfile.id
      });

    if (error) throw error;

    alert('Successfully joined project!');
    // Reload panel
    await loadNodeDetails(currentNodeData);

  } catch (error) {
    console.error('Error joining project:', error);
    alert('Failed to join project: ' + error.message);
  }
};

window.viewProjectDetails = function(projectId) {
  closeNodePanel();
  // Open project details in projects modal
  window.openProjectsModal();
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNodePanel();
});

console.log('✅ Node panel ready');
