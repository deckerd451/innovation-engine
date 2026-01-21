// ================================================================
// ADVANCED ANALYTICS & INSIGHTS SYSTEM
// ================================================================
// User engagement tracking, project analytics, and community insights

console.log("%c📊 Advanced Analytics Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let analyticsCache = new Map();
let trackingQueue = [];
let sessionData = {
  startTime: Date.now(),
  pageViews: 0,
  interactions: 0,
  timeSpent: 0
};

// Analytics event types
const ANALYTICS_EVENTS = {
  PAGE_VIEW: 'page_view',
  USER_INTERACTION: 'user_interaction',
  PROJECT_VIEW: 'project_view',
  PROFILE_VIEW: 'profile_view',
  SEARCH_QUERY: 'search_query',
  CONNECTION_REQUEST: 'connection_request',
  MESSAGE_SENT: 'message_sent',
  TEAM_CREATED: 'team_created',
  ACHIEVEMENT_EARNED: 'achievement_earned',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end'
};

// Metric categories
const METRIC_CATEGORIES = {
  ENGAGEMENT: 'engagement',
  COLLABORATION: 'collaboration',
  PRODUCTIVITY: 'productivity',
  SOCIAL: 'social',
  TECHNICAL: 'technical'
};

// Initialize advanced analytics
export function initAdvancedAnalytics() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
    startAnalyticsSession();
  });

  // Expose functions globally
  window.openAnalyticsDashboard = openAnalyticsDashboard;
  window.closeAnalyticsDashboard = closeAnalyticsDashboard;
  window.trackEvent = trackEvent;
  window.trackUserEngagement = trackUserEngagement;
  window.generateInsights = generateInsights;
  window.exportAnalyticsData = exportAnalyticsData;

  // Setup automatic tracking
  setupAutomaticTracking();

  // Setup real-time analytics and performance monitoring
  setupRealTimeAnalytics();
  setupPerformanceAlerts();

  console.log('✅ Advanced analytics initialized');
}

// Start analytics session
function startAnalyticsSession() {
  if (!currentUserProfile) return;

  sessionData.startTime = Date.now();
  sessionData.userId = currentUserProfile.id;
  
  trackEvent(ANALYTICS_EVENTS.SESSION_START, {
    user_id: currentUserProfile.id,
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    screen_resolution: `${screen.width}x${screen.height}`,
    viewport_size: `${window.innerWidth}x${window.innerHeight}`
  });

  console.log('📊 Analytics session started for:', currentUserProfile.name);
}

// Setup automatic tracking
function setupAutomaticTracking() {
  // Track page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      trackEvent(ANALYTICS_EVENTS.SESSION_END, {
        session_duration: Date.now() - sessionData.startTime,
        page_views: sessionData.pageViews,
        interactions: sessionData.interactions
      });
    } else {
      startAnalyticsSession();
    }
  });

  // Track user interactions
  document.addEventListener('click', (e) => {
    sessionData.interactions++;
    
    // Track specific interaction types
    const target = e.target.closest('[data-analytics]');
    if (target) {
      trackEvent(ANALYTICS_EVENTS.USER_INTERACTION, {
        element: target.dataset.analytics,
        timestamp: new Date().toISOString(),
        coordinates: { x: e.clientX, y: e.clientY }
      });
    }
  });

  // Track scroll depth
  let maxScrollDepth = 0;
  window.addEventListener('scroll', () => {
    const scrollDepth = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
    if (scrollDepth > maxScrollDepth) {
      maxScrollDepth = scrollDepth;
    }
  });

  // Track time spent
  setInterval(() => {
    if (!document.hidden) {
      sessionData.timeSpent += 1000; // 1 second
    }
  }, 1000);

  console.log('📊 Automatic tracking setup complete');
}

// Track analytics event
window.trackEvent = function(eventType, data = {}) {
  const event = {
    id: generateEventId(),
    type: eventType,
    user_id: currentUserProfile?.id,
    timestamp: new Date().toISOString(),
    data: data,
    session_id: sessionData.startTime
  };

  // Add to queue
  trackingQueue.push(event);

  // Process queue if it gets large
  if (trackingQueue.length >= 10) {
    processTrackingQueue();
  }

  console.log('📊 Event tracked:', eventType, data);
};

// Process tracking queue
async function processTrackingQueue() {
  if (trackingQueue.length === 0 || !supabase) return;

  try {
    const events = [...trackingQueue];
    trackingQueue = [];

    // In a real implementation, this would insert into analytics tables
    console.log('📊 Processing analytics events:', events.length);
    
    // Mock successful processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.error('❌ Error processing analytics events:', error);
    // Re-add events to queue for retry
    trackingQueue.unshift(...trackingQueue);
  }
}

// Open analytics dashboard
export async function openAnalyticsDashboard() {
  console.log('📊 Opening analytics dashboard...');

  // Remove existing dashboard if present
  const existing = document.getElementById('analytics-dashboard');
  if (existing) existing.remove();

  // Create analytics dashboard
  const dashboard = document.createElement('div');
  dashboard.id = 'analytics-dashboard';
  dashboard.style.cssText = `
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

  dashboard.innerHTML = `
    <div class="analytics-container" style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 1400px;
      width: 100%;
      height: 90vh;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    ">
      <!-- Header -->
      <div class="analytics-header" style="
        padding: 2rem 2rem 1rem;
        border-bottom: 1px solid rgba(0, 224, 255, 0.2);
        flex-shrink: 0;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0; font-size: 1.75rem;">
              <i class="fas fa-chart-line"></i> Analytics & Insights
            </h2>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0; font-size: 1rem;">
              Comprehensive analytics and community insights
            </p>
          </div>
          <button onclick="closeAnalyticsDashboard()" style="
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

        <!-- Analytics Navigation -->
        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; flex-wrap: wrap;">
          <button onclick="showAnalyticsTab('overview')" 
                  class="analytics-tab-btn active" data-tab="overview"
                  style="padding: 0.75rem 1.5rem; background: rgba(0, 224, 255, 0.2); border: 1px solid rgba(0, 224, 255, 0.4); border-radius: 8px; color: #00e0ff; cursor: pointer; font-weight: 600;">
            <i class="fas fa-tachometer-alt"></i> Overview
          </button>
          <button onclick="showAnalyticsTab('engagement')" 
                  class="analytics-tab-btn" data-tab="engagement"
                  style="padding: 0.75rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.8); cursor: pointer; font-weight: 600;">
            <i class="fas fa-heart"></i> Engagement
          </button>
          <button onclick="showAnalyticsTab('projects')" 
                  class="analytics-tab-btn" data-tab="projects"
                  style="padding: 0.75rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.8); cursor: pointer; font-weight: 600;">
            <i class="fas fa-lightbulb"></i> Projects
          </button>
          <button onclick="showAnalyticsTab('social')" 
                  class="analytics-tab-btn" data-tab="social"
                  style="padding: 0.75rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.8); cursor: pointer; font-weight: 600;">
            <i class="fas fa-users"></i> Social
          </button>
          <button onclick="showAnalyticsTab('insights')" 
                  class="analytics-tab-btn" data-tab="insights"
                  style="padding: 0.75rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.8); cursor: pointer; font-weight: 600;">
            <i class="fas fa-brain"></i> Insights
          </button>
          <button onclick="openPerformanceMonitor()" 
                  class="analytics-tab-btn" data-tab="performance"
                  style="padding: 0.75rem 1.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: rgba(255, 255, 255, 0.8); cursor: pointer; font-weight: 600;">
            <i class="fas fa-tachometer-alt"></i> Performance
          </button>
        </div>
      </div>

      <!-- Content Area -->
      <div class="analytics-content" style="
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
      ">
        <div id="analytics-tab-content">
          <!-- Content will be populated by tab functions -->
        </div>
      </div>
    </div>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .analytics-tab-btn {
      transition: all 0.2s;
    }

    .analytics-tab-btn:hover {
      background: rgba(0, 224, 255, 0.1) !important;
      border-color: rgba(0, 224, 255, 0.3) !important;
      color: #00e0ff !important;
    }

    .analytics-tab-btn.active {
      background: rgba(0, 224, 255, 0.2) !important;
      border-color: rgba(0, 224, 255, 0.4) !important;
      color: #00e0ff !important;
    }

    .metric-card {
      background: rgba(0, 224, 255, 0.05);
      border: 1px solid rgba(0, 224, 255, 0.2);
      border-radius: 12px;
      padding: 1.5rem;
      transition: all 0.2s;
    }

    .metric-card:hover {
      border-color: rgba(0, 224, 255, 0.4);
      background: rgba(0, 224, 255, 0.08);
    }

    .metric-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: #00e0ff;
      margin-bottom: 0.5rem;
    }

    .metric-label {
      color: rgba(255, 255, 255, 0.8);
      font-size: 1rem;
      margin-bottom: 0.25rem;
    }

    .metric-change {
      font-size: 0.85rem;
      font-weight: 600;
    }

    .metric-change.positive {
      color: #00ff88;
    }

    .metric-change.negative {
      color: #ff6b6b;
    }

    .chart-container {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .insight-card {
      background: linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 255, 136, 0.05));
      border: 1px solid rgba(0, 255, 136, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }

    .insight-card h4 {
      color: #00ff88;
      margin: 0 0 0.5rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .insight-card p {
      color: rgba(255, 255, 255, 0.8);
      margin: 0;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(dashboard);

  // Close on backdrop click
  dashboard.addEventListener('click', (e) => {
    if (e.target === dashboard) {
      closeAnalyticsDashboard();
    }
  });

  // Show default tab
  await showAnalyticsTab('overview');

  console.log('✅ Analytics dashboard opened');
}

// Show analytics tab
window.showAnalyticsTab = async function(tabName) {
  // Update tab buttons
  document.querySelectorAll('.analytics-tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = 'rgba(255, 255, 255, 0.05)';
    btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    btn.style.color = 'rgba(255, 255, 255, 0.8)';
  });

  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.background = 'rgba(0, 224, 255, 0.2)';
    activeBtn.style.borderColor = 'rgba(0, 224, 255, 0.4)';
    activeBtn.style.color = '#00e0ff';
  }

  // Load tab content
  const content = document.getElementById('analytics-tab-content');
  if (!content) return;

  content.innerHTML = `
    <div style="text-align: center; padding: 3rem; color: rgba(255, 255, 255, 0.6);">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Loading ${tabName} analytics...</p>
    </div>
  `;

  // Generate content based on tab
  switch (tabName) {
    case 'overview':
      await renderOverviewTab(content);
      break;
    case 'engagement':
      await renderEngagementTab(content);
      break;
    case 'projects':
      await renderProjectsTab(content);
      break;
    case 'social':
      await renderSocialTab(content);
      break;
    case 'insights':
      await renderInsightsTab(content);
      break;
    default:
      content.innerHTML = '<p>Tab not found</p>';
  }
};

// Render overview tab
async function renderOverviewTab(content) {
  const metrics = await generateOverviewMetrics();
  
  content.innerHTML = `
    <!-- Key Metrics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      ${metrics.map(metric => `
        <div class="metric-card">
          <div class="metric-value">${metric.value}</div>
          <div class="metric-label">${metric.label}</div>
          <div class="metric-change ${metric.change >= 0 ? 'positive' : 'negative'}">
            <i class="fas fa-arrow-${metric.change >= 0 ? 'up' : 'down'}"></i>
            ${Math.abs(metric.change)}% from last week
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Activity Chart -->
    <div class="chart-container">
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-chart-area"></i> Activity Over Time
      </h3>
      <div id="activity-chart" style="height: 300px; display: flex; align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.6);">
        <div>
          <i class="fas fa-chart-line" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
          <p>Interactive charts would be rendered here using Chart.js or D3.js</p>
        </div>
      </div>
    </div>

    <!-- Recent Activity -->
    <div>
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-clock"></i> Recent Activity
      </h3>
      <div style="display: grid; gap: 1rem;">
        ${generateRecentActivity().map(activity => `
          <div style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 1rem;
            display: flex;
            align-items: center;
            gap: 1rem;
          ">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: ${activity.color};
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 1.2rem;
            ">
              <i class="${activity.icon}"></i>
            </div>
            <div style="flex: 1;">
              <div style="color: white; font-weight: 600; margin-bottom: 0.25rem;">
                ${activity.title}
              </div>
              <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">
                ${activity.description}
              </div>
            </div>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
              ${activity.time}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Render engagement tab
async function renderEngagementTab(content) {
  const engagementData = await generateEngagementMetrics();
  
  content.innerHTML = `
    <!-- Engagement Metrics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <div class="metric-card">
        <div class="metric-value">${engagementData.dailyActiveUsers}</div>
        <div class="metric-label">Daily Active Users</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> 12% from yesterday
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${engagementData.avgSessionTime}</div>
        <div class="metric-label">Avg Session Time</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> 8% from last week
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${engagementData.interactionRate}%</div>
        <div class="metric-label">Interaction Rate</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> 15% from last week
        </div>
      </div>
    </div>

    <!-- Engagement Breakdown -->
    <div class="chart-container">
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-pie-chart"></i> Engagement Breakdown
      </h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        ${engagementData.breakdown.map(item => `
          <div style="text-align: center; padding: 1rem;">
            <div style="
              width: 80px;
              height: 80px;
              border-radius: 50%;
              background: conic-gradient(${item.color} 0deg ${item.percentage * 3.6}deg, rgba(255,255,255,0.1) ${item.percentage * 3.6}deg 360deg);
              margin: 0 auto 1rem;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 1.2rem;
            ">
              ${item.percentage}%
            </div>
            <div style="color: white; font-weight: 600; margin-bottom: 0.25rem;">
              ${item.label}
            </div>
            <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.85rem;">
              ${item.count} users
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- User Journey -->
    <div>
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-route"></i> User Journey Analysis
      </h3>
      <div style="display: grid; gap: 1rem;">
        ${engagementData.userJourney.map((step, index) => `
          <div style="
            background: rgba(0, 224, 255, 0.05);
            border: 1px solid rgba(0, 224, 255, 0.2);
            border-radius: 8px;
            padding: 1.5rem;
            position: relative;
          ">
            <div style="
              position: absolute;
              left: -10px;
              top: 50%;
              transform: translateY(-50%);
              width: 20px;
              height: 20px;
              border-radius: 50%;
              background: #00e0ff;
              color: #000;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 0.8rem;
            ">
              ${index + 1}
            </div>
            <div style="margin-left: 1rem;">
              <h4 style="color: #00e0ff; margin: 0 0 0.5rem 0;">${step.title}</h4>
              <p style="color: rgba(255, 255, 255, 0.8); margin: 0 0 0.5rem 0;">${step.description}</p>
              <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.9rem;">
                ${step.completionRate}% completion rate • ${step.avgTime} avg time
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Render projects tab
async function renderProjectsTab(content) {
  const projectData = await generateProjectMetrics();
  
  content.innerHTML = `
    <!-- Project Metrics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <div class="metric-card">
        <div class="metric-value">${projectData.totalProjects}</div>
        <div class="metric-label">Total Projects</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${projectData.projectGrowth}% this month
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${projectData.activeProjects}</div>
        <div class="metric-label">Active Projects</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${projectData.activeGrowth}% this week
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${projectData.avgTeamSize}</div>
        <div class="metric-label">Avg Team Size</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${projectData.teamSizeGrowth}% improvement
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${projectData.completionRate}%</div>
        <div class="metric-label">Completion Rate</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${projectData.completionGrowth}% this quarter
        </div>
      </div>
    </div>

    <!-- Project Categories -->
    <div class="chart-container">
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-tags"></i> Project Categories
      </h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        ${projectData.categories.map(category => `
          <div style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
          ">
            <div style="
              font-size: 2rem;
              color: ${category.color};
              margin-bottom: 1rem;
            ">
              <i class="${category.icon}"></i>
            </div>
            <h4 style="color: white; margin: 0 0 0.5rem 0;">${category.name}</h4>
            <div style="color: ${category.color}; font-size: 1.5rem; font-weight: bold; margin-bottom: 0.25rem;">
              ${category.count}
            </div>
            <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.85rem;">
              ${category.percentage}% of total
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Top Performing Projects -->
    <div>
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-trophy"></i> Top Performing Projects
      </h3>
      <div style="display: grid; gap: 1rem;">
        ${projectData.topProjects.map((project, index) => `
          <div style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
          ">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: ${index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32'};
              display: flex;
              align-items: center;
              justify-content: center;
              color: #000;
              font-weight: bold;
              font-size: 1.2rem;
            ">
              ${index + 1}
            </div>
            <div style="flex: 1;">
              <h4 style="color: white; margin: 0 0 0.25rem 0;">${project.title}</h4>
              <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem; margin-bottom: 0.5rem;">
                ${project.description}
              </div>
              <div style="display: flex; gap: 1rem; font-size: 0.85rem;">
                <span style="color: #00e0ff;">
                  <i class="fas fa-users"></i> ${project.teamSize} members
                </span>
                <span style="color: #00ff88;">
                  <i class="fas fa-chart-line"></i> ${project.engagement}% engagement
                </span>
                <span style="color: #ffaa00;">
                  <i class="fas fa-star"></i> ${project.rating}/5 rating
                </span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Render social tab
async function renderSocialTab(content) {
  const socialData = await generateSocialMetrics();
  
  content.innerHTML = `
    <!-- Social Metrics -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <div class="metric-card">
        <div class="metric-value">${socialData.totalConnections}</div>
        <div class="metric-label">Total Connections</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${socialData.connectionGrowth}% this week
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${socialData.activeConversations}</div>
        <div class="metric-label">Active Conversations</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${socialData.conversationGrowth}% today
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${socialData.networkDensity}%</div>
        <div class="metric-label">Network Density</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${socialData.densityGrowth}% this month
        </div>
      </div>
      
      <div class="metric-card">
        <div class="metric-value">${socialData.collaborationIndex}</div>
        <div class="metric-label">Collaboration Index</div>
        <div class="metric-change positive">
          <i class="fas fa-arrow-up"></i> ${socialData.collaborationGrowth}% improvement
        </div>
      </div>
    </div>

    <!-- Network Analysis -->
    <div class="chart-container">
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-project-diagram"></i> Network Analysis
      </h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
        <div>
          <h4 style="color: white; margin-bottom: 1rem;">Connection Types</h4>
          <div style="display: grid; gap: 0.75rem;">
            ${socialData.connectionTypes.map(type => `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: rgba(255, 255, 255, 0.8);">
                  <i class="${type.icon}" style="color: ${type.color}; margin-right: 0.5rem;"></i>
                  ${type.name}
                </span>
                <span style="color: ${type.color}; font-weight: bold;">${type.count}</span>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div>
          <h4 style="color: white; margin-bottom: 1rem;">Influence Metrics</h4>
          <div style="display: grid; gap: 0.75rem;">
            ${socialData.influenceMetrics.map(metric => `
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: rgba(255, 255, 255, 0.8);">${metric.name}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <div style="
                    width: 100px;
                    height: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                  ">
                    <div style="
                      width: ${metric.percentage}%;
                      height: 100%;
                      background: ${metric.color};
                    "></div>
                  </div>
                  <span style="color: ${metric.color}; font-weight: bold; min-width: 40px;">
                    ${metric.value}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Community Leaders -->
    <div>
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-crown"></i> Community Leaders
      </h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
        ${socialData.communityLeaders.map(leader => `
          <div style="
            background: rgba(255, 215, 0, 0.1);
            border: 1px solid rgba(255, 215, 0, 0.3);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
          ">
            <div style="
              width: 60px;
              height: 60px;
              border-radius: 50%;
              background: linear-gradient(135deg, #FFD700, #FFA500);
              margin: 0 auto 1rem;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #000;
              font-weight: bold;
              font-size: 1.5rem;
            ">
              ${leader.name[0]}
            </div>
            <h4 style="color: #FFD700; margin: 0 0 0.5rem 0;">${leader.name}</h4>
            <div style="color: rgba(255, 255, 255, 0.8); font-size: 0.9rem; margin-bottom: 1rem;">
              ${leader.role}
            </div>
            <div style="display: flex; justify-content: space-around; font-size: 0.85rem;">
              <div>
                <div style="color: #00e0ff; font-weight: bold;">${leader.connections}</div>
                <div style="color: rgba(255, 255, 255, 0.6);">Connections</div>
              </div>
              <div>
                <div style="color: #00ff88; font-weight: bold;">${leader.projects}</div>
                <div style="color: rgba(255, 255, 255, 0.6);">Projects</div>
              </div>
              <div>
                <div style="color: #ff6b6b; font-weight: bold;">${leader.influence}</div>
                <div style="color: rgba(255, 255, 255, 0.6);">Influence</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Render insights tab
async function renderInsightsTab(content) {
  const insights = await generateInsights();
  
  content.innerHTML = `
    <!-- AI-Generated Insights -->
    <div style="margin-bottom: 2rem;">
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-brain"></i> AI-Generated Insights
      </h3>
      <div style="display: grid; gap: 1rem;">
        ${insights.map(insight => `
          <div class="insight-card">
            <h4>
              <i class="${insight.icon}"></i>
              ${insight.title}
            </h4>
            <p>${insight.description}</p>
            ${insight.action ? `
              <div style="margin-top: 1rem;">
                <button onclick="${insight.action.onClick}" style="
                  background: rgba(0, 255, 136, 0.2);
                  border: 1px solid rgba(0, 255, 136, 0.4);
                  border-radius: 6px;
                  color: #00ff88;
                  padding: 0.5rem 1rem;
                  cursor: pointer;
                  font-weight: 600;
                ">
                  ${insight.action.label}
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Recommendations -->
    <div>
      <h3 style="color: #00e0ff; margin-bottom: 1rem;">
        <i class="fas fa-lightbulb"></i> Personalized Recommendations
      </h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1rem;">
        ${generateRecommendations().map(rec => `
          <div style="
            background: rgba(0, 224, 255, 0.05);
            border: 1px solid rgba(0, 224, 255, 0.2);
            border-radius: 8px;
            padding: 1.5rem;
          ">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
              <div style="
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: ${rec.color};
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 1.2rem;
              ">
                <i class="${rec.icon}"></i>
              </div>
              <div>
                <h4 style="color: #00e0ff; margin: 0;">${rec.title}</h4>
                <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
                  ${rec.category}
                </div>
              </div>
            </div>
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 1rem; line-height: 1.5;">
              ${rec.description}
            </p>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.85rem;">
                Impact: <span style="color: ${rec.impact.color}; font-weight: bold;">${rec.impact.level}</span>
              </div>
              <button onclick="${rec.action}" style="
                background: rgba(0, 224, 255, 0.2);
                border: 1px solid rgba(0, 224, 255, 0.4);
                border-radius: 6px;
                color: #00e0ff;
                padding: 0.5rem 1rem;
                cursor: pointer;
                font-weight: 600;
                font-size: 0.85rem;
              ">
                Take Action
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Generate mock data functions
async function generateOverviewMetrics() {
  return [
    { label: 'Active Users', value: '1,247', change: 12 },
    { label: 'Projects Created', value: '89', change: 23 },
    { label: 'Connections Made', value: '456', change: 8 },
    { label: 'Messages Sent', value: '2,341', change: 15 }
  ];
}

function generateRecentActivity() {
  return [
    {
      title: 'New Project Created',
      description: 'AI-Powered Health Tracker by Sarah Johnson',
      time: '2 minutes ago',
      icon: 'fas fa-lightbulb',
      color: '#ff6b6b'
    },
    {
      title: 'Team Formation',
      description: '5 members joined Sustainable Energy Dashboard',
      time: '15 minutes ago',
      icon: 'fas fa-users',
      color: '#00ff88'
    },
    {
      title: 'Achievement Unlocked',
      description: 'Mike Rodriguez earned "Connector" badge',
      time: '1 hour ago',
      icon: 'fas fa-trophy',
      color: '#FFD700'
    }
  ];
}

async function generateEngagementMetrics() {
  return {
    dailyActiveUsers: 1247,
    avgSessionTime: '24m 32s',
    interactionRate: 78,
    breakdown: [
      { label: 'Highly Engaged', percentage: 35, count: 437, color: '#00ff88' },
      { label: 'Moderately Engaged', percentage: 45, count: 561, color: '#00e0ff' },
      { label: 'Low Engagement', percentage: 20, count: 249, color: '#ffaa00' }
    ],
    userJourney: [
      {
        title: 'Registration & Onboarding',
        description: 'Users complete profile setup and initial connections',
        completionRate: 85,
        avgTime: '8 minutes'
      },
      {
        title: 'First Project Interaction',
        description: 'Users view or join their first project',
        completionRate: 72,
        avgTime: '3 days'
      },
      {
        title: 'Active Collaboration',
        description: 'Users regularly engage in messaging and team activities',
        completionRate: 58,
        avgTime: '1 week'
      }
    ]
  };
}

async function generateProjectMetrics() {
  return {
    totalProjects: 342,
    activeProjects: 89,
    avgTeamSize: 4.2,
    completionRate: 67,
    projectGrowth: 23,
    activeGrowth: 15,
    teamSizeGrowth: 8,
    completionGrowth: 12,
    categories: [
      { name: 'Web Development', count: 45, percentage: 32, icon: 'fas fa-code', color: '#00e0ff' },
      { name: 'AI/ML', count: 28, percentage: 20, icon: 'fas fa-brain', color: '#ff6b6b' },
      { name: 'Mobile Apps', count: 22, percentage: 16, icon: 'fas fa-mobile-alt', color: '#00ff88' },
      { name: 'Data Science', count: 18, percentage: 13, icon: 'fas fa-chart-bar', color: '#ffaa00' },
      { name: 'IoT', count: 15, percentage: 11, icon: 'fas fa-microchip', color: '#8a2be2' },
      { name: 'Other', count: 11, percentage: 8, icon: 'fas fa-ellipsis-h', color: '#ffd700' }
    ],
    topProjects: [
      {
        title: 'AI Health Tracker',
        description: 'Machine learning-powered personal health monitoring',
        teamSize: 6,
        engagement: 94,
        rating: 4.8
      },
      {
        title: 'Sustainable Energy Dashboard',
        description: 'Real-time renewable energy monitoring platform',
        teamSize: 5,
        engagement: 89,
        rating: 4.6
      },
      {
        title: 'Community Connect',
        description: 'Local community engagement and event platform',
        teamSize: 4,
        engagement: 87,
        rating: 4.5
      }
    ]
  };
}

async function generateSocialMetrics() {
  return {
    totalConnections: 2847,
    activeConversations: 156,
    networkDensity: 73,
    collaborationIndex: 8.4,
    connectionGrowth: 18,
    conversationGrowth: 25,
    densityGrowth: 12,
    collaborationGrowth: 15,
    connectionTypes: [
      { name: 'Professional', count: 1245, icon: 'fas fa-briefcase', color: '#00e0ff' },
      { name: 'Project-based', count: 892, icon: 'fas fa-lightbulb', color: '#ff6b6b' },
      { name: 'Skill-based', count: 567, icon: 'fas fa-cogs', color: '#00ff88' },
      { name: 'Mentorship', count: 143, icon: 'fas fa-graduation-cap', color: '#ffaa00' }
    ],
    influenceMetrics: [
      { name: 'Network Reach', value: '2.4K', percentage: 85, color: '#00e0ff' },
      { name: 'Engagement Rate', value: '78%', percentage: 78, color: '#00ff88' },
      { name: 'Knowledge Sharing', value: '156', percentage: 92, color: '#ff6b6b' },
      { name: 'Collaboration Score', value: '8.4', percentage: 84, color: '#ffaa00' }
    ],
    communityLeaders: [
      { name: 'Sarah Chen', role: 'AI/ML Expert', connections: 234, projects: 12, influence: 94 },
      { name: 'Mike Rodriguez', role: 'Full Stack Dev', connections: 189, projects: 8, influence: 87 },
      { name: 'Emily Davis', role: 'UX Designer', connections: 156, projects: 15, influence: 82 }
    ]
  };
}

window.generateInsights = async function() {
  return [
    {
      title: 'Peak Collaboration Hours',
      description: 'Your community is most active between 2-4 PM EST. Consider scheduling important announcements during this time for maximum engagement.',
      icon: 'fas fa-clock',
      action: {
        label: 'Schedule Announcement',
        onClick: 'scheduleAnnouncement()'
      }
    },
    {
      title: 'Skill Gap Opportunity',
      description: 'There\'s high demand for UI/UX designers in current projects. Consider reaching out to design communities or hosting a design workshop.',
      icon: 'fas fa-palette',
      action: {
        label: 'Find Designers',
        onClick: 'findDesigners()'
      }
    },
    {
      title: 'Network Growth Potential',
      description: 'Users with 5+ connections are 3x more likely to start successful projects. Focus on helping new users make their first connections.',
      icon: 'fas fa-network-wired',
      action: {
        label: 'Improve Onboarding',
        onClick: 'improveOnboarding()'
      }
    },
    {
      title: 'Project Success Pattern',
      description: 'Projects with diverse skill sets have 40% higher completion rates. Encourage cross-functional team formation.',
      icon: 'fas fa-chart-line',
      action: {
        label: 'Promote Diversity',
        onClick: 'promoteDiversity()'
      }
    }
  ];
};

function generateRecommendations() {
  return [
    {
      title: 'Host a Virtual Hackathon',
      category: 'Community Engagement',
      description: 'Based on current activity levels and project interests, a hackathon could boost engagement by 35% and create 15+ new projects.',
      icon: 'fas fa-trophy',
      color: '#FFD700',
      impact: { level: 'High', color: '#00ff88' },
      action: 'planHackathon()'
    },
    {
      title: 'Implement Skill Badges',
      category: 'User Recognition',
      description: 'Skill verification badges could increase profile completeness by 60% and improve team formation accuracy.',
      icon: 'fas fa-medal',
      color: '#ff6b6b',
      impact: { level: 'Medium', color: '#ffaa00' },
      action: 'implementBadges()'
    },
    {
      title: 'Create Mentorship Program',
      category: 'Knowledge Sharing',
      description: 'A structured mentorship program could improve new user retention by 45% and accelerate skill development.',
      icon: 'fas fa-graduation-cap',
      color: '#00e0ff',
      impact: { level: 'High', color: '#00ff88' },
      action: 'createMentorship()'
    }
  ];
}

// Helper functions
function generateEventId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Track user engagement
window.trackUserEngagement = function(action, context = {}) {
  trackEvent(ANALYTICS_EVENTS.USER_INTERACTION, {
    action: action,
    context: context,
    timestamp: new Date().toISOString()
  });
};

// Real-time analytics streaming
function setupRealTimeAnalytics() {
  if (!supabase) return;

  // Listen for real-time events and update analytics
  const analyticsChannel = supabase
    .channel('analytics-updates')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'community' },
      (payload) => {
        console.log('📊 Real-time analytics update:', payload);
        
        // Track community changes
        trackEvent('community_update', {
          event_type: payload.eventType,
          table: payload.table,
          timestamp: new Date().toISOString()
        });

        // Show notification for significant events
        if (window.showSynapseNotification) {
          if (payload.eventType === 'INSERT') {
            window.showSynapseNotification('New member joined the community!', 'success');
          }
        }
      }
    )
    .subscribe();

  console.log('📊 Real-time analytics streaming enabled');
}

// Performance monitoring integration
function setupPerformanceAlerts() {
  // Monitor performance metrics and send alerts
  setInterval(() => {
    const metrics = getPerformanceMetrics();
    
    if (metrics.currentMemory > PERFORMANCE_THRESHOLDS.MEMORY_WARNING) {
      if (window.showSynapseNotification) {
        window.showSynapseNotification(
          `High memory usage: ${metrics.currentMemory}MB`, 
          'warning'
        );
      }
      
      trackEvent('performance_alert', {
        type: 'high_memory',
        value: metrics.currentMemory,
        threshold: PERFORMANCE_THRESHOLDS.MEMORY_WARNING
      });
    }

    if (metrics.avgInteractionLatency > PERFORMANCE_THRESHOLDS.GOOD_FID) {
      trackEvent('performance_alert', {
        type: 'high_latency',
        value: metrics.avgInteractionLatency,
        threshold: PERFORMANCE_THRESHOLDS.GOOD_FID
      });
    }
  }, 30000); // Check every 30 seconds

  console.log('⚡ Performance monitoring alerts enabled');
}

// Export analytics data
window.exportAnalyticsData = function() {
  console.log('📊 Exporting analytics data...');
  
  try {
    // Gather all analytics data
    const exportData = {
      session: sessionData,
      events: trackingQueue,
      performance: {
        pageLoadTime: performanceData.pageLoadTime,
        renderTime: performanceData.renderTime,
        memoryUsage: performanceData.memoryUsage,
        interactionLatency: performanceData.interactionLatency,
        errors: performanceData.errors
      },
      timestamp: new Date().toISOString(),
      user: currentUserProfile?.id || 'anonymous'
    };

    // Create downloadable file
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (window.showSynapseNotification) {
      window.showSynapseNotification('Analytics data exported successfully!', 'success');
    }

    // Track export event
    trackEvent('analytics_export', {
      events_count: trackingQueue.length,
      session_duration: Date.now() - sessionData.startTime,
      export_size: dataStr.length
    });

  } catch (error) {
    console.error('❌ Error exporting analytics data:', error);
    
    if (window.showSynapseNotification) {
      window.showSynapseNotification('Failed to export analytics data', 'error');
    }
  }
};

// Close analytics dashboard
window.closeAnalyticsDashboard = function() {
  const dashboard = document.getElementById('analytics-dashboard');
  if (dashboard) {
    dashboard.remove();
  }
  console.log('🗑️ Analytics dashboard closed');
};

// Placeholder action functions
window.scheduleAnnouncement = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Announcement scheduling feature coming soon!', 'info');
  }
};

window.findDesigners = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Designer recruitment feature coming soon!', 'info');
  }
};

window.improveOnboarding = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Onboarding improvements are being planned!', 'info');
  }
};

window.promoteDiversity = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Diversity promotion features coming soon!', 'info');
  }
};

window.planHackathon = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Hackathon planning tools coming soon!', 'info');
  }
};

window.implementBadges = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Skill badge system coming soon!', 'info');
  }
};

window.createMentorship = function() {
  if (window.showSynapseNotification) {
    window.showSynapseNotification('Mentorship program features coming soon!', 'info');
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initAdvancedAnalytics();
});

// Process tracking queue before page unload
window.addEventListener('beforeunload', () => {
  processTrackingQueue();
});

console.log('✅ Advanced analytics ready');