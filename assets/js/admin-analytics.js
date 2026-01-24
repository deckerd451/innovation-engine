// ================================================================
// ADMIN ANALYTICS DASHBOARD
// ================================================================
// Ecosystem insights for organizers and community leaders

console.log("%c📊 Admin Analytics Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let analyticsModal = null;
let supabase = null;
let currentUserProfile = null;

// Initialize analytics
export function initAdminAnalytics() {
  supabase = window.supabase;

  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;

    // Only show admin button if user is admin
    if (currentUserProfile.role === 'admin') {
      createAdminButton();
    }
  });

  createAnalyticsModal();

  console.log('✅ Admin analytics initialized');
}

// Create admin button - DISABLED: Now integrated into Filter View
function createAdminButton() {
  // Analytics button is now integrated into the Filter View UI
  // See dashboard-actions.js createSynapseLegend() for the new location
  console.log('📊 Analytics button integrated into Filter View');
  return;

  // Old standalone button code (kept for reference):
  /*
  const button = document.createElement('button');
  button.id = 'admin-analytics-btn';
  button.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    padding: 0.75rem 1.25rem;
    background: linear-gradient(135deg, #ff6b6b, #ff8c8c);
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: bold;
    cursor: pointer;
    z-index: 1500;
    box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
    transition: all 0.2s;
  `;
  button.innerHTML = '<i class="fas fa-chart-line"></i> Analytics';

  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 20px rgba(255, 107, 107, 0.6)';
  };

  button.onmouseout = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(255, 107, 107, 0.4)';
  };

  button.onclick = openAnalyticsModal;

  document.body.appendChild(button);
  */
}

// Create analytics modal
function createAnalyticsModal() {
  analyticsModal = document.createElement('div');
  analyticsModal.id = 'admin-analytics-modal';
  analyticsModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(10px);
    z-index: 5000;
    display: none;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.3s;
  `;

  document.body.appendChild(analyticsModal);
}

// Open analytics modal
async function openAnalyticsModal() {
  console.log('📊 Opening admin analytics');

  analyticsModal.style.display = 'flex';
  setTimeout(() => {
    analyticsModal.style.opacity = '1';
  }, 10);

  // Show loading
  analyticsModal.innerHTML = `
    <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(255, 107, 107, 0.5); border-radius: 16px; padding: 3rem; max-width: 95vw; width: 1200px; max-height: 90vh; overflow-y: auto; position: relative;">
      <div style="text-align: center; color: #ff6b6b;">
        <i class="fas fa-spinner fa-spin" style="font-size: 3rem;"></i>
        <p style="margin-top: 1rem; font-size: 1.2rem;">Loading analytics...</p>
      </div>
    </div>
  `;

  // Load analytics data
  await loadAnalyticsData();
}

// Load and render analytics
async function loadAnalyticsData() {
  try {
    console.log('📊 Fetching analytics data...');

    // Fetch all data in parallel
    const [
      communityData,
      connectionsData,
      projectsData,
      endorsementsData,
      messagesData,
      activityData
    ] = await Promise.all([
      supabase.from('community').select('*'),
      supabase.from('connections').select('*'),
      supabase.from('projects').select('*'),
      supabase.from('endorsements').select('*'),
      supabase.from('messages').select('*'),
      supabase.from('activity_log').select('*')
    ]);

    const community = communityData.data || [];
    const connections = connectionsData.data || [];
    const projects = projectsData.data || [];
    const endorsements = endorsementsData.data || [];
    const messages = messagesData.data || [];
    const activities = activityData.data || [];

    // Calculate metrics
    const metrics = calculateMetrics(community, connections, projects, endorsements, messages, activities);

    // Render dashboard
    renderAnalyticsDashboard(metrics);

  } catch (error) {
    console.error('❌ Error loading analytics:', error);
    analyticsModal.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(255, 107, 107, 0.5); border-radius: 16px; padding: 3rem; text-align: center;">
        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ff6666;"></i>
        <p style="margin-top: 1rem; color: white;">Error loading analytics</p>
        <button onclick="closeAnalyticsModal()" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;">
          Close
        </button>
      </div>
    `;
  }
}

// Calculate analytics metrics
function calculateMetrics(community, connections, projects, endorsements, messages, activities) {
  // Basic counts
  const totalMembers = community.length;
  const totalConnections = connections.filter(c => c.status === 'accepted').length;
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'in-progress').length;

  // Network density (actual connections / possible connections)
  const possibleConnections = (totalMembers * (totalMembers - 1)) / 2;
  const networkDensity = possibleConnections > 0 ? (totalConnections / possibleConnections * 100).toFixed(2) : 0;

  // Identify isolated nodes (users with 0 connections)
  const connectedUserIds = new Set();
  connections.forEach(conn => {
    if (conn.status === 'accepted') {
      connectedUserIds.add(conn.from_user_id);
      connectedUserIds.add(conn.to_user_id);
    }
  });
  const isolatedNodes = community.filter(u => !connectedUserIds.has(u.id));

  // Key connectors (top 10% by connection count)
  const connectionCounts = {};
  connections.forEach(conn => {
    if (conn.status === 'accepted') {
      connectionCounts[conn.from_user_id] = (connectionCounts[conn.from_user_id] || 0) + 1;
      connectionCounts[conn.to_user_id] = (connectionCounts[conn.to_user_id] || 0) + 1;
    }
  });

  const sortedConnectors = Object.entries(connectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(5, Math.floor(totalMembers * 0.1)));

  const keyConnectors = sortedConnectors.map(([userId, count]) => {
    const user = community.find(u => u.id === userId);
    return {
      id: userId,
      name: user?.name || 'Unknown',
      connections: count,
      image_url: user?.image_url
    };
  });

  // Growth metrics (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const newMembers = community.filter(u => new Date(u.created_at) > thirtyDaysAgo).length;
  const newConnections = connections.filter(c => c.status === 'accepted' && new Date(c.created_at) > thirtyDaysAgo).length;
  const newProjects = projects.filter(p => new Date(p.created_at) > thirtyDaysAgo).length;

  // Engagement metrics
  const totalMessages = messages.length;
  const totalEndorsements = endorsements.length;
  const avgConnectionsPerUser = totalMembers > 0 ? (totalConnections * 2 / totalMembers).toFixed(1) : 0;

  // Top skills
  const skillCounts = {};
  community.forEach(user => {
    if (user.skills) {
      const skills = user.skills.split(',').map(s => s.trim());
      skills.forEach(skill => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    }
  });

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Activity breakdown
  const activityBreakdown = {};
  activities.forEach(act => {
    activityBreakdown[act.action_type] = (activityBreakdown[act.action_type] || 0) + 1;
  });

  // Suggested introductions (isolated nodes + key connectors)
  const suggestedIntros = isolatedNodes.slice(0, 5).map(isolated => {
    // Find best connector based on shared skills
    const isolatedSkills = isolated.skills ? isolated.skills.toLowerCase().split(',').map(s => s.trim()) : [];

    let bestConnector = keyConnectors[0];
    let maxSharedSkills = 0;

    keyConnectors.forEach(connector => {
      const connectorUser = community.find(u => u.id === connector.id);
      if (connectorUser && connectorUser.skills) {
        const connectorSkills = connectorUser.skills.toLowerCase().split(',').map(s => s.trim());
        const sharedSkills = isolatedSkills.filter(skill => connectorSkills.includes(skill)).length;

        if (sharedSkills > maxSharedSkills) {
          maxSharedSkills = sharedSkills;
          bestConnector = connector;
        }
      }
    });

    return {
      isolated: {
        id: isolated.id,
        name: isolated.name,
        image_url: isolated.image_url
      },
      connector: bestConnector,
      reason: maxSharedSkills > 0 ? `${maxSharedSkills} shared skills` : 'Network integration'
    };
  });

  return {
    totalMembers,
    totalConnections,
    totalProjects,
    activeProjects,
    networkDensity,
    isolatedNodes,
    keyConnectors,
    newMembers,
    newConnections,
    newProjects,
    totalMessages,
    totalEndorsements,
    avgConnectionsPerUser,
    topSkills,
    activityBreakdown,
    suggestedIntros
  };
}

// Render analytics dashboard
function renderAnalyticsDashboard(metrics) {
  analyticsModal.innerHTML = `
    <div style="background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98)); border: 2px solid rgba(255, 107, 107, 0.5); border-radius: 16px; padding: 2rem; max-width: 95vw; width: 1200px; max-height: 90vh; overflow-y: auto; position: relative;">

      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1 style="color: #ff6b6b; font-size: 2rem; margin: 0;">
          <i class="fas fa-chart-line"></i> Ecosystem Analytics
        </h1>
        <button onclick="closeAnalyticsModal()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.2rem;">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Key Metrics Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">

        <div style="background: rgba(0,224,255,0.1); border: 2px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; color: #00e0ff; margin-bottom: 0.5rem;">${metrics.totalMembers}</div>
          <div style="color: #ddd; font-size: 1rem;">Total Members</div>
          ${metrics.newMembers > 0 ? `<div style="color: #00ff88; font-size: 0.85rem; margin-top: 0.5rem;">+${metrics.newMembers} this month</div>` : ''}
        </div>

        <div style="background: rgba(0,255,136,0.1); border: 2px solid rgba(0,255,136,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; color: #00ff88; margin-bottom: 0.5rem;">${metrics.totalConnections}</div>
          <div style="color: #ddd; font-size: 1rem;">Connections</div>
          ${metrics.newConnections > 0 ? `<div style="color: #00ff88; font-size: 0.85rem; margin-top: 0.5rem;">+${metrics.newConnections} this month</div>` : ''}
        </div>

        <div style="background: rgba(255,170,0,0.1); border: 2px solid rgba(255,170,0,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; color: #ffaa00; margin-bottom: 0.5rem;">${metrics.networkDensity}%</div>
          <div style="color: #ddd; font-size: 1rem;">Network Density</div>
          <div style="color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;">Connection saturation</div>
        </div>

        <div style="background: rgba(255,107,107,0.1); border: 2px solid rgba(255,107,107,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; color: #ff6b6b; margin-bottom: 0.5rem;">${metrics.activeProjects}</div>
          <div style="color: #ddd; font-size: 1rem;">Active Projects</div>
          <div style="color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;">${metrics.totalProjects} total</div>
        </div>

        <div style="background: rgba(255,107,255,0.1); border: 2px solid rgba(255,107,255,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; color: #ff6bff; margin-bottom: 0.5rem;">${metrics.avgConnectionsPerUser}</div>
          <div style="color: #ddd; font-size: 1rem;">Avg Connections</div>
          <div style="color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;">Per member</div>
        </div>

        <div style="background: rgba(255,215,0,0.1); border: 2px solid rgba(255,215,0,0.3); border-radius: 12px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; color: #ffd700; margin-bottom: 0.5rem;">${metrics.totalEndorsements}</div>
          <div style="color: #ddd; font-size: 1rem;">Endorsements</div>
          <div style="color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;">Skills validated</div>
        </div>

      </div>

      <!-- Two Column Layout -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">

        <!-- Isolated Nodes -->
        <div style="background: rgba(255,107,107,0.05); border: 2px solid rgba(255,107,107,0.3); border-radius: 12px; padding: 1.5rem;">
          <h3 style="color: #ff6b6b; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-exclamation-triangle"></i>
            Isolated Nodes (${metrics.isolatedNodes.length})
          </h3>
          <div style="color: #aaa; font-size: 0.9rem; margin-bottom: 1rem;">Members with zero connections</div>

          ${metrics.isolatedNodes.length === 0 ? `
            <div style="text-align: center; padding: 2rem; color: #00ff88;">
              <i class="fas fa-check-circle" style="font-size: 2rem;"></i>
              <p style="margin-top: 0.5rem;">No isolated members!</p>
            </div>
          ` : `
            <div style="max-height: 300px; overflow-y: auto;">
              ${metrics.isolatedNodes.slice(0, 10).map(user => {
                const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
                return `
                  <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: rgba(255,107,107,0.1); border-radius: 8px; margin-bottom: 0.5rem;">
                    ${user.image_url ?
                      `<img src="${user.image_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` :
                      `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">${initials}</div>`
                    }
                    <div style="flex: 1;">
                      <div style="color: white; font-weight: bold;">${user.name}</div>
                      <div style="color: #aaa; font-size: 0.85rem;">${user.skills || 'No skills listed'}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Key Connectors -->
        <div style="background: rgba(0,255,136,0.05); border: 2px solid rgba(0,255,136,0.3); border-radius: 12px; padding: 1.5rem;">
          <h3 style="color: #00ff88; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-star"></i>
            Key Connectors
          </h3>
          <div style="color: #aaa; font-size: 0.9rem; margin-bottom: 1rem;">Top network hubs</div>

          <div style="max-height: 300px; overflow-y: auto;">
            ${metrics.keyConnectors.map((connector, index) => {
              const initials = connector.name.split(' ').map(n => n[0]).join('').toUpperCase();
              return `
                <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: rgba(0,255,136,0.1); border-radius: 8px; margin-bottom: 0.5rem;">
                  <div style="width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #ffd700, #ffed4e); display: flex; align-items: center; justify-content: center; font-weight: bold; color: #000; font-size: 0.9rem;">
                    ${index + 1}
                  </div>
                  ${connector.image_url ?
                    `<img src="${connector.image_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` :
                    `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #00ff88, #00cc66); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">${initials}</div>`
                  }
                  <div style="flex: 1;">
                    <div style="color: white; font-weight: bold;">${connector.name}</div>
                    <div style="color: #00ff88; font-size: 0.85rem;">${connector.connections} connections</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

      </div>

      <!-- Top Skills -->
      <div style="background: rgba(0,224,255,0.05); border: 2px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
        <h3 style="color: #00e0ff; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-code"></i>
          Top Skills in Network
        </h3>
        <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
          ${metrics.topSkills.map(([skill, count], index) => `
            <div style="background: rgba(0,224,255,${0.1 + (index / metrics.topSkills.length) * 0.2}); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; padding: 1rem; min-width: 150px; text-align: center;">
              <div style="font-size: 2rem; color: #00e0ff; font-weight: bold;">${count}</div>
              <div style="color: white; font-weight: bold; margin-top: 0.5rem;">${skill}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Suggested Introductions -->
      <div style="background: rgba(255,170,0,0.05); border: 2px solid rgba(255,170,0,0.3); border-radius: 12px; padding: 1.5rem;">
        <h3 style="color: #ffaa00; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-handshake"></i>
          Suggested Introductions
        </h3>
        <div style="color: #aaa; font-size: 0.9rem; margin-bottom: 1rem;">Strategic connections to strengthen the network</div>

        <div style="display: grid; gap: 1rem;">
          ${metrics.suggestedIntros.map(intro => {
            const isolatedInitials = intro.isolated.name.split(' ').map(n => n[0]).join('').toUpperCase();
            const connectorInitials = intro.connector.name.split(' ').map(n => n[0]).join('').toUpperCase();

            return `
              <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: rgba(255,170,0,0.1); border-radius: 8px;">
                ${intro.isolated.image_url ?
                  `<img src="${intro.isolated.image_url}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">` :
                  `<div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #ff6b6b, #ff8c8c); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.2rem;">${isolatedInitials}</div>`
                }

                <div style="flex: 1;">
                  <div style="color: white; font-weight: bold; font-size: 1rem;">${intro.isolated.name}</div>
                  <div style="color: #aaa; font-size: 0.85rem;">Isolated member</div>
                </div>

                <div style="color: #ffaa00; font-size: 1.5rem;">
                  <i class="fas fa-arrow-right"></i>
                </div>

                ${intro.connector.image_url ?
                  `<img src="${intro.connector.image_url}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">` :
                  `<div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #00ff88, #00cc66); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.2rem;">${connectorInitials}</div>`
                }

                <div style="flex: 1;">
                  <div style="color: white; font-weight: bold; font-size: 1rem;">${intro.connector.name}</div>
                  <div style="color: #00ff88; font-size: 0.85rem;">${intro.connector.connections} connections</div>
                </div>

                <div style="padding: 0.5rem 1rem; background: rgba(255,170,0,0.2); border-radius: 8px; color: #ffaa00; font-size: 0.85rem;">
                  ${intro.reason}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

    </div>
  `;
}

// Close analytics modal
function closeAnalyticsModal() {
  if (!analyticsModal) return;

  analyticsModal.style.opacity = '0';
  setTimeout(() => {
    analyticsModal.style.display = 'none';
  }, 300);
}

window.openAnalyticsModal = openAnalyticsModal;
window.closeAnalyticsModal = closeAnalyticsModal;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initAdminAnalytics();
});

console.log('✅ Admin analytics ready');
