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
        <button onclick="closeNodePanel(); window.openProfileEditor?.();" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem;">
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

window.endorseSkill = async function(userId) {
  try {
    const { data: profile } = await supabase
      .from('community')
      .select('name, skills')
      .eq('id', userId)
      .single();

    if (!profile || !profile.skills) {
      alert('No skills to endorse');
      return;
    }

    const skills = profile.skills.split(',').map(s => s.trim());

    // Create selection modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    modal.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(0, 224, 255, 0.5); border-radius: 16px; padding: 2rem; max-width: 500px; width: 90%;">
        <h2 style="color: #00e0ff; margin-bottom: 1rem;">
          <i class="fas fa-star"></i> Endorse ${profile.name}
        </h2>
        <p style="color: #ddd; margin-bottom: 1.5rem;">Select a skill to endorse:</p>

        <div id="skill-selection" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; max-height: 300px; overflow-y: auto;">
          ${skills.map(skill => `
            <button onclick="confirmEndorsement('${userId}', '${skill.replace(/'/g, "\\'")}', '${profile.name.replace(/'/g, "\\'")}', this)" style="padding: 1rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; text-align: left; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.2)'" onmouseout="this.style.background='rgba(0,224,255,0.1)'">
              <div style="font-weight: bold; font-size: 1rem; margin-bottom: 0.25rem;">${skill}</div>
              <div style="color: #aaa; font-size: 0.85rem;">Click to endorse</div>
            </button>
          `).join('')}
        </div>

        <button onclick="this.closest('[style*=\\'position: fixed\\']').remove()" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (error) {
    console.error('Error showing endorsement modal:', error);
    alert('Failed to load skills');
  }
};

window.confirmEndorsement = async function(userId, skill, userName, button) {
  button.disabled = true;
  button.style.opacity = '0.5';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to endorse');
      return;
    }

    const { data: endorserProfile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!endorserProfile) {
      alert('Profile not found');
      return;
    }

    // Check if already endorsed
    const { data: existing } = await supabase
      .from('endorsements')
      .select('id')
      .eq('endorser_community_id', endorserProfile.id)
      .eq('endorsed_community_id', userId)
      .eq('skill', skill)
      .single();

    if (existing) {
      alert('You already endorsed this skill!');
      return;
    }

    // Insert endorsement
    const { error } = await supabase
      .from('endorsements')
      .insert({
        endorser_id: user.id,
        endorser_community_id: endorserProfile.id,
        endorsed_id: userId,
        endorsed_community_id: userId,
        skill: skill
      });

    if (error) throw error;

    // Close modal
    button.closest('[style*="position: fixed"]').remove();

    // Show success
    showToastNotification(`✨ You endorsed ${userName} for ${skill}!`, 'success');

    // Reload panel to show updated endorsements
    if (currentNodeData) {
      await loadNodeDetails(currentNodeData);
    }

  } catch (error) {
    console.error('Error endorsing skill:', error);
    alert('Failed to endorse: ' + error.message);
    button.disabled = false;
    button.style.opacity = '1';
  }
};

function showToastNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: ${type === 'success' ? 'linear-gradient(135deg, #00ff88, #00cc66)' : 'linear-gradient(135deg, #00e0ff, #0080ff)'};
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10001;
    font-weight: bold;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.inviteToProject = async function(userId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert('Please log in to invite to projects');
      return;
    }

    const { data: currentProfile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!currentProfile) {
      alert('Profile not found');
      return;
    }

    // Get user's name for display
    const { data: targetProfile } = await supabase
      .from('community')
      .select('name')
      .eq('id', userId)
      .single();

    // Get projects where current user is creator
    const { data: projects } = await supabase
      .from('projects')
      .select('id, title, description, status')
      .eq('creator_id', currentProfile.id)
      .in('status', ['open', 'active', 'in-progress']);

    if (!projects || projects.length === 0) {
      alert('You need to create a project first!');
      return;
    }

    // Check which projects the target user is already in
    const { data: existingMemberships } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', userId);

    const existingProjectIds = new Set(existingMemberships?.map(m => m.project_id) || []);
    const availableProjects = projects.filter(p => !existingProjectIds.has(p.id));

    if (availableProjects.length === 0) {
      alert(`${targetProfile?.name || 'This user'} is already in all your active projects!`);
      return;
    }

    // Create project selection modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    modal.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(255, 107, 107, 0.5); border-radius: 16px; padding: 2rem; max-width: 600px; width: 90%;">
        <h2 style="color: #ff6b6b; margin-bottom: 1rem;">
          <i class="fas fa-plus-circle"></i> Invite ${targetProfile?.name || 'User'} to Project
        </h2>
        <p style="color: #ddd; margin-bottom: 1.5rem;">Select a project to invite them to:</p>

        <div id="project-selection" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; max-height: 400px; overflow-y: auto;">
          ${availableProjects.map(project => `
            <button onclick="confirmProjectInvitation('${userId}', '${project.id}', '${project.title.replace(/'/g, "\\'")}', '${targetProfile?.name?.replace(/'/g, "\\'") || 'User'}', this)" style="padding: 1.25rem; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.3); border-radius: 8px; color: white; text-align: left; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,107,107,0.2)'" onmouseout="this.style.background='rgba(255,107,107,0.1)'">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div style="font-weight: bold; font-size: 1.1rem; color: #ff6b6b;">${project.title}</div>
                <div style="background: rgba(255,107,107,0.2); padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; color: #ff6b6b;">${project.status}</div>
              </div>
              ${project.description ? `<div style="color: #aaa; font-size: 0.9rem; line-height: 1.4;">${project.description.substring(0, 100)}${project.description.length > 100 ? '...' : ''}</div>` : ''}
            </button>
          `).join('')}
        </div>

        <button onclick="this.closest('[style*=\\'position: fixed\\']').remove()" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(modal);

  } catch (error) {
    console.error('Error showing project invitation modal:', error);
    alert('Failed to load projects: ' + error.message);
  }
};

window.confirmProjectInvitation = async function(userId, projectId, projectTitle, userName, button) {
  button.disabled = true;
  button.style.opacity = '0.5';
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inviting...';

  try {
    // Add user to project_members
    const { error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: userId,
        role: 'member'
      });

    if (error) throw error;

    // Close modal
    button.closest('[style*="position: fixed"]').remove();

    // Show success
    showToastNotification(`🎉 ${userName} has been added to ${projectTitle}!`, 'success');

    // Log activity
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('activity_log')
        .insert({
          auth_user_id: user.id,
          action_type: 'project_member_added',
          details: {
            project_id: projectId,
            invited_user_id: userId,
            project_title: projectTitle
          }
        });
    } catch (logError) {
      console.error('Error logging activity:', logError);
    }

  } catch (error) {
    console.error('Error inviting to project:', error);
    alert('Failed to invite: ' + error.message);
    button.disabled = false;
    button.style.opacity = '1';
    button.innerHTML = projectTitle;
  }
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


// ========================
// EDIT PROFILE (Modal)
// ========================
// The panel HTML calls window.openProfileEditor?.() for your own node.
// This function was missing, so the "Edit Profile" button did nothing.
// We create a lightweight modal editor and persist changes to the `community` table.
window.openProfileEditor = async function () {
  try {
    if (!supabase) supabase = window.supabase;
    if (!supabase) throw new Error("Supabase client not available on window.supabase");

    // Ensure we have the latest current user profile
    if (!currentUserProfile?.id) {
      // Try to hydrate from auth user_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Please log in to edit your profile.");
        return;
      }
      const { data: profileRow, error } = await supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      currentUserProfile = profileRow;
    }

    const modal = ensureProfileEditorModal();
    hydrateProfileEditorFields(modal, currentUserProfile);
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
  } catch (e) {
    console.error("openProfileEditor failed:", e);
    alert("Could not open profile editor: " + (e?.message || e));
  }
};

function ensureProfileEditorModal() {
  let modal = document.getElementById("profile-editor-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "profile-editor-modal";
  modal.style.cssText = `
    position: fixed; inset: 0;
    z-index: 10050;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; pointer-events: none;
    transition: opacity .2s ease;
  `;

  // Active-state CSS (so opacity/pointer-events work reliably)
  if (!document.getElementById("profile-editor-modal-style")) {
    const s = document.createElement("style");
    s.id = "profile-editor-modal-style";
    s.textContent = `
      #profile-editor-modal.active { opacity: 1 !important; pointer-events: auto !important; }
      #profile-editor-modal input:focus, #profile-editor-modal textarea:focus { border-color: rgba(0,224,255,.65); box-shadow: 0 0 0 3px rgba(0,224,255,.18); }
    `;
    document.head.appendChild(s);
  }

  modal.innerHTML = `
    <div id="profile-editor-card" style="
      width: min(720px, 92vw);
      max-height: 90vh;
      overflow: auto;
      background: linear-gradient(135deg, rgba(10,14,39,.98), rgba(26,26,46,.98));
      border: 2px solid rgba(0,224,255,.55);
      border-radius: 16px;
      box-shadow: 0 24px 80px rgba(0,224,255,.22);
      padding: 1.5rem 1.5rem 1.25rem;
    ">
      <div style="display:flex; align-items:center; justify-content:space-between; gap: 1rem; margin-bottom: 1rem;">
        <div>
          <div style="color:#00e0ff; font-weight: 800; letter-spacing: 0.02em; font-size: 1.1rem;">
            Edit Profile
          </div>
          <div style="color:#a9b2c7; font-size: .9rem; margin-top: .15rem;">
            Update how you appear across the Synapse network.
          </div>
        </div>
        <button id="profile-editor-close" title="Close" aria-label="Close" style="
          width: 40px; height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08);
          color: white;
          cursor: pointer;
        ">
          ✕
        </button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div style="grid-column: 1 / -1;">
          <label style="display:block; color:#fff; font-weight:700; margin-bottom:.35rem;">Name</label>
          <input id="pe-name" type="text" placeholder="Your name" style="${inputStyle()}">
        </div>

        <div>
          <label style="display:block; color:#fff; font-weight:700; margin-bottom:.35rem;">Avatar Image URL</label>
          <input id="pe-image-url" type="url" placeholder="https://…" style="${inputStyle()}">
          <div style="color:#7e89a6; font-size:.8rem; margin-top:.35rem;">Optional. Leave blank to use initials.</div>
        </div>

        <div>
          <label style="display:block; color:#fff; font-weight:700; margin-bottom:.35rem;">Availability</label>
          <input id="pe-availability" type="text" placeholder="e.g., Evenings / Weekends" style="${inputStyle()}">
        </div>

        <div style="grid-column: 1 / -1;">
          <label style="display:block; color:#fff; font-weight:700; margin-bottom:.35rem;">Skills</label>
          <input id="pe-skills" type="text" placeholder="Comma-separated (e.g., AI, Design, Radiology)" style="${inputStyle()}">
        </div>

        <div style="grid-column: 1 / -1;">
          <label style="display:block; color:#fff; font-weight:700; margin-bottom:.35rem;">Interests</label>
          <input id="pe-interests" type="text" placeholder="Comma-separated (optional)" style="${inputStyle()}">
        </div>

        <div style="grid-column: 1 / -1;">
          <label style="display:block; color:#fff; font-weight:700; margin-bottom:.35rem;">Bio</label>
          <textarea id="pe-bio" rows="4" placeholder="A short bio…" style="${textareaStyle()}"></textarea>
        </div>
      </div>

      <div style="display:flex; gap:.75rem; justify-content:flex-end; margin-top: 1.25rem;">
        <button id="profile-editor-cancel" style="${secondaryBtnStyle()}">Cancel</button>
        <button id="profile-editor-save" style="${primaryBtnStyle()}">
          <span class="label">Save Changes</span>
        </button>
      </div>

      <div id="profile-editor-status" style="margin-top:.9rem; color:#7e89a6; font-size:.85rem; min-height: 1.1rem;"></div>
    </div>
  `;

  // Close when clicking backdrop (but not the card)
  modal.addEventListener("click", (e) => {
    const card = modal.querySelector("#profile-editor-card");
    if (card && !card.contains(e.target)) closeProfileEditorModal();
  });

  document.body.appendChild(modal);

  // Wire buttons
  modal.querySelector("#profile-editor-close")?.addEventListener("click", closeProfileEditorModal);
  modal.querySelector("#profile-editor-cancel")?.addEventListener("click", closeProfileEditorModal);
  modal.querySelector("#profile-editor-save")?.addEventListener("click", saveProfileEditor);

  // Escape key closes
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) closeProfileEditorModal();
  });

  // Activate animation on next frame
  requestAnimationFrame(() => {
    if (modal.classList.contains("active")) modal.style.opacity = "1";
  });

  return modal;
}

function closeProfileEditorModal() {
  const modal = document.getElementById("profile-editor-modal");
  if (!modal) return;
  modal.classList.remove("active");
  modal.style.opacity = "0";
  modal.style.pointerEvents = "none";
  document.body.style.overflow = "";
}

function openProfileEditorModal() {
  const modal = ensureProfileEditorModal();
  modal.classList.add("active");
  modal.style.opacity = "1";
  modal.style.pointerEvents = "auto";
  document.body.style.overflow = "hidden";
}

function inputStyle() {
  return `
    width: 100%;
    padding: 0.8rem 0.9rem;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: white;
    outline: none;
  `;
}

function textareaStyle() {
  return `
    width: 100%;
    padding: 0.8rem 0.9rem;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: white;
    outline: none;
    resize: vertical;
  `;
}

function primaryBtnStyle() {
  return `
    padding: 0.8rem 1rem;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    font-weight: 800;
    color: #061018;
    background: linear-gradient(135deg, #00e0ff, #0080ff);
  `;
}

function secondaryBtnStyle() {
  return `
    padding: 0.8rem 1rem;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.18);
    cursor: pointer;
    font-weight: 700;
    color: white;
    background: rgba(255,255,255,0.08);
  `;
}

function hydrateProfileEditorFields(modal, profile) {
  // Ensure active/open styles
  openProfileEditorModal();

  const name = profile?.name ?? "";
  const bio = profile?.bio ?? "";
  const skills = normalizeCommaList(profile?.skills);
  const availability = profile?.availability ?? "";
  const imageUrl = profile?.image_url ?? "";
  const interests = normalizeCommaList(profile?.interests);

  modal.querySelector("#pe-name").value = name;
  modal.querySelector("#pe-bio").value = bio;
  modal.querySelector("#pe-skills").value = skills;
  modal.querySelector("#pe-availability").value = availability;
  modal.querySelector("#pe-image-url").value = imageUrl;
  modal.querySelector("#pe-interests").value = interests;

  setEditorStatus("");
}

function normalizeCommaList(value) {
  if (!value) return "";
  // interests might be an array in some schemas; skills is usually text
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "string") return value;
  try { return String(value); } catch { return ""; }
}

function parseCommaList(text) {
  const raw = (text || "").split(",").map(s => s.trim()).filter(Boolean);
  return raw;
}

function setEditorStatus(msg, isError = false) {
  const el = document.getElementById("profile-editor-status");
  if (!el) return;
  el.style.color = isError ? "#ff7b7b" : "#7e89a6";
  el.textContent = msg || "";
}

async function saveProfileEditor() {
  const modal = document.getElementById("profile-editor-modal");
  if (!modal) return;

  const saveBtn = modal.querySelector("#profile-editor-save");
  const label = saveBtn?.querySelector(".label");
  if (saveBtn) saveBtn.disabled = true;
  if (label) label.textContent = "Saving…";
  setEditorStatus("Saving changes…");

  try {
    if (!currentUserProfile?.id) throw new Error("No current profile loaded.");

    const name = modal.querySelector("#pe-name").value.trim();
    const bio = modal.querySelector("#pe-bio").value.trim();
    const skillsText = modal.querySelector("#pe-skills").value.trim();
    const availability = modal.querySelector("#pe-availability").value.trim();
    const image_url = modal.querySelector("#pe-image-url").value.trim();
    const interestsText = modal.querySelector("#pe-interests").value.trim();

    if (!name) throw new Error("Name is required.");

    // Keep schema-flexible:
    // - skills: stored as text (comma separated) in your table
    // - interests: stored as ARRAY in some versions; we will send an array if non-empty, else null
    const interestsArray = parseCommaList(interestsText);

    const payload = {
      name,
      bio,
      skills: skillsText || null,
      availability: availability || null,
      image_url: image_url || null
    };

    // Only include interests if the column exists in your DB.
    // Since we can't introspect columns here reliably, we include it but tolerate failure.
    payload.interests = interestsArray.length ? interestsArray : null;

    const { data, error } = await supabase
      .from("community")
      .update(payload)
      .eq("id", currentUserProfile.id)
      .select("*")
      .single();

    if (error) {
      // If interests caused an error (schema mismatch), retry without interests.
      if ((error.message || "").toLowerCase().includes("interests")) {
        console.warn("Retrying profile update without interests due to schema mismatch.");
        delete payload.interests;
        const retry = await supabase
          .from("community")
          .update(payload)
          .eq("id", currentUserProfile.id)
          .select("*")
          .single();
        if (retry.error) throw retry.error;
        currentUserProfile = retry.data;
      } else {
        throw error;
      }
    } else {
      currentUserProfile = data;
    }

    setEditorStatus("✅ Saved! Updating UI…");

    // Let the rest of the app re-hydrate the profile
    try {
      window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { profile: currentUserProfile } }));
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: { profile: currentUserProfile } }));
    } catch {}

    // If the panel is currently showing your own profile, refresh it
    try {
      if (currentNodeData?.id === currentUserProfile.id) {
        await loadNodeDetails({ ...currentNodeData, id: currentUserProfile.id, type: "person" });
      }
    } catch {}

    // Close after a beat
    setTimeout(() => closeProfileEditorModal(), 250);

  } catch (e) {
    console.error("saveProfileEditor failed:", e);
    setEditorStatus("❌ " + (e?.message || e), true);
    alert("Failed to save profile: " + (e?.message || e));
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (label) label.textContent = "Save Changes";
  }
}


// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNodePanel();
});

console.log('✅ Node panel ready');
