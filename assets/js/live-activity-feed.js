// ================================================================
// LIVE ACTIVITY FEED SYSTEM
// ================================================================
// Real-time activity updates, social feed, and community engagement

console.log("%c📡 Live Activity Feed Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let activityChannel = null;
let activityCache = new Map();
let feedFilters = {
  connections: true,
  projects: true,
  achievements: true,
  messages: false, // Private by default
  all: true
};

// Activity types
const ACTIVITY_TYPES = {
  USER_JOINED: 'user_joined',
  CONNECTION_MADE: 'connection_made',
  PROJECT_CREATED: 'project_created',
  PROJECT_JOINED: 'project_joined',
  ACHIEVEMENT_EARNED: 'achievement_earned',
  SKILL_ENDORSED: 'skill_endorsed',
  THEME_CREATED: 'theme_created',
  TEAM_FORMED: 'team_formed',
  MILESTONE_REACHED: 'milestone_reached'
};

// Initialize live activity feed
let liveActivityFeedInitialized = false;

export function initLiveActivityFeed() {
  if (liveActivityFeedInitialized) {
    console.log('⚠️ Live Activity Feed already initialized, skipping');
    return;
  }
  liveActivityFeedInitialized = true;
  
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
    setupActivityChannel();
  });

  // Expose functions globally
  window.openActivityFeed = openActivityFeed;
  window.closeActivityFeed = closeActivityFeed;
  window.refreshActivityFeed = refreshActivityFeed;
  window.updateFeedFilters = updateFeedFilters;
  window.createActivity = createActivity;

  console.log('✅ Live activity feed initialized');
}

// Setup activity channel for real-time updates
async function setupActivityChannel() {
  if (!supabase || !currentUserProfile) return;

  console.log('📡 Setting up activity channel...');

  try {
    activityChannel = supabase
      .channel('activity-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity_log'
      }, handleNewActivity)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'connections'
      }, handleConnectionActivity)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'projects'
      }, handleProjectActivity)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'project_members'
      }, handleProjectMemberActivity)
      .subscribe();

    console.log('✅ Activity channel established');

  } catch (error) {
    console.error('❌ Error setting up activity channel:', error);
  }
}

// Handle new activity
function handleNewActivity(payload) {
  const activity = payload.new;
  console.log('📡 New activity received:', activity);

  // Add to cache
  activityCache.set(activity.id, activity);

  // Update feed if open
  if (document.getElementById('activity-feed-modal')) {
    prependActivityToFeed(activity);
  }

  // Show notification for relevant activities
  if (shouldNotifyForActivity(activity)) {
    showActivityNotification(activity);
  }
}

// Handle connection activities
function handleConnectionActivity(payload) {
  const connection = payload.new;
  
  if (connection.status === 'accepted') {
    createActivity({
      type: ACTIVITY_TYPES.CONNECTION_MADE,
      user_id: connection.from_user_id,
      target_user_id: connection.to_user_id,
      metadata: {
        connection_id: connection.id
      }
    });
  }
}

// Handle project activities
function handleProjectActivity(payload) {
  const project = payload.new;
  
  createActivity({
    type: ACTIVITY_TYPES.PROJECT_CREATED,
    user_id: project.creator_id,
    target_id: project.id,
    metadata: {
      project_title: project.title,
      project_id: project.id
    }
  });
}

// Handle project member activities
function handleProjectMemberActivity(payload) {
  const member = payload.new;
  
  if (member.role === 'member' || member.role === 'creator') {
    createActivity({
      type: ACTIVITY_TYPES.PROJECT_JOINED,
      user_id: member.user_id,
      target_id: member.project_id,
      metadata: {
        project_id: member.project_id,
        role: member.role
      }
    });
  }
}

// Open activity feed modal
export async function openActivityFeed() {
  console.log('📡 Opening activity feed...');

  // Remove existing feed if present
  const existing = document.getElementById('activity-feed-modal');
  if (existing) existing.remove();

  // Create activity feed modal
  const modal = document.createElement('div');
  modal.id = 'activity-feed-modal';
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
    <div class="activity-feed-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 800px;
      width: 100%;
      height: 80vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div class="activity-feed-header" style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-stream"></i> Live Activity Feed
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              See what's happening in the community
            </p>
          </div>
          <button onclick="closeActivityFeed()" style="
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2rem;
          ">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Filters -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button onclick="updateFeedFilters('all', true)" 
                  class="filter-btn active" data-filter="all"
                  style="padding: 0.5rem 1rem; background: rgba(0, 224, 255, 0.2); border: 1px solid rgba(0, 224, 255, 0.4); border-radius: 20px; color: #00e0ff; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
            <i class="fas fa-globe"></i> All Activity
          </button>
          <button onclick="updateFeedFilters('connections', !feedFilters.connections)" 
                  class="filter-btn ${feedFilters.connections ? 'active' : ''}" data-filter="connections"
                  style="padding: 0.5rem 1rem; background: rgba(255, 215, 0, 0.1); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 20px; color: #ffd700; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
            <i class="fas fa-users"></i> Connections
          </button>
          <button onclick="updateFeedFilters('projects', !feedFilters.projects)" 
                  class="filter-btn ${feedFilters.projects ? 'active' : ''}" data-filter="projects"
                  style="padding: 0.5rem 1rem; background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3); border-radius: 20px; color: #ff6b6b; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
            <i class="fas fa-lightbulb"></i> Projects
          </button>
          <button onclick="updateFeedFilters('achievements', !feedFilters.achievements)" 
                  class="filter-btn ${feedFilters.achievements ? 'active' : ''}" data-filter="achievements"
                  style="padding: 0.5rem 1rem; background: rgba(0, 255, 136, 0.1); border: 1px solid rgba(0, 255, 136, 0.3); border-radius: 20px; color: #00ff88; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
            <i class="fas fa-trophy"></i> Achievements
          </button>
        </div>
      </div>

      <!-- Activity Feed -->
      <div class="activity-feed-content" style="
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
      ">
        <div id="activity-feed-list">
          <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
            <p>Loading activity feed...</p>
          </div>
        </div>
      </div>

      <!-- Refresh Button -->
      <div style="
        padding: 1rem 2rem;
        border-top: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
        text-align: center;
      ">
        <button onclick="refreshActivityFeed()" style="
          padding: 0.75rem 2rem;
          background: rgba(0, 224, 255, 0.1);
          border: 1px solid rgba(0, 224, 255, 0.3);
          border-radius: 8px;
          color: #00e0ff;
          cursor: pointer;
          font-weight: 600;
        ">
          <i class="fas fa-sync-alt"></i> Refresh Feed
        </button>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .activity-item {
      background: rgba(0, 224, 255, 0.05);
      border: 1px solid rgba(0, 224, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      transition: all 0.2s;
      animation: slideInFromRight 0.3s ease-out;
    }

    .activity-item:hover {
      border-color: rgba(0, 224, 255, 0.4);
      background: rgba(0, 224, 255, 0.08);
    }

    .activity-item.new {
      border-color: rgba(0, 255, 136, 0.6);
      background: rgba(0, 255, 136, 0.1);
      animation: pulseGreen 0.5s ease-out;
    }

    .filter-btn {
      transition: all 0.2s;
    }

    .filter-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .filter-btn.active {
      background: rgba(0, 224, 255, 0.3) !important;
      border-color: rgba(0, 224, 255, 0.6) !important;
      color: #00e0ff !important;
    }

    .activity-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 1.2rem;
      margin-right: 1rem;
      flex-shrink: 0;
    }

    .activity-icon {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.7rem;
      border: 2px solid rgba(10, 14, 39, 1);
    }

    .activity-icon.connection {
      background: #ffd700;
      color: #000;
    }

    .activity-icon.project {
      background: #ff6b6b;
      color: white;
    }

    .activity-icon.achievement {
      background: #00ff88;
      color: #000;
    }

    @keyframes slideInFromRight {
      from {
        opacity: 0;
        transform: translateX(30px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @keyframes pulseGreen {
      0% {
        box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.4);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(0, 255, 136, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(0, 255, 136, 0);
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeActivityFeed();
    }
  });

  // Load activity feed
  await loadActivityFeed();

  console.log('✅ Activity feed opened');
}

// Load activity feed
async function loadActivityFeed() {
  const container = document.getElementById('activity-feed-list');
  if (!container) return;

  try {
    // Get recent activities (real data with fallback)
    const activities = await loadRealActivityFeed();

    if (activities.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
          <i class="fas fa-stream" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <h3 style="color: rgba(255, 255, 255, 0.8); margin-bottom: 0.5rem;">No activity yet</h3>
          <p>Activity will appear here as people join, create projects, and connect</p>
        </div>
      `;
      return;
    }

    let html = '';
    activities.forEach(activity => {
      if (shouldShowActivity(activity)) {
        html += renderActivityItem(activity);
      }
    });

    container.innerHTML = html || `
      <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
        <p>No activities match your current filters</p>
      </div>
    `;

  } catch (error) {
    console.error('Error loading activity feed:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #ff6666;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Failed to load activity feed</p>
      </div>
    `;
  }
}

// Load real activity data from Supabase
async function loadRealActivityFeed() {
  if (!supabase) {
    console.warn('📡 Supabase not available, using fallback activities');
    return generateFallbackActivities();
  }

  try {
    console.log('📡 Loading real activity data from Supabase...');
    
    // Get recent activities with user information
    const { data: activities, error } = await supabase
      .from('activity_log')
      .select(`
        *,
        user:community!user_id(id, name, image_url),
        target_user:community!target_user_id(id, name, image_url)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('📡 Activity log query failed:', error);
      return generateFallbackActivities();
    }

    if (!activities || activities.length === 0) {
      console.log('📡 No activities found, generating sample data for new community');
      return generateFallbackActivities();
    }

    console.log(`📡 Loaded ${activities.length} real activities`);
    return activities.map(activity => ({
      id: activity.id,
      type: activity.event_type || activity.type,
      user: activity.user,
      target_user: activity.target_user,
      created_at: activity.created_at,
      metadata: activity.event_data || activity.metadata || {}
    }));

  } catch (error) {
    console.error('📡 Error loading real activity data:', error);
    return generateFallbackActivities();
  }
}

// Fallback activities for new communities or when real data is unavailable
function generateFallbackActivities() {
  const sampleUsers = [
    { id: 'sample-1', name: 'Community Member', image_url: null },
    { id: 'sample-2', name: 'Project Creator', image_url: null },
    { id: 'sample-3', name: 'Team Builder', image_url: null },
    { id: 'sample-4', name: 'Innovator', image_url: null },
    { id: 'sample-5', name: 'Collaborator', image_url: null }
  ];

  return [
    {
      id: 'sample-activity-1',
      type: ACTIVITY_TYPES.USER_JOINED,
      user: sampleUsers[0],
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      metadata: {}
    },
    {
      id: 'sample-activity-2',
      type: ACTIVITY_TYPES.PROJECT_CREATED,
      user: sampleUsers[1],
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      metadata: { project_title: 'Welcome to CharlestonHacks!' }
    },
    {
      id: 'sample-activity-3',
      type: ACTIVITY_TYPES.CONNECTION_MADE,
      user: sampleUsers[2],
      target_user: sampleUsers[3],
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      metadata: {}
    }
  ];
}

// Render activity item
function renderActivityItem(activity) {
  const user = activity.user;
  const timeAgo = getTimeAgo(activity.created_at);
  const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  
  const { message, icon, iconClass } = getActivityMessage(activity);

  return `
    <div class="activity-item" data-activity-id="${activity.id}">
      <div style="display: flex; align-items: flex-start;">
        <div style="position: relative;">
          ${user.image_url 
            ? `<img src="${user.image_url}" class="activity-avatar" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 1rem;">`
            : `<div class="activity-avatar">${initials}</div>`
          }
          <div class="activity-icon ${iconClass}">
            <i class="${icon}"></i>
          </div>
        </div>
        
        <div style="flex: 1; min-width: 0;">
          <div style="color: white; margin-bottom: 0.5rem; line-height: 1.4;">
            ${message}
          </div>
          <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
            ${timeAgo}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Get activity message and icon
function getActivityMessage(activity) {
  const user = activity.user;
  const targetUser = activity.target_user;
  
  switch (activity.type) {
    case ACTIVITY_TYPES.USER_JOINED:
      return {
        message: `<strong>${user.name}</strong> joined the community`,
        icon: 'fas fa-user-plus',
        iconClass: 'connection'
      };
      
    case ACTIVITY_TYPES.PROJECT_CREATED:
      return {
        message: `<strong>${user.name}</strong> created a new project: <em>${activity.metadata.project_title}</em>`,
        icon: 'fas fa-lightbulb',
        iconClass: 'project'
      };
      
    case ACTIVITY_TYPES.PROJECT_JOINED:
      return {
        message: `<strong>${user.name}</strong> joined the project: <em>${activity.metadata.project_title}</em>`,
        icon: 'fas fa-users',
        iconClass: 'project'
      };
      
    case ACTIVITY_TYPES.CONNECTION_MADE:
      return {
        message: `<strong>${user.name}</strong> connected with <strong>${targetUser?.name || 'someone'}</strong>`,
        icon: 'fas fa-handshake',
        iconClass: 'connection'
      };
      
    case ACTIVITY_TYPES.ACHIEVEMENT_EARNED:
      return {
        message: `<strong>${user.name}</strong> earned the achievement: <em>${activity.metadata.achievement}</em>`,
        icon: 'fas fa-trophy',
        iconClass: 'achievement'
      };
      
    default:
      return {
        message: `<strong>${user.name}</strong> did something interesting`,
        icon: 'fas fa-star',
        iconClass: 'connection'
      };
  }
}

// Helper functions
function getTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffInSeconds = Math.floor((now - time) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

function shouldShowActivity(activity) {
  if (feedFilters.all) return true;
  
  const typeFilters = {
    [ACTIVITY_TYPES.CONNECTION_MADE]: 'connections',
    [ACTIVITY_TYPES.USER_JOINED]: 'connections',
    [ACTIVITY_TYPES.PROJECT_CREATED]: 'projects',
    [ACTIVITY_TYPES.PROJECT_JOINED]: 'projects',
    [ACTIVITY_TYPES.TEAM_FORMED]: 'projects',
    [ACTIVITY_TYPES.ACHIEVEMENT_EARNED]: 'achievements',
    [ACTIVITY_TYPES.MILESTONE_REACHED]: 'achievements'
  };
  
  const filterKey = typeFilters[activity.type];
  return filterKey ? feedFilters[filterKey] : true;
}

function shouldNotifyForActivity(activity) {
  // Only notify for activities involving the current user or their connections
  return activity.user_id === currentUserProfile?.id || 
         activity.target_user_id === currentUserProfile?.id;
}

function showActivityNotification(activity) {
  const { message } = getActivityMessage(activity);
  
  if (window.showNotification) {
    window.showNotification({
      type: 'info',
      title: 'New Activity',
      message: message.replace(/<[^>]*>/g, ''), // Strip HTML
      duration: 4000
    });
  }
}

function prependActivityToFeed(activity) {
  const container = document.getElementById('activity-feed-list');
  if (!container) return;

  const activityHtml = renderActivityItem(activity);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = activityHtml;
  const activityElement = tempDiv.firstElementChild;
  
  activityElement.classList.add('new');
  container.insertBefore(activityElement, container.firstChild);
  
  // Remove 'new' class after animation
  setTimeout(() => {
    activityElement.classList.remove('new');
  }, 500);
}

// Global functions
window.closeActivityFeed = function() {
  const modal = document.getElementById('activity-feed-modal');
  if (modal) {
    modal.remove();
  }
  console.log('🗑️ Activity feed closed');
};

window.refreshActivityFeed = async function() {
  console.log('🔄 Refreshing activity feed...');
  await loadActivityFeed();
};

window.updateFeedFilters = function(filterType, enabled) {
  if (filterType === 'all') {
    // Reset all filters
    Object.keys(feedFilters).forEach(key => {
      feedFilters[key] = key === 'all';
    });
  } else {
    feedFilters[filterType] = enabled;
    feedFilters.all = false;
  }
  
  // Update filter button states
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filter = btn.dataset.filter;
    if (feedFilters[filter]) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Refresh feed
  loadActivityFeed();
};

window.createActivity = async function(activityData) {
  console.log('📝 Creating activity:', activityData);
  
  // In a real implementation, this would insert into the activity_log table
  // For now, we'll just log it
  try {
    if (supabase) {
      const { error } = await supabase
        .from('activity_log')
        .insert([{
          ...activityData,
          created_at: new Date().toISOString()
        }]);
      
      if (error) {
        console.warn('Failed to create activity log entry:', error);
      }
    }
  } catch (error) {
    console.warn('Activity logging not available:', error);
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initLiveActivityFeed();
});

console.log('✅ Live activity feed ready');