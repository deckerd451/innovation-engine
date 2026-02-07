// ================================================================
// NODE SIDE PANEL
// ================================================================
// Actionable side panel that appears when clicking network nodes
// Shows profile details, mutual connections, and clear CTAs

const NODE_PANEL_VERSION = 'v2.2-' + Date.now();
console.log(`%c👤 Node Panel ${NODE_PANEL_VERSION} (Project Approval Fix)`, "color:#0ff; font-weight: bold; font-size: 16px");

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

  // Expose functions globally
  window.createProjectInTheme = createProjectInTheme;

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
    background: linear-gradient(135deg, rgba(10, 14, 39, 0.73), rgba(26, 26, 46, 0.73));
    border-left: 2px solid rgba(0, 224, 255, 0.5);
    backdrop-filter: blur(10px);
    z-index: 2000;
    overflow-y: auto;
    overflow-x: hidden;
    transition: right 0.3s ease-out;
    box-shadow: -5px 0 30px rgba(0, 0, 0, 0.5);
  `;

  // Custom scrollbar and collapsible section styles
  const style = document.createElement('style');
  style.textContent = `
    /* Mobile responsive styles for node panel */
    @media (max-width: 768px) {
      #node-side-panel {
        width: 100vw !important;
        right: -100vw !important;
        border-left: none !important;
        height: 100vh !important;
        height: 100dvh !important; /* Dynamic viewport height for mobile browsers */
      }
      
      #node-side-panel.open {
        right: 0 !important;
      }
      
      /* Adjust padding for mobile */
      #node-side-panel .node-panel-header {
        padding: 1rem !important;
      }
      
      #node-side-panel .panel-section-header {
        padding: 0.75rem 1rem !important;
      }
      
      /* Make buttons stack on mobile */
      #node-side-panel .action-buttons,
      #node-side-panel [style*="display: flex"][style*="gap"] {
        flex-direction: column !important;
        gap: 0.5rem !important;
      }
      
      #node-side-panel button[style*="flex: 1"] {
        width: 100% !important;
        flex: none !important;
      }
      
      /* Adjust font sizes for mobile */
      #node-side-panel h2 {
        font-size: 1.25rem !important;
      }
      
      #node-side-panel h3 {
        font-size: 1.1rem !important;
      }
      
      /* Make profile images smaller on mobile */
      #node-side-panel img[style*="width: 120px"],
      #node-side-panel img[style*="width: 100px"] {
        width: 80px !important;
        height: 80px !important;
      }
      
      /* Adjust skill tags for mobile */
      #node-side-panel [style*="flex-wrap: wrap"] {
        gap: 0.35rem !important;
      }
      
      #node-side-panel [style*="flex-wrap: wrap"] > * {
        font-size: 0.75rem !important;
        padding: 0.25rem 0.5rem !important;
      }
    }
    
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
    
    /* Collapsible section styles */
    .panel-section {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .panel-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      cursor: pointer;
      background: rgba(0, 224, 255, 0.05);
      transition: background 0.2s;
    }
    
    .panel-section-header:hover {
      background: rgba(0, 224, 255, 0.1);
    }
    
    .panel-section-title {
      color: #00e0ff;
      font-weight: 700;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .panel-section-toggle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.9rem;
      transition: transform 0.3s;
    }
    
    .panel-section-toggle.collapsed {
      transform: rotate(-90deg);
    }
    
    .panel-section-content {
      max-height: 1000px;
      overflow: hidden;
      transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 1;
    }
    
    .panel-section-content.collapsed {
      max-height: 0;
      opacity: 0;
    }
    
    .panel-section-inner {
      padding: 1rem 1.5rem;
    }

    /* Responsive styles for mobile */
    @media (max-width: 768px) {
      #node-side-panel {
        width: 100vw !important;
        right: -100vw !important;
      }
      
      #node-side-panel.open {
        right: 0 !important;
      }
      
      /* Make action bars full width on mobile */
      #node-side-panel [style*="width: 420px"] {
        width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(panelElement);
}

// Toggle collapsible section
window.togglePanelSection = function(sectionId) {
  const content = document.getElementById(`${sectionId}-content`);
  const toggle = document.getElementById(`${sectionId}-toggle`);
  
  if (!content || !toggle) return;
  
  const isCollapsed = content.classList.contains('collapsed');
  
  if (isCollapsed) {
    content.classList.remove('collapsed');
    toggle.classList.remove('collapsed');
  } else {
    content.classList.add('collapsed');
    toggle.classList.add('collapsed');
  }
};

// Open panel with node data
export async function openNodePanel(nodeData) {
  console.log('Opening panel for node:', nodeData);

  currentNodeData = nodeData;

  // Show panel
  panelElement.style.right = '0';
  panelElement.classList.add('open');

  // Load full data
  await loadNodeDetails(nodeData);
  
  // Update presence for this user (if it's a person)
  if (nodeData.type === 'person' && window.PresenceUI) {
    const userId = nodeData.user_id || nodeData.id;
    window.PresenceUI.updatePresenceForUser(userId);
    
    // Dispatch event for presence UI
    window.dispatchEvent(new CustomEvent('profile-panel-opened', {
      detail: { userId }
    }));
  }
}

// Close panel
export function closeNodePanel() {
  // Check if mobile
  const isMobile = window.innerWidth <= 768;
  panelElement.style.right = isMobile ? '-100vw' : '-450px';
  panelElement.classList.remove('open');
  currentNodeData = null;
}

// Load complete node details
async function loadNodeDetails(nodeData) {
  // Show loading state
  panelElement.innerHTML = `
    <div style="padding: 2rem; text-align: center; color: #00e0ff;">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
      <p style="margin-top: 1rem;">Loading...</p>
    </div>
  `;

  try {
    // Check if this is a theme lens view
    if (nodeData.isThemeLens) {
      await renderThemeLensPanel(nodeData);
      return;
    }

    // Determine node type and render appropriate panel
    if (nodeData.type === 'project') {
      await renderProjectPanel(nodeData);
    } else if (nodeData.type === 'organization') {
      await renderOrganizationPanel(nodeData);
    } else {
      await renderPersonPanel(nodeData);
    }

  } catch (error) {
    console.error('Error loading node details:', error);
    panelElement.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ff6666;">
        <i class="fas fa-exclamation-circle" style="font-size: 2rem;"></i>
        <p style="margin-top: 1rem;">Error loading details</p>
      </div>
    `;
  }
}

// Render theme lens panel (shows projects within theme)
async function renderThemeLensPanel(themeData) {
  const { name, description, tags, expires_at, relatedProjects, onClearFocus } = themeData;

  // Get current user info
  let currentUserCommunityId = null;
  let isCreator = false;
  let isParticipant = false;
  
  // Remove 'theme:' prefix from theme ID
  const cleanThemeId = themeData.id ? themeData.id.replace(/^theme:/, '') : null;
  
  try {
    const user = await window.bootstrapSession.getAuthUser();
    if (user) {
      const { data: currentUserProfile } = await supabase
        .from('community')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      currentUserCommunityId = currentUserProfile?.id;

      // Check if user created this theme
      isCreator = themeData.created_by === currentUserCommunityId;
      
      // Check if user is a participant
      if (cleanThemeId && currentUserCommunityId) {
        try {
          const { data: participation } = await supabase
            .from('theme_participants')
            .select('id')
            .eq('theme_id', cleanThemeId)
            .eq('community_id', currentUserCommunityId)
            .maybeSingle();
          
          isParticipant = !!participation;
          console.log('Participation check:', { cleanThemeId, currentUserCommunityId, isParticipant });
        } catch (err) {
          console.warn('Error checking participation:', err);
          isParticipant = false;
        }
      }
    }
  } catch (error) {
    console.error('Error checking user status:', error);
  }

  // Calculate time remaining
  const now = Date.now();
  const expires = new Date(expires_at).getTime();
  const remaining = expires - now;
  const daysRemaining = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const timeText = daysRemaining > 1 ? `${daysRemaining} days left` : `${Math.floor(remaining / (1000 * 60 * 60))} hours left`;

  panelElement.innerHTML = `
    <div class="node-panel-header" style="background: linear-gradient(135deg, rgba(0,224,255,0.15), rgba(0,224,255,0.05)); padding: 1.5rem; border-bottom: 1px solid rgba(0,224,255,0.3);">
      <div style="display: flex; justify-content: space-between; align-items: start;">
        <div style="flex: 1;">
          <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.5rem;">
            ✨ ${escapeHtml(name)}
          </h2>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">
            Theme Circle • ${timeText}
          </div>
        </div>
        <button onclick="window.closeNodePanel?.()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; flex-shrink: 0;">
          <i class="fas fa-times"></i>
        </button>
      </div>

      ${description ? `
        <p style="margin-top: 1rem; color: rgba(255,255,255,0.8); line-height: 1.5;">
          ${escapeHtml(description)}
        </p>
      ` : ''}

      ${tags && tags.length > 0 ? `
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
          ${tags.map(tag => `
            <span style="padding: 0.25rem 0.75rem; background: rgba(0,224,255,0.2); border: 1px solid rgba(0,224,255,0.4); border-radius: 12px; font-size: 0.8rem; color: #00e0ff;">
              ${escapeHtml(tag)}
            </span>
          `).join('')}
        </div>
      ` : ''}
      
      ${currentUserCommunityId ? `
        <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
          ${!isParticipant && !isCreator ? `
            <button onclick="joinTheme('${themeData.id}', '${escapeHtml(name)}')"
              onmouseover="this.style.background='linear-gradient(135deg, rgba(0,224,255,0.3), rgba(0,224,255,0.2))'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,224,255,0.4)';"
              onmouseout="this.style.background='linear-gradient(135deg, rgba(0,224,255,0.2), rgba(0,224,255,0.1))'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
              style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, rgba(0,224,255,0.2), rgba(0,224,255,0.1)); border: 1px solid rgba(0,224,255,0.4); 
              border-radius: 8px; color: #00e0ff; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;">
              <i class="fas fa-user-plus"></i> Join Theme
            </button>
          ` : ''}
          ${isCreator ? `
            <button onclick="deleteTheme('${themeData.id}', '${escapeHtml(name)}')"
              onmouseover="this.style.background='rgba(255,68,68,0.25)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(255,68,68,0.3)';"
              onmouseout="this.style.background='rgba(255,68,68,0.15)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
              style="flex: 1; padding: 0.75rem; background: rgba(255,68,68,0.15); border: 1px solid rgba(255,68,68,0.4); 
              border-radius: 8px; color: #ff4444; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;">
              <i class="fas fa-trash"></i> Delete Theme
            </button>
          ` : ''}
          ${isParticipant && !isCreator ? `
            <button onclick="leaveTheme('${themeData.id}', '${escapeHtml(name)}')"
              onmouseover="this.style.background='rgba(255,170,0,0.25)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(255,170,0,0.3)';"
              onmouseout="this.style.background='rgba(255,170,0,0.15)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
              style="flex: 1; padding: 0.75rem; background: rgba(255,170,0,0.15); border: 1px solid rgba(255,170,0,0.4); 
              border-radius: 8px; color: #ffaa00; cursor: pointer; font-weight: 600; font-size: 0.9rem; transition: all 0.2s;">
              <i class="fas fa-sign-out-alt"></i> Leave Theme
            </button>
          ` : ''}
        </div>
      ` : ''}
    </div>

    <div class="theme-lens-content" style="padding: 1.5rem;">
      ${relatedProjects && relatedProjects.length > 0 ? `
        <div>
          <h3 style="color: #00e0ff; font-size: 1.1rem; margin: 0 0 1rem 0;">
            <i class="fas fa-lightbulb"></i> Projects in this theme (${relatedProjects.length})
          </h3>
          <div style="display: grid; gap: 1rem;">
            ${relatedProjects.map(project => renderThemeProjectCard(project)).join('')}
          </div>
        </div>
      ` : `
        <div style="text-align: center; padding: 3rem 1rem; color: rgba(255,255,255,0.5);">
          <i class="fas fa-lightbulb" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <p>No projects in this theme yet</p>
          <p style="font-size: 0.9rem; margin-top: 0.5rem;">Be the first to create one!</p>
        </div>
      `}

      <div style="margin-top: 2rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1);">
        <button onclick="createProjectInTheme('${themeData.id}', '${escapeHtml(name)}')"
          style="width: 100%; padding: 0.875rem; background: linear-gradient(135deg, rgba(0,224,255,0.2), rgba(0,224,255,0.1)); border: 1px solid rgba(0,224,255,0.4); border-radius: 8px; color: #00e0ff; cursor: pointer; font-weight: 700; font-size: 1rem;">
          <i class="fas fa-plus-circle"></i> Create Project in ${escapeHtml(name)}
        </button>
      </div>
    </div>
  `;

  // Override close button to also clear theme focus
  const closeBtn = panelElement.querySelector('button[onclick*="closeNodePanel"]');
  if (closeBtn && onClearFocus) {
    closeBtn.onclick = () => {
      closeNodePanel();
      onClearFocus();
    };
  }
}

function renderThemeProjectCard(project) {
  // Create a safe project ID for the onclick handler
  const safeProjectData = JSON.stringify({
    id: project.id,
    title: project.title || project.name,
    name: project.title || project.name,
    description: project.description,
    status: project.status,
    team_size: project.team_size,
    theme_id: project.theme_id
  }).replace(/"/g, '&quot;');

  return `
    <div class="theme-project-card" style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; padding: 1rem; cursor: pointer; transition: all 0.2s;" onclick="window.openProjectDetails(JSON.parse('${safeProjectData}'))">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
        <h4 style="color: #00e0ff; margin: 0; font-size: 1rem;">
          ${escapeHtml(project.name || project.title)}
        </h4>
        <span style="padding: 0.25rem 0.5rem; background: rgba(0,224,255,0.2); border: 1px solid rgba(0,224,255,0.4); border-radius: 4px; font-size: 0.75rem; color: #00e0ff;">
          ${escapeHtml(project.status || 'active')}
        </span>
      </div>

      ${project.description ? `
        <p style="color: rgba(255,255,255,0.7); margin: 0.5rem 0; font-size: 0.9rem; line-height: 1.4;">
          ${escapeHtml(project.description).substring(0, 120)}${project.description.length > 120 ? '...' : ''}
        </p>
      ` : ''}

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem;">
        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">
          <i class="fas fa-users"></i> ${project.team_size || 0} members
        </div>
        <button onclick="event.stopPropagation(); window.joinProjectFromPanel?.('${project.id}');"
          style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #00e0ff, #00a8cc); border: none; border-radius: 6px; color: #000; cursor: pointer; font-weight: 700; font-size: 0.85rem;">
          <i class="fas fa-plus"></i> Join
        </button>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Render organization panel
async function renderOrganizationPanel(nodeData) {
  // Extract the actual organization ID (remove 'org:' prefix if present)
  const orgId = nodeData.id?.startsWith('org:') ? nodeData.id.replace('org:', '') : nodeData.id;

  // Fetch organization data from organizations table
  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();

  if (error || !org) {
    console.error('Error loading organization:', error);
    // Use node data as fallback
    const fallbackOrg = {
      name: nodeData.name || 'Unknown Organization',
      description: nodeData.description || '',
      industry: nodeData.industry || '',
      location: nodeData.location || '',
      website: nodeData.website || '',
      logo_url: nodeData.logo_url || ''
    };
    renderOrganizationContent(fallbackOrg, []);
    return;
  }

  // Try to load members (may fail if table doesn't exist or has RLS issues)
  let members = [];
  try {
    const { data: memberData, error: membersError } = await supabase
      .from('organization_members')
      .select(`
        role,
        community:community_id(id, name, image_url)
      `)
      .eq('organization_id', orgId);

    if (!membersError && memberData) {
      members = memberData;
    }
  } catch (e) {
    console.warn('Could not load organization members:', e);
  }

  renderOrganizationContent(org, members);
}

function renderOrganizationContent(org, members) {
  const initials = org.name ? org.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'ORG';

  let html = `
    <div style="padding: 2rem; padding-bottom: 180px;">
      <!-- Close Button -->
      <button onclick="closeNodePanel()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem;">
        <i class="fas fa-times"></i>
      </button>

      <!-- Organization Header -->
      <div style="margin-bottom: 2rem; text-align: center;">
        <div style="width: 80px; height: 80px; border-radius: 16px; background: linear-gradient(135deg, #a855f7, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 2rem; color: white; margin: 0 auto 1rem; border: 3px solid #a855f7; overflow: hidden;">
          ${org.logo_url ?
            `<img src="${escapeHtml(org.logo_url)}" style="width: 100%; height: 100%; object-fit: cover;">` :
            `<i class="fas fa-building"></i>`
          }
        </div>

        <h2 style="color: #a855f7; font-size: 1.75rem; margin-bottom: 0.5rem;">${escapeHtml(org.name)}</h2>

        ${org.industry ? `
          <div style="margin-bottom: 0.5rem;">
            <span style="background: rgba(168,85,247,0.2); color: #a855f7; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">
              <i class="fas fa-tag"></i> ${escapeHtml(org.industry)}
            </span>
          </div>
        ` : ''}

        ${org.location ? `
          <div style="color: #aaa; font-size: 0.9rem;">
            <i class="fas fa-map-marker-alt"></i> ${escapeHtml(org.location)}
          </div>
        ` : ''}
      </div>

      <!-- Description -->
      ${org.description ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #a855f7; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-info-circle"></i> About
          </h3>
          <p style="color: #ddd; line-height: 1.6;">${escapeHtml(org.description)}</p>
        </div>
      ` : ''}

      <!-- Website -->
      ${org.website ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #a855f7; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-globe"></i> Website
          </h3>
          <a href="${escapeHtml(org.website)}" target="_blank" rel="noopener noreferrer"
             style="color: #a855f7; text-decoration: none; display: inline-flex; align-items: center; gap: 0.5rem;">
            ${escapeHtml(org.website)}
            <i class="fas fa-external-link-alt" style="font-size: 0.8rem;"></i>
          </a>
        </div>
      ` : ''}

      <!-- Members -->
      ${members.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #a855f7; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-users"></i> Members (${members.length})
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
            ${members.map(member => {
              const user = member.community;
              if (!user) return '';
              const memberInitials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
              const roleLabel = member.role === 'owner' ? '(Owner)' : member.role === 'admin' ? '(Admin)' : '';
              return `
                <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(168,85,247,0.05); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(168,85,247,0.2);">
                  ${user.image_url ?
                    `<img src="${escapeHtml(user.image_url)}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">` :
                    `<div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: white;">${memberInitials}</div>`
                  }
                  <span style="color: white; font-size: 0.85rem;">${escapeHtml(user.name)} ${roleLabel}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : `
        <div style="margin-bottom: 2rem; text-align: center; padding: 2rem; background: rgba(168,85,247,0.05); border-radius: 12px; border: 1px dashed rgba(168,85,247,0.3);">
          <i class="fas fa-users" style="font-size: 2rem; color: rgba(168,85,247,0.3); margin-bottom: 0.75rem;"></i>
          <p style="color: rgba(255,255,255,0.5); font-size: 0.9rem;">No members yet or membership data unavailable</p>
        </div>
      `}

      <!-- Join Button -->
      <div style="position: fixed; bottom: 0; left: 0; right: 0; padding: 1rem; background: linear-gradient(to top, rgba(10,14,39,1), rgba(10,14,39,0.9)); border-top: 1px solid rgba(168,85,247,0.3);">
        <button onclick="if(typeof joinOrganization === 'function') joinOrganization('${escapeHtml(org.id)}'); else if(typeof window.joinOrganization === 'function') window.joinOrganization('${escapeHtml(org.id)}'); else alert('Join feature unavailable');"
          style="width: 100%; padding: 1rem; background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 12px; color: white; font-weight: bold; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <i class="fas fa-plus"></i> Join Organization
        </button>
      </div>
    </div>
  `;

  panelElement.innerHTML = html;
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
    const { data: connections } = await supabase
      .from('connections')
      .select('id, status')
      .or(`and(from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${profile.id}),and(from_user_id.eq.${profile.id},to_user_id.eq.${currentUserProfile.id})`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (connections && connections.length > 0) {
      connectionStatus = connections[0].status;
      connectionId = connections[0].id;
    }
  }

  // Get mutual connections
  const mutualConnections = await getMutualConnections(profile.id);

  // Get endorsements
  const { data: endorsementsData } = await supabase
    .from('endorsements')
    .select('skill, endorser_community_id')
    .eq('endorsed_community_id', profile.id)
    .limit(5);
  
  // Fetch endorser names
  let endorsements = [];
  if (endorsementsData && endorsementsData.length > 0) {
    const endorserIds = [...new Set(endorsementsData.map(e => e.endorser_community_id))];
    const { data: endorserProfiles } = await supabase
      .from('community')
      .select('id, name')
      .in('id', endorserIds);
    
    const profileMap = {};
    (endorserProfiles || []).forEach(p => profileMap[p.id] = p);
    endorsements = endorsementsData.map(e => ({
      skill: e.skill,
      endorser: profileMap[e.endorser_community_id]
    }));
  }

  // Get shared projects
  const sharedProjects = await getSharedProjects(profile.id);

  // Track profile view for engagement system
  if (window.DailyEngagement && profile.id !== currentUserProfile?.id) {
    try {
      await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.VIEW_PROFILE, `Viewed ${profile.name}'s profile`);
      await window.DailyEngagement.updateQuestProgress('view_profiles', 1);
    } catch (err) {
      console.warn('Failed to track profile view:', err);
    }
  }

  // Build panel HTML
  const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase();

  let html = `
    <div style="padding-bottom: 180px;">
      <!-- Close Button -->
      <button onclick="closeNodePanel()" style="position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; transition: all 0.2s; z-index: 10;">
        <i class="fas fa-times"></i>
      </button>

      <!-- Profile Header -->
      <div style="text-align: center; padding: 2rem; padding-bottom: 1.5rem;">
        <div style="position: relative; display: inline-block; margin-bottom: 1rem;">
          ${profile.image_url ?
            `<img src="${profile.image_url}" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">` :
            `<div style="width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-size: 3rem; font-weight: bold; color: white; border: 3px solid #00e0ff;">${initials}</div>`
          }
          <!-- Presence Indicator Dot -->
          <div data-presence-user-id="${profile.user_id || profile.id}" 
               style="width: 24px; height: 24px; border-radius: 50%; background-color: #666; border: 3px solid #0a0e27; position: absolute; bottom: 5px; right: 5px; z-index: 10; transition: all 0.3s ease;"
               title="Offline"></div>
        </div>

        <h2 style="color: #00e0ff; font-size: 1.75rem; margin-bottom: 0.5rem;">${profile.name}</h2>

        <!-- Presence Status -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <i class="fas fa-circle" data-presence-status-user-id="${profile.user_id || profile.id}" style="font-size: 0.5rem; color: #666;"></i>
          <span data-presence-status-user-id="${profile.user_id || profile.id}" style="color: #666; font-size: 0.85rem;">offline</span>
        </div>

        <!-- Last Seen -->
        <div data-presence-lastseen-user-id="${profile.user_id || profile.id}" style="color: #888; font-size: 0.75rem; margin-bottom: 0.5rem;">
          Last seen: unknown
        </div>

        ${profile.user_role ? `<div style="color: #aaa; font-size: 0.9rem; margin-bottom: 0.5rem;">${profile.user_role}</div>` : ''}

        <!-- Admin-only: Show email (clickable) -->
        ${(typeof window.isAdminUser === 'function' && window.isAdminUser()) && profile.email ? `
          <a href="mailto:${profile.email}" style="color: rgba(255,170,0,0.9); font-size: 0.85rem; margin-bottom: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(255,170,0,0.1); border: 1px solid rgba(255,170,0,0.3); border-radius: 6px; display: inline-block; text-decoration: none; transition: all 0.2s; cursor: pointer;" onmouseover="this.style.background='rgba(255,170,0,0.2)'; this.style.borderColor='rgba(255,170,0,0.5)'" onmouseout="this.style.background='rgba(255,170,0,0.1)'; this.style.borderColor='rgba(255,170,0,0.3)'">
            <i class="fas fa-envelope"></i> ${profile.email}
          </a>
        ` : ''}

        <!-- Level and Streak Badges (shown on mobile, hidden on desktop) -->
        ${profile.id === currentUserProfile?.id ? `
          <div class="mobile-only-badges" style="display: none; gap: 0.75rem; justify-content: center; margin: 1rem 0; flex-wrap: wrap;">
            <!-- Level Badge -->
            <div style="padding: 0.5rem 1rem; background: rgba(0,224,255,0.15); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; display: flex; flex-direction: column; align-items: center; min-width: 120px;">
              <div style="color: #00e0ff; font-size: 0.75rem; font-weight: 600;">Level 6</div>
              <div style="color: #aaa; font-size: 0.65rem;">Leader</div>
              <div style="color: #888; font-size: 0.6rem; margin-top: 0.25rem;">2173 / 5000 XP</div>
            </div>
            <!-- Streak Badge -->
            <div style="padding: 0.5rem 1rem; background: rgba(255,59,48,0.15); border: 1px solid rgba(255,59,48,0.3); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; min-width: 140px;">
              <i class="fas fa-fire" style="color: #ff3b30; font-size: 1rem;"></i>
              <div style="display: flex; flex-direction: column;">
                <div style="color: #ff3b30; font-size: 0.85rem; font-weight: 700;">25 Day Streak</div>
                <div style="color: #ff8a80; font-size: 0.6rem;">Keep it going!</div>
              </div>
            </div>
          </div>
        ` : ''}

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

      <!-- Bio Section (Collapsible) -->
      ${profile.bio ? `
        <div class="panel-section">
          <div class="panel-section-header" onclick="togglePanelSection('bio')">
            <div class="panel-section-title">
              <i class="fas fa-user"></i> ABOUT
            </div>
            <i class="fas fa-chevron-down panel-section-toggle" id="bio-toggle"></i>
          </div>
          <div class="panel-section-content" id="bio-content">
            <div class="panel-section-inner">
              <p style="color: #ddd; line-height: 1.6; margin: 0;">${profile.bio}</p>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Skills Section (Collapsible) -->
      ${profile.skills ? `
        <div class="panel-section">
          <div class="panel-section-header" onclick="togglePanelSection('skills')">
            <div class="panel-section-title">
              <i class="fas fa-code"></i> SKILLS
            </div>
            <i class="fas fa-chevron-down panel-section-toggle" id="skills-toggle"></i>
          </div>
          <div class="panel-section-content" id="skills-content">
            <div class="panel-section-inner">
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                ${profile.skills.split(',').map(skill => `
                  <span style="background: rgba(0,224,255,0.1); color: #00e0ff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; border: 1px solid rgba(0,224,255,0.3);">
                    ${skill.trim()}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Endorsements Section (Collapsible) -->
      ${endorsements && endorsements.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-header" onclick="togglePanelSection('endorsements')">
            <div class="panel-section-title">
              <i class="fas fa-star"></i> TOP ENDORSEMENTS
            </div>
            <i class="fas fa-chevron-down panel-section-toggle" id="endorsements-toggle"></i>
          </div>
          <div class="panel-section-content" id="endorsements-content">
            <div class="panel-section-inner">
              ${endorsements.slice(0, 3).map(e => `
                <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem;">
                  <div style="color: #00e0ff; font-weight: bold; margin-bottom: 0.25rem;">${e.skill}</div>
                  <div style="color: #aaa; font-size: 0.85rem;">Endorsed by ${e.endorser?.name || 'Unknown'}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Mutual Connections Section (Collapsible) -->
      ${mutualConnections.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-header" onclick="togglePanelSection('mutual')">
            <div class="panel-section-title">
              <i class="fas fa-user-friends"></i> ${mutualConnections.length} MUTUAL CONNECTION${mutualConnections.length !== 1 ? 'S' : ''}
            </div>
            <i class="fas fa-chevron-down panel-section-toggle" id="mutual-toggle"></i>
          </div>
          <div class="panel-section-content" id="mutual-content">
            <div class="panel-section-inner">
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
          </div>
        </div>
      ` : ''}

      <!-- Shared Projects Section (Collapsible) -->
      ${sharedProjects.length > 0 ? `
        <div class="panel-section">
          <div class="panel-section-header" onclick="togglePanelSection('projects')">
            <div class="panel-section-title">
              <i class="fas fa-project-diagram"></i> SHARED PROJECTS
            </div>
            <i class="fas fa-chevron-down panel-section-toggle" id="projects-toggle"></i>
          </div>
          <div class="panel-section-content" id="projects-content">
            <div class="panel-section-inner">
              ${sharedProjects.map(proj => `
                <div style="background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem;">
                  <div style="color: #00e0ff; font-weight: bold;">${proj.title}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Edit Profile Button (Own Profile Only) -->
      ${profile.id === currentUserProfile?.id ? `
        <div style="padding: 1.5rem;">
          <button onclick="closeNodePanel(); window.openProfileEditor?.();" style="width: 100%; padding: 0.85rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 10px; color: white; font-weight: 700; cursor: pointer; font-size: 1rem; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,224,255,0.3);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,224,255,0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,224,255,0.3)';">
            <i class="fas fa-edit"></i> Edit Profile
          </button>
        </div>
      ` : ''}
    </div>

    <!-- Action Bar (Fixed at Bottom) -->
    <div style="position: fixed; bottom: 0; right: 0; width: 420px; background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border-top: 2px solid rgba(0, 224, 255, 0.5); padding: 1.5rem; backdrop-filter: blur(10px); z-index: 100;">
      ${profile.id === currentUserProfile?.id ? `
        <!-- Own Profile - Action bar hidden for own profile -->
        <div style="display: none;"></div>
      ` : `
        <!-- Other User Actions -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
          <!-- Message button - always available -->
          <button onclick="sendMessage('${profile.id}')" style="padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <i class="fas fa-comment"></i> Message
          </button>

          <!-- Connection status button -->
          ${connectionStatus === 'accepted' ? `
            <button onclick="endorseSkill('${profile.id}')" style="padding: 0.75rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff; font-weight: bold; cursor: pointer;">
              <i class="fas fa-star"></i> Endorse
            </button>
          ` : connectionStatus === 'pending' ? `
            <button onclick="withdrawConnectionFromPanel('${profile.id}')" style="padding: 0.75rem; background: rgba(255,170,0,0.2); border: 1px solid rgba(255,170,0,0.5); border-radius: 8px; color: #ffaa00; font-weight: bold; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,170,0,0.3)'" onmouseout="this.style.background='rgba(255,170,0,0.2)'">
              <i class="fas fa-times-circle"></i> Withdraw
            </button>
          ` : `
            <button onclick="sendConnectionFromPanel('${profile.id}')" style="padding: 0.75rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #00e0ff; font-weight: bold; cursor: pointer;">
              <i class="fas fa-user-plus"></i> Connect
            </button>
          `}
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
        user_id,
        role,
        user:community(id, name, image_url)
      )
    `)
    .eq('id', nodeData.id)
    .single();

  if (error || !project) {
    throw error;
  }

  // Separate active members from pending requests
  const activeMembers = project.project_members?.filter(m => m.role !== 'pending') || [];
  const pendingRequests = project.project_members?.filter(m => m.role === 'pending') || [];

  // Check if user is an active member (exclude pending)
  const isMember = activeMembers.some(m =>
    m.user?.id === currentUserProfile?.id || m.user_id === currentUserProfile?.id
  );

  // Check if user has a pending request
  const hasPendingRequest = pendingRequests.some(m =>
    m.user?.id === currentUserProfile?.id || m.user_id === currentUserProfile?.id
  );

  // Check if current user is the creator
  const isCreator = project.creator_id === currentUserProfile?.id;
  
  console.log('🔍 Project panel debug:', {
    projectId: project.id,
    projectTitle: project.title,
    creatorId: project.creator_id,
    currentUserId: currentUserProfile?.id,
    isCreator,
    isMember,
    hasPendingRequest,
    pendingRequestsCount: pendingRequests.length
  });

  let html = `
    <div style="padding: 2rem; padding-bottom: 180px;">
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
            <i class="fas fa-users"></i> ${activeMembers.length} member${activeMembers.length !== 1 ? 's' : ''}
          </div>
          ${pendingRequests.length > 0 && isCreator ? `
            <div style="color: #ffa500;">
              <i class="fas fa-clock"></i> ${pendingRequests.length} pending
            </div>
          ` : ''}
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
      ${activeMembers.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="color: #ff6b6b; font-size: 1rem; margin-bottom: 0.75rem; text-transform: uppercase;">
            <i class="fas fa-users"></i> Team Members
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.75rem;">
            ${activeMembers.map(member => {
              const user = member.user;
              const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
              const roleLabel = member.role === 'creator' ? '(Creator)' : '';
              return `
                <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,107,107,0.05); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,107,107,0.2);">
                  ${user.image_url ?
                    `<img src="${user.image_url}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">` :
                    `<div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: white;">${initials}</div>`
                  }
                  <span style="color: white; font-size: 0.85rem;">${user.name} ${roleLabel}</span>
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
      ${isCreator ? `
        <!-- Creator Actions -->
        <button onclick="editProjectFromPanel('${project.id}')" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem; margin-bottom: 0.75rem;">
          <i class="fas fa-edit"></i> Edit Project
        </button>
        ${pendingRequests.length > 0 ? `
          <button onclick="manageProjectRequests('${project.id}')" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #ffa500, #ff8c00); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem; margin-bottom: 0.75rem;">
            <i class="fas fa-user-clock"></i> Manage Requests (${pendingRequests.length})
          </button>
        ` : ''}
      ` : isMember ? `
        <!-- Member Status -->
        <div style="text-align: center; color: #00ff88; font-weight: bold; margin-bottom: 0.75rem;">
          <i class="fas fa-check-circle"></i> You're a member of this project
        </div>
      ` : hasPendingRequest ? `
        <!-- Pending Request Status -->
        <div style="text-align: center; color: #ffa500; font-weight: bold; margin-bottom: 0.75rem; padding: 0.75rem; background: rgba(255,165,0,0.1); border-radius: 8px; border: 1px solid rgba(255,165,0,0.3);">
          <i class="fas fa-clock"></i> Join request pending approval
        </div>
      ` : `
        <!-- Join Button -->
        <button onclick="joinProjectFromPanel('${project.id}')" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem; margin-bottom: 0.75rem;">
          <i class="fas fa-plus-circle"></i> Request to Join
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
      .in('id', mutualIds)
      .or('is_hidden.is.null,is_hidden.eq.false');

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
window.openNodePanel = openNodePanel;

// Open project details by calling openNodePanel with proper project structure
window.openProjectDetails = function(project) {
  openNodePanel({
    ...project,
    type: 'project',
    id: project.id,
    name: project.title || project.name
  });
};

window.sendConnectionFromPanel = async function(userId) {
  try {
    await window.sendConnectionRequest(userId);

    // Track connection request for engagement system
    if (window.DailyEngagement) {
      try {
        await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.SEND_CONNECTION, 'Sent connection request');
        await window.DailyEngagement.updateQuestProgress('send_connection', 1);
      } catch (err) {
        console.warn('Failed to track connection request:', err);
      }
    }

    // Reload panel to update connection status
    await loadNodeDetails(currentNodeData);
  } catch (error) {
    console.error('Error sending connection:', error);
    alert('Failed to send connection request');
  }
};

window.withdrawConnectionFromPanel = async function(userId) {
  try {
    if (!currentUserProfile) {
      alert('Please log in to withdraw connection requests');
      return;
    }

    // Show confirmation dialog
    const confirmed = confirm(
      '⚠️ Are you sure you want to withdraw this connection request?\n\n' +
      'If you proceed, you will need to send a new connection request to connect with this person again.'
    );

    if (!confirmed) {
      return; // User cancelled
    }

    // Find the connection where current user is the requester (handle duplicates)
    const { data: connections, error: findError } = await supabase
      .from('connections')
      .select('id, from_user_id')
      .or(`and(from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${userId}),and(from_user_id.eq.${userId},to_user_id.eq.${currentUserProfile.id})`)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (findError) {
      console.error('Error finding connection:', findError);
      alert('Failed to find connection request');
      return;
    }

    if (!connections || connections.length === 0) {
      alert('No pending connection request found');
      return;
    }

    const connection = connections[0];

    // Only allow withdrawal if current user is the one who sent the request
    if (connection.from_user_id !== currentUserProfile.id) {
      alert('You can only withdraw requests that you sent');
      return;
    }

    // Delete the connection request
    const { error: deleteError } = await supabase
      .from('connections')
      .delete()
      .eq('id', connection.id);

    if (deleteError) {
      console.error('Error withdrawing connection:', deleteError);
      alert('Failed to withdraw connection request');
      return;
    }

    showToastNotification('✓ Connection request withdrawn', 'info');

    // Reload panel to update connection status
    await loadNodeDetails(currentNodeData);

  } catch (error) {
    console.error('Error withdrawing connection:', error);
    alert('Failed to withdraw connection request: ' + error.message);
  }
};

window.sendMessage = async function(userId) {
  try {
    console.log('📨 Opening message for user:', userId);
    closeNodePanel();

    // Open messages modal
    const messagesModal = document.getElementById('messages-modal');
    if (messagesModal) {
      messagesModal.classList.add('active');
    }

    // Wait for messaging module to initialize
    await new Promise(resolve => setTimeout(resolve, 300));

    // Initialize and start conversation
    if (window.MessagingModule) {
      if (typeof window.MessagingModule.init === 'function') {
        await window.MessagingModule.init();
      }
      if (typeof window.MessagingModule.startConversation === 'function') {
        await window.MessagingModule.startConversation(userId);
        console.log('✅ Started conversation with user:', userId);
      }
    } else {
      console.error('MessagingModule not available');
    }
  } catch (error) {
    console.error('Error starting conversation:', error);
    alert('Failed to start conversation: ' + error.message);
  }
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
    const user = await window.bootstrapSession.getAuthUser();
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
        endorser_id: endorserProfile.id,           // Fixed: use community ID
        endorser_community_id: endorserProfile.id,
        endorsed_id: userId,                        // userId is already community.id from button
        endorsed_community_id: userId,
        skill: skill
      });

    if (error) throw error;

    // Track endorsement for engagement system
    if (window.DailyEngagement) {
      try {
        await window.DailyEngagement.awardXP(window.DailyEngagement.XP_REWARDS.ENDORSE_SKILL, `Endorsed ${skill}`);
        await window.DailyEngagement.updateQuestProgress('endorse_skill', 1);
      } catch (err) {
        console.warn('Failed to track endorsement:', err);
      }
    }

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
    const user = await window.bootstrapSession.getAuthUser();
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
      const user = await window.bootstrapSession.getAuthUser();
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
    const user = await window.bootstrapSession.getAuthUser();
    if (!user) {
      alert('Please log in to join a project');
      return;
    }

    // Check if already a member or has pending request
    const { data: existingMember } = await supabase
      .from('project_members')
      .select('id, role')
      .eq('project_id', projectId)
      .eq('user_id', currentUserProfile.id)
      .single();

    if (existingMember) {
      if (existingMember.role === 'pending') {
        showToastNotification('Your join request is pending approval', 'info');
      } else {
        showToastNotification('You are already a member of this project!', 'info');
      }
      await loadNodeDetails(currentNodeData);
      return;
    }

    // Send join request with role='pending'
    const { error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: currentUserProfile.id,
        role: 'pending'
      });

    if (error) {
      // Handle duplicate key error gracefully
      if (error.code === '23505') {
        showToastNotification('You already have a pending request!', 'info');
        await loadNodeDetails(currentNodeData);
        return;
      }
      throw error;
    }

    showToastNotification('Join request sent! Awaiting approval.', 'success');
    // Reload panel to update UI
    await loadNodeDetails(currentNodeData);

    // Refresh synapse view to show updated project membership
    if (window.refreshSynapseProjectCircles) {
      await window.refreshSynapseProjectCircles();
    }

  } catch (error) {
    console.error('Error sending join request:', error);
    alert('Failed to send join request: ' + error.message);
  }
};

window.viewProjectDetails = function(projectId) {
  closeNodePanel();
  // Open project details in projects modal
  window.openProjectsModal();
};

window.editProjectFromPanel = async function(projectId) {
  try {
    // Fetch current project data
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      console.error('Error loading project:', error);
      alert('Failed to load project');
      return;
    }

    // Create edit modal
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
      overflow-y: auto;
    `;

    modal.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(255, 107, 107, 0.5); border-radius: 16px; padding: 2rem; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <h2 style="color: #ff6b6b; margin-bottom: 1.5rem;">
          <i class="fas fa-edit"></i> Edit Project
        </h2>

        <form id="edit-project-form">
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Project Name *</label>
            <input
              type="text"
              id="edit-project-name"
              value="${project.name || project.title || ''}"
              required
              placeholder="Project name"
              style="width: 100%; padding: 0.75rem; background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Description *</label>
            <textarea
              id="edit-project-description"
              rows="4"
              required
              placeholder="Describe your project..."
              style="width: 100%; padding: 0.75rem; background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;"
            >${project.description || ''}</textarea>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Required Skills</label>
            <input
              type="text"
              id="edit-project-skills"
              value="${normalizeCommaList(project.required_skills || project.skills_needed)}"
              placeholder="e.g., JavaScript, React, Design"
              style="width: 100%; padding: 0.75rem; background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Tags (comma-separated)</label>
            <input
              type="text"
              id="edit-project-tags"
              value="${Array.isArray(project.tags) ? project.tags.join(', ') : (project.tags || '')}"
              placeholder="e.g., AI, Web3, Social Impact"
              style="width: 100%; padding: 0.75rem; background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Status</label>
            <select
              id="edit-project-status"
              style="width: 100%; padding: 0.75rem; background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; color: white; font-family: inherit;"
            >
              <option value="open" ${project.status === 'open' ? 'selected' : ''}>Open (Recruiting)</option>
              <option value="active" ${project.status === 'active' ? 'selected' : ''}>Active (In Progress)</option>
              <option value="in-progress" ${project.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="completed" ${project.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="on-hold" ${project.status === 'on-hold' ? 'selected' : ''}>On Hold</option>
            </select>
          </div>

          <div style="display: flex; gap: 1rem;">
            <button
              type="submit"
              style="flex: 1; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; padding: 1rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem;"
            >
              <i class="fas fa-save"></i> Save Changes
            </button>
            <button
              type="button"
              onclick="this.closest('[style*=\\'position: fixed\\']').remove()"
              style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 1rem 1.5rem; border-radius: 8px; color: white; cursor: pointer; font-size: 1rem; font-weight: bold;"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Add form submit handler
    document.getElementById('edit-project-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const skillsText = document.getElementById('edit-project-skills').value || "";
      const tagsText = document.getElementById('edit-project-tags').value || "";

      // Schema-flexible:
      // - required_skills is an ARRAY in your current Supabase schema (per the error you saw),
      //   but some older versions stored it as text. We send an array first, then retry as text if needed.
      const skillsArray = parseCommaList(skillsText);
      const tagsArray = parseCommaList(tagsText);

      let updatedProject = {
        title: document.getElementById('edit-project-name').value.trim(),
        description: document.getElementById('edit-project-description').value.trim(),
        required_skills: skillsArray.length ? skillsArray : null,
        tags: tagsArray.length ? tagsArray : null,
        status: document.getElementById('edit-project-status').value
      };

      const { error: updateError } = await supabase
        .from('projects')
        .update(updatedProject)
        .eq('id', projectId);

      if (updateError) {
        // Most likely cause (based on your screenshot): required_skills is a Postgres ARRAY column,
        // but we accidentally sent an empty string or plain text.
        // Retry once with required_skills as plain text for schema compatibility.
        const msg = (updateError.message || "").toLowerCase();

        if (msg.includes("required_skills") || msg.includes("array") || msg.includes("malformed")) {
          const retryProject = { ...updatedProject, required_skills: skillsText.trim() || null, tags: tagsArray.length ? tagsArray : null };
          const retry = await supabase
            .from('projects')
            .update(retryProject)
            .eq('id', projectId);

          if (!retry.error) {
            updatedProject = retryProject;
          } else {
            console.error('Error updating project (retry):', retry.error);
            alert('Error updating project: ' + (retry.error.message || retry.error));
            return;
          }
        } else {
          console.error('Error updating project:', updateError);
          alert('Error updating project: ' + updateError.message);
          return;
        }
      }

      // Close modal
      modal.remove();

      // Show success
      showToastNotification('Project updated successfully!', 'success');

      // Reload panel to show updated info
      if (currentNodeData) {
        await loadNodeDetails(currentNodeData);
      }
    });

  } catch (error) {
    console.error('Error opening project editor:', error);
    alert('Failed to open project editor');
  }
};

window.manageProjectRequests = async function(projectId) {
  console.log('🔧 manageProjectRequests called for project:', projectId);
  try {
    // Ensure supabase is available
    if (!supabase) supabase = window.supabase;
    if (!supabase) {
      throw new Error('Database connection not available');
    }

    // Fetch pending requests for this project
    const { data: pendingRequests, error } = await supabase
      .from('project_members')
      .select(`
        *,
        user:community(id, name, image_url, bio, skills)
      `)
      .eq('project_id', projectId)
      .eq('role', 'pending');

    if (error) throw error;

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
      <div style="width: min(700px, 92vw); max-height: 80vh; overflow-y: auto;
        background: linear-gradient(135deg, rgba(10,14,39,.98), rgba(26,26,46,.98));
        border: 2px solid rgba(255,107,107,0.5); border-radius: 16px; padding: 2rem;">

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <h2 style="color: #ff6b6b; margin: 0;">
            <i class="fas fa-user-clock"></i> Join Requests
          </h2>
          <button onclick="this.closest('div[style*=fixed]').remove()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1.1rem;">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div id="requests-container">
          ${pendingRequests.length === 0 ? `
            <div style="text-align: center; color: #aaa; padding: 3rem;">
              <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
              <p style="margin-top: 1rem;">No pending requests</p>
            </div>
          ` : pendingRequests.map(request => {
            const user = request.user;
            // Parse skills - could be string (comma-separated) or array
            let skills = user.skills || [];
            if (typeof skills === 'string') {
              skills = skills.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (!Array.isArray(skills)) {
              skills = [];
            }
            return `
              <div style="background: rgba(255,107,107,0.05); border: 1px solid rgba(255,107,107,0.2); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem;" data-request-id="${request.id}">
                <div style="display: flex; gap: 1rem; align-items: start;">
                  <!-- User Avatar -->
                  <img src="${user.image_url || 'https://via.placeholder.com/60'}"
                    style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid rgba(255,107,107,0.3);"
                    onerror="this.src='https://via.placeholder.com/60'">

                  <!-- User Info -->
                  <div style="flex: 1; min-width: 0;">
                    <div style="color: #ff6b6b; font-weight: 800; font-size: 1.1rem; margin-bottom: 0.25rem;">
                      ${user.name}
                    </div>
                    ${user.bio ? `
                      <div style="color: #ddd; font-size: 0.9rem; margin-bottom: 0.5rem; line-height: 1.4;">
                        ${user.bio.substring(0, 120)}${user.bio.length > 120 ? '...' : ''}
                      </div>
                    ` : ''}
                    ${skills.length > 0 ? `
                      <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem;">
                        ${skills.slice(0, 5).map(skill => `
                          <span style="background: rgba(0,224,255,0.1); color: #00e0ff; padding: 0.2rem 0.6rem; border-radius: 8px; font-size: 0.8rem; border: 1px solid rgba(0,224,255,0.2);">
                            ${skill}
                          </span>
                        `).join('')}
                        ${skills.length > 5 ? `<span style="color: #888; font-size: 0.8rem;">+${skills.length - 5} more</span>` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
                  <button class="approve-request-btn" data-project-id="${projectId}" data-request-id="${request.id}" data-user-id="${user.id}" style="flex: 1; padding: 0.65rem; background: linear-gradient(135deg, #00ff88, #00cc70); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
                    <i class="fas fa-check"></i> Approve
                  </button>
                  <button class="decline-request-btn" data-project-id="${projectId}" data-request-id="${request.id}" style="flex: 1; padding: 0.65rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 8px; color: #ff6b6b; font-weight: bold; cursor: pointer;">
                    <i class="fas fa-times"></i> Decline
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners for approve/decline buttons
    modal.querySelectorAll('.approve-request-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const projectId = e.currentTarget.dataset.projectId;
        const requestId = e.currentTarget.dataset.requestId;
        const userId = e.currentTarget.dataset.userId;
        console.log('🔘 Approve button clicked:', { projectId, requestId, userId });
        await window.approveJoinRequest(projectId, requestId, userId);
      });
    });

    modal.querySelectorAll('.decline-request-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const projectId = e.currentTarget.dataset.projectId;
        const requestId = e.currentTarget.dataset.requestId;
        console.log('🔘 Decline button clicked:', { projectId, requestId });
        await window.declineJoinRequest(projectId, requestId);
      });
    });

  } catch (error) {
    console.error('Error loading join requests:', error);
    alert('Failed to load join requests: ' + error.message);
  }
};

window.approveJoinRequest = async function(projectId, requestId, userId) {
  try {
    console.log('🔄 Approving join request:', { projectId, requestId, userId });
    
    // Ensure supabase is available
    if (!supabase) supabase = window.supabase;
    if (!supabase) {
      throw new Error('Database connection not available');
    }

    // Update role from 'pending' to 'member'
    const { data, error } = await supabase
      .from('project_members')
      .update({ role: 'member' })
      .eq('id', requestId)
      .select();

    if (error) {
      console.error('❌ Error updating project_members:', error);
      throw error;
    }

    console.log('✅ Successfully approved request:', data);

    showToastNotification('Request approved!', 'success');

    // Remove the request card from UI
    const card = document.querySelector(`[data-request-id="${requestId}"]`);
    if (card) {
      card.remove();
      console.log('✅ Removed request card from UI');
    }

    // Check if container is now empty
    const container = document.getElementById('requests-container');
    if (container && container.children.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #aaa; padding: 3rem;">
          <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
          <p style="margin-top: 1rem;">No pending requests</p>
        </div>
      `;
    }

    // Wait a moment for database to fully commit
    await new Promise(resolve => setTimeout(resolve, 300));

    // Reload panel if it's currently showing this project
    if (currentNodeData?.id === projectId) {
      console.log('🔄 Reloading node panel with fresh data...');
      // Force refetch by passing just the ID
      await loadNodeDetails({ id: projectId, type: 'project' });
    }

    // Refresh synapse view to show updated project membership
    if (typeof window.refreshSynapseConnections === 'function') {
      console.log('🔄 Refreshing synapse connections...');
      await window.refreshSynapseConnections();
    } else {
      console.warn('⚠️ window.refreshSynapseConnections not available');
    }

  } catch (error) {
    console.error('❌ Error approving request:', error);
    showToastNotification('Failed to approve request: ' + error.message, 'error');
  }
};

window.declineJoinRequest = async function(projectId, requestId) {
  try {
    // Ensure supabase is available
    if (!supabase) supabase = window.supabase;
    if (!supabase) {
      throw new Error('Database connection not available');
    }

    // Delete the pending request
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', requestId);

    if (error) throw error;

    showToastNotification('Request declined', 'info');

    // Remove the request card from UI
    const card = document.querySelector(`[data-request-id="${requestId}"]`);
    if (card) card.remove();

    // Check if container is now empty
    const container = document.getElementById('requests-container');
    if (container && container.children.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #aaa; padding: 3rem;">
          <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
          <p style="margin-top: 1rem;">No pending requests</p>
        </div>
      `;
    }

    // Wait a moment for database to fully commit
    await new Promise(resolve => setTimeout(resolve, 300));

    // Reload panel if it's currently showing this project
    if (currentNodeData?.id === projectId) {
      // Force refetch by passing just the ID
      await loadNodeDetails({ id: projectId, type: 'project' });
    }

    // Refresh synapse view to show updated project membership
    if (typeof window.refreshSynapseConnections === 'function') {
      await window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error declining request:', error);
    alert('Failed to decline request: ' + error.message);
  }
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
      const user = await window.bootstrapSession.getAuthUser();
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

// Function to create a project in a specific theme
async function createProjectInTheme(themeId, themeName) {
  console.log("🎯 Creating project in theme:", { themeId, themeName });
  
  try {
    // Close the node panel first
    closeNodePanel();
    
    // Open the projects modal
    if (typeof window.openProjectsModal === 'function') {
      await window.openProjectsModal();
      
      // Show the create project form
      if (typeof window.showCreateProjectForm === 'function') {
        await window.showCreateProjectForm();
        
        // Pre-select the theme in the dropdown
        setTimeout(() => {
          const themeSelect = document.getElementById('project-theme');
          if (themeSelect) {
            // Try to find and select the theme
            for (let option of themeSelect.options) {
              if (option.value === themeId) {
                option.selected = true;
                console.log("✅ Pre-selected theme in dropdown:", themeName);
                break;
              }
            }
          } else {
            console.warn("⚠️ Theme select dropdown not found");
          }
        }, 100); // Small delay to ensure form is rendered
        
      } else {
        console.warn("⚠️ showCreateProjectForm function not available");
      }
    } else {
      console.warn("⚠️ openProjectsModal function not available");
      alert("Project creation is not available at the moment. Please try again later.");
    }
  } catch (error) {
    console.error("❌ Failed to create project in theme:", error);
    alert("Failed to open project creation form. Please try again.");
  }
}

// Join theme function
window.joinTheme = async function(themeId, themeName) {
  try {
    const user = await window.bootstrapSession.getAuthUser();
    if (!user) {
      alert('Please log in to join themes');
      return;
    }
    
    const { data: userProfile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!userProfile) {
      alert('Profile not found');
      return;
    }
    
    // Remove 'theme:' prefix if present
    const cleanThemeId = themeId.replace(/^theme:/, '');
    
    console.log('Joining theme:', { 
      originalThemeId: themeId, 
      cleanThemeId, 
      communityId: userProfile.id,
      themeName 
    });
    
    // Verify theme exists before trying to join
    const { data: themeExists, error: themeCheckError } = await supabase
      .from('theme_circles')
      .select('id, title')
      .eq('id', cleanThemeId)
      .single();
    
    if (themeCheckError || !themeExists) {
      console.error('Theme not found:', { cleanThemeId, error: themeCheckError });
      alert(`Theme not found in database.\n\nTheme ID: ${cleanThemeId}\n\nPlease refresh the page and try again.`);
      return;
    }
    
    console.log('Theme found:', themeExists);
    
    // Add to theme_participants
    const { error } = await supabase
      .from('theme_participants')
      .insert({
        theme_id: cleanThemeId,
        community_id: userProfile.id,
        engagement_level: 'interested',  // Use 'interested' - one of the allowed values
        joined_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Join theme error:', error);
      
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        alert('Theme participation feature is not yet set up in the database.\n\nPlease contact an administrator to run the theme_participants migration.');
        return;
      }
      
      // Check for duplicate - user already joined
      if (error.code === '23505') {
        showToastNotification('✓ You are already a member of this theme!', 'info');
        closeNodePanel();
        return;
      }
      
      if (error.code === '23503') {
        alert('Invalid theme or user ID. Please refresh and try again.');
      } else {
        throw error;
      }
      return;
    }
    
    showToastNotification(`✓ You've joined "${themeName}"!`, 'success');
    
    // Close panel
    closeNodePanel();
    
    console.log('🔄 Refreshing synapse after joining theme...');
    
    // Reload synapse data if available
    if (window.reloadAllData && typeof window.reloadAllData === 'function') {
      console.log('🔄 Calling reloadAllData...');
      await window.reloadAllData();
      if (window.rebuildGraph && typeof window.rebuildGraph === 'function') {
        console.log('🔄 Calling rebuildGraph...');
        await window.rebuildGraph();
      }
    } else {
      console.warn('⚠️ reloadAllData not available, forcing page reload...');
      // Force a full page reload to refresh the synapse
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  } catch (error) {
    console.error('Error joining theme:', error);
    alert('Failed to join theme. Please try again.');
  }
};

// Leave theme function
window.leaveTheme = async function(themeId, themeName) {
  if (!confirm(`Are you sure you want to leave "${themeName}"?\n\nYou can rejoin later if you change your mind.`)) {
    return;
  }
  
  try {
    const user = await window.bootstrapSession.getAuthUser();
    if (!user) {
      alert('Please log in to leave themes');
      return;
    }
    
    const { data: userProfile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!userProfile) {
      alert('Profile not found');
      return;
    }
    
    // Remove 'theme:' prefix if present
    const cleanThemeId = themeId.replace(/^theme:/, '');
    
    // Remove from theme_participants
    const { error } = await supabase
      .from('theme_participants')
      .delete()
      .eq('theme_id', cleanThemeId)
      .eq('community_id', userProfile.id);
    
    if (error) throw error;
    
    showToastNotification(`✓ You've left "${themeName}"`, 'success');
    
    // Close panel
    closeNodePanel();
    
    console.log('🔄 Refreshing synapse after leaving theme...');
    
    // Reload synapse data if available
    if (window.reloadAllData && typeof window.reloadAllData === 'function') {
      console.log('🔄 Calling reloadAllData...');
      await window.reloadAllData();
      if (window.rebuildGraph && typeof window.rebuildGraph === 'function') {
        console.log('🔄 Calling rebuildGraph...');
        await window.rebuildGraph();
      }
    } else {
      console.warn('⚠️ reloadAllData not available, forcing page reload...');
      // Force a full page reload to refresh the synapse
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  } catch (error) {
    console.error('Error leaving theme:', error);
    alert('Failed to leave theme. Please try again.');
  }
};

// Delete theme function
window.deleteTheme = async function(themeId, themeName) {
  if (!confirm(`⚠️ Are you sure you want to DELETE "${themeName}"?\n\nThis will:\n• Remove the theme permanently\n• Remove all participants\n• Unlink all projects from this theme\n\nThis action CANNOT be undone!`)) {
    return;
  }
  
  // Double confirmation for destructive action
  const confirmText = prompt(`Type "${themeName}" to confirm deletion:`);
  if (confirmText !== themeName) {
    alert('Theme name did not match. Deletion cancelled.');
    return;
  }
  
  try {
    const user = await window.bootstrapSession.getAuthUser();
    if (!user) {
      alert('Please log in to delete themes');
      return;
    }
    
    const { data: userProfile } = await supabase
      .from('community')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (!userProfile) {
      alert('Profile not found');
      return;
    }
    
    // Remove 'theme:' prefix if present
    const cleanThemeId = themeId.replace(/^theme:/, '');
    
    // Verify user is the creator
    const { data: theme } = await supabase
      .from('theme_circles')
      .select('created_by')
      .eq('id', cleanThemeId)
      .single();
    
    if (!theme || theme.created_by !== userProfile.id) {
      alert('You can only delete themes you created');
      return;
    }
    
    // Unlink projects from this theme
    await supabase
      .from('projects')
      .update({ theme_id: null })
      .eq('theme_id', cleanThemeId);
    
    // Delete theme participants
    await supabase
      .from('theme_participants')
      .delete()
      .eq('theme_id', cleanThemeId);
    
    // Delete the theme
    const { error } = await supabase
      .from('theme_circles')
      .delete()
      .eq('id', cleanThemeId);
    
    if (error) throw error;
    
    showToastNotification(`✓ "${themeName}" has been deleted`, 'success');
    
    // Close panel and refresh
    closeNodePanel();
    
    // Reload synapse data if available
    if (window.reloadAllData) {
      await window.reloadAllData();
      if (window.rebuildGraph) {
        await window.rebuildGraph();
      }
    }
  } catch (error) {
    console.error('Error deleting theme:', error);
    alert('Failed to delete theme. Please try again.');
  }
};


// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initNodePanel();
});

console.log('✅ Node panel ready');
